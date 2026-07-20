import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { checkPeriodIsOpen } from './PeriodService';

interface EcritureInput {
  journal?: string;
  date_ecriture: string;
  compte_numero: string;
  tiers_id?: number;
  libelle: string;
  debit: number;
  credit: number;
  reference_type?: string;
  reference_id?: number;
  cree_par?: number;
}

interface PieceInput {
  journal: string;
  date_ecriture: string;
  libelle: string;
  lignes: { compte_numero: string; debit: number; credit: number; tiers_id?: number }[];
  reference_type?: string;
  reference_id?: number;
  cree_par?: number;
}

export class ComptabiliteService {
  // ========== PLAN COMPTABLE ==========

  async getPlanComptable(classe?: number): Promise<any[]> {
    let query = 'SELECT * FROM plan_comptable WHERE actif = true';
    const params: any[] = [];
    if (classe) {
      query += ' AND classe = $1';
      params.push(classe);
    }
    query += ' ORDER BY numero ASC';
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async chercherCompte(search: string): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT * FROM plan_comptable
       WHERE actif = true
         AND (numero ILIKE $1 OR intitule ILIKE $1)
       ORDER BY numero ASC LIMIT 20`,
      [`%${search}%`]
    );
    return rows;
  }

  // ========== ÉCRITURES ==========

  /**
   * Enregistre une pièce comptable (ensemble d'écritures équilibré)
   * Vérifie que total débit = total crédit avant insertion
   */
  async enregistrerPiece(input: PieceInput): Promise<{ id: number; numero_piece: string }> {
    // 'OD' (opérations diverses) — the only valid default under the ecritures_comptables
    // journal CHECK (ACHATS/VENTES/TRESORERIE/OD). Callers may override.
    const { journal = 'OD', date_ecriture, libelle, lignes, reference_type, reference_id, cree_par } = input;

    if (!lignes || lignes.length < 2) {
      throw new Error('Une pièce doit contenir au moins 2 lignes');
    }

    const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Écriture non équilibrée: débit ${totalDebit} ≠ crédit ${totalCredit}`);
    }

    const { rows: seqRows } = await pool.query("SELECT nextval('piece_comptable_seq') as num");
    const numeroPiece = `PC-${new Date().getFullYear()}-${String(seqRows[0].num).padStart(5, '0')}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Refuse posting into a closed accounting period (nice 422 before the DB trigger fires).
      await checkPeriodIsOpen(new Date(date_ecriture), client);

      for (const ligne of lignes) {
        await client.query(
          `INSERT INTO ecritures_comptables
             (journal, numero_piece, date_ecriture, compte_numero, tiers_id, libelle, debit, credit,
              reference_type, reference_id, cree_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            journal, numeroPiece, date_ecriture, ligne.compte_numero,
            ligne.tiers_id || null, libelle, ligne.debit, ligne.credit,
            reference_type || null, reference_id || null, cree_par || null,
          ]
        );
      }

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: cree_par ?? null,
        action: 'create',
        table_name: 'ecritures_comptables',
        record_id: seqRows[0].num,
        new_values: { numero_piece: numeroPiece, journal, libelle, lignes: lignes.length },
      });

      return { id: seqRows[0].num, numero_piece: numeroPiece };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Récupère les écritures avec pagination et filtres
   */
  async getEcritures(options: {
    date_debut?: string;
    date_fin?: string;
    journal?: string;
    compte_numero?: string;
    tiers_id?: number;
    page?: number;
    limit?: number;
  } = {}): Promise<{ data: any[]; total: number; total_debit: number; total_credit: number }> {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    let query = 'SELECT e.*, pc.intitule as compte_intitule FROM ecritures_comptables e LEFT JOIN plan_comptable pc ON e.compte_numero = pc.numero WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (options.date_debut) {
      query += ` AND e.date_ecriture >= $${paramIdx++}`;
      params.push(options.date_debut);
    }
    if (options.date_fin) {
      query += ` AND e.date_ecriture <= $${paramIdx++}`;
      params.push(options.date_fin);
    }
    if (options.journal) {
      query += ` AND e.journal = $${paramIdx++}`;
      params.push(options.journal);
    }
    if (options.compte_numero) {
      query += ` AND e.compte_numero LIKE $${paramIdx++}`;
      params.push(`${options.compte_numero}%`);
    }
    if (options.tiers_id) {
      query += ` AND e.tiers_id = $${paramIdx++}`;
      params.push(options.tiers_id);
    }

    // Total count & sums — fully parameterized (no string interpolation, SQLi safe)
    let countQuery = `SELECT COUNT(*) as total, COALESCE(SUM(debit), 0) as total_debit, COALESCE(SUM(credit), 0) as total_credit FROM ecritures_comptables e WHERE 1=1`;
    const countParams: any[] = [];
    let countIdx = 1;
    if (options.date_debut) {
      countQuery += ` AND e.date_ecriture >= $${countIdx++}`;
      countParams.push(options.date_debut);
    }
    if (options.date_fin) {
      countQuery += ` AND e.date_ecriture <= $${countIdx++}`;
      countParams.push(options.date_fin);
    }
    if (options.journal) {
      countQuery += ` AND e.journal = $${countIdx++}`;
      countParams.push(options.journal);
    }
    if (options.compte_numero) {
      countQuery += ` AND e.compte_numero LIKE $${countIdx++}`;
      countParams.push(`${options.compte_numero}%`);
    }
    if (options.tiers_id) {
      countQuery += ` AND e.tiers_id = $${countIdx++}`;
      countParams.push(options.tiers_id);
    }
    const countResult = await pool.query(countQuery, countParams);

    query += ' ORDER BY e.date_ecriture DESC, e.id ASC';
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    return {
      data: rows,
      total: parseInt(countResult.rows[0].total),
      total_debit: parseFloat(countResult.rows[0].total_debit),
      total_credit: parseFloat(countResult.rows[0].total_credit),
    };
  }

  /**
   * Grand-livre : toutes les écritures d'un compte sur une période
   */
  async getGrandLivre(compteNumero: string, dateDebut?: string, dateFin?: string): Promise<any[]> {
    let query = `SELECT e.*, pc.intitule as compte_intitule
                 FROM ecritures_comptables e
                 LEFT JOIN plan_comptable pc ON e.compte_numero = pc.numero
                 WHERE e.compte_numero = $1`;
    const params: any[] = [compteNumero];
    let paramIdx = 2;

    if (dateDebut) {
      query += ` AND e.date_ecriture >= $${paramIdx++}`;
      params.push(dateDebut);
    }
    if (dateFin) {
      query += ` AND e.date_ecriture <= $${paramIdx++}`;
      params.push(dateFin);
    }

    query += ' ORDER BY e.date_ecriture ASC, e.id ASC';

    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Balance générale : soldes de tous les comptes sur une période
   */
  async getBalance(dateDebut?: string, dateFin?: string): Promise<any[]> {
    let query = `SELECT
                  pc.numero, pc.intitule, pc.classe, pc.type_compte,
                  COALESCE(SUM(e.debit), 0) as total_debit,
                  COALESCE(SUM(e.credit), 0) as total_credit,
                  COALESCE(SUM(e.debit), 0) - COALESCE(SUM(e.credit), 0) as solde
                 FROM plan_comptable pc
                 LEFT JOIN ecritures_comptables e ON pc.numero = e.compte_numero`;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;
    if (dateDebut) { conditions.push(`e.date_ecriture >= $${paramIdx++}`); params.push(dateDebut); }
    if (dateFin) { conditions.push(`e.date_ecriture <= $${paramIdx++}`); params.push(dateFin); }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY pc.numero, pc.intitule, pc.classe, pc.type_compte';
    query += ' ORDER BY pc.numero ASC';

    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Journal général : toutes les écritures triées par date
   */
  async getJournal(dateDebut?: string, dateFin?: string, journal?: string): Promise<any[]> {
    let query = `SELECT e.*, pc.intitule as compte_intitule
                 FROM ecritures_comptables e
                 LEFT JOIN plan_comptable pc ON e.compte_numero = pc.numero
                 WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (dateDebut) {
      query += ` AND e.date_ecriture >= $${paramIdx++}`;
      params.push(dateDebut);
    }
    if (dateFin) {
      query += ` AND e.date_ecriture <= $${paramIdx++}`;
      params.push(dateFin);
    }
    if (journal) {
      query += ` AND e.journal = $${paramIdx++}`;
      params.push(journal);
    }

    query += ' ORDER BY e.date_ecriture ASC, e.numero_piece ASC, e.id ASC';
    const { rows } = await pool.query(query, params);
    return rows;
  }

  // NOTE: the former app-level auto-posting helpers (ecrituresFromFacture/
  // Paiement/Depense) were removed — they had zero callers and duplicated the
  // DB triggers that are the single source of journal entries (see migration 072).

  // ========== TRÉSORERIE PRÉVISIONNELLE ==========

  async getTresoreriePrevisionnelle(jours: number = 90): Promise<any> {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + jours);
    const endDateStr = endDate.toISOString().slice(0, 10);

    const { rows: encaissements } = await pool.query(
      `SELECT
         f.date_echeance as echeance,
         f.remaining_due as montant,
         f.numero_facture as reference,
         t.raison_sociale as tiers_nom
       FROM factures f
       LEFT JOIN tiers t ON f.tiers_id = t.id
       WHERE f.statut IN ('en_attente', 'partielle')
         AND f.deleted_at IS NULL
         AND f.date_echeance >= CURRENT_DATE
         AND f.date_echeance <= $1::DATE
       ORDER BY f.date_echeance ASC`,
      [endDateStr]
    );

    const { rows: decaissements } = await pool.query(
      `SELECT
         c.date_livraison_prevue as echeance,
         c.sous_total as montant,
         c.numero_commande as reference,
         t.raison_sociale as tiers_nom
       FROM commandes_fournisseur c
       LEFT JOIN tiers t ON c.tiers_id = t.id
       WHERE c.statut NOT IN ('livree', 'annulee')
         AND c.deleted_at IS NULL
         AND c.date_livraison_prevue >= CURRENT_DATE
         AND c.date_livraison_prevue <= $1::DATE
       ORDER BY c.date_livraison_prevue ASC`,
      [endDateStr]
    );

    const { rows: depenses } = await pool.query(
      `SELECT
         d.date_depense as echeance,
         d.montant,
         d.numero_depense as reference,
         d.description
       FROM depenses d
       WHERE d.deleted_at IS NULL
         AND d.date_depense >= CURRENT_DATE
         AND d.date_depense <= $1::DATE
       ORDER BY d.date_depense ASC`,
      [endDateStr]
    );

    // Aggrégation par période (7 jours)
    const echeancier: { debut: string; fin: string; encaissements: number; decaissements: number; solde: number }[] = [];
    const maintenant = new Date();

    for (let i = 0; i < jours; i += 7) {
      const debut = new Date(maintenant.getTime() + i * 86400000);
      const fin = new Date(maintenant.getTime() + Math.min(i + 6, jours - 1) * 86400000);
      const d = debut.toISOString().slice(0, 10);
      const f = fin.toISOString().slice(0, 10);

      const enc = encaissements
        .filter((e: any) => e.echeance >= d && e.echeance <= f)
        .reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0);

      const dec = decaissements
        .filter((e: any) => e.echeance >= d && e.echeance <= f)
        .reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0)
        + depenses
          .filter((e: any) => e.echeance >= d && e.echeance <= f)
          .reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0);

      echeancier.push({
        debut: debut.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        fin: fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        encaissements: enc,
        decaissements: dec,
        solde: enc - dec,
      });
    }

    return {
      echeancier,
      encaissements,
      decaissements,
      depenses,
      total_encaissements: encaissements.reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0),
      total_decaissements: decaissements.reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0)
        + depenses.reduce((s: number, e: any) => s + parseFloat(e.montant || 0), 0),
    };
  }

  // ========== RATIOS FINANCIERS ==========

  async getRatiosFinanciers(dateDebut?: string, dateFin?: string): Promise<any> {
    if (!dateDebut) {
      const d = new Date();
      d.setMonth(d.getMonth() - 12);
      dateDebut = d.toISOString().slice(0, 10);
    }
    if (!dateFin) {
      dateFin = new Date().toISOString().slice(0, 10);
    }

    const [pnl, stockValue, clients, fournisseurs] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(f.total) FILTER (WHERE f.statut != 'annulee'), 0) as chiffre_affaires,
           COALESCE(SUM(f.total * 0.7), 0) as cout_ventes_estime -- estimation 70% marge
         FROM factures f
         WHERE f.date_facture BETWEEN $1 AND $2 AND f.deleted_at IS NULL`,
        [dateDebut, dateFin]
      ),
      pool.query(
        // Canonical inventory valuation: maintained per-location value (= quantite × cmp),
        // kept correct on receptions, sales and transfers by trigger trg_stock_valeur_invariant (076).
        `SELECT COALESCE(SUM(spl.valeur_stock), 0) as valeur_stock
         FROM stock_par_location spl
         JOIN produits p ON p.id = spl.produit_id
         WHERE p.deleted_at IS NULL`
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(f.remaining_due) FILTER (WHERE f.statut IN ('en_attente', 'partielle') AND f.deleted_at IS NULL), 0) as creances
         FROM factures f
         WHERE f.deleted_at IS NULL`
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(montant_restant), 0) as dettes_fournisseurs
         FROM acomptes
         WHERE statut = 'actif' AND direction = 'sortant'`
      ),
    ]);

    const ca = parseFloat(pnl.rows[0].chiffre_affaires);
    const coutVentes = parseFloat(pnl.rows[0].cout_ventes_estime);
    const stock = parseFloat(stockValue.rows[0].valeur_stock);
    const creances = parseFloat(clients.rows[0].creances);
    const dettesFourn = parseFloat(fournisseurs.rows[0].dettes_fournisseurs);

    // Calcul des ratios
    const margeBrute = ca > 0 ? ((ca - coutVentes) / ca) * 100 : 0;
    const delaiClient = ca > 0 ? (creances / (ca / 365)) : 0;
    const rotationStock = coutVentes > 0 ? (stock / (coutVentes / 365)) : 0;
    const bfr = creances + stock - dettesFourn;

    return {
      periode: { debut: dateDebut, fin: dateFin },
      chiffre_affaires: ca,
      marge_brute: { valeur: ca - coutVentes, pourcentage: Math.round(margeBrute * 100) / 100 },
      besoin_fonds_roulement: Math.round(bfr),
      ratios: {
        delai_moyen_client: Math.round(delaiClient),
        rotation_stock: Math.round(rotationStock),
        ratio_liquidite: dettesFourn > 0 ? Math.round(((creances + stock) / dettesFourn) * 100) / 100 : 0,
      },
      creances,
      dettes_fournisseurs: dettesFourn,
      valeur_stock: stock,
    };
  }
}

export const comptabiliteService = new ComptabiliteService();
