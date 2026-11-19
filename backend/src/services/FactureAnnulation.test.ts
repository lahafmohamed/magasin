import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';

/**
 * Annulation d'une facture (décision du 2026-10-23) : l'annulation
 * contre-passe les écritures que le trigger 072 a passées à la création et
 * remet les articles en stock, dans une seule transaction.
 *
 * Le contrôle applicatif de période (PeriodService) peut être court-circuité
 * pour prouver que le trigger 075 reste la garantie : il refuse la
 * contre-passation dans une période close, et l'utilisateur lit un message
 * français.
 */
const periodCheck = vi.hoisted(() => ({ bypass: false }));
vi.mock('./PeriodService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./PeriodService')>();
  return {
    ...actual,
    checkPeriodIsOpen: async (date: Date, db?: any) =>
      periodCheck.bypass ? undefined : actual.checkPeriodIsOpen(date, db),
  };
});

import pool from '../db/connection';
import app from '../server';
import { FactureService } from './FactureService';
import { produitService } from './ProduitService';
import bonLivraisonService from './BonLivraisonService';
import { employeService } from './EmployeService';
import { TestDB } from '../test/helpers';
import { formatMontantFcfa } from '../utils/money';

const factureService = new FactureService();
const suffix = `${Date.now() % 100000000}`;

let adminId: number;
let principal: { id: number; nom: string };
let tiersId: number;
let stockedId: number; // produit suivi par emplacement (stock_par_location, cmp)
let legacyId: number; // produit historique : stock dans produits.stock
const factureIds: number[] = [];
const devisIds: number[] = [];
const blIds: number[] = [];
const produitIds: number[] = [];
const tiersIds: number[] = [];
const retourIds: number[] = [];
let employeId: number | null = null;
let vendeurId: number | null = null;

const now = new Date();
const EXERCICE = now.getFullYear();
const PERIODE = now.getMonth() + 1;
let periodRowExisted = false;

async function closeCurrentPeriod(): Promise<void> {
  const { rows } = await pool.query(
    'SELECT 1 FROM periodes_comptables WHERE exercice = $1 AND periode = $2',
    [EXERCICE, PERIODE]
  );
  periodRowExisted = rows.length > 0;
  const debut = new Date(EXERCICE, PERIODE - 1, 1);
  const fin = new Date(EXERCICE, PERIODE, 0);
  await pool.query(
    `INSERT INTO periodes_comptables (exercice, periode, date_debut, date_fin, statut)
     VALUES ($1, $2, $3, $4, 'fermee')
     ON CONFLICT (exercice, periode) DO UPDATE SET statut = 'fermee'`,
    [EXERCICE, PERIODE, debut, fin]
  );
}

async function reopenCurrentPeriod(): Promise<void> {
  if (periodRowExisted) {
    await pool.query(
      `UPDATE periodes_comptables SET statut = 'ouverte' WHERE exercice = $1 AND periode = $2`,
      [EXERCICE, PERIODE]
    );
  } else {
    await pool.query('DELETE FROM periodes_comptables WHERE exercice = $1 AND periode = $2', [EXERCICE, PERIODE]);
  }
}

async function facture(lignes: Array<{ produit_id: number; quantite: number; prix_unitaire?: number }>, tiers = tiersId, creePar?: number) {
  const created = await factureService.create({
    tiers_id: tiers,
    lignes: lignes.map((l) => ({ ...l, prix_unitaire: l.prix_unitaire ?? 5000 })),
    cree_par: creePar ?? adminId,
  });
  factureIds.push(created.id);
  return created;
}

async function spl(produitId: number, locationId = principal.id) {
  const { rows } = await pool.query(
    'SELECT quantite, cmp, valeur_stock FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
    [produitId, locationId]
  );
  return rows[0]
    ? { quantite: Number(rows[0].quantite), cmp: Number(rows[0].cmp), valeur: Number(rows[0].valeur_stock) }
    : null;
}

async function legacyStock(produitId: number): Promise<number> {
  const { rows } = await pool.query('SELECT stock FROM produits WHERE id = $1', [produitId]);
  return Number(rows[0].stock);
}

