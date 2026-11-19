import type { Pool, PoolClient } from 'pg';
import pool from '../db/connection';
import { logger } from '../utils/logger';
import { formatMontantFcfa } from '../utils/money';
import { toPaiementMethod } from '../utils/paymentMethods';
import { roundMoney } from './PricingService';

export interface AllocationResult {
  clientId: number;
  facturesUpdated: number;
  surplus: number;
  totalPool: number;
  totalAllocated: number;
}

/** One invoice whose per-invoice balance a reallocation changes (or changed). */
export interface ReallocationFactureChange {
  facture_id: number;
  numero_facture: string;
  montant_paye_avant: number;
  montant_paye_apres: number;
  statut_avant: string;
  statut_apres: string;
}

/** Outcome of the E1 reallocation for one client (see `reallocateClient`). */
export interface ReallocationClientReport {
  tiers_id: number;
  tiers_nom: string | null;
  /**
   * inchange: nothing moves · modifie: balances re-spread between invoices,
   * totals kept · ecart: the total paid or the available deposit credit would
   * change, left as is unless accepted · erreur: the recompute failed,
   * nothing written for this client.
   */
  statut: 'inchange' | 'modifie' | 'ecart' | 'erreur';
  /** True when the change was written (application mode). */
  applique: boolean;
  total_paye_avant: number;
  total_paye_apres: number;
  acomptes_disponibles_avant: number;
  acomptes_disponibles_apres: number;
  factures: ReallocationFactureChange[];
  /**
   * E1-R1: payments that exceed the invoice they were recorded on, after the
   * re-spread — where their surplus goes. The administrator re-records a
   * payment that was filed on the wrong invoice.
   */
  paiements_reportes: PaiementReporte[];
  erreur?: string;
}

export interface ReallocationReport {
  mode: 'simulation' | 'application';
  clients_examines: number;
  clients_modifies: number;
  factures_modifiees: number;
  clients_ecart: number;
  clients_erreur: number;
  /** Number of payment surpluses carried to (or left off) other invoices, all clients. */
  paiements_reportes: number;
  duree_ms: number;
  /** Every client except the unchanged ones without any carried payment. */
  details: ReallocationClientReport[];
}

/**
 * E1-R1 — the part of a payment that settles another invoice than the one it
 * was recorded on: legacy data re-spread under E1 (a payment recorded beyond
 * its invoice's total) or money left on a cancelled invoice. It goes to the
 * client's oldest open invoices; `facture_cible_id` null = no invoice could
 * take it (no open invoice issued on or before the payment).
 */
export interface PaiementReporte {
  paiement_id: number;
  methode_paiement: string;
  date_paiement: string;
  facture_source_id: number;
  numero_source: string;
  /** The invoice the payment was recorded on is cancelled (rather than already paid). */
  source_annulee: boolean;
  facture_cible_id: number | null;
  numero_cible: string | null;
  montant: number;
}

/** One carry seen from an invoice page: the other invoice and the payment behind it. */
export interface ReportFacture {
  facture_id: number;
  numero_facture: string;
  montant: number;
  paiement_id: number;
  methode_paiement: string;
  date_paiement: string;
}

/**
 * What `GET /factures/:id` adds so that, on every invoice page,
 * listed payments − excedent_reporte − excedent_non_affecte + recu_par_report = montant_paye.
 */
export interface FactureReports {
  /** This invoice's payments that settled other invoices. */
  excedent_reporte: ReportFacture[];
  /** Money from other invoices' payments that settled this one. */
  recu_par_report: ReportFacture[];
  /** Part of this invoice's payments that settles no invoice at all. */
  excedent_non_affecte: number;
}

const NO_REPORTS: FactureReports = { excedent_reporte: [], recu_par_report: [], excedent_non_affecte: 0 };

/** One spendable fund in the oldest-first pass: untargeted payment money or an acompte balance. */
interface FundItem {
  id: number;
  montant: number;
  date: string;
  type: 'paiement' | 'acompte';
  /** Direct payments cannot settle an invoice issued after them; acompte money can. */
  chronoBound: boolean;
  remaining: number;
  /** Payment funds: the invoice the payment was recorded on. */
  factureId?: number;
}

