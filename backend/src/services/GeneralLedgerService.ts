import pool from '../db/connection';
import { BaseService } from './BaseService';
import { logger } from '../utils/logger';
import { checkPeriodIsOpen } from './PeriodService';
import { businessError } from '../utils/errors';
import { logAudit } from '../middleware/audit';

export interface EcritureComptableRecord {
  id: number;
  numero_piece: string | null;
  date_ecriture: string;
  journal: string;
  reference_id: number | null;
  reference_type: string | null;
  compte_numero: string;
  debit: number;
  credit: number;
  libelle: string | null;
}

export interface PlanComptableRecord {
  id: number;
  numero: string;
  intitule: string;
  type_compte: string;
  categorie: string | null;
  actif: boolean;
}

export interface BalanceComptable {
  compte_id: number;
  compte_numero: string;
  compte_intitule: string;
  total_debit: number;
  total_credit: number;
  solde: number;
}

export class GeneralLedgerService extends BaseService<EcritureComptableRecord> {
  protected tableName = 'ecritures_comptables';
  protected selectColumns = 'ec.id, ec.numero_piece, ec.date_ecriture, ec.journal, ec.reference_id, ec.reference_type, ec.compte_numero, ec.debit, ec.credit, ec.libelle, ec.libelle as description, ec.date_saisie, pc.numero as compte_pc_numero, pc.intitule as compte_intitule';
  protected defaultSortColumn = 'date_ecriture';
  protected allowedSortColumns = ['date_ecriture', 'journal', 'numero_piece'];

  /**
   * Get all journal entries with pagination
   */
  async getAll(options?: { journal?: string; date_debut?: string; date_fin?: string; compte_id?: number; page?: number; limit?: number }): Promise<{ data: any[]; total: number }> {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const offset = (page - 1) * limit;

    let query = `
      SELECT ${this.selectColumns}
      FROM ecritures_comptables ec
      LEFT JOIN plan_comptable pc ON pc.numero = ec.compte_numero
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.journal) {
      query += ` AND ec.journal = $${params.length + 1}`;
      params.push(options.journal);
    }

    if (options?.date_debut) {
      query += ` AND ec.date_ecriture >= $${params.length + 1}::timestamp`;
      params.push(options.date_debut);
    }

    if (options?.date_fin) {
      query += ` AND ec.date_ecriture <= $${params.length + 1}::timestamp`;
      params.push(options.date_fin);
    }

    if (options?.compte_id) {
      // compte_id from the API is the plan_comptable.id; resolve to its numero.
      query += ` AND ec.compte_numero = (SELECT numero FROM plan_comptable WHERE id = $${params.length + 1})`;
      params.push(options.compte_id);
    }

    query += ' ORDER BY ec.date_ecriture DESC, ec.id ASC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM ecritures_comptables ec WHERE 1=1`;
    const countParams: any[] = [];
    if (options?.journal) {
      countQuery += ` AND ec.journal = $${countParams.length + 1}`;
      countParams.push(options.journal);
    }
    if (options?.date_debut) {
      countQuery += ` AND ec.date_ecriture >= $${countParams.length + 1}::timestamp`;
      countParams.push(options.date_debut);
    }
    if (options?.date_fin) {
      countQuery += ` AND ec.date_ecriture <= $${countParams.length + 1}::timestamp`;
      countParams.push(options.date_fin);
    }
    if (options?.compte_id) {
      countQuery += ` AND ec.compte_numero = (SELECT numero FROM plan_comptable WHERE id = $${countParams.length + 1})`;
      countParams.push(options.compte_id);
    }
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);

