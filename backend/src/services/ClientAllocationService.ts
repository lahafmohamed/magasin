import pool from '../db/connection';
import { logger } from '../utils/logger';
import { toPaiementMethod } from '../utils/paymentMethods';

export interface AllocationResult {
  clientId: number;
  facturesUpdated: number;
  surplus: number;
  totalPool: number;
  totalAllocated: number;
}

/** Money is NUMERIC(15,2) — keep JS accumulators from drifting off the stored scale. */
const roundMoney = (n: number): number => parseFloat(n.toFixed(2));

/** One spendable fund in the FIFO pool: a payment row or an acompte balance. */
interface FundItem {
  id: number;
  montant: number;
  date: string;
  type: 'paiement' | 'acompte';
  /** Direct payments cannot settle an invoice issued after them; acompte money can. */
  chronoBound: boolean;
  remaining: number;
}

interface FifoLine {
  factureId: number;
  total: number;
  allocated: number;
  statut: string;
}

interface AcompteAllocation {
  acompteId: number;
  factureId: number;
  montant: number;
}

interface FifoSimulation {
  perFacture: FifoLine[];
  acompteAllocations: AcompteAllocation[];
  totalPool: number;
  totalAllocated: number;
  surplus: number;
}

export class ClientAllocationService {

  /**
   * Recompute FIFO allocation for a client
   * Updates factures.montant_paye and factures.statut based on FIFO rule
   */
  static async recomputeClientAllocations(
    clientId: number,
    options: { transaction?: any; userId?: number | null } = {}
  ): Promise<AllocationResult> {
    // This routine resets every invoice's montant_paye to 0 before re-allocating.
    // It MUST run inside a transaction; otherwise a mid-run failure leaves all the
    // client's invoices showing zero paid. When no transaction is supplied, manage one here.
    if (!options.transaction) {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        const result = await this.recomputeClientAllocations(clientId, { ...options, transaction: conn });
        await conn.query('COMMIT');
        return result;
      } catch (error) {
        await conn.query('ROLLBACK');
        throw error;
      } finally {
        conn.release();
      }
    }

    const client = options.transaction;
    const userId = options.userId ?? null;

