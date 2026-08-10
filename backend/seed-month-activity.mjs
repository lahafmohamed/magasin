#!/usr/bin/env node
/**
 * seed-month-activity.mjs — Ajoute ~1 mois d'activité aléatoire réaliste
 * PAR-DESSUS les données existantes (aucun TRUNCATE).
 *
 * Génère : factures clients + paiements (triggers GL/statut), mouvements de
 * stock cohérents (vente/réception, stock_avant/apres suivis), devis,
 * commandes fournisseur → réceptions (restock + CMP pondéré) → factures
 * fournisseur + paiements, dépenses.
 *
 * Numérotation via les séquences existantes (pas de collision).
 * Usage : node seed-month-activity.mjs [--days 30]
 */
import pg from 'pg';
import 'dotenv/config';
const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'magasin_db',
});

const DAYS = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--days') || '30');
const YEAR = new Date().getFullYear();

// ---------- helpers aléatoires ----------
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickW = (pairs) => {
  // pairs: [[valeur, poids], ...]
  const tot = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * tot;
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[pairs.length - 1][0];
};
const pad5 = (n) => String(n).padStart(5, '0');

// timestamp un jour donné, heures ouvrées 08:00-18:30
const ts = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(rnd(8, 18), rnd(0, 59), rnd(0, 59), 0);
  return d;
};
const dateOnly = (d) => d.toISOString().slice(0, 10);
const plusDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const METHODES_CLIENT = [
  ['virement', 30], ['orange_money', 20], ['wave', 20], ['mtn_money', 10], ['cheque', 10], ['carte', 10],
]; // pas d'espece : exige session caisse + mouvement_caisse (aucune caisse configurée)

