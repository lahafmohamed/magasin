import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';

export interface GenerateRunInput {
  periode: string; // 'YYYY-MM'
  notes?: string;
  cree_par?: number;
  req?: any;
}

export interface UpdatePayslipInput {
  primes?: number;
  deductions?: number;
  notes?: string;
}

/**
 * Payroll: pay runs + payslips built on employes / commissions_ventes.
 */
interface CotisationRow { taux_salarial: number; taux_patronal: number; plafond: number | null }
interface BaremeRow { tranche_min: number; tranche_max: number | null; taux: number }
interface StatutoryConfig { cotisations: CotisationRow[]; baremes: BaremeRow[] }

export class PayrollService {
  /** Load active CNPS/ITS config (called once per run/update, passed down). */
  private async loadStatutoryConfig(client?: any): Promise<StatutoryConfig> {
    const q = client || pool;
    const { rows: cot } = await q.query(
      `SELECT taux_salarial, taux_patronal, plafond FROM payroll_cotisations WHERE actif = true`
    );
    const { rows: bar } = await q.query(
      `SELECT tranche_min, tranche_max, taux FROM payroll_bareme_its WHERE actif = true ORDER BY ordre ASC`
    );
    return {
      cotisations: cot.map((r: any) => ({
        taux_salarial: Number(r.taux_salarial),
        taux_patronal: Number(r.taux_patronal),
        plafond: r.plafond === null ? null : Number(r.plafond),
      })),
      baremes: bar.map((r: any) => ({
        tranche_min: Number(r.tranche_min),
        tranche_max: r.tranche_max === null ? null : Number(r.tranche_max),
        taux: Number(r.taux),
      })),
    };
  }

  /** Progressive (marginal) ITS over a taxable amount. */
  private computeITS(taxable: number, baremes: BaremeRow[]): number {
    if (taxable <= 0) return 0;
    let its = 0;
    for (const b of baremes) {
      const upper = b.tranche_max === null ? taxable : Math.min(taxable, b.tranche_max);
      if (upper > b.tranche_min) its += (upper - b.tranche_min) * b.taux;
      if (b.tranche_max !== null && taxable <= b.tranche_max) break;
    }
    return Math.round(its * 100) / 100;
  }

  /** CNPS (and other flat cotisations) + ITS for a gross salary. */
  private computeStatutory(brut: number, cfg: StatutoryConfig): { cnps: number; its: number; patronal: number } {
    let cnps = 0;
    let patronal = 0;
    for (const c of cfg.cotisations) {
      const base = c.plafond !== null ? Math.min(brut, c.plafond) : brut;
      cnps += base * c.taux_salarial;
      patronal += base * c.taux_patronal;
    }
    cnps = Math.round(cnps * 100) / 100;
    patronal = Math.round(patronal * 100) / 100;
    const taxable = Math.max(0, brut - cnps); // social contributions are deductible from taxable base
    const its = this.computeITS(taxable, cfg.baremes);
    return { cnps, its, patronal };
  }

  /** Recompute a payslip's brut/net from its components incl. statutory retenues. */
  private computeAmounts(
    salaireBase: number, commissions: number, primes: number, deductions: number,
    cnps = 0, its = 0
  ) {
    const brut = Math.round((salaireBase + commissions + primes) * 100) / 100;
    const net = Math.round((brut - cnps - its - deductions) * 100) / 100;
    return { brut, net };
  }

  /** Recompute and persist a run's totals from its payslips (within a tx client). */
  private async recomputeRunTotals(client: any, runId: number): Promise<void> {
    await client.query(
      `UPDATE payroll_runs r SET
         total_brut               = COALESCE(s.brut, 0),
         total_commissions        = COALESCE(s.commissions, 0),
         total_primes             = COALESCE(s.primes, 0),
         total_deductions         = COALESCE(s.deductions, 0),
         total_cnps               = COALESCE(s.cnps, 0),
         total_its                = COALESCE(s.its, 0),
         total_charges_patronales = COALESCE(s.patronal, 0),
         total_net                = COALESCE(s.net, 0),
         updated_at               = CURRENT_TIMESTAMP
       FROM (
         SELECT payroll_run_id,
                SUM(salaire_brut)           AS brut,
                SUM(commissions)            AS commissions,
                SUM(primes)                 AS primes,
                SUM(deductions)             AS deductions,
                SUM(retenue_cnps)           AS cnps,
                SUM(retenue_its)            AS its,
                SUM(cotisations_patronales) AS patronal,
                SUM(salaire_net)            AS net
         FROM payslips WHERE payroll_run_id = $1 GROUP BY payroll_run_id
       ) s
       WHERE r.id = $1 AND s.payroll_run_id = r.id`,
      [runId]
    );
    // If a run has no payslips, zero its totals.
    await client.query(
      `UPDATE payroll_runs SET total_brut=0, total_commissions=0, total_primes=0, total_deductions=0,
              total_cnps=0, total_its=0, total_charges_patronales=0, total_net=0
       WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM payslips WHERE payroll_run_id = $1)`,
      [runId]
    );
  }