    try {
      // 1. Load non-cancelled factures for client, sorted by date ASC, id ASC
      const { rows: factures } = await client.query(
        `SELECT id, total, COALESCE(montant_paye, 0) as montant_paye, statut, date_facture, location_id
         FROM factures
         WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL
         ORDER BY date_facture ASC, id ASC
         FOR UPDATE`,
        [clientId]
      );

      // 2. Load direct paiements for client, sorted by date ASC, id ASC. Payments
      // booked from an acompte application are excluded here and pinned to their
      // own invoice in step 2b instead.
      const { rows: paiementsDirects } = await client.query(
        `SELECT p.id, p.montant, p.date_paiement, f.date_facture
         FROM paiements p
         JOIN factures f ON f.id = p.facture_id
         WHERE f.tiers_id = $1 AND f.deleted_at IS NULL
           AND p.source <> 'acompte_application'
         ORDER BY p.date_paiement ASC, p.id ASC`,
        [clientId]
      );

      // 2b. Acompte applications already committed against a specific invoice.
      const { rows: pinnedRows } = await client.query(
        `SELECT p.facture_id, SUM(p.montant) AS montant
         FROM paiements p
         JOIN factures f ON f.id = p.facture_id
         WHERE f.tiers_id = $1 AND f.deleted_at IS NULL
           AND p.source = 'acompte_application'
         GROUP BY p.facture_id`,
        [clientId]
      );
      const pinnedByFacture = new Map<number, number>(
        pinnedRows.map((r: any) => [r.facture_id, parseFloat(r.montant)])
      );

      // 3a. Reset factures.montant_paye = 0 for this client, in one statement.
      await client.query(
        `UPDATE factures
         SET montant_paye = 0,
             remaining_due = total,
             statut = CASE WHEN statut = 'annulee' THEN statut ELSE 'en_attente' END
         WHERE tiers_id = $1 AND deleted_at IS NULL`,
        [clientId]
      );

      // 3b. Load spendable acomptes. Availability is `montant_restant > 0`, NOT the
      // statut label: statut is derived by the 048/095 sync trigger from the
      // application rows, and rows mis-stamped 'utilise' by the pre-fix recompute
      // (which flipped the label without consuming the balance) must come back into
      // the pool so this run repairs them. Pool at montant_restant, not montant —
      // the already-applied part lives on as its acompte_application paiements rows.
      const { rows: acomptes } = await client.query(
        `SELECT id, montant_restant AS montant, date_acompte, methode_paiement
         FROM acomptes_clients
         WHERE tiers_id = $1
           AND statut <> 'rembourse'
           AND deleted_at IS NULL
           AND montant_restant > 0
         ORDER BY date_acompte ASC, id ASC
         FOR UPDATE`,
        [clientId]
      );

      // 4. Simulate the FIFO allocation (same routine the read-only preview uses).
      const sim = this.simulateFifo(
        factures,
        this.buildFundPool(paiementsDirects, acomptes),
        pinnedByFacture
      );

      // 5. Materialize every acompte→facture allocation as real ledger events:
      // one paiement (source 'acompte_application'), one acompte_application, one
      // customer-account line — exactly what AcompteService.applyClient writes.
      //
      // Before this, the recompute spent acompte balances straight into
      // factures.montant_paye: no payment row, no application row, no decrement of
      // montant_restant. The invoice then disagreed with SUM(paiements) — so the
      // next payment event on it silently reverted the acompte-funded part via the
      // 043 trigger — and the acompte still advertised the money as spendable.
      // Writing the events instead lets the 095 sync trigger own montant_restant
      // and statut, so a partial consumption lands on 'partiellement_utilise'
      // rather than being mislabelled fully used.
      const acompteById = new Map<number, any>(acomptes.map((a: any) => [a.id, a]));
      const factureById = new Map<number, any>(factures.map((f: any) => [f.id, f]));

      for (const alloc of sim.acompteAllocations) {
        const acompte = acompteById.get(alloc.acompteId);
        const facture = factureById.get(alloc.factureId);
        const montant = roundMoney(alloc.montant);
        if (montant <= 0) continue;

        const magasinId = facture?.location_id
          ? (await client.query('SELECT id FROM magasins WHERE location_id = $1 LIMIT 1', [facture.location_id])).rows[0]?.id ?? null
          : null;

        const { rows: payRows } = await client.query(
          `INSERT INTO paiements (
            facture_id, montant, methode_paiement, date_paiement,
            reference, notes, magasin_id, source, cree_par
          ) VALUES ($1,$2,$3,CURRENT_TIMESTAMP,$4,$5,$6,'acompte_application',$7)
          RETURNING id`,
          [alloc.factureId, montant, toPaiementMethod(acompte?.methode_paiement),
            `ACO-ALLOC-${alloc.acompteId}`,
            `Affectation automatique acompte #${alloc.acompteId} sur facture #${alloc.factureId}`,
            magasinId, userId ?? null]
        );

        await client.query(
          `INSERT INTO acompte_applications (acompte_id, facture_id, paiement_id, montant, cree_par, notes)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [alloc.acompteId, alloc.factureId, payRows[0].id, montant, userId ?? null,
            'Affectation FIFO automatique']
        );

        await client.query(
          `INSERT INTO compte_client_lignes
             (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
           VALUES ($1, 'paiement', $2, $3, 0, $4, $5, $6)`,
          [clientId, payRows[0].id, `PAI-${payRows[0].id}`, montant,
            `Affectation automatique acompte #${alloc.acompteId} sur facture #${alloc.factureId}`, userId ?? null]
        );
      }

      // 6. Write the allocation onto the invoices. Runs after step 5 because each
      // payment insert fires the 043 trigger, which rewrites that invoice from
      // SUM(paiements); the FIFO result is authoritative and must land last.
      for (const line of sim.perFacture) {
        await client.query(
          `UPDATE factures
           SET montant_paye = $1, remaining_due = $2, statut = $3
           WHERE id = $4`,
          [line.allocated, roundMoney(line.total - line.allocated), line.statut, line.factureId]
        );
      }

      // 7. Sync tiers.solde_client_actuel from authoritative source
      const { rows: soldeRows } = await client.query(
        `SELECT COALESCE(SUM(remaining_due), 0) as solde
         FROM factures
         WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL`,
        [clientId]
      );
      await client.query(
        'UPDATE tiers SET solde_client_actuel = $1 WHERE id = $2',
        [parseFloat(soldeRows[0].solde), clientId]
      );

      const result: AllocationResult = {
        clientId,
        facturesUpdated: factures.length,
        surplus: roundMoney(sim.surplus),
        totalPool: roundMoney(sim.totalPool),
        totalAllocated: roundMoney(sim.totalAllocated),
      };

      logger.info('Client allocation recomputed', { clientId, result } as any);
      return result;

    } catch (error) {
      logger.error({ err: error, clientId }, 'Error recomputing client allocations');
      throw error;
    }
  }