/** Where untargeted payment money went in a simulation (`cibleFactureId` null = nowhere). */
interface PaymentCarry {
  paiementId: number;
  sourceFactureId: number;
  cibleFactureId: number | null;
  montant: number;
}

interface AllocationLine {
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

interface AllocationSimulation {
  perFacture: AllocationLine[];
  acompteAllocations: AcompteAllocation[];
  /** Untargeted payment money: which invoice each part settled (E1-R1). */
  paymentCarries: PaymentCarry[];
  totalPool: number;
  totalAllocated: number;
  surplus: number;
}

/** A payment row of the client, as the allocation engine reads it. */
interface PaymentRow {
  id: number;
  facture_id: number;
  montant: string | number;
  date_paiement: string;
  source: string;
  methode_paiement?: string;
  /** Number and status of the invoice the payment was recorded on. */
  numero_facture?: string;
  facture_statut?: string;
}

/**
 * Per-invoice allocation of a client's money (decision E1, 2026-10-24).
 *
 * A payment settles the invoice it was recorded on: every payment row —
 * direct or from an acompte application — is pinned to its `facture_id`, for
 * every client (the shared « Client comptoir » included). Oldest-first
 * allocation is kept only for money without a target invoice:
 *   - acompte balances spread automatically (invoice creation, BL conversion,
 *     credit-note remainder, compensation…);
 *   - the part of a direct payment that exceeds what its invoice can take
 *     (legacy rows recorded while the account was FIFO-pooled);
 *   - payments left on a cancelled invoice.
 * Applying a credit note to a chosen invoice books an acompte application on
 * that invoice, so it is pinned like any other payment.
 */
export class ClientAllocationService {

  /**
   * Acompte money the client's invoices already count as paid without any
   * payment row behind it.
   *
   * Before 2026-07-18 the recompute spent acompte balances straight into
   * factures.montant_paye — no payment row, no application row, montant_restant
   * untouched. Production still carries that state (the invoice shows the
   * deposit as paid while the acompte still advertises a balance). Every
   * recompute that pools acomptes re-materializes it; a recompute that does not
   * pool them would silently drop the deposit from the invoice.
   *
   * Measured at the client level as Σ montant_paye − Σ paiements, floored at 0
   * (a stranded direct payment makes the difference negative). Must be read
   * BEFORE the caller inserts, edits or deletes a payment row.
   */
  static async countedAcompteMoney(clientId: number, client: any): Promise<number> {
    const { rows } = await client.query(
      `SELECT
         COALESCE((SELECT SUM(f.montant_paye) FROM factures f
                   WHERE f.tiers_id = $1 AND f.deleted_at IS NULL AND f.statut <> 'annulee'), 0)
       - COALESCE((SELECT SUM(p.montant) FROM paiements p
                   JOIN factures f ON f.id = p.facture_id
                   WHERE f.tiers_id = $1 AND f.deleted_at IS NULL), 0) AS counted`,
      [clientId]
    );
    return Math.max(0, roundMoney(parseFloat(rows[0].counted) || 0));
  }

  /**
   * @param options.acomptePoolCap  When set, at most this much acompte balance
   *   (oldest first) enters the FIFO pool. The payment paths pass
   *   `countedAcompteMoney()` so that recording, editing or deleting a payment
   *   never spends a deposit the invoices did not already count (decision D3,
   *   2026-10-23: acomptes are applied only through their explicit action).
   *   Omitted = every available acompte balance is pooled (facture creation,
   *   BL conversion, avoir, compensation, acompte apply/refund).
   */
  static async recomputeClientAllocations(
    clientId: number,
    options: { transaction?: any; userId?: number | null; acomptePoolCap?: number } = {}
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
        `SELECT id, numero_facture, total, COALESCE(montant_paye, 0) as montant_paye, statut, date_facture, location_id
         FROM factures
         WHERE tiers_id = $1 AND statut != 'annulee' AND deleted_at IS NULL
         ORDER BY date_facture ASC, id ASC
         FOR UPDATE`,
        [clientId]
      );

      // 2. Every payment row of the client (E1: each one is pinned to its own
      // invoice; see simulateAllocation for what stays untargeted).
      const paiements = await this.loadPayments(client, clientId);