async function main() {
  const db = await pool.connect();
  try {
    const { rows: [{ db: dbName }] } = await db.query('SELECT current_database() AS db');
    console.log('\n DB: ' + dbName + ' — ajout ' + DAYS + ' jours d\'activité (aucun vidage)\n');
    await db.query('BEGIN');

    // ---------- référentiels ----------
    const { rows: [{ id: userId }] } = await db.query('SELECT id FROM utilisateurs ORDER BY id LIMIT 1');
    const { rows: [{ id: locId }] } = await db.query(
      'SELECT id FROM stock_locations WHERE est_principal = TRUE AND actif = TRUE LIMIT 1');
    const { rows: clients } = await db.query(
      `SELECT id FROM tiers WHERE est_client AND deleted_at IS NULL ORDER BY random() LIMIT 80`);
    const { rows: fournisseurs } = await db.query(
      `SELECT id, raison_sociale FROM tiers WHERE est_fournisseur AND deleted_at IS NULL ORDER BY random() LIMIT 12`);
    // produits vendables sur la location principale (stock + CMP connus)
    const { rows: prods } = await db.query(
      `SELECT spl.produit_id AS id, spl.quantite::int AS qte, spl.cmp::numeric AS cmp,
              p.nom, p.prix_vente::numeric AS pv, p.prix_achat::numeric AS pa
       FROM stock_par_location spl
       JOIN produits p ON p.id = spl.produit_id
       WHERE spl.location_id = $1 AND spl.quantite > 5 AND spl.cmp > 0
         AND p.prix_vente > 0 AND p.deleted_at IS NULL
       ORDER BY random() LIMIT 400`, [locId]);
    if (!clients.length || !prods.length) throw new Error('Pas assez de clients/produits éligibles');
    console.log(`  Référentiels : ${clients.length} clients, ${fournisseurs.length} fournisseurs, ${prods.length} produits, location=${locId}, user=${userId}`);

    // suivi stock en mémoire pour des stock_avant/apres cohérents
    const stock = new Map(prods.map(p => [p.id, { qte: p.qte, cmp: Number(p.cmp), pv: Number(p.pv), pa: Number(p.pa), nom: p.nom }]));

    const num = async (seq) => (await db.query(`SELECT nextval('${seq}')::int AS n`)).rows[0].n;

    // ---------- planification des événements (tri chronologique) ----------
    const events = [];
    for (let ago = DAYS - 1; ago >= 1; ago--) {
      const day = ts(ago);
      if (day.getDay() === 0) continue; // fermé le dimanche
      const nbVentes = day.getDay() === 6 ? rnd(4, 9) : rnd(3, 7); // samedi plus chargé
      for (let i = 0; i < nbVentes; i++) events.push({ type: 'vente', at: ts(ago) });
    }
    // ~6 commandes fournisseur réparties sur le mois
    const cmdOffsets = [DAYS - 3, DAYS - 8, DAYS - 13, DAYS - 18, DAYS - 23, 4].filter(o => o >= 1);
    cmdOffsets.forEach((o, i) => events.push({ type: 'achat', at: ts(o), idx: i }));
    // ~10 devis
    for (let i = 0; i < 10; i++) events.push({ type: 'devis', at: ts(rnd(1, DAYS - 1)) });
    // ~12 dépenses
    const DEPENSES = [
      ['Loyer', 'Loyer boutique mois en cours', [250000, 400000], 'virement'],
      ['Salaires', 'Avance sur salaires équipe', [400000, 800000], 'virement'],
      ['Électricité / Eau', 'Facture CIE/SODECI', [45000, 120000], 'cheque'],
      ['Téléphone / Internet', 'Abonnement internet boutique', [30000, 60000], 'virement'],
      ['Transport', 'Carburant livraisons', [15000, 45000], 'cheque'],
      ['Transport', 'Course coursier', [5000, 20000], 'cheque'],
      ['Fournitures', 'Fournitures bureau et emballage', [10000, 50000], 'cheque'],
      ['Entretien', 'Nettoyage et petites réparations', [15000, 60000], 'cheque'],
      ['Repas / Restauration', 'Repas équipe', [8000, 25000], 'cheque'],
      ['Publicité', 'Flyers et affiches promo', [20000, 80000], 'virement'],
      ['Divers', 'Frais divers boutique', [5000, 30000], 'cheque'],
      ['Transport', 'Transport marchandises', [20000, 60000], 'cheque'],
    ];
    DEPENSES.forEach((d, i) => events.push({ type: 'depense', at: ts(rnd(1, DAYS - 1)), dep: d }));
    events.sort((a, b) => a.at - b.at);

    const { rows: catDep } = await db.query('SELECT id, nom FROM categories_depenses');
    const catDepId = Object.fromEntries(catDep.map(c => [c.nom, c.id]));

    // ---------- exécution ----------
    let cFac = 0, cPay = 0, cDev = 0, cCmd = 0, cRec = 0, cFF = 0, cPayF = 0, cDep = 0, cLig = 0, cMvt = 0;
    const caFacture = { total: 0, encaisse: 0 };

    const insereLigneVente = async (facId, prodId, qte, pu) => {
      await db.query(
        `INSERT INTO document_lignes(document_type,document_id,produit_id,description,quantite,prix_unitaire,total_ligne,prix_achat_unitaire)
         VALUES('facture',$1,$2,$3,$4,$5,$6,$7)`,
        [facId, prodId, stock.get(prodId).nom, qte, pu, qte * pu, stock.get(prodId).cmp]);
      cLig++;
    };

    for (const ev of events) {
      if (ev.type === 'vente') {
        // 1 à 4 lignes, produits avec stock suffisant
        const lignes = [];
        const nbLignes = pickW([[1, 40], [2, 30], [3, 20], [4, 10]]);
        const dejaVus = new Set();
        for (let i = 0; i < nbLignes; i++) {
          const p = pick(prods);
          const s = stock.get(p.id);
          if (dejaVus.has(p.id) || s.qte < 2) continue;
          dejaVus.add(p.id);
          const maxQ = s.pv < 20000 ? Math.min(10, s.qte - 1) : Math.min(3, s.qte - 1);
          const qte = rnd(1, Math.max(1, maxQ));
          lignes.push({ id: p.id, qte, pu: s.pv });
        }
        if (!lignes.length) continue;
        const total = lignes.reduce((s, l) => s + l.qte * l.pu, 0);

        const nFac = `FAC-${YEAR}-${pad5(await num('facture_numero_seq'))}`;
        const { rows: [{ id: facId }] } = await db.query(
          `INSERT INTO factures(numero_facture,tiers_id,date_facture,date_echeance,sous_total,tva,total,montant_paye,remaining_due,statut,type_facture,location_id,cree_par)
           VALUES($1,$2,$3,$4,$5,0,$5,0,$5,'en_attente','standard',$6,$7) RETURNING id`,
          [nFac, pick(clients).id, ev.at, dateOnly(plusDays(ev.at, 30)), total, locId, userId]);
        cFac++; caFacture.total += total;

        for (const l of lignes) {
          await insereLigneVente(facId, l.id, l.qte, l.pu);
          const s = stock.get(l.id);
          await db.query(
            `INSERT INTO mouvements_stock(produit_id,type_mouvement,quantite,stock_avant,stock_apres,raison,reference_liee,date_mouvement,location_id)
             VALUES($1,'vente',$2,$3,$4,$5,$6,$7,$8)`,
            [l.id, -l.qte, s.qte, s.qte - l.qte, `Vente — facture ${nFac}`, nFac, ev.at, locId]);
          await db.query(
            `UPDATE stock_par_location SET quantite = quantite - $1 WHERE produit_id=$2 AND location_id=$3`,
            [l.qte, l.id, locId]);
          s.qte -= l.qte; cMvt++;
        }

        // scénario paiement : 65% payée, 15% partielle, 20% impayée
        const sc = pickW([['payee', 65], ['partielle', 15], ['impayee', 20]]);
        if (sc !== 'impayee') {
          const montant = sc === 'payee' ? total : Math.max(1, Math.round(total * (rnd(30, 70) / 100)));
          const payAt = new Date(Math.min(plusDays(ev.at, rnd(0, 5)).getTime(), Date.now() - 3600e3));
          await db.query(
            `INSERT INTO paiements(facture_id,montant,methode_paiement,date_paiement,source,magasin_id,cree_par)
             VALUES($1,$2,$3,$4,'direct',1,$5)`,
            [facId, montant, pickW(METHODES_CLIENT), payAt, userId]);
          cPay++; caFacture.encaisse += montant;
          // le trigger update_facture_payment_status recalcule statut/montant_paye/remaining_due
        }
      }

      else if (ev.type === 'devis') {
        const lignes = [];
        for (let i = 0, n = rnd(1, 3); i < n; i++) {
          const p = pick(prods);
          const s = stock.get(p.id);
          lignes.push({ id: p.id, qte: rnd(1, 5), pu: s.pv, nom: s.nom });
        }
        const total = lignes.reduce((s, l) => s + l.qte * l.pu, 0);
        const statut = pickW([['brouillon', 25], ['envoye', 35], ['accepte', 25], ['refuse', 15]]);
        const nDev = `DEV-${YEAR}-${pad5(await num('devis_seq'))}`;
        const { rows: [{ id: devId }] } = await db.query(
          `INSERT INTO devis(numero_devis,tiers_id,date_devis,date_validite,statut,sous_total,tva,total,location_id,cree_par)
           VALUES($1,$2,$3,$4,$5,$6,0,$6,$7,$8) RETURNING id`,
          [nDev, pick(clients).id, ev.at, dateOnly(plusDays(ev.at, 30)), statut, total, locId, userId]);
        for (const l of lignes) {
          await db.query(
            `INSERT INTO document_lignes(document_type,document_id,produit_id,description,quantite,prix_unitaire,total_ligne)
             VALUES('devis',$1,$2,$3,$4,$5,$6)`, [devId, l.id, l.nom, l.qte, l.pu, l.qte * l.pu]);
          cLig++;
        }
        cDev++;
      }

      else if (ev.type === 'achat' && fournisseurs.length) {
        const frn = pick(fournisseurs);
        // 2 à 5 produits à réapprovisionner
        const lignes = [];
        const vus = new Set();
        for (let i = 0, n = rnd(2, 5); i < n; i++) {
          const p = pick(prods);
          if (vus.has(p.id)) continue;
          vus.add(p.id);
          const s = stock.get(p.id);
          const cout = Math.round(s.cmp * (rnd(92, 105) / 100)); // coût proche du CMP
          lignes.push({ id: p.id, qte: rnd(5, 30), cout, nom: s.nom });
        }
        const totalCmd = lignes.reduce((s, l) => s + l.qte * l.cout, 0);
        const recente = ev.idx >= cmdOffsets.length - 2; // 2 dernières non livrées
        const statutCmd = recente ? pickW([['en_attente', 50], ['validee', 50]]) : 'livree';
        const nCmd = `CMD-${YEAR}-${pad5(await num('commande_numero_seq'))}`;
        const { rows: [{ id: cmdId }] } = await db.query(
          `INSERT INTO commandes_fournisseur(numero_commande,tiers_id,date_commande,date_livraison_prevue,statut,sous_total)
           VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [nCmd, frn.id, ev.at, dateOnly(plusDays(ev.at, 7)), statutCmd, totalCmd]);
        for (const l of lignes) {
          await db.query(
            `INSERT INTO commande_lignes(commande_id,produit_id,quantite,prix_unitaire,total_ligne)
             VALUES($1,$2,$3,$4,$5)`, [cmdId, l.id, l.qte, l.cout, l.qte * l.cout]);
          cLig++;
        }
        cCmd++;
        if (statutCmd !== 'livree') continue;

        // réception 3-6 jours après la commande
        const recAt = plusDays(ev.at, rnd(3, 6));
        await db.query(`UPDATE commandes_fournisseur SET date_livraison_reelle=$1 WHERE id=$2`, [dateOnly(recAt), cmdId]);
        const nRec = `REC-${YEAR}-${pad5(await num('reception_numero_seq'))}`;
        const { rows: [{ id: recId }] } = await db.query(
          `INSERT INTO receptions(numero_reception,commande_id,date_reception,receptionne_par,location_id)
           VALUES($1,$2,$3,$4,$5) RETURNING id`, [nRec, cmdId, recAt, userId, locId]);
        cRec++;
        for (const l of lignes) {
          await db.query(
            `INSERT INTO reception_lignes(reception_id,produit_id,quantite_commandee,quantite_recue,cout_unitaire,total_ligne,ecart)
             VALUES($1,$2,$3,$3,$4,$5,0)`, [recId, l.id, l.qte, l.cout, l.qte * l.cout]);
          const s = stock.get(l.id);
          await db.query(
            `INSERT INTO mouvements_stock(produit_id,type_mouvement,quantite,stock_avant,stock_apres,raison,reference_liee,date_mouvement,location_id)
             VALUES($1,'commande',$2,$3,$4,$5,$6,$7,$8)`,
            [l.id, l.qte, s.qte, s.qte + l.qte, `Réception — ${nRec}`, nRec, recAt, locId]);
          // restock + CMP moyen pondéré (le trigger recalcule valeur_stock)
          await db.query(
            `UPDATE stock_par_location
             SET cmp = ROUND(((quantite * cmp) + ($1::numeric * $2::numeric)) / NULLIF(quantite + $1, 0), 2),
                 quantite = quantite + $1
             WHERE produit_id=$3 AND location_id=$4`, [l.qte, l.cout, l.id, locId]);
          s.cmp = Math.round((((s.qte * s.cmp) + (l.qte * l.cout)) / (s.qte + l.qte)) * 100) / 100;
          s.qte += l.qte; cMvt++; cLig++;
        }

        // facture fournisseur 0-3 jours après réception (trigger auto-poste au GL)
        const ffAt = plusDays(recAt, rnd(0, 3));
        const nFF = `FF-${YEAR}-${pad5(await num('facture_fournisseur_numero_seq'))}`;
        const refExt = `${(frn.raison_sociale || 'FRN').replace(/[^A-Za-z]/g, '').slice(0, 5).toUpperCase() || 'FRN'}-${YEAR}-${rnd(1000, 9999)}`;
        const { rows: [{ id: ffId }] } = await db.query(
          `INSERT INTO factures_fournisseur(tiers_id,reception_id,commande_id,numero_facture_fournisseur,numero_facture_interne,date_facture,date_echeance,sous_total,tva,total,montant_paye,reste_due,statut,condition_paiement,cree_par)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,$8,0,$8,'en_attente','30_jours',$9) RETURNING id`,
          [frn.id, recId, cmdId, refExt, nFF, dateOnly(ffAt), dateOnly(plusDays(ffAt, 30)), totalCmd, userId]);
        for (const l of lignes) {
          await db.query(
            `INSERT INTO facture_fournisseur_lignes(facture_id,produit_id,description,quantite,prix_unitaire,total_ligne)
             VALUES($1,$2,$3,$4,$5,$6)`, [ffId, l.id, l.nom, l.qte, l.cout, l.qte * l.cout]);
          cLig++;
        }
        cFF++;
        // paiement fournisseur : 50% payée, 25% partielle, 25% en attente
        const scF = pickW([['payee', 50], ['partielle', 25], ['attente', 25]]);
        if (scF !== 'attente') {
          const montant = scF === 'payee' ? totalCmd : Math.max(1, Math.round(totalCmd * (rnd(30, 60) / 100)));
          const payAt = new Date(Math.min(plusDays(ffAt, rnd(1, 8)).getTime(), Date.now() - 3600e3));
          await db.query(
            `INSERT INTO paiements_fournisseur(facture_id,montant,methode_paiement,date_paiement,source,effectue_par)
             VALUES($1,$2,$3,$4,'direct',$5)`,
            [ffId, montant, pick(['virement', 'cheque']), payAt, userId]);
          cPayF++;
          // trigger update_facture_fournisseur_payment_status recalcule statut/reste_due
        }
      }

      else if (ev.type === 'depense') {
        const [cat, desc, [mn, mx], meth] = ev.dep;
        const catId = catDepId[cat] || catDepId['Divers'];
        if (!catId) continue;
        const nDep = `DEP-${YEAR}-${pad5(await num('depense_seq'))}`;
        await db.query(
          `INSERT INTO depenses(numero_depense,location_id,categorie_id,montant,methode_paiement,date_depense,description,cree_par)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [nDep, locId, catId, rnd(mn / 1000, mx / 1000) * 1000, meth, ev.at, desc, userId]);
        cDep++;
      }
    }

    await db.query('COMMIT');

    // ---------- vérifications post-commit ----------
    const { rows: [neg] } = await db.query(
      'SELECT COUNT(*)::int n FROM stock_par_location WHERE quantite < 0');
    const { rows: [gl] } = await db.query(
      `SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) AS ecart FROM ecritures_comptables`);

    console.log('\n==========================================');
    console.log('  ACTIVITÉ 1 MOIS — RÉSUMÉ');
    console.log('==========================================');
    console.log(`  Factures clients : ${cFac} (CA facturé ${caFacture.total.toLocaleString('fr-FR')} XOF)`);
    console.log(`  Paiements clients : ${cPay} (encaissé ${caFacture.encaisse.toLocaleString('fr-FR')} XOF)`);
    console.log(`  Devis : ${cDev}   Dépenses : ${cDep}`);
    console.log(`  Cmd fournisseur : ${cCmd}   Réceptions : ${cRec}   Fact. fournisseur : ${cFF}   Paiements frn : ${cPayF}`);
    console.log(`  Lignes documents : ${cLig}   Mouvements stock : ${cMvt}`);
    console.log(`  Contrôles : stocks négatifs=${neg.n} (attendu 0), écart GL débit-crédit=${gl.ecart} (attendu 0)`);
    console.log('==========================================\n');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('ERREUR: ' + err.message);
    if (err.detail) console.error('Detail: ' + err.detail);
    process.exitCode = 1;
  } finally {
    db.release();
    await pool.end();
  }
}
main();