  /**
   * Generate a pay run for a period: one payslip per active employee, with
   * commissions earned in the period. Run starts in 'brouillon'.
   */
  async generateRun(input: GenerateRunInput): Promise<any> {
    const { periode, notes, cree_par, req } = input;
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      const err: any = new Error("Période invalide (format attendu 'YYYY-MM')");
      err.statusCode = 400;
      throw err;
    }
    const [yearStr, monthStr] = periode.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    if (month < 1 || month > 12) {
      const err: any = new Error('Mois invalide');
      err.statusCode = 400;
      throw err;
    }
    const dateDebut = `${periode}-01`;
    const dateFin = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // One active run per period (allow regenerating only after cancel).
      const { rows: existing } = await client.query(
        `SELECT id FROM payroll_runs WHERE periode = $1 AND statut != 'annule' FOR UPDATE`,
        [periode]
      );
      if (existing.length > 0) {
        const err: any = new Error(`Un cycle de paie existe déjà pour la période ${periode}`);
        err.statusCode = 409;
        throw err;
      }

      const { rows: seqRows } = await client.query("SELECT nextval('payroll_run_numero_seq') as num");
      const numero = `PAIE-${year}-${String(seqRows[0].num).padStart(4, '0')}`;

      const { rows: runRows } = await client.query(
        `INSERT INTO payroll_runs (numero, periode, date_debut, date_fin, statut, notes, cree_par)
         VALUES ($1, $2, $3, $4, 'brouillon', $5, $6) RETURNING id`,
        [numero, periode, dateDebut, dateFin, notes || null, cree_par || null]
      );
      const runId = runRows[0].id;

      // Active employees + commissions earned in the period.
      const { rows: employes } = await client.query(
        `SELECT e.id, e.nom_complet, COALESCE(e.salaire_base, 0) AS salaire_base,
                COALESCE(c.total_commissions, 0) AS commissions
         FROM employes e
         LEFT JOIN (
           SELECT employe_id, SUM(montant_commission) AS total_commissions
           FROM commissions_ventes
           WHERE date_vente BETWEEN $1 AND $2
           GROUP BY employe_id
         ) c ON c.employe_id = e.id
         WHERE e.actif = true`,
        [dateDebut, dateFin]
      );

      const cfg = await this.loadStatutoryConfig(client);
      for (const e of employes) {
        const base = Number(e.salaire_base);
        const commissions = Number(e.commissions);
        const brutOnly = Math.round((base + commissions) * 100) / 100;
        const { cnps, its, patronal } = this.computeStatutory(brutOnly, cfg);
        const { brut, net } = this.computeAmounts(base, commissions, 0, 0, cnps, its);
        await client.query(
          `INSERT INTO payslips
             (payroll_run_id, employe_id, salaire_base, commissions, primes, deductions,
              retenue_cnps, retenue_its, cotisations_patronales, salaire_brut, salaire_net)
           VALUES ($1, $2, $3, $4, 0, 0, $5, $6, $7, $8, $9)`,
          [runId, e.id, base, commissions, cnps, its, patronal, brut, net]
        );
      }

      await this.recomputeRunTotals(client, runId);
      await client.query('COMMIT');

