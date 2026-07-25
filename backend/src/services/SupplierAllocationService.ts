import { PoolClient } from 'pg';
import pool from '../db/connection';
import { logger } from '../utils/logger';

interface AllocateOptions {
  transaction?: PoolClient;
  userId?: number | null;
}

export interface SupplierAllocationResult {
  tiersId: number;
  facturesUpdated: number;
  totalAllocated: number;
  surplus: number;
}

export interface SupplierRepairResult {
  tiersId: number;
  acomptesRepaired: number;
  facturesRepaired: number;
  allocation: SupplierAllocationResult;
}

/**
 * FIFO allocation of supplier advances to the oldest outstanding invoices.
 * Applying an advance creates a supplier payment/application but no caisse
 * movement: the cash movement already happened when the advance was recorded.
 */
export class SupplierAllocationService {
  static async allocateAvailableAdvances(
    tiersId: number,
    options: AllocateOptions = {},
  ): Promise<SupplierAllocationResult> {
    if (!options.transaction) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await this.allocateAvailableAdvances(tiersId, {
          transaction: client,
          userId: options.userId,
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const client = options.transaction;
    const { rows: advances } = await client.query(
      `SELECT id, montant_restant, methode_paiement, date_acompte, magasin_id, cree_par
       FROM acomptes_fournisseur
       WHERE tiers_id = $1
         AND statut IN ('disponible', 'partiellement_utilise')
         AND montant_restant > 0
         AND deleted_at IS NULL
       ORDER BY date_acompte ASC, id ASC
       FOR UPDATE`,
      [tiersId],
    );

    const { rows: factures } = await client.query(
      `SELECT id, total, COALESCE(montant_paye, 0) AS montant_paye,
              GREATEST(total - COALESCE(montant_paye, 0), 0) AS restant
       FROM factures_fournisseur
       WHERE tiers_id = $1
         AND statut != 'annulee'
         AND GREATEST(total - COALESCE(montant_paye, 0), 0) > 0
       ORDER BY date_facture ASC, id ASC
       FOR UPDATE`,
      [tiersId],
    );

    let totalAllocated = 0;
    const updatedFactureIds = new Set<number>();

    for (const advance of advances) {
      let advanceRemaining = Number(advance.montant_restant);

      for (const facture of factures) {
        if (advanceRemaining <= 0) break;
        const factureRemaining = Number(facture.restant);
        if (factureRemaining <= 0) continue;

        const montant = Math.min(advanceRemaining, factureRemaining);
        const reference = `ACOF-AUTO-${advance.id}-${facture.id}`;
        const { rows: paymentRows } = await client.query(
          `INSERT INTO paiements_fournisseur (
             facture_id, montant, methode_paiement, date_paiement, reference,
             notes, magasin_id, source, idempotency_key, effectue_par
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,'acompte_application',$8,$9)
           RETURNING id`,
          [
            facture.id,
            montant,
            advance.methode_paiement || 'virement',
            advance.date_acompte,
            reference,
            `Affectation automatique de l'acompte fournisseur #${advance.id}`,
            advance.magasin_id || null,
            `acof-auto:${advance.id}:${facture.id}`,
            options.userId ?? advance.cree_par ?? null,
          ],
        );

        await client.query(
          `INSERT INTO acompte_applications_fournisseur
             (acompte_id, facture_id, paiement_id, montant, cree_par, notes)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            advance.id,
            facture.id,
            paymentRows[0].id,
            montant,
            options.userId ?? advance.cree_par ?? null,
            'Affectation FIFO automatique',
          ],
        );

        advanceRemaining -= montant;
        facture.restant = factureRemaining - montant;
        totalAllocated += montant;
        updatedFactureIds.add(Number(facture.id));
      }
    }

    const surplus = advances.reduce(
      (sum, advance) => sum + Number(advance.montant_restant),
      0,
    ) - totalAllocated;

    const result = {
      tiersId,
      facturesUpdated: updatedFactureIds.size,
      totalAllocated,
      surplus: Math.max(0, surplus),
    };
    logger.info({ tiersId, result }, 'Supplier advances allocated');
    return result;
  }

  /**
   * Repair engine (admin) — AP mirror of ClientAllocationService.recompute*.
   * The supplier side is event-sourced: applications and payments are the
   * source of truth, montant_restant / montant_paye / statut are derived.
   * This recomputes every derived column from the event rows (applications,
   * non-deleted payments, cumulated refunds), then FIFO-allocates any funds
   * the repair freed. Idempotent: a second run repairs zero rows.
   */
  static async recomputeSupplierState(
    tiersId: number,
    options: AllocateOptions = {},
  ): Promise<SupplierRepairResult> {
    if (!options.transaction) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await this.recomputeSupplierState(tiersId, {
          transaction: client,
          userId: options.userId,
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const client = options.transaction;

    // Stable-order locks on every row we may touch (avoids deadlocks with the
    // allocation path, which locks in the same acomptes-then-factures order).
    await client.query(
      `SELECT id FROM acomptes_fournisseur
       WHERE tiers_id = $1 AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
      [tiersId],
    );
    await client.query(
      `SELECT id FROM factures_fournisseur WHERE tiers_id = $1 ORDER BY id FOR UPDATE`,
      [tiersId],
    );

    // 1. Acomptes: restant = montant - Σ(applications) - remboursé (095 formula)
    const { rows: repairedAcomptes } = await client.query(
      `UPDATE acomptes_fournisseur af
       SET montant_restant = sub.restant,
           statut = CASE
             WHEN af.statut = 'rembourse' THEN 'rembourse'
             WHEN sub.restant <= 0.005 THEN 'utilise'
             WHEN sub.applied <= 0.005 THEN 'disponible'
             ELSE 'partiellement_utilise'
           END,
           updated_at = CURRENT_TIMESTAMP
       FROM (
         SELECT af2.id,
                COALESCE(app.total, 0) AS applied,
                GREATEST(af2.montant - COALESCE(af2.montant_rembourse, 0) - COALESCE(app.total, 0), 0) AS restant
         FROM acomptes_fournisseur af2
         LEFT JOIN (
           SELECT acompte_id, SUM(montant) AS total
           FROM acompte_applications_fournisseur
           GROUP BY acompte_id
         ) app ON app.acompte_id = af2.id
         WHERE af2.tiers_id = $1 AND af2.deleted_at IS NULL
       ) sub
       WHERE sub.id = af.id
         AND (af.montant_restant IS DISTINCT FROM sub.restant
              OR af.statut IS DISTINCT FROM CASE
                   WHEN af.statut = 'rembourse' THEN 'rembourse'
                   WHEN sub.restant <= 0.005 THEN 'utilise'
                   WHEN sub.applied <= 0.005 THEN 'disponible'
                   ELSE 'partiellement_utilise'
                 END)
       RETURNING af.id`,
      [tiersId],
    );

    // 2. Factures: montant_paye = Σ(paiements non supprimés), statut dérivé
    //    (same formula as trigger update_facture_fournisseur_payment_status)
    const { rows: repairedFactures } = await client.query(
      `UPDATE factures_fournisseur ff
       SET montant_paye = sub.paid,
           reste_due = ff.total - sub.paid,
           statut = CASE
             WHEN sub.paid = 0 THEN 'en_attente'
             WHEN sub.paid < ff.total THEN 'partiellement_payee'
             ELSE 'payee'
           END
       FROM (
         SELECT ff2.id, COALESCE(p.total, 0) AS paid
         FROM factures_fournisseur ff2
         LEFT JOIN (
           SELECT facture_id, SUM(montant) AS total
           FROM paiements_fournisseur
           WHERE deleted_at IS NULL
           GROUP BY facture_id
         ) p ON p.facture_id = ff2.id
         WHERE ff2.tiers_id = $1 AND ff2.statut != 'annulee'
       ) sub
       WHERE sub.id = ff.id
         AND (ff.montant_paye IS DISTINCT FROM sub.paid
              OR ff.statut IS DISTINCT FROM CASE
                   WHEN sub.paid = 0 THEN 'en_attente'
                   WHEN sub.paid < ff.total THEN 'partiellement_payee'
                   ELSE 'payee'
                 END)
       RETURNING ff.id`,
      [tiersId],
    );

    // 3. Any funds the repair freed go straight back to the oldest open invoices
    const allocation = await this.allocateAvailableAdvances(tiersId, {
      transaction: client,
      userId: options.userId,
    });

    const result: SupplierRepairResult = {
      tiersId,
      acomptesRepaired: repairedAcomptes.length,
      facturesRepaired: repairedFactures.length,
      allocation,
    };
    logger.info({ tiersId, result }, 'Supplier state recomputed');
    return result;
  }
}