  /**
   * Derive statut from payment vs total
   */
  private static deriveStatut(montantPaye: number, total: number): string {
    if (montantPaye <= 0) return 'en_attente';
    if (montantPaye < total) return 'partielle';
    return 'payee';
  }

  /**
   * Merge redistributable payment rows and acompte balances into one
   * date-ordered fund pool.
   *
   * `paiements` must contain **direct** payments only. A payment with
   * source = 'acompte_application' is a settlement already committed against a
   * specific invoice: it is pinned there (see `pinnedByFacture`), not free
   * money the FIFO pass may move elsewhere. Feeding it back into the pool makes
   * the recompute non-idempotent — each run re-spends it, converts more acompte
   * balance into fresh payment rows, and pushes SUM(paiements) past the amount
   * actually owed.
   *
   * `chronoBound` separates the two remaining families: a direct payment cannot
   * settle an invoice issued after it, while acompte money carries no such
   * constraint.
   */
  private static buildFundPool(paiementsDirects: any[], acomptes: any[]): FundItem[] {
    return [
      ...paiementsDirects.map((p: any) => ({
        id: p.id,
        montant: parseFloat(p.montant),
        date: p.date_paiement,
        type: 'paiement' as const,
        chronoBound: true,
        remaining: parseFloat(p.montant),
      })),
      ...acomptes.map((a: any) => ({
        id: a.id,
        montant: parseFloat(a.montant),
        date: a.date_acompte,
        type: 'acompte' as const,
        chronoBound: false,
        remaining: parseFloat(a.montant),
      })),
    ].sort((a, b) => {
      const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (byDate !== 0) return byDate;
      // Same instant — which happens whenever rows are written in one transaction,
      // since CURRENT_TIMESTAMP is the transaction start. Falling straight through
      // to `id` would compare an acomptes_clients id against a paiements id: two
      // unrelated sequences, so the winner flips run to run. Order by family first
      // (advances are prepaid money, consumed before payments), then by id inside
      // the family, which keeps the allocation reproducible.
      if (a.type !== b.type) return a.type === 'acompte' ? -1 : 1;
      return a.id - b.id;
    });
  }

  /**
   * FIFO-allocate a fund pool across invoices. Pure: mutates only the local
   * `remaining` counters, touches no database.
   *
   * Each invoice starts already credited with `pinnedByFacture` — the acompte
   * applications booked against it — and the pool fills only what is still due.
   *
   * Single source of the allocation rule: `recomputeClientAllocations` persists
   * what this returns and `testAllocation` renders it, so the preview cannot
   * drift from what a real run would do.
   */
  private static simulateFifo(
    factures: any[],
    funds: FundItem[],
    pinnedByFacture: Map<number, number> = new Map()
  ): FifoSimulation {
    const poolTotal = funds.reduce((sum, f) => sum + f.montant, 0);
    let remainingPool = poolTotal;
    let pinnedTotal = 0;
    let totalAllocated = 0;
    const perFacture: FifoLine[] = [];
    const acompteAllocations: AcompteAllocation[] = [];

    for (const facture of factures) {
      const factureTotal = parseFloat(facture.total);
      const pinned = Math.min(pinnedByFacture.get(facture.id) ?? 0, factureTotal);
      let factureAllocated = pinned;

      pinnedTotal += pinned;
      totalAllocated += pinned;

      if (remainingPool > 0) {
        for (const fund of funds) {
          if (fund.remaining <= 0) continue;
          if (factureAllocated >= factureTotal) break;
          if (fund.chronoBound && new Date(fund.date) < new Date(facture.date_facture)) continue;

          const toAllocate = Math.min(fund.remaining, factureTotal - factureAllocated);

          fund.remaining -= toAllocate;
          factureAllocated += toAllocate;
          remainingPool -= toAllocate;
          totalAllocated += toAllocate;

          if (fund.type === 'acompte') {
            const existing = acompteAllocations.find(
              a => a.acompteId === fund.id && a.factureId === facture.id
            );
            if (existing) existing.montant += toAllocate;
            else acompteAllocations.push({ acompteId: fund.id, factureId: facture.id, montant: toAllocate });
          }
        }
      }

      perFacture.push({
        factureId: facture.id,
        total: factureTotal,
        allocated: roundMoney(factureAllocated),
        statut: this.deriveStatut(factureAllocated, factureTotal),
      });
    }

    return {
      perFacture,
      acompteAllocations,
      totalPool: pinnedTotal + poolTotal,
      totalAllocated,
      surplus: remainingPool,
    };
  }

