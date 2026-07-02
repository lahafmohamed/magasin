import type { PoolClient } from 'pg';

/**
 * Client credit-limit enforcement (O2C control).
 *
 * A tiers' credit exposure is the live sum of `remaining_due` across its
 * non-cancelled invoices — the same figure cached in `tiers.solde_client_actuel`
 * by the allocation services, recomputed here so the check never trusts a stale
 * cache and holds a row lock against concurrent credit-extending documents.
 *
 * `credit_max <= 0` means "no limit configured" and the check is skipped.
 */
export class CreditService {
  /**
   * Assert that extending `additionalAmount` of credit to `tiersId` keeps the
   * client within its configured limit. Must run inside the caller's
   * transaction so the FOR UPDATE lock on the tiers row serialises concurrent
   * credit-extending documents (BL, direct invoice).
   *
   * Throws a 422 business error (`code: 'CREDIT_LIMIT_EXCEEDED'`) when the
   * limit would be breached.
   */
  async assertWithinCreditLimit(
    dbClient: PoolClient,
    tiersId: number,
    additionalAmount: number
  ): Promise<void> {
    const { rows: tiersRows } = await dbClient.query(
      `SELECT raison_sociale, prenom, COALESCE(credit_max, 0) AS credit_max
         FROM tiers
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE`,
      [tiersId]
    );

    if (tiersRows.length === 0) {
      const err: any = new Error(`Tiers ID ${tiersId} non trouvé`);
      err.statusCode = 404;
      err.code = 'TIERS_NOT_FOUND';
      throw err;
    }

    const creditMax = parseFloat(tiersRows[0].credit_max) || 0;
    if (creditMax <= 0) {
      return; // no limit configured
    }

    const { rows: soldeRows } = await dbClient.query(
      `SELECT COALESCE(SUM(remaining_due), 0) AS encours
         FROM factures
        WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL`,
      [tiersId]
    );

    const encours = parseFloat(soldeRows[0].encours) || 0;
    const encoursApres = encours + additionalAmount;

    if (encoursApres > creditMax) {
      const nom = `${tiersRows[0].raison_sociale || ''} ${tiersRows[0].prenom || ''}`.trim();
      const err: any = new Error(
        `Plafond de crédit dépassé pour ${nom}. Limite: ${creditMax.toFixed(2)}, ` +
          `Encours actuel: ${encours.toFixed(2)}, Après opération: ${encoursApres.toFixed(2)}`
      );
      err.statusCode = 422;
      err.code = 'CREDIT_LIMIT_EXCEEDED';
      throw err;
    }
  }
}

export const creditService = new CreditService();