      if (cree_par) {
        await logAudit({
          utilisateur_id: cree_par, action: 'create', table_name: 'payroll_runs',
          record_id: runId, req, new_values: { numero, periode, employes: employes.length },
        });
      }
      logger.info({ runId, numero, periode, employes: employes.length }, 'Payroll run generated');
      return this.getRunById(runId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listRuns(page = 1, limit = 20): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(
      `SELECT r.*, COUNT(s.id) AS nb_bulletins
       FROM payroll_runs r LEFT JOIN payslips s ON s.payroll_run_id = r.id
       GROUP BY r.id ORDER BY r.periode DESC, r.id DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: countRows } = await pool.query('SELECT COUNT(*) AS total FROM payroll_runs');
    return { data: rows, total: parseInt(countRows[0].total) };
  }

  async getRunById(id: number): Promise<any | null> {
    const { rows: runRows } = await pool.query('SELECT * FROM payroll_runs WHERE id = $1', [id]);
    if (runRows.length === 0) return null;
    const { rows: payslips } = await pool.query(
      `SELECT s.*, e.nom_complet, e.matricule, e.poste
       FROM payslips s JOIN employes e ON e.id = s.employe_id
       WHERE s.payroll_run_id = $1 ORDER BY e.nom_complet ASC`,
      [id]
    );
    return { ...runRows[0], payslips };
  }

  /** Adjust a payslip's primes/deductions (run must be 'brouillon'). */
  async updatePayslip(payslipId: number, input: UpdatePayslipInput, userId?: number, req?: any): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT s.*, r.statut AS run_statut, r.id AS run_id
         FROM payslips s JOIN payroll_runs r ON r.id = s.payroll_run_id
         WHERE s.id = $1 FOR UPDATE`,
        [payslipId]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        const err: any = new Error('Bulletin introuvable'); err.statusCode = 404; throw err;
      }
      const ps = rows[0];
      if (ps.run_statut !== 'brouillon') {
        await client.query('ROLLBACK');
        const err: any = new Error('Seuls les bulletins d\'un cycle en brouillon sont modifiables');
        err.statusCode = 422; throw err;
      }
      const primes = input.primes !== undefined ? Number(input.primes) : Number(ps.primes);
      const deductions = input.deductions !== undefined ? Number(input.deductions) : Number(ps.deductions);
      const base = Number(ps.salaire_base);
      const commissions = Number(ps.commissions);
      const cfg = await this.loadStatutoryConfig(client);
      const brutOnly = Math.round((base + commissions + primes) * 100) / 100;
      const { cnps, its, patronal } = this.computeStatutory(brutOnly, cfg);
      const { brut, net } = this.computeAmounts(base, commissions, primes, deductions, cnps, its);
      await client.query(
        `UPDATE payslips SET primes=$1, deductions=$2, retenue_cnps=$3, retenue_its=$4,
           cotisations_patronales=$5, salaire_brut=$6, salaire_net=$7,
           notes=COALESCE($8, notes), updated_at=CURRENT_TIMESTAMP WHERE id=$9`,
        [primes, deductions, cnps, its, patronal, brut, net, input.notes ?? null, payslipId]
      );
      await this.recomputeRunTotals(client, ps.run_id);
      await client.query('COMMIT');
      if (userId) {
        await logAudit({ utilisateur_id: userId, action: 'update', table_name: 'payslips', record_id: payslipId, req, new_values: { primes, deductions } });
      }
      return this.getRunById(ps.run_id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** brouillon -> valide */
  async validateRun(id: number, userId?: number, req?: any): Promise<any> {
    const { rowCount } = await pool.query(
      `UPDATE payroll_runs SET statut='valide', valide_par=$2, date_validation=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND statut='brouillon'`,
      [id, userId || null]
    );
    if (!rowCount) { const err: any = new Error('Cycle introuvable ou non en brouillon'); err.statusCode = 422; throw err; }
    if (userId) await logAudit({ utilisateur_id: userId, action: 'update', table_name: 'payroll_runs', record_id: id, req, new_values: { statut: 'valide' } });
    return this.getRunById(id);
  }

  /** valide -> paye (records disbursement on all payslips) */
  async markRunPaid(id: number, methodePaiement: string | undefined, userId?: number, req?: any): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT statut FROM payroll_runs WHERE id=$1 FOR UPDATE`, [id]);
      if (rows.length === 0) { await client.query('ROLLBACK'); const err: any = new Error('Cycle introuvable'); err.statusCode = 404; throw err; }
      if (rows[0].statut !== 'valide') { await client.query('ROLLBACK'); const err: any = new Error('Le cycle doit être validé avant paiement'); err.statusCode = 422; throw err; }
      await client.query(
        `UPDATE payslips SET statut='paye', methode_paiement=$2, date_paiement=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
         WHERE payroll_run_id=$1`,
        [id, methodePaiement || null]
      );
      await client.query(
        `UPDATE payroll_runs SET statut='paye', date_paiement=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [id]
      );
      await client.query('COMMIT');
      if (userId) await logAudit({ utilisateur_id: userId, action: 'update', table_name: 'payroll_runs', record_id: id, req, new_values: { statut: 'paye' } });
      return this.getRunById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** brouillon|valide -> annule */
  async cancelRun(id: number, userId?: number, req?: any): Promise<any> {
    const { rowCount } = await pool.query(
      `UPDATE payroll_runs SET statut='annule', updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND statut IN ('brouillon','valide')`,
      [id]
    );
    if (!rowCount) { const err: any = new Error('Cycle introuvable ou déjà payé/annulé'); err.statusCode = 422; throw err; }
    if (userId) await logAudit({ utilisateur_id: userId, action: 'update', table_name: 'payroll_runs', record_id: id, req, new_values: { statut: 'annule' } });
    return this.getRunById(id);
  }

  /** Delete a draft run (cascades payslips). */
  async deleteRun(id: number, userId?: number, req?: any): Promise<boolean> {
    const { rowCount } = await pool.query(`DELETE FROM payroll_runs WHERE id=$1 AND statut='brouillon'`, [id]);
    if (!rowCount) { const err: any = new Error('Seuls les cycles en brouillon peuvent être supprimés'); err.statusCode = 422; throw err; }
    if (userId) await logAudit({ utilisateur_id: userId, action: 'delete', table_name: 'payroll_runs', record_id: id, req });
    return true;
  }

  /** Full statutory config (rows with ids) for the admin UI. */
  async getConfig(): Promise<{ cotisations: any[]; baremes: any[] }> {
    const { rows: cotisations } = await pool.query(
      `SELECT id, code, libelle, taux_salarial, taux_patronal, plafond, actif
       FROM payroll_cotisations ORDER BY code ASC`
    );
    const { rows: baremes } = await pool.query(
      `SELECT id, ordre, tranche_min, tranche_max, taux, actif
       FROM payroll_bareme_its ORDER BY ordre ASC`
    );
    return { cotisations, baremes };
  }

  /** Update a single cotisation row. */
  async updateCotisation(id: number, input: { taux_salarial?: number; taux_patronal?: number; plafond?: number | null; actif?: boolean }): Promise<any> {
    const { rows } = await pool.query(
      `UPDATE payroll_cotisations SET
         taux_salarial = COALESCE($2, taux_salarial),
         taux_patronal = COALESCE($3, taux_patronal),
         plafond       = $4,
         actif         = COALESCE($5, actif),
         updated_at    = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id, input.taux_salarial ?? null, input.taux_patronal ?? null, input.plafond ?? null, input.actif ?? null]
    );
    if (!rows[0]) { const err: any = new Error('Cotisation introuvable'); err.statusCode = 404; throw err; }
    return rows[0];
  }

  /** Replace the full ITS bracket table atomically. */
  async replaceBaremes(baremes: Array<{ tranche_min: number; tranche_max: number | null; taux: number }>): Promise<any[]> {
    const sorted = [...baremes].sort((a, b) => a.tranche_min - b.tranche_min);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM payroll_bareme_its');
      for (let i = 0; i < sorted.length; i++) {
        const b = sorted[i];
        await client.query(
          `INSERT INTO payroll_bareme_its (ordre, tranche_min, tranche_max, taux, actif)
           VALUES ($1, $2, $3, $4, true)`,
          [i + 1, b.tranche_min, b.tranche_max ?? null, b.taux]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return (await this.getConfig()).baremes;
  }

  async getStats(): Promise<any> {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS total_cycles,
              COUNT(*) FILTER (WHERE statut='brouillon') AS brouillon,
              COUNT(*) FILTER (WHERE statut='valide') AS valide,
              COUNT(*) FILTER (WHERE statut='paye') AS paye,
              COALESCE(SUM(total_net) FILTER (WHERE statut='paye'), 0) AS total_net_paye
       FROM payroll_runs`
    );
    return rows[0];
  }
}

export const payrollService = new PayrollService();