async function glLines(factureId: number) {
  const { rows } = await pool.query(
    `SELECT compte_id, compte_numero, debit::float AS debit, credit::float AS credit, libelle, date_ecriture, journal
     FROM ecritures_comptables
     WHERE piece_type = 'facture' AND piece_id = $1
     ORDER BY ligne_numero, id`,
    [factureId]
  );
  return rows;
}

async function invoiceRow(factureId: number) {
  const { rows } = await pool.query(
    'SELECT statut, montant_paye::float AS montant_paye, remaining_due::float AS remaining_due FROM factures WHERE id = $1',
    [factureId]
  );
  return rows[0];
}

async function solde(tiers = tiersId): Promise<number> {
  const { rows } = await pool.query('SELECT solde_client_actuel::float AS s FROM tiers WHERE id = $1', [tiers]);
  return Number(rows[0].s);
}

describe('Annulation de facture : contre-passation et remise en stock', () => {
  beforeAll(async () => {
    const { rows: adminRows } = await pool.query("SELECT id FROM utilisateurs WHERE username = 'admin'");
    adminId = adminRows[0].id;
    const { rows: locRows } = await pool.query(
      'SELECT id, nom FROM stock_locations WHERE est_principal = true AND actif = true ORDER BY id LIMIT 1'
    );
    principal = { id: locRows[0].id, nom: locRows[0].nom };

    tiersId = await TestDB.createTestClient({ nom: `Client annulation ${suffix}` });
    tiersIds.push(tiersId);

    const stocked = await produitService.create({
      reference: `ANNUL-STK-${suffix}`,
      nom: `Écran annulation ${suffix}`,
      prix_achat: 1000,
      prix_vente: 5000,
      initial_stock: 20,
    });
    stockedId = stocked.id;
    produitIds.push(stockedId);

    legacyId = await TestDB.createTestProduct({ reference: `ANNUL-LEG-${suffix}`, nom: `Câble annulation ${suffix}`, stock: 100 });
    produitIds.push(legacyId);
  });

  afterEach(async () => {
    periodCheck.bypass = false;
    await reopenCurrentPeriod();
  });

  afterAll(async () => {
    await reopenCurrentPeriod();
    if (factureIds.length) {
      await pool.query(`DELETE FROM ecritures_comptables WHERE piece_type = 'facture' AND piece_id = ANY($1::int[])`, [factureIds]);
      await TestDB.deleteInvoicesByIds(factureIds);
    }
    if (retourIds.length) await pool.query('DELETE FROM retours WHERE id = ANY($1::int[])', [retourIds]);
    if (blIds.length) {
      await pool.query(`DELETE FROM document_lignes WHERE document_type = 'bl' AND document_id = ANY($1::int[])`, [blIds]);
      await pool.query('DELETE FROM bons_livraison WHERE id = ANY($1::int[])', [blIds]);
    }
    if (devisIds.length) {
      await pool.query(`DELETE FROM document_lignes WHERE document_type = 'devis' AND document_id = ANY($1::int[])`, [devisIds]);
      await pool.query('DELETE FROM devis WHERE id = ANY($1::int[])', [devisIds]);
    }
    await pool.query('DELETE FROM mouvements_stock WHERE produit_id = ANY($1::int[])', [produitIds]);
    await pool.query('DELETE FROM stock_par_location WHERE produit_id = ANY($1::int[])', [produitIds]);
    await pool.query('DELETE FROM produits WHERE id = ANY($1::int[])', [produitIds]);
    for (const id of tiersIds) {
      await pool.query(
        'DELETE FROM acompte_applications WHERE acompte_id IN (SELECT id FROM acomptes_clients WHERE tiers_id = $1)',
        [id]
      );
      await pool.query('DELETE FROM acomptes_clients WHERE tiers_id = $1', [id]);
      await pool.query('DELETE FROM compte_client_lignes WHERE tiers_id = $1', [id]);
      await pool.query('DELETE FROM tiers WHERE id = $1', [id]);
    }
    if (employeId) await pool.query('DELETE FROM employes WHERE id = $1', [employeId]);
    if (vendeurId) await pool.query('DELETE FROM utilisateurs WHERE id = $1', [vendeurId]);
  });

  it('contre-passe les écritures, remet les articles en stock et solde le client', async () => {
    const before = await spl(stockedId);
    const legacyBefore = await legacyStock(legacyId);
    const soldeBefore = await solde();

    const f = await facture([
      { produit_id: stockedId, quantite: 3 },
      { produit_id: legacyId, quantite: 2 },
    ]);
    expect((await spl(stockedId))!.quantite).toBe(before!.quantite - 3);
    expect(await legacyStock(legacyId)).toBe(legacyBefore - 2);
    expect(await solde()).toBe(soldeBefore + 25000);
    const posted = await glLines(f.id);
    expect(posted).toHaveLength(2);

    const result = await factureService.annuler(f.id, adminId);

    expect(result).not.toBeNull();
    expect(result!.message).toBe(
      `Facture ${f.numero_facture} annulée : écritures contre-passées, articles remis en stock à ${principal.nom}.`
    );
    expect(result!.ecritures_contre_passees).toBe(2);
    expect(result!.emplacements).toEqual([{ id: principal.id, nom: principal.nom }]);
    expect(result!.articles_remis_en_stock.map((a) => [a.produit_id, a.quantite]).sort()).toEqual(
      [[stockedId, 3], [legacyId, 2]].sort()
    );
    expect(result!.bons_livraison_annules).toEqual([]);

    // Grand livre : 4 lignes, débit = crédit, effet net nul sur chaque compte.
    const lines = await glLines(f.id);
    expect(lines).toHaveLength(4);
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBeCloseTo(credit, 2);
    expect(debit).toBeCloseTo(50000, 2);
    const net = new Map<string, number>();
    for (const l of lines) {
      const key = `${l.compte_id}|${l.compte_numero ?? ''}|${l.journal}`;
      net.set(key, (net.get(key) ?? 0) + l.debit - l.credit);
    }
    for (const value of net.values()) expect(value).toBeCloseTo(0, 2);
    const contra = lines.slice(2);
    for (const l of contra) {
      expect(l.libelle).toBe(`Annulation facture ${f.numero_facture}`);
      expect(new Date(l.date_ecriture).toDateString()).toBe(new Date().toDateString());
    }
    // Contre-passation miroir : même compte, débit et crédit inversés.
    expect(contra.map((l) => [l.compte_id, l.debit, l.credit])).toEqual(
      posted.map((l) => [l.compte_id, l.credit, l.debit])
    );

    // Stock : quantités, cmp et valeur (076) cohérents ; mouvements nets nuls.
    const after = await spl(stockedId);
    expect(after!.quantite).toBe(before!.quantite);
    expect(after!.cmp).toBe(before!.cmp);
    expect(after!.valeur).toBeCloseTo(after!.quantite * after!.cmp, 2);
    expect(await legacyStock(legacyId)).toBe(legacyBefore);
    const { rows: mvts } = await pool.query(
      `SELECT produit_id, SUM(quantite)::int AS net,
              COUNT(*) FILTER (WHERE quantite > 0 AND raison = $2 AND type_mouvement = 'vente' AND location_id = $3)::int AS retours
       FROM mouvements_stock WHERE reference_liee = $1 GROUP BY produit_id`,
      [f.numero_facture, `Annulation facture ${f.numero_facture}`, principal.id]
    );
    expect(mvts).toHaveLength(2);
    for (const m of mvts) {
      expect(m.net).toBe(0);
      expect(m.retours).toBe(1);
    }

    // Facture et compte client.
    expect(await invoiceRow(f.id)).toMatchObject({ statut: 'annulee', montant_paye: 0, remaining_due: 0 });
    expect(await solde()).toBe(soldeBefore);
    const { rows: ccl } = await pool.query(
      `SELECT COALESCE(SUM(montant_debit - montant_credit), 0)::float AS net
       FROM compte_client_lignes WHERE tiers_id = $1 AND document_id = $2 AND type_operation IN ('facture', 'ajustement')`,
      [tiersId, f.id]
    );
    expect(ccl[0].net).toBeCloseTo(0, 2);

    const { rows: audit } = await pool.query(
      `SELECT new_values FROM audit_log WHERE table_name = 'factures' AND record_id = $1 AND action = 'cancel'`,
      [f.id]
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].new_values).toMatchObject({ statut: 'annulee', ecritures_contre_passees: 2 });
  });

  it('refuse une facture déjà réglée en partie (409), sans rien toucher', async () => {
    const f = await facture([{ produit_id: stockedId, quantite: 1 }]);
    await pool.query(
      `INSERT INTO paiements (facture_id, montant, methode_paiement, date_paiement, source)
       VALUES ($1, 1000, 'virement', CURRENT_TIMESTAMP, 'direct')`,
      [f.id]
    );
    const stockBefore = (await spl(stockedId))!.quantite;

    await expect(factureService.annuler(f.id, adminId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'FACTURE_REGLEE',
      message: `Impossible d’annuler la facture ${f.numero_facture} : ${formatMontantFcfa(1000)} y sont déjà réglés. Supprimez d’abord ses paiements, ou établissez un avoir.`,
    });

    expect((await invoiceRow(f.id)).statut).toBe('partielle');
    expect(await glLines(f.id)).toHaveLength(2);
    expect((await spl(stockedId))!.quantite).toBe(stockBefore);
  });

  it('refuse quand la période comptable du jour est clôturée (contrôle applicatif)', async () => {
    const f = await facture([{ produit_id: stockedId, quantite: 1 }]);
    const stockBefore = (await spl(stockedId))!.quantite;
    await closeCurrentPeriod();

    const mm = String(PERIODE).padStart(2, '0');
    await expect(factureService.annuler(f.id, adminId)).rejects.toMatchObject({
      statusCode: 422,
      code: 'PERIOD_CLOSED',
      message: `Impossible d’annuler la facture ${f.numero_facture} : la période comptable ${mm}/${EXERCICE} est clôturée, ses écritures ne peuvent pas être contre-passées.`,
    });

    expect((await invoiceRow(f.id)).statut).toBe('en_attente');
    expect(await glLines(f.id)).toHaveLength(2);
    expect((await spl(stockedId))!.quantite).toBe(stockBefore);
  });

  it('le trigger 075 refuse aussi la contre-passation quand le contrôle applicatif est contourné', async () => {
    const f = await facture([{ produit_id: stockedId, quantite: 1 }]);
    const stockBefore = (await spl(stockedId))!.quantite;
    await closeCurrentPeriod();
    periodCheck.bypass = true;

    const mm = String(PERIODE).padStart(2, '0');
    await expect(factureService.annuler(f.id, adminId)).rejects.toMatchObject({
      statusCode: 422,
      code: 'PERIOD_CLOSED',
      message: `Impossible d’annuler la facture ${f.numero_facture} : la période comptable ${mm}/${EXERCICE} est clôturée, ses écritures ne peuvent pas être contre-passées.`,
    });

    // Rien n'a été écrit : la transaction entière est annulée.
    expect((await invoiceRow(f.id)).statut).toBe('en_attente');
    expect(await glLines(f.id)).toHaveLength(2);
    expect((await spl(stockedId))!.quantite).toBe(stockBefore);
  });

  it('une vente sur bon de livraison : remet en stock ce que le BL a livré et annule le BL', async () => {
    const { rows: [devis] } = await pool.query(
      `INSERT INTO devis (numero_devis, tiers_id, sous_total, total, statut, location_id)
       VALUES ($1, $2, 20000, 20000, 'accepte', $3) RETURNING id`,
      [`DEV-ANNUL-${suffix}`, tiersId, principal.id]
    );
    devisIds.push(devis.id);
    await pool.query(
      `INSERT INTO document_lignes (document_type, document_id, produit_id, quantite, prix_unitaire, total_ligne)
       VALUES ('devis', $1, $2, 4, 5000, 20000)`,
      [devis.id, stockedId]
    );
    // BL manuel sans emplacement : il prend celui du devis.
    const bl = await bonLivraisonService.create({
      tiers_id: tiersId,
      devis_id: devis.id,
      lignes: [{ produit_id: stockedId, quantite_commandee: 4, quantite_livree: 4, prix_unitaire: 5000 }],
    });
    blIds.push(bl.id);
    const { rows: blRow } = await pool.query('SELECT location_id FROM bons_livraison WHERE id = $1', [bl.id]);
    expect(blRow[0].location_id).toBe(principal.id);

    const stockBefore = (await spl(stockedId))!.quantite;
    await bonLivraisonService.updateStatut(bl.id, 'livre');
    expect((await spl(stockedId))!.quantite).toBe(stockBefore - 4);
    const { facture_id, numero_facture } = await bonLivraisonService.convertToFacture(bl.id, adminId);
    factureIds.push(facture_id);
    expect((await spl(stockedId))!.quantite).toBe(stockBefore - 4);

    const result = await factureService.annuler(facture_id, adminId);

    expect(result!.message).toBe(
      `Facture ${numero_facture} annulée : écritures contre-passées, articles remis en stock à ${principal.nom}. Le bon de livraison ${bl.numero_bl} est annulé.`
    );
    expect(result!.bons_livraison_annules).toEqual([{ id: bl.id, numero_bl: bl.numero_bl }]);
    expect((await spl(stockedId))!.quantite).toBe(stockBefore);
    const { rows: blAfter } = await pool.query('SELECT statut FROM bons_livraison WHERE id = $1', [bl.id]);
    expect(blAfter[0].statut).toBe('annule');
    // Le BL annulé ne peut plus remettre le stock une seconde fois.
    await expect(bonLivraisonService.updateStatut(bl.id, 'annule')).rejects.toMatchObject({ statusCode: 409 });
    expect((await spl(stockedId))!.quantite).toBe(stockBefore);

    const lines = await glLines(facture_id);
    expect(lines.reduce((s, l) => s + l.debit - l.credit, 0)).toBeCloseTo(0, 2);
  });

  it('ne dépense pas l’acompte disponible et ne touche pas aux autres factures (FIFO)', async () => {
    const tiers2 = await TestDB.createTestClient({ nom: `Client acompte annulation ${suffix}` });
    tiersIds.push(tiers2);
    const a = await facture([{ produit_id: stockedId, quantite: 1 }], tiers2);
    const b = await facture([{ produit_id: stockedId, quantite: 1 }], tiers2);
    const { rows: [acompte] } = await pool.query(
      `INSERT INTO acomptes_clients (tiers_id, montant, montant_restant, date_acompte, statut, notes)
       VALUES ($1, 3000, 3000, CURRENT_TIMESTAMP, 'disponible', 'Acompte test annulation') RETURNING id`,
      [tiers2]
    );

    await factureService.annuler(a.id, adminId);

    const { rows: ac } = await pool.query('SELECT montant_restant::float AS r FROM acomptes_clients WHERE id = $1', [acompte.id]);
    expect(ac[0].r).toBe(3000);
    expect(await invoiceRow(b.id)).toMatchObject({ statut: 'en_attente', montant_paye: 0, remaining_due: 5000 });
    expect(await invoiceRow(a.id)).toMatchObject({ statut: 'annulee', remaining_due: 0 });
    expect(await solde(tiers2)).toBe(5000);
  });

  it('la commission du vendeur sort de la paie et de la fiche employé', async () => {
    const { rows: roleRows } = await pool.query("SELECT id FROM roles WHERE nom = 'caissier'");
    const { rows: userRows } = await pool.query(
      `INSERT INTO utilisateurs (username, email, password_hash, nom_complet, role_id, actif)
       VALUES ($1, $2, 'x', 'Vendeur Annulation', $3, true) RETURNING id`,
      [`vendeur-annul-${suffix}`, `vendeur-annul-${suffix}@test.local`, roleRows[0].id]
    );
    vendeurId = userRows[0].id;
    const { rows: empRows } = await pool.query(
      `INSERT INTO employes (utilisateur_id, matricule, nom_complet, date_embauche, commission_taux, actif)
       VALUES ($1, $2, 'Vendeur Annulation', CURRENT_DATE, 5, true) RETURNING id`,
      [vendeurId, `EMP-ANNUL-${suffix}`]
    );
    employeId = empRows[0].id;

    const f = await facture([{ produit_id: stockedId, quantite: 2 }], tiersId, vendeurId!);
    const today = new Date().toISOString().slice(0, 10);
    const avant = await employeService.getCommissionSummary(employeId!, today, today);
    expect(Number(avant.total_commissions)).toBeCloseTo(500, 2);

    await factureService.annuler(f.id, adminId);

    const apres = await employeService.getCommissionSummary(employeId!, today, today);
    expect(Number(apres.total_ventes)).toBe(0);
    expect(Number(apres.total_commissions)).toBe(0);
  });

  it('supprimer ensuite la facture annulée avec restaurer_stock ne remet pas le stock deux fois', async () => {
    const stockBefore = (await spl(stockedId))!.quantite;
    const f = await facture([{ produit_id: stockedId, quantite: 2 }]);
    await factureService.annuler(f.id, adminId);
    expect((await spl(stockedId))!.quantite).toBe(stockBefore);

    await factureService.delete(f.id, true, adminId);

    expect((await spl(stockedId))!.quantite).toBe(stockBefore);
  });

  it('une facture annulée ne se rétablit pas et ne s’annule pas deux fois', async () => {
    const f = await facture([{ produit_id: stockedId, quantite: 1 }]);
    await factureService.annuler(f.id, adminId);

    await expect(factureService.updateStatut(f.id, 'en_attente', adminId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'FACTURE_ANNULEE',
    });
    await expect(factureService.annuler(f.id, adminId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'FACTURE_DEJA_ANNULEE',
      message: `La facture ${f.numero_facture} est déjà annulée.`,
    });
    expect(await glLines(f.id)).toHaveLength(4);
  });

  it('refuse quand un retour client concerne la facture', async () => {
    const f = await facture([{ produit_id: stockedId, quantite: 1 }]);
    const { rows: [retour] } = await pool.query(
      `INSERT INTO retours (numero_retour, tiers_id, statut, total_remboursement)
       VALUES ($1, $2, 'en_attente', 5000) RETURNING id, numero_retour`,
      [`RET-ANNUL-${suffix}`, tiersId]
    );
    retourIds.push(retour.id);
    await pool.query(
      `INSERT INTO retour_lignes (retour_id, facture_id, produit_id, quantite, raison, prix_unitaire, total_ligne)
       VALUES ($1, $2, $3, 1, 'Défaut', 5000, 5000)`,
      [retour.id, f.id, stockedId]
    );

    await expect(factureService.annuler(f.id, adminId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'FACTURE_RETOUR_ACTIF',
      message: `Impossible d’annuler la facture ${f.numero_facture} : le retour ${retour.numero_retour} la concerne. Annulez d’abord ce retour.`,
    });
  });

  it('PUT /api/factures/:id/statut annulee répond le message et le détail ; 409 sur une facture réglée', async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const token = login.body.data.token;

    const f = await facture([{ produit_id: stockedId, quantite: 1 }]);
    const res = await request(app)
      .put(`/api/factures/${f.id}/statut`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statut: 'annulee' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(
      `Facture ${f.numero_facture} annulée : écritures contre-passées, articles remis en stock à ${principal.nom}.`
    );
    expect(res.body.data).toMatchObject({
      id: f.id,
      numero_facture: f.numero_facture,
      statut: 'annulee',
      ecritures_contre_passees: 2,
      emplacements: [{ id: principal.id, nom: principal.nom }],
    });

    const again = await request(app)
      .put(`/api/factures/${f.id}/statut`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statut: 'annulee' });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ success: false, code: 'FACTURE_DEJA_ANNULEE' });

    const paid = await facture([{ produit_id: stockedId, quantite: 1 }]);
    await pool.query(
      `INSERT INTO paiements (facture_id, montant, methode_paiement, date_paiement, source)
       VALUES ($1, 5000, 'virement', CURRENT_TIMESTAMP, 'direct')`,
      [paid.id]
    );
    const refused = await request(app)
      .put(`/api/factures/${paid.id}/statut`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statut: 'annulee' });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ success: false, code: 'FACTURE_REGLEE' });
    expect(refused.body.error).toContain(formatMontantFcfa(5000));
  });
});