    return { data: rows, total };
  }

  /**
   * Get chart of accounts
   */
  async getChartOfAccounts(actifOnly: boolean = true): Promise<PlanComptableRecord[]> {
    let query = 'SELECT * FROM plan_comptable';
    const params: any[] = [];

    if (actifOnly) {
      query += ' WHERE actif = $1';
      params.push(true);
    }

    query += ' ORDER BY numero ASC';

    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Get trial balance (Balance comptable)
   */
  async getTrialBalance(dateDebut: string, dateFin: string): Promise<BalanceComptable[]> {
    const { rows } = await pool.query(
      `SELECT 
        pc.id as compte_id,
        pc.numero as compte_numero,
        pc.intitule as compte_intitule,
        COALESCE(SUM(ec.debit), 0) as total_debit,
        COALESCE(SUM(ec.credit), 0) as total_credit,
        COALESCE(SUM(ec.debit), 0) - COALESCE(SUM(ec.credit), 0) as solde
       FROM plan_comptable pc
       LEFT JOIN ecritures_comptables ec ON pc.numero = ec.compte_numero
         AND ec.date_ecriture BETWEEN $1::timestamp AND $2::timestamp
       WHERE pc.actif = true
       GROUP BY pc.id, pc.numero, pc.intitule
       HAVING COALESCE(SUM(ec.debit), 0) > 0 OR COALESCE(SUM(ec.credit), 0) > 0
       ORDER BY pc.numero ASC`,
      [dateDebut, dateFin]
    );
    return rows;
  }

  /**
   * Compte de résultat (income statement) over a period.
   * SYSCOHADA: class 6 = charges, class 7 = produits. Résultat = produits - charges.
   */
  async getIncomeStatement(dateDebut: string, dateFin: string): Promise<{
    charges: Array<{ compte_numero: string; compte_intitule: string; montant: number }>;
    produits: Array<{ compte_numero: string; compte_intitule: string; montant: number }>;
    total_charges: number;
    total_produits: number;
    resultat: number;
  }> {
    const { rows } = await pool.query(
      `SELECT pc.numero AS compte_numero, pc.intitule AS compte_intitule,
              COALESCE(SUM(ec.debit), 0)  AS total_debit,
              COALESCE(SUM(ec.credit), 0) AS total_credit
       FROM plan_comptable pc
       LEFT JOIN ecritures_comptables ec ON pc.numero = ec.compte_numero
         AND ec.date_ecriture BETWEEN $1::timestamp AND $2::timestamp
       WHERE pc.actif = true AND LEFT(pc.numero, 1) IN ('6', '7')
       GROUP BY pc.numero, pc.intitule
       HAVING COALESCE(SUM(ec.debit), 0) <> 0 OR COALESCE(SUM(ec.credit), 0) <> 0
       ORDER BY pc.numero ASC`,
      [dateDebut, dateFin]
    );

    const charges: Array<{ compte_numero: string; compte_intitule: string; montant: number }> = [];
    const produits: Array<{ compte_numero: string; compte_intitule: string; montant: number }> = [];
    let total_charges = 0;
    let total_produits = 0;

    for (const r of rows) {
      const debit = Number(r.total_debit);
      const credit = Number(r.total_credit);
      if (String(r.compte_numero)[0] === '6') {
        const montant = Math.round((debit - credit) * 100) / 100; // charges: debit-positive
        charges.push({ compte_numero: r.compte_numero, compte_intitule: r.compte_intitule, montant });
        total_charges += montant;
      } else {
        const montant = Math.round((credit - debit) * 100) / 100; // produits: credit-positive
        produits.push({ compte_numero: r.compte_numero, compte_intitule: r.compte_intitule, montant });
        total_produits += montant;
      }
    }

    total_charges = Math.round(total_charges * 100) / 100;
    total_produits = Math.round(total_produits * 100) / 100;
    const resultat = Math.round((total_produits - total_charges) * 100) / 100;
    return { charges, produits, total_charges, total_produits, resultat };
  }

  /**
   * Bilan (balance sheet): cumulative balances from inception up to dateFin.
   * SYSCOHADA classes 1-5. Class 2/3 = actif, class 1 = passif (capitaux),
   * class 4/5 = actif if débiteur else passif. Résultat (produits-charges,
   * cumulative) is reported in passif so total actif = total passif.
   */
  async getBalanceSheet(dateFin: string): Promise<{
    actif: Array<{ compte_numero: string; compte_intitule: string; montant: number }>;
    passif: Array<{ compte_numero: string; compte_intitule: string; montant: number }>;
    resultat: number;
    total_actif: number;
    total_passif: number;
  }> {
    const { rows } = await pool.query(
      `SELECT pc.numero AS compte_numero, pc.intitule AS compte_intitule,
              COALESCE(SUM(ec.debit), 0) - COALESCE(SUM(ec.credit), 0) AS solde
       FROM plan_comptable pc
       LEFT JOIN ecritures_comptables ec ON pc.numero = ec.compte_numero
         AND ec.date_ecriture <= $1::timestamp
       WHERE pc.actif = true AND LEFT(pc.numero, 1) IN ('1', '2', '3', '4', '5')
       GROUP BY pc.numero, pc.intitule
       HAVING COALESCE(SUM(ec.debit), 0) - COALESCE(SUM(ec.credit), 0) <> 0
       ORDER BY pc.numero ASC`,
      [dateFin]
    );

    const actif: Array<{ compte_numero: string; compte_intitule: string; montant: number }> = [];
    const passif: Array<{ compte_numero: string; compte_intitule: string; montant: number }> = [];
    let total_actif = 0;
    let total_passif = 0;

    for (const r of rows) {
      const solde = Math.round(Number(r.solde) * 100) / 100;
      const cls = String(r.compte_numero)[0];
      const entry = { compte_numero: r.compte_numero, compte_intitule: r.compte_intitule, montant: 0 };
      if (cls === '2' || cls === '3') {
        entry.montant = solde; // actif (débiteur)
        actif.push(entry);
        total_actif += solde;
      } else if (cls === '1') {
        entry.montant = -solde; // passif (créditeur)
        passif.push(entry);
        total_passif += -solde;
      } else {
        // class 4/5: sign decides side
        if (solde >= 0) { entry.montant = solde; actif.push(entry); total_actif += solde; }
        else { entry.montant = -solde; passif.push(entry); total_passif += -solde; }
      }
    }

    // Résultat net (cumulative produits - charges up to dateFin) belongs to passif.
    const { rows: resRows } = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN LEFT(compte_numero,1)='7' THEN credit - debit ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN LEFT(compte_numero,1)='6' THEN debit - credit ELSE 0 END), 0) AS resultat
       FROM ecritures_comptables
       WHERE date_ecriture <= $1::timestamp AND LEFT(compte_numero,1) IN ('6','7')`,
      [dateFin]
    );
    const resultat = Math.round(Number(resRows[0].resultat) * 100) / 100;
    total_passif += resultat;

    return {
      actif,
      passif,
      resultat,
      total_actif: Math.round(total_actif * 100) / 100,
      total_passif: Math.round(total_passif * 100) / 100,
    };
  }

  /**
   * Get account ledger (Grand livre d'un compte)
   */
  async getAccountLedger(compteId: number, dateDebut: string, dateFin: string): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT ec.*, pc.intitule as compte_intitule,
              SUM(ec.debit - ec.credit) OVER (ORDER BY ec.date_ecriture, ec.id) as solde_cumule
       FROM ecritures_comptables ec
       JOIN plan_comptable pc ON pc.numero = ec.compte_numero
       WHERE ec.compte_numero = (SELECT numero FROM plan_comptable WHERE id = $1)
         AND ec.date_ecriture BETWEEN $2::timestamp AND $3::timestamp
       ORDER BY ec.date_ecriture ASC, ec.id ASC`,
      [compteId, dateDebut, dateFin]
    );
    return rows;
  }

  /**
   * Get journal entries by document reference
   */
  async getByDocument(pieceType: string, pieceId: number): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT ${this.selectColumns}
       FROM ecritures_comptables ec
       LEFT JOIN plan_comptable pc ON pc.numero = ec.compte_numero
       WHERE ec.reference_type = $1 AND ec.reference_id = $2
       ORDER BY ec.id ASC`,
      [pieceType, pieceId]
    );
    return rows;
  }

  /**
   * Manual journal entry creation (for accountants)
   */
  async createManualEntry(
    numeroPiece: string,
    journal: string,
    dateEcriture: string,
    lignes: Array<{ compte_id: number; debit: number; credit: number; description?: string }>,
    userId?: number
  ): Promise<void> {
    const client = await pool.connect();
    let firstEcritureId: number | null = null;

    try {
      await client.query('BEGIN');

      // Manual entries must not post into a closed accounting period.
      await checkPeriodIsOpen(new Date(dateEcriture), client);

      // Validate balanced entry
      const totalDebit = lignes.reduce((sum, l) => sum + l.debit, 0);
      const totalCredit = lignes.reduce((sum, l) => sum + l.credit, 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw businessError(400, `L'écriture n'est pas équilibrée: Débit ${totalDebit} ≠ Crédit ${totalCredit}`);
      }

      // Guard against malformed payloads that would fail on NOT NULL/FK constraints.
      for (let i = 0; i < lignes.length; i++) {
        const ligne = lignes[i];
        const compteId = Number((ligne as any).compte_id);
        const debit = Number((ligne as any).debit);
        const credit = Number((ligne as any).credit);

        if (!Number.isInteger(compteId) || compteId <= 0) {
          throw businessError(400, `Ligne ${i + 1}: compte_id invalide ou manquant`);
        }

        if (!Number.isFinite(debit) || debit < 0 || !Number.isFinite(credit) || credit < 0) {
          throw businessError(400, `Ligne ${i + 1}: débit/crédit invalide`);
        }

        if (debit === 0 && credit === 0) {
          throw businessError(400, `Ligne ${i + 1}: débit et crédit ne peuvent pas être tous les deux à zéro`);
        }
      }

      // Insert each line. The API passes compte_id (plan_comptable.id); resolve
      // it to the canonical compte_numero used by the 069 schema.
      for (let i = 0; i < lignes.length; i++) {
        const ligne = lignes[i];
        const { rows: compteRows } = await client.query(
          `SELECT numero FROM plan_comptable WHERE id = $1`,
          [ligne.compte_id]
        );
        if (!compteRows.length) {
          throw businessError(404, `Ligne ${i + 1}: compte introuvable (id ${ligne.compte_id})`);
        }
        const compteNumero = compteRows[0].numero;

        const { rows: inserted } = await client.query(
          `INSERT INTO ecritures_comptables
           (numero_piece, date_ecriture, journal, compte_numero, debit, credit, libelle, cree_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [numeroPiece, dateEcriture, journal, compteNumero, ligne.debit, ligne.credit, ligne.description || null, userId || null]
        );
        if (i === 0) firstEcritureId = inserted[0].id;
      }

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: userId ?? null,
        action: 'create',
        table_name: 'ecritures_comptables',
        record_id: firstEcritureId ?? 0,
        new_values: { numero_piece: numeroPiece, journal, lignes: lignes.length },
      });

      logger.info({ numeroPiece, journal, lignes: lignes.length }, 'Manual journal entry created');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error creating manual journal entry');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get accounting statistics
   */
  async getStats(dateDebut?: string, dateFin?: string): Promise<any> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (dateDebut) {
      whereClause += ` AND date_ecriture >= $${params.length + 1}::timestamp`;
      params.push(dateDebut);
    }

    if (dateFin) {
      whereClause += ` AND date_ecriture <= $${params.length + 1}::timestamp`;
      params.push(dateFin);
    }

    const { rows } = await pool.query(
      `SELECT
        COUNT(*) as total_ecritures,
        COALESCE(SUM(debit), 0) as total_debit,
        COALESCE(SUM(credit), 0) as total_credit,
        COUNT(DISTINCT numero_piece) as total_pieces,
        COUNT(DISTINCT journal) as total_journaux
       FROM ecritures_comptables
       ${whereClause}`,
      params
    );
    return rows[0];
  }

  /**
   * Get journal breakdown by type
   */
  async getJournalBreakdown(dateDebut: string, dateFin: string): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT 
        journal,
        COUNT(*) as nombre_ecritures,
        COALESCE(SUM(debit), 0) as total_debit,
        COALESCE(SUM(credit), 0) as total_credit
       FROM ecritures_comptables
       WHERE date_ecriture BETWEEN $1::timestamp AND $2::timestamp
       GROUP BY journal
       ORDER BY journal ASC`,
      [dateDebut, dateFin]
    );
    return rows;
  }
}

export const generalLedgerService = new GeneralLedgerService();