  /**
   * Recompute allocations for all clients (admin endpoint)
   */
  static async recomputeAllAllocations(userId?: number | null): Promise<{ 
    clientsProcessed: number; 
    facturesUpdated: number; 
    msElapsed: number;
    summary: AllocationResult[];
  }> {
    const startTime = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const { rows: clients } = await client.query(
        'SELECT DISTINCT tiers_id FROM factures WHERE deleted_at IS NULL AND tiers_id IS NOT NULL'
      );

      const summary: AllocationResult[] = [];
      let totalFacturesUpdated = 0;

      for (const clientRow of clients) {
        const clientId = clientRow.tiers_id;
        try {
          const result = await this.recomputeClientAllocations(clientId, { transaction: client, userId });
          summary.push(result);
          totalFacturesUpdated += result.facturesUpdated;
        } catch (error) {
          logger.error({ err: error, clientId }, 'Failed to recompute allocations for client');
          // Continue with other clients
        }
      }

      await client.query('COMMIT');

      const msElapsed = Date.now() - startTime;
      
      return {
        clientsProcessed: clients.length,
        facturesUpdated: totalFacturesUpdated,
        msElapsed,
        summary
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Test allocation for a specific client (returns result without persisting)
   */
  static async testAllocation(clientId: number): Promise<AllocationResult & { factures: any[] }> {
    const client = await pool.connect();
    
    try {
      // Load data without locks
      const { rows: factures } = await client.query(
        `SELECT id, numero_facture, total, COALESCE(montant_paye, 0) as montant_paye, statut, date_facture
         FROM factures
         WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL
         ORDER BY date_facture ASC, id ASC`,
        [clientId]
      );

      const { rows: paiementsDirects } = await client.query(
        `SELECT p.id, p.montant, p.date_paiement, f.date_facture, f.numero_facture
         FROM paiements p
         JOIN factures f ON f.id = p.facture_id
         WHERE f.tiers_id = $1 AND f.deleted_at IS NULL
           AND p.source <> 'acompte_application'
         ORDER BY p.date_paiement ASC, p.id ASC`,
        [clientId]
      );

      const { rows: pinnedRows } = await client.query(
        `SELECT p.facture_id, SUM(p.montant) AS montant
         FROM paiements p
         JOIN factures f ON f.id = p.facture_id
         WHERE f.tiers_id = $1 AND f.deleted_at IS NULL
           AND p.source = 'acompte_application'
         GROUP BY p.facture_id`,
        [clientId]
      );
      const pinnedByFacture = new Map<number, number>(
        pinnedRows.map((r: any) => [r.facture_id, parseFloat(r.montant)])
      );

      // Same pooling rule as the real recompute: spendable remainder only.
      const { rows: acomptes } = await client.query(
        `SELECT id, montant_restant AS montant, date_acompte, methode_paiement
         FROM acomptes_clients
         WHERE tiers_id = $1
           AND statut <> 'rembourse'
           AND deleted_at IS NULL
           AND montant_restant > 0
         ORDER BY date_acompte ASC, id ASC`,
        [clientId]
      );

      // Same engine the real recompute persists from — the preview cannot drift.
      const sim = this.simulateFifo(
        factures,
        this.buildFundPool(paiementsDirects, acomptes),
        pinnedByFacture
      );
      const allocationByFacture = new Map(sim.perFacture.map(l => [l.factureId, l]));

      return {
        clientId,
        facturesUpdated: factures.length,
        surplus: roundMoney(sim.surplus),
        totalPool: roundMoney(sim.totalPool),
        totalAllocated: roundMoney(sim.totalAllocated),
        factures: factures.map((f: any) => {
          const line = allocationByFacture.get(f.id);
          return {
            ...f,
            new_montant_paye: line?.allocated ?? 0,
            new_statut: line?.statut ?? 'en_attente',
            allocated: line?.allocated ?? 0,
          };
        }),
      };

    } finally {
      client.release();
    }
  }
}