      // 3a. Reset factures.montant_paye = 0 for this client, in one statement.
      // A cancelled invoice owes nothing: it keeps remaining_due = 0 (it used to
      // get its total back on every recompute, so a cancelled invoice displayed
      // its full amount as « reste dû »).
      await client.query(
        `UPDATE factures
         SET montant_paye = 0,
             remaining_due = CASE WHEN statut = 'annulee' THEN 0 ELSE total END,
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

      // 3c. Optional cap (payment paths): only the acompte money the invoices
      // already counted may be pooled, oldest first. The rest stays available
      // until its explicit application.
      const pooledAcomptes = options.acomptePoolCap === undefined
        ? acomptes
        : this.capAcomptes(acomptes, options.acomptePoolCap);

      // 4. Simulate the allocation (same routine the read-only preview uses).
      const sim = this.simulateAllocation(factures, paiements, pooledAcomptes);

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

        // CPG2-02: shown in the invoice payment history and the client
        // statement — the deposit's number and the invoice's number, never
        // database ids behind « # ».
        const acompteRef = `Acompte n° ${alloc.acompteId}`;
        const { rows: payRows } = await client.query(
          `INSERT INTO paiements (
            facture_id, montant, methode_paiement, date_paiement,
            reference, notes, magasin_id, source, cree_par
          ) VALUES ($1,$2,$3,CURRENT_TIMESTAMP,$4,$5,$6,'acompte_application',$7)
          RETURNING id`,
          [alloc.factureId, montant, toPaiementMethod(acompte?.methode_paiement),
            acompteRef,
            `${acompteRef} déduit automatiquement (factures les plus anciennes d’abord)`,
            magasinId, userId ?? null]
        );

        await client.query(
          `INSERT INTO acompte_applications (acompte_id, facture_id, paiement_id, montant, cree_par, notes)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [alloc.acompteId, alloc.factureId, payRows[0].id, montant, userId ?? null,
            'Déduit automatiquement (factures les plus anciennes d’abord)']
        );

        await client.query(
          `INSERT INTO compte_client_lignes
             (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
           VALUES ($1, 'paiement', $2, $3, 0, $4, $5, $6)`,
          [clientId, payRows[0].id, `PAI-${payRows[0].id}`, montant,
            facture?.numero_facture
              ? `${acompteRef} déduit automatiquement de ${facture.numero_facture}`
              : `${acompteRef} déduit automatiquement`,
            userId ?? null]
        );
      }

      // 6. Write the allocation onto the invoices. Runs after step 5 because each
      // payment insert fires the 043 trigger, which rewrites that invoice from
      // SUM(paiements); the engine's result is authoritative and must land last.
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

  /** Keep the oldest acompte balances up to `cap` (the last one possibly partially). */
  private static capAcomptes(acomptes: any[], cap: number): any[] {
    let left = roundMoney(Math.max(0, cap));
    const kept: any[] = [];
    for (const a of acomptes) {
      if (left <= 0) break;
      const take = Math.min(parseFloat(a.montant), left);
      if (take <= 0) continue;
      kept.push({ ...a, montant: take });
      left = roundMoney(left - take);
    }
    return kept;
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
   * Every payment row on the client's live (not soft-deleted) invoices,
   * cancelled ones included, in the order they settle an invoice.
   */
  private static async loadPayments(client: any, clientId: number): Promise<PaymentRow[]> {
    const { rows } = await client.query(
      `SELECT p.id, p.facture_id, p.montant, p.date_paiement, p.source, p.methode_paiement,
              f.numero_facture, f.statut AS facture_statut
       FROM paiements p
       JOIN factures f ON f.id = p.facture_id
       WHERE f.tiers_id = $1 AND f.deleted_at IS NULL
       ORDER BY p.date_paiement ASC, p.id ASC`,
      [clientId]
    );
    return rows;
  }

  /** Date order, then family (acomptes are prepaid money, spent first), then id. */
  private static compareFunds(a: FundItem, b: FundItem): number {
    const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (byDate !== 0) return byDate;
    // Same instant — which happens whenever rows are written in one transaction,
    // since CURRENT_TIMESTAMP is the transaction start. Falling straight through
    // to `id` would compare an acomptes_clients id against a paiements id: two
    // unrelated sequences, so the winner flips run to run.
    if (a.type !== b.type) return a.type === 'acompte' ? -1 : 1;
    return a.id - b.id;
  }

  /**
   * The allocation rule (E1). Pure: touches no database.
   *
   * Phase 1 — pinned money. Each live invoice is credited with the payments
   * recorded on it: acompte applications first (they mirror an
   * acompte_applications row and can never move), then its direct payments in
   * date order, up to the invoice total. What a direct payment cannot place on
   * its own invoice becomes untargeted money.
   *
   * Phase 2 — untargeted money, oldest invoice first: that overflow, the
   * payments left on a cancelled invoice, and the pooled acompte balances. A
   * direct payment still cannot settle an invoice issued after it
   * (`chronoBound`); acompte money can.
   *
   * Single source of the rule: `recomputeClientAllocations` persists what this
   * returns and `testAllocation` renders it, so the preview cannot drift from
   * what a real run would do.
   */
  private static simulateAllocation(
    factures: any[],
    paiements: PaymentRow[],
    acomptes: any[]
  ): AllocationSimulation {
    const liveIds = new Set<number>(factures.map((f: any) => Number(f.id)));
    const acompteAppliedByFacture = new Map<number, number>();
    const directByFacture = new Map<number, PaymentRow[]>();
    const funds: FundItem[] = [];

    for (const p of paiements) {
      const factureId = Number(p.facture_id);
      const montant = roundMoney(parseFloat(String(p.montant)) || 0);
      if (montant <= 0) continue;
      if (p.source === 'acompte_application') {
        // Pinned to its invoice; on a cancelled invoice it settles nothing
        // (the acompte balance it consumed stays consumed).
        if (liveIds.has(factureId)) {
          acompteAppliedByFacture.set(factureId, roundMoney((acompteAppliedByFacture.get(factureId) ?? 0) + montant));
        }
        continue;
      }
      if (liveIds.has(factureId)) {
        const list = directByFacture.get(factureId) ?? [];
        list.push(p);
        directByFacture.set(factureId, list);
      } else {
        // Money left on a cancelled invoice has no target any more.
        funds.push({ id: Number(p.id), montant, date: p.date_paiement, type: 'paiement', chronoBound: true, remaining: montant, factureId });
      }
    }

    // Phase 1 — pinned money.
    const allocatedByFacture = new Map<number, number>();
    let pinnedTotal = 0;
    for (const facture of factures) {
      const factureId = Number(facture.id);
      const total = roundMoney(parseFloat(facture.total) || 0);
      let allocated = Math.min(acompteAppliedByFacture.get(factureId) ?? 0, total);
      for (const p of directByFacture.get(factureId) ?? []) {
        const montant = roundMoney(parseFloat(String(p.montant)) || 0);
        const take = roundMoney(Math.max(0, Math.min(montant, total - allocated)));
        allocated = roundMoney(allocated + take);
        const rest = roundMoney(montant - take);
        if (rest > 0) {
          funds.push({ id: Number(p.id), montant: rest, date: p.date_paiement, type: 'paiement', chronoBound: true, remaining: rest, factureId });
        }
      }
      allocatedByFacture.set(factureId, allocated);
      pinnedTotal = roundMoney(pinnedTotal + allocated);
    }

    for (const a of acomptes) {
      const montant = roundMoney(parseFloat(a.montant) || 0);
      if (montant <= 0) continue;
      funds.push({ id: Number(a.id), montant, date: a.date_acompte, type: 'acompte', chronoBound: false, remaining: montant });
    }
    funds.sort((a, b) => this.compareFunds(a, b));

    // Phase 2 — untargeted money, oldest invoice first.
    const poolTotal = roundMoney(funds.reduce((sum, f) => sum + f.montant, 0));
    let remainingPool = poolTotal;
    let totalAllocated = pinnedTotal;
    const perFacture: AllocationLine[] = [];
    const acompteAllocations: AcompteAllocation[] = [];
    const paymentCarries: PaymentCarry[] = [];

    for (const facture of factures) {
      const factureId = Number(facture.id);
      const total = roundMoney(parseFloat(facture.total) || 0);
      let allocated = allocatedByFacture.get(factureId) ?? 0;

      if (remainingPool > 0) {
        for (const fund of funds) {
          if (allocated >= total) break;
          if (fund.remaining <= 0) continue;
          if (fund.chronoBound && new Date(fund.date) < new Date(facture.date_facture)) continue;

          const toAllocate = roundMoney(Math.min(fund.remaining, total - allocated));
          if (toAllocate <= 0) continue;

          fund.remaining = roundMoney(fund.remaining - toAllocate);
          allocated = roundMoney(allocated + toAllocate);
          remainingPool = roundMoney(remainingPool - toAllocate);
          totalAllocated = roundMoney(totalAllocated + toAllocate);

          if (fund.type === 'acompte') {
            const existing = acompteAllocations.find(
              (x) => x.acompteId === fund.id && x.factureId === factureId
            );
            if (existing) existing.montant = roundMoney(existing.montant + toAllocate);
            else acompteAllocations.push({ acompteId: fund.id, factureId, montant: toAllocate });
          } else {
            const existing = paymentCarries.find(
              (x) => x.paiementId === fund.id && x.cibleFactureId === factureId
            );
            if (existing) existing.montant = roundMoney(existing.montant + toAllocate);
            else paymentCarries.push({ paiementId: fund.id, sourceFactureId: fund.factureId ?? 0, cibleFactureId: factureId, montant: toAllocate });
          }
        }
      }

      perFacture.push({
        factureId,
        total,
        allocated,
        statut: this.deriveStatut(allocated, total),
      });
    }

    // Payment money no invoice could take: on no invoice at all.
    for (const fund of funds) {
      if (fund.type !== 'paiement' || fund.remaining <= 0) continue;
      const existing = paymentCarries.find((x) => x.paiementId === fund.id && x.cibleFactureId === null);
      if (existing) existing.montant = roundMoney(existing.montant + fund.remaining);
      else paymentCarries.push({ paiementId: fund.id, sourceFactureId: fund.factureId ?? 0, cibleFactureId: null, montant: fund.remaining });
    }

    return {
      perFacture,
      acompteAllocations,
      paymentCarries,
      totalPool: roundMoney(pinnedTotal + poolTotal),
      totalAllocated,
      surplus: remainingPool,
    };
  }

  /**
   * E1-R1 — every carried payment of one client, as its invoices' persisted
   * balances reflect them.
   *
   * Computed on read with the allocation engine itself rather than recorded by
   * the recompute: the rule has a single source, nothing can go stale between
   * a recompute and a read, and data re-spread before this existed (the E1
   * one-time run) is explained without a backfill. The acompte pool is left
   * empty: every acompte the last recompute spent is now an
   * acompte_application row, pinned to its invoice, so replaying the payment
   * rows reproduces the persisted figures exactly.
   *
   * Returns null when the replay does not reproduce every live invoice's
   * montant_paye (balances written by the pre-E1 engine and never re-spread,
   * deposit money counted without a payment row…): the carries cannot be
   * stated for sure, so none is.
   */
  static async loadClientCarries(clientId: number, db: Pool | PoolClient = pool): Promise<PaiementReporte[] | null> {
    const { rows: factures } = await db.query<{
      id: number;
      numero_facture: string;
      total: string;
      montant_paye: string;
      statut: string;
      date_facture: string;
    }>(
      `SELECT id, numero_facture, total, COALESCE(montant_paye, 0) AS montant_paye, statut, date_facture
       FROM factures
       WHERE tiers_id = $1 AND statut <> 'annulee' AND deleted_at IS NULL
       ORDER BY date_facture ASC, id ASC`,
      [clientId]
    );
    const paiements = await this.loadPayments(db, clientId);
    const sim = this.simulateAllocation(factures, paiements, []);

    const persisted = new Map<number, number>(
      factures.map((f) => [Number(f.id), roundMoney(parseFloat(f.montant_paye) || 0)])
    );
    for (const line of sim.perFacture) {
      if (Math.abs(line.allocated - (persisted.get(line.factureId) ?? 0)) >= 0.005) return null;
    }

    const numeroById = new Map<number, string>(factures.map((f) => [Number(f.id), f.numero_facture]));
    const paiementById = new Map<number, PaymentRow>(paiements.map((p) => [Number(p.id), p]));
    return sim.paymentCarries
      .filter((c) => c.montant > 0)
      .map((c) => {
        const p = paiementById.get(c.paiementId);
        return {
          paiement_id: c.paiementId,
          methode_paiement: p?.methode_paiement ?? '',
          date_paiement: p ? new Date(p.date_paiement).toISOString() : '',
          facture_source_id: c.sourceFactureId,
          numero_source: p?.numero_facture ?? numeroById.get(c.sourceFactureId) ?? '',
          source_annulee: p?.facture_statut === 'annulee',
          facture_cible_id: c.cibleFactureId,
          numero_cible: c.cibleFactureId === null ? null : numeroById.get(c.cibleFactureId) ?? null,
          montant: roundMoney(c.montant),
        };
      });
  }

  /**
   * E1-R1 — explains, for one invoice page, a paid amount that differs from
   * the payments listed on it (`FactureReports`).
   *
   * Cheap for almost every invoice: when the payment rows recorded on it add
   * up to its montant_paye, nothing moved and the client is not replayed.
   * `paiements` are the rows the page lists; legacy acompte imputations
   * (negative ids, no payment row) are not money the engine moves.
   */
  static async getFactureReports(
    facture: { id: number; tiers_id: number | null; statut: string; montant_paye: string | number | null },
    paiements: Array<{ id: number; montant: string | number }>
  ): Promise<FactureReports> {
    if (!facture.tiers_id) return NO_REPORTS;
    const listed = roundMoney(
      paiements
        .filter((p) => Number(p.id) > 0)
        .reduce((sum, p) => sum + Math.max(0, parseFloat(String(p.montant)) || 0), 0)
    );
    const paid = roundMoney(parseFloat(String(facture.montant_paye ?? 0)) || 0);
    if (Math.abs(listed - paid) < 0.005) return NO_REPORTS;
    // A cancelled invoice settles nothing: its payments only move once a
    // recompute has emptied it.
    if (facture.statut === 'annulee' && paid !== 0) return NO_REPORTS;

    let carries: PaiementReporte[] | null;
    try {
      carries = await this.loadClientCarries(Number(facture.tiers_id));
    } catch (error) {
      logger.error({ err: error, factureId: facture.id }, 'Report des paiements illisible pour cette facture');
      return NO_REPORTS;
    }
    if (!carries) return NO_REPORTS;

    const factureId = Number(facture.id);
    const excedent_reporte: ReportFacture[] = [];
    const recu_par_report: ReportFacture[] = [];
    let excedentNonAffecte = 0;
    for (const c of carries) {
      if (c.facture_source_id === factureId) {
        if (c.facture_cible_id === null) {
          excedentNonAffecte = roundMoney(excedentNonAffecte + c.montant);
        } else {
          excedent_reporte.push({
            facture_id: c.facture_cible_id,
            numero_facture: c.numero_cible ?? '',
            montant: c.montant,
            paiement_id: c.paiement_id,
            methode_paiement: c.methode_paiement,
            date_paiement: c.date_paiement,
          });
        }
      } else if (c.facture_cible_id === factureId) {
        recu_par_report.push({
          facture_id: c.facture_source_id,
          numero_facture: c.numero_source,
          montant: c.montant,
          paiement_id: c.paiement_id,
          methode_paiement: c.methode_paiement,
          date_paiement: c.date_paiement,
        });
      }
    }
    return { excedent_reporte, recu_par_report, excedent_non_affecte: excedentNonAffecte };
  }

  /**
   * One sentence per carried payment, for the recompute messages:
   * « 49 400 FCFA payés sur FAC-2026-00113, déjà soldée, règlent FAC-2026-00079. »
   */
  static describeReports(reports: PaiementReporte[]): string {
    if (reports.length === 0) return '';
    if (reports.length > 3) {
      return `${reports.length} paiements dépassent la facture sur laquelle ils ont été enregistrés : leur surplus règle d’autres factures du client (détail sur chaque facture).`;
    }
    return reports
      .map((r) => {
        const montant = formatMontantFcfa(r.montant);
        const source = `${r.numero_source}, ${r.source_annulee ? 'annulée' : 'déjà soldée'}`;
        return r.numero_cible
          ? `${montant} payés sur ${source}, règlent ${r.numero_cible}.`
          : `${montant} payés sur ${source}, ne règlent aucune facture : aucune autre facture du client n’était ouverte à la date du paiement.`;
      })
      .join(' ');
  }

  /** Σ montant_paye of the live invoices and the available acompte balance. */
  private static async readAccountState(client: any, clientId: number): Promise<{
    totalPaye: number;
    acomptesDisponibles: number;
    factures: Map<number, { numero_facture: string; montant_paye: number; statut: string }>;
  }> {
    const { rows: factureRows } = await client.query(
      `SELECT id, numero_facture, COALESCE(montant_paye, 0) AS montant_paye, statut
       FROM factures
       WHERE tiers_id = $1 AND deleted_at IS NULL AND statut <> 'annulee'
       ORDER BY id`,
      [clientId]
    );
    const { rows: acompteRows } = await client.query(
      `SELECT COALESCE(SUM(montant_restant), 0) AS disponible
       FROM acomptes_clients
       WHERE tiers_id = $1 AND deleted_at IS NULL AND statut <> 'rembourse' AND montant_restant > 0`,
      [clientId]
    );
    const factures = new Map<number, { numero_facture: string; montant_paye: number; statut: string }>();
    let totalPaye = 0;
    for (const r of factureRows) {
      const paye = roundMoney(parseFloat(r.montant_paye) || 0);
      factures.set(Number(r.id), { numero_facture: r.numero_facture, montant_paye: paye, statut: r.statut });
      totalPaye = roundMoney(totalPaye + paye);
    }
    return {
      totalPaye,
      acomptesDisponibles: roundMoney(parseFloat(acompteRows[0].disponible) || 0),
      factures,
    };
  }

  /**
   * Re-spread one client's payments under the E1 rule, in its own transaction.
   *
   * Never spends a deposit as a side effect: the acompte pool is capped at the
   * acompte money the invoices already count (`countedAcompteMoney`), exactly
   * like the payment paths (D3). A client whose total paid or available
   * deposit credit would change (statut 'ecart' — e.g. pre-2026-07-18 deposit
   * money counted on invoices without payment rows, which the recompute books
   * as acompte applications) is rolled back unless `acceptEcart`: the E1
   * re-spread moves money between invoices, nothing else.
   * In application mode a changed client gets one audit_log row (action
   * 'reimputation_paiements') holding every invoice before/after, written in
   * the same transaction as the change.
   */
  static async reallocateClient(
    clientId: number,
    options: { apply?: boolean; acceptEcart?: boolean; userId?: number | null } = {}
  ): Promise<ReallocationClientReport> {
    const conn = await pool.connect();
    const empty: ReallocationClientReport = {
      tiers_id: clientId,
      tiers_nom: null,
      statut: 'inchange',
      applique: false,
      total_paye_avant: 0,
      total_paye_apres: 0,
      acomptes_disponibles_avant: 0,
      acomptes_disponibles_apres: 0,
      factures: [],
      paiements_reportes: [],
    };
    try {
      await conn.query('BEGIN');

      const { rows: tiersRows } = await conn.query(
        `SELECT TRIM(CONCAT_WS(' ', raison_sociale, NULLIF(prenom, ''))) AS nom FROM tiers WHERE id = $1`,
        [clientId]
      );
      const tiersNom: string | null = tiersRows[0]?.nom || null;

      const before = await this.readAccountState(conn, clientId);
      const counted = await this.countedAcompteMoney(clientId, conn);
      await this.recomputeClientAllocations(clientId, {
        transaction: conn,
        userId: options.userId ?? null,
        acomptePoolCap: counted,
      });
      const after = await this.readAccountState(conn, clientId);
      // E1-R1: payments still beyond their invoice after the re-spread, read
      // in the same transaction (the simulated state when nothing is written).
      const paiementsReportes = (await this.loadClientCarries(clientId, conn)) ?? [];

      const factures: ReallocationFactureChange[] = [];
      for (const [factureId, b] of before.factures) {
        const a = after.factures.get(factureId);
        if (!a) continue;
        if (Math.abs(a.montant_paye - b.montant_paye) >= 0.005 || a.statut !== b.statut) {
          factures.push({
            facture_id: factureId,
            numero_facture: b.numero_facture,
            montant_paye_avant: b.montant_paye,
            montant_paye_apres: a.montant_paye,
            statut_avant: b.statut,
            statut_apres: a.statut,
          });
        }
      }

      const ecart = Math.abs(after.totalPaye - before.totalPaye) >= 0.005
        || Math.abs(after.acomptesDisponibles - before.acomptesDisponibles) >= 0.005;
      const statut: ReallocationClientReport['statut'] = ecart
        ? 'ecart'
        : factures.length > 0 ? 'modifie' : 'inchange';
      const writes = options.apply === true && statut !== 'inchange' && (statut === 'modifie' || options.acceptEcart === true);

      if (writes) {
        await conn.query(
          `INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
           VALUES ($1, 'reimputation_paiements', 'tiers', $2, $3, $4)`,
          [
            options.userId ?? null,
            clientId,
            JSON.stringify({
              total_paye: before.totalPaye,
              acomptes_disponibles: before.acomptesDisponibles,
              factures: factures.map((f) => ({ facture_id: f.facture_id, numero_facture: f.numero_facture, montant_paye: f.montant_paye_avant, statut: f.statut_avant })),
            }),
            JSON.stringify({
              regle: 'E1 — un paiement règle la facture sur laquelle il a été enregistré',
              total_paye: after.totalPaye,
              acomptes_disponibles: after.acomptesDisponibles,
              factures: factures.map((f) => ({ facture_id: f.facture_id, numero_facture: f.numero_facture, montant_paye: f.montant_paye_apres, statut: f.statut_apres })),
            }),
          ]
        );
        await conn.query('COMMIT');
      } else {
        await conn.query('ROLLBACK');
      }

      return {
        tiers_id: clientId,
        tiers_nom: tiersNom,
        statut,
        applique: writes,
        total_paye_avant: before.totalPaye,
        total_paye_apres: after.totalPaye,
        acomptes_disponibles_avant: before.acomptesDisponibles,
        acomptes_disponibles_apres: after.acomptesDisponibles,
        factures,
        paiements_reportes: paiementsReportes,
      };
    } catch (error: any) {
      await conn.query('ROLLBACK').catch(() => undefined);
      logger.error({ err: error, clientId }, 'Réimputation des paiements impossible pour ce client');
      return {
        ...empty,
        statut: 'erreur',
        erreur: 'Recalcul impossible pour ce client : rien n’a été modifié.',
      };
    } finally {
      conn.release();
    }
  }

  /**
   * One-time E1 re-spread of every client (admin: POST /api/tiers/recompute-allocations).
   * Simulation by default: nothing is written unless `apply`. Each client runs
   * in its own transaction, so one failure never blocks or undoes the others.
   * Idempotent — a second application finds nothing left to move.
   */
  static async reallocateAllClients(
    options: { apply?: boolean; acceptEcart?: boolean; userId?: number | null; tiersId?: number } = {}
  ): Promise<ReallocationReport> {
    const startTime = Date.now();
    const { rows } = options.tiersId
      ? { rows: [{ tiers_id: options.tiersId }] }
      : await pool.query(
          `SELECT DISTINCT tiers_id FROM factures
           WHERE deleted_at IS NULL AND tiers_id IS NOT NULL
           ORDER BY tiers_id`
        );

    const details: ReallocationClientReport[] = [];
    let modifies = 0;
    let facturesModifiees = 0;
    let ecarts = 0;
    let erreurs = 0;
    let reportes = 0;
    for (const row of rows) {
      const report = await this.reallocateClient(Number(row.tiers_id), options);
      reportes += report.paiements_reportes.length;
      // A client whose invoices do not move is still listed when one of its
      // payments exceeds its invoice: that payment may have been mis-filed.
      if (report.statut === 'inchange' && report.paiements_reportes.length === 0) continue;
      details.push(report);
      if (report.statut === 'modifie' || (report.statut === 'ecart' && report.applique)) {
        modifies += 1;
        facturesModifiees += report.factures.length;
      }
      if (report.statut === 'ecart') ecarts += 1;
      if (report.statut === 'erreur') erreurs += 1;
    }

    return {
      mode: options.apply ? 'application' : 'simulation',
      clients_examines: rows.length,
      clients_modifies: modifies,
      factures_modifiees: facturesModifiees,
      clients_ecart: ecarts,
      clients_erreur: erreurs,
      paiements_reportes: reportes,
      duree_ms: Date.now() - startTime,
      details,
    };
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

      const paiements = await this.loadPayments(client, clientId);

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
      const sim = this.simulateAllocation(factures, paiements, acomptes);
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
