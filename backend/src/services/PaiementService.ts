import type { PoolClient } from 'pg';
import pool from '../db/connection';
import { businessError } from '../utils/errors';
import { checkPeriodIsOpen } from './PeriodService';
import { caisseMagasinService } from './CaisseMagasinService';
import { ClientAllocationService } from './ClientAllocationService';
import { logger } from '../utils/logger';
import { logAudit } from '../middleware/audit';
import { PAYMENT_METHODS, PaymentMethod, paymentMethodPhrase } from '../utils/paymentMethods';
import { NotificationService } from './NotificationService';
import { formatMontantFcfa } from '../utils/money';
import { roundMoney } from './PricingService';
import { mouvementLibelle, tiersNomSql } from '../utils/caisseLibelle';

// Payment methods now live in utils/paymentMethods so non-service layers can
// import them without a cycle. Re-exported here for existing importers.
export { PAYMENT_METHODS };
export type { PaymentMethod };

export interface CreatePaiementInput {
  factureId: number;
  montant: number;
  methode_paiement: PaymentMethod;
  date_paiement?: string;
  reference?: string;
  notes?: string;
  session_caisse_id?: number;
  idempotency_key?: string;
  /** Explicit request to settle `montant` from the client's acomptes first (D3). */
  appliquer_acomptes?: boolean;
  /** @deprecated No-op since D3 — not applying acomptes is the default. Wins over `appliquer_acomptes`. */
  skip_acompte_application?: boolean;
  userId: number | null;
}

export interface CreatePaiementResult {
  idempotent?: boolean;
  existing?: Record<string, unknown>;
  facture_id: number;
  numero_facture: string;
  /** The amount entered: always equals applique_depuis_acomptes + direct_montant. */
  montant_recu: number;
  /** Taken from the client's acomptes — only on an explicit request (appliquer_acomptes). */
  applique_depuis_acomptes: number;
  applications: { acompte_id: number; paiement_id: number; montant: number }[];
  direct_paiement_id: number | null;
  /** Recorded as a payment in `methode_paiement` (cash in the till when espece). */
  direct_montant: number;
  methode_paiement: PaymentMethod;
  session_caisse_id: number | null;
  /** Till movement written for direct_montant, null when no open session was involved. */
  mouvement_caisse_id: number | null;
  encaisse_en_caisse: boolean;
  /** Invoice state after the recompute (E1: the payment settles this invoice). */
  reste_du: number;
  statut_facture: string;
  /** Client's acompte balance still available after this payment. */
  acomptes_disponibles: number;
  message: string;
}

/**
 * French sentence describing exactly what was recorded, e.g.
 * « Paiement de 70 000 FCFA enregistré en espèces. Reste dû : 30 000 FCFA. »
 */
function describePayment(r: {
  direct: number;
  applied: number;
  methode: PaymentMethod;
  resteDu: number;
}): string {
  const phrase = paymentMethodPhrase(r.methode);
  let first: string;
  if (r.applied > 0 && r.direct > 0) {
    first = `${formatMontantFcfa(r.applied)} pris sur l’acompte et ${formatMontantFcfa(r.direct)} payés ${phrase}.`;
  } else if (r.applied > 0) {
    first = `${formatMontantFcfa(r.applied)} pris sur l’acompte.`;
  } else {
    first = `Paiement de ${formatMontantFcfa(r.direct)} enregistré ${phrase}.`;
  }
  const second = r.resteDu > 0.005
    ? `Reste dû : ${formatMontantFcfa(r.resteDu)}.`
    : 'Facture soldée.';
  return `${first} ${second}`;
}

export interface UpdatePaiementInput {
  montant?: number;
  methode_paiement?: PaymentMethod;
  reference?: string;
  notes?: string;
  date_paiement?: string;
}

/**
 * Payment transaction orchestration. All business rules throw businessError
 * (4xx) — controllers map them via businessStatusOf and never leak raw errors.
 */
export class PaiementService {
  /**
   * Record a payment on a facture.
   *  1. Idempotency short-circuit (idempotency_key).
   *  2. Only when explicitly requested (`appliquer_acomptes`): settle part of
   *     `montant` from available acomptes FIFO, never more than `montant` —
   *     each application creates a paiements row (source='acompte_application')
   *     and an acompte_applications ledger row. No caisse movement.
   *  3. The rest of `montant` (all of it by default) is recorded as a direct
   *     paiement plus one mouvement_caisse line when a session is resolvable.
   *     Caisse error = rollback.
   *  4. Recompute (E1: each payment pinned to its own invoice) with the
   *     acompte pool capped at what the invoices already counted: recording a
   *     payment never spends a deposit as a side effect (decision D3).
   */
  async create(input: CreatePaiementInput): Promise<CreatePaiementResult> {
    // Contrôles de forme avant de prendre une connexion (refaits par le cœur).
    if (!input.montant || Number(input.montant) <= 0) {
      throw businessError(400, 'Le montant doit être supérieur à 0');
    }
    if (!input.methode_paiement || !PAYMENT_METHODS.includes(input.methode_paiement)) {
      throw businessError(400, 'Méthode de paiement invalide');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const { result, afterCommit } = await this.createInTransaction(client, input);
      await client.query('COMMIT');
      await afterCommit();
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Corps de `create` dans une transaction ouverte par l'appelant (vente
   * comptoir : facture et paiements validés ensemble). `afterCommit` écrit le
   * journal d'audit et notifie : à n'appeler qu'après le COMMIT.
   */
  async createInTransaction(
    client: PoolClient,
    input: CreatePaiementInput
  ): Promise<{ result: CreatePaiementResult; afterCommit: () => Promise<void> }> {
    const {
      factureId, montant, methode_paiement, date_paiement, reference, notes,
      session_caisse_id, idempotency_key, appliquer_acomptes, skip_acompte_application, userId,
    } = input;
    const applyAcomptes = appliquer_acomptes === true && skip_acompte_application !== true;

    if (!montant || Number(montant) <= 0) {
      throw businessError(400, 'Le montant doit être supérieur à 0');
    }
    if (!methode_paiement || !PAYMENT_METHODS.includes(methode_paiement)) {
      throw businessError(400, 'Méthode de paiement invalide');
    }

    {
      // Without a date from the caller, the payment is stamped by the database
      // clock — the one that stamped the invoice (date_facture = CURRENT_TIMESTAMP)
      // and the acomptes. The Node clock (used before) can lag it by tens of ms on
      // Windows: a payment recorded right after its invoice then looked older than
      // the invoice, and the FIFO rule « a direct payment cannot settle an invoice
      // issued after it » left that invoice unpaid (flaky PaiementController tests).
      const datePaiement: string = date_paiement || (
        await client.query(`SELECT to_char(LOCALTIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS maintenant`)
      ).rows[0].maintenant;

      // Reject postings into a closed accounting period
      await checkPeriodIsOpen(new Date(datePaiement), client);

      // Idempotency
      if (idempotency_key) {
        const { rows: dup } = await client.query(
          'SELECT * FROM paiements WHERE idempotency_key = $1',
          [idempotency_key]
        );
        if (dup.length > 0) {
          return {
            result: { idempotent: true, existing: dup[0] } as unknown as CreatePaiementResult,
            afterCommit: async () => {},
          };
        }
      }

      // Lock facture row to serialize concurrent payments
      const { rows: factureRows } = await client.query(
        `SELECT f.id, f.numero_facture, f.tiers_id, f.statut, f.location_id, f.total, f.montant_paye,
                GREATEST(f.total - f.montant_paye, 0) AS remaining,
                (SELECT ${tiersNomSql('t')} FROM tiers t WHERE t.id = f.tiers_id) AS client_nom
         FROM factures f WHERE f.id = $1 FOR UPDATE OF f`,
        [factureId]
      );

      if (factureRows.length === 0) {
        throw businessError(404, 'Facture non trouvée');
      }

      const facture = factureRows[0];
      if (facture.statut === 'annulee') {
        throw businessError(400, 'Impossible d\'ajouter un paiement sur une facture annulée');
      }

      const clientId = facture.tiers_id;
      const locationId = facture.location_id;
      const remainingDue = parseFloat(facture.remaining);
      const montantNum = Number(montant);

      if (montantNum > remainingDue + 0.005) {
        throw businessError(422, `Montant (${montantNum}) dépasse le reste dû (${remainingDue})`);
      }

      // Resolve magasin / session for caisse
      let effectiveMagasinId: number | null = null;
      if (locationId) {
        const { rows: magRows } = await client.query(
          'SELECT id FROM magasins WHERE location_id = $1 LIMIT 1',
          [locationId]
        );
        if (magRows.length > 0) effectiveMagasinId = magRows[0].id;
      }

      let effectiveSessionCaisseId: number | null = session_caisse_id || null;
      if (!effectiveSessionCaisseId && effectiveMagasinId) {
        const { rows: sessRows } = await client.query(
          'SELECT id FROM sessions_caisse WHERE magasin_id = $1 AND statut = $2 LIMIT 1',
          [effectiveMagasinId, 'ouverte']
        );
        if (sessRows.length > 0) effectiveSessionCaisseId = sessRows[0].id;
      }

      if (methode_paiement === 'espece' && !effectiveSessionCaisseId) {
        throw businessError(409, 'La caisse de ce magasin est fermée : ouvrez-la avant d’encaisser des espèces.', 'CAISSE_FERMEE');
      }

      // Read before any payment row moves: acompte money the invoices already
      // count (legacy state) must survive the recompute below.
      const countedAcomptes = await ClientAllocationService.countedAcompteMoney(clientId, client);

      // ── Step 1: explicit acompte application (opt-in only) ──
      let appliedFromAcomptes = 0;
      const applications: { acompte_id: number; paiement_id: number; montant: number }[] = [];

      if (applyAcomptes) {
        const { rows: acomptes } = await client.query(
          `SELECT id, montant_restant
           FROM acomptes_clients
           WHERE tiers_id = $1
             AND statut IN ('disponible','partiellement_utilise')
             AND COALESCE(deleted_at, NULL) IS NULL
             AND montant_restant > 0
           ORDER BY date_acompte ASC, id ASC
           FOR UPDATE`,
          [clientId]
        );

        // Never more than the amount entered: `montant` is the total settled.
        let remainingNeeded = Math.min(remainingDue, montantNum);
        for (const ac of acomptes) {
          if (remainingNeeded <= 0) break;
          const acRestant = parseFloat(ac.montant_restant);
          const toApply = Math.min(acRestant, remainingNeeded);
          if (toApply <= 0) continue;

          // Create paiement row for this application
          const { rows: payRows } = await client.query(
            `INSERT INTO paiements (
              facture_id, montant, methode_paiement, date_paiement,
              reference, notes, session_caisse_id, magasin_id, source, cree_par
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'acompte_application',$9)
            RETURNING id`,
            [factureId, toApply, methode_paiement, datePaiement,
              `Acompte n° ${ac.id}`, `Acompte n° ${ac.id} appliqué`,
              null, effectiveMagasinId, userId]
          );

          await client.query(
            `INSERT INTO acompte_applications (acompte_id, facture_id, paiement_id, montant, cree_par)
             VALUES ($1,$2,$3,$4,$5)`,
            [ac.id, factureId, payRows[0].id, toApply, userId]
          );

          // Ledger: credit (client paid via acompte balance)
          await client.query(
            `INSERT INTO compte_client_lignes
               (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
             VALUES ($1, 'paiement', $2, $3, 0, $4, $5, $6)`,
            [clientId, payRows[0].id, `PAI-${payRows[0].id}`, toApply,
              `Acompte n° ${ac.id} appliqué à ${facture.numero_facture}`, userId]
          );

          applications.push({ acompte_id: ac.id, paiement_id: payRows[0].id, montant: toApply });
          appliedFromAcomptes = roundMoney(appliedFromAcomptes + toApply);
          remainingNeeded = roundMoney(remainingNeeded - toApply);
        }
      }

      // ── Step 2: direct payment for the rest (all of `montant` by default) ──
      const directMontant = roundMoney(Math.max(0, montantNum - appliedFromAcomptes));
      let directPaiementId: number | null = null;
      let mouvementCaisseId: number | null = null;

      if (directMontant > 0) {
        const { rows: payRows } = await client.query(
          `INSERT INTO paiements (
            facture_id, montant, methode_paiement, date_paiement,
            reference, notes, session_caisse_id, magasin_id, source,
            idempotency_key, cree_par
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'direct',$9,$10)
          RETURNING id, date_paiement`,
          [factureId, directMontant, methode_paiement, datePaiement,
            reference || null, notes || null,
            effectiveSessionCaisseId, effectiveMagasinId,
            idempotency_key || null, userId]
        );
        directPaiementId = payRows[0].id;

        // Caisse movement (any tracked method when session known). FAIL tx if fails.
        if (effectiveSessionCaisseId) {
          const mouvement = await caisseMagasinService.enregistrerMouvement(client, {
            session_caisse_id: effectiveSessionCaisseId,
            type: 'encaissement',
            categorie: 'paiement_client',
            montant: directMontant,
            methode_paiement,
            reference_type: 'paiement',
            reference_id: directPaiementId!,
            libelle: mouvementLibelle(`Paiement ${facture.numero_facture}`, facture.client_nom),
            user_id: userId || undefined,
            idempotency_key: idempotency_key ? `${idempotency_key}:mvt` : undefined,
          });

          await client.query(
            'UPDATE paiements SET mouvement_caisse_id = $1 WHERE id = $2',
            [mouvement.id, directPaiementId]
          );
          mouvementCaisseId = mouvement.id;
        }

        // Ledger
        await client.query(
          `INSERT INTO compte_client_lignes
             (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
           VALUES ($1, 'paiement', $2, $3, 0, $4, $5, $6)`,
          [clientId, directPaiementId, `PAI-${directPaiementId}`, directMontant, notes || null, userId]
        );
      }

      await ClientAllocationService.recomputeClientAllocations(clientId, {
        transaction: client,
        acomptePoolCap: countedAcomptes,
      });

      // What the user should be told: the invoice and deposit state after the
      // recompute. Since E1 (2026-10-24) the payment stays on this invoice; only
      // a legacy overpayment of it can still flow to the client's oldest one.
      const { rows: afterRows } = await client.query(
        `SELECT f.statut, GREATEST(f.total - f.montant_paye, 0) AS reste_du,
                (SELECT COALESCE(SUM(a.montant_restant), 0) FROM acomptes_clients a
                 WHERE a.tiers_id = f.tiers_id AND a.deleted_at IS NULL
                   AND a.statut <> 'rembourse' AND a.montant_restant > 0) AS acomptes_disponibles
         FROM factures f WHERE f.id = $1`,
        [factureId]
      );
      const resteDu = roundMoney(parseFloat(afterRows[0].reste_du));
      const acomptesDisponibles = roundMoney(parseFloat(afterRows[0].acomptes_disponibles));

      const afterCommit = async () => {
      await logAudit({
        utilisateur_id: userId,
        action: 'create',
        table_name: 'paiements',
        record_id: directPaiementId ?? applications[0]?.paiement_id ?? factureId,
        new_values: {
          facture_id: factureId,
          montant: montantNum,
          methode_paiement,
          applique_depuis_acomptes: appliedFromAcomptes,
          direct_montant: directMontant,
        },
      });

      // Notification après COMMIT, non bloquante (cf. FactureService.create).
      NotificationService.safely(() =>
        NotificationService.paymentReceived({
          facture_numero: factureRows[0].numero_facture,
          montant: montantNum,
          methode: methode_paiement,
        })
      );
      };

      const result: CreatePaiementResult = {
        facture_id: factureId,
        numero_facture: facture.numero_facture,
        montant_recu: montantNum,
        applique_depuis_acomptes: appliedFromAcomptes,
        applications,
        direct_paiement_id: directPaiementId,
        direct_montant: directMontant,
        methode_paiement,
        session_caisse_id: directPaiementId ? effectiveSessionCaisseId : null,
        mouvement_caisse_id: mouvementCaisseId,
        encaisse_en_caisse: mouvementCaisseId !== null,
        reste_du: resteDu,
        statut_facture: afterRows[0].statut,
        acomptes_disponibles: acomptesDisponibles,
        message: describePayment({
          direct: directMontant,
          applied: appliedFromAcomptes,
          methode: methode_paiement,
          resteDu,
        }),
      };
      return { result, afterCommit };
    }
  }

  /**
   * Update a payment (triggers FIFO reallocation). Financial fields are only
   * editable when the payment has no caisse movement and is not an acompte
   * application; the target period(s) must be open.
   */
  async update(id: number, input: UpdatePaiementInput, userId: number | null = null): Promise<void> {
    const { montant, methode_paiement, reference, notes, date_paiement } = input;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: existingPayment } = await client.query(
        `SELECT p.*, f.tiers_id
         FROM paiements p
         JOIN factures f ON f.id = p.facture_id
         WHERE p.id = $1
         FOR UPDATE OF p`,
        [id]
      );

      if (existingPayment.length === 0) {
        throw businessError(404, 'Paiement non trouvé');
      }

      const payment = existingPayment[0];

      if (montant !== undefined && montant <= 0) {
        throw businessError(400, 'Le montant doit être supérieur à 0');
      }

      const changesFinancials =
        montant !== undefined || methode_paiement !== undefined || date_paiement !== undefined;

      if (changesFinancials) {
        // An acompte-application line mirrors an acompte_applications ledger row;
        // editing its amount would desynchronize the acompte balance.
        if (payment.source === 'acompte_application') {
          throw businessError(409, 'Paiement issu d\'un acompte — modifiez l\'acompte, pas ce paiement');
        }
        // A caisse-linked payment already produced a till movement at the original
        // amount; supprimer puis recréer keeps the till consistent.
        if (payment.mouvement_caisse_id) {
          throw businessError(409, 'Paiement lié à un mouvement de caisse — supprimez puis recréez le paiement');
        }

        // Closed accounting periods are immutable (original date and, if moved, the new one)
        await checkPeriodIsOpen(new Date(payment.date_paiement), client);
        if (date_paiement) {
          await checkPeriodIsOpen(new Date(date_paiement), client);
        }

        // New amount must not exceed the facture's remaining due (old amount released)
        if (montant !== undefined) {
          const { rows: factureRows } = await client.query(
            `SELECT GREATEST(total - montant_paye, 0) AS remaining
             FROM factures WHERE id = $1 FOR UPDATE`,
            [payment.facture_id]
          );
          const available = parseFloat(factureRows[0].remaining) + parseFloat(payment.montant);
          if (Number(montant) > available + 0.005) {
            throw businessError(422, `Montant (${montant}) dépasse le reste dû (${available})`);
          }
        }
      }

      // Before the row moves (D3: editing a payment never spends a deposit).
      const countedAcomptes = await ClientAllocationService.countedAcompteMoney(payment.tiers_id, client);

      await client.query(
        `UPDATE paiements SET
          montant = COALESCE($1, montant),
          methode_paiement = COALESCE($2, methode_paiement),
          reference = COALESCE($3, reference),
          notes = COALESCE($4, notes),
          date_paiement = COALESCE($5, date_paiement)
         WHERE id = $6`,
        [montant, methode_paiement, reference, notes, date_paiement, id]
      );

      await ClientAllocationService.recomputeClientAllocations(payment.tiers_id, {
        transaction: client,
        acomptePoolCap: countedAcomptes,
      });

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: userId,
        action: 'update',
        table_name: 'paiements',
        record_id: id,
        new_values: { montant, methode_paiement, reference, notes, date_paiement },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a payment (triggers FIFO reallocation). Reverses the caisse
   * movement into its (still open) session and writes a ledger reversal.
   */
  async delete(id: number, userId: number | null): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: existingPayment } = await client.query(
        `SELECT p.*, f.tiers_id, f.numero_facture,
                (SELECT ${tiersNomSql('t')} FROM tiers t WHERE t.id = f.tiers_id) AS client_nom
         FROM paiements p
         JOIN factures f ON f.id = p.facture_id
         WHERE p.id = $1
         FOR UPDATE OF p`,
        [id]
      );

      if (existingPayment.length === 0) {
        throw businessError(404, 'Paiement non trouvé');
      }

      const payment = existingPayment[0];

      // acompte_applications.paiement_id is ON DELETE SET NULL: deleting this row
      // would leave the acompte consumed while the facture becomes unpaid.
      if (payment.source === 'acompte_application') {
        throw businessError(409, 'Paiement issu d\'un acompte — annulez l\'application d\'acompte, pas ce paiement');
      }

      // Closed accounting periods are immutable
      await checkPeriodIsOpen(new Date(payment.date_paiement), client);

      // Before the row goes (D3): deleting a payment reopens the invoice, and an
      // available deposit must not silently fill the gap.
      const countedAcomptes = await ClientAllocationService.countedAcompteMoney(payment.tiers_id, client);

      // Reverse the till movement so the caisse balance stays true. Only an
      // open session can absorb the reversal — a closed one has been counted.
      if (payment.mouvement_caisse_id) {
        const { rows: mvtRows } = await client.query(
          `SELECT m.session_caisse_id, s.statut AS session_statut
           FROM mouvements_caisse m
           JOIN sessions_caisse s ON s.id = m.session_caisse_id
           WHERE m.id = $1`,
          [payment.mouvement_caisse_id]
        );
        if (mvtRows.length > 0) {
          if (mvtRows[0].session_statut !== 'ouverte') {
            throw businessError(409, 'Paiement lié à une session de caisse fermée — suppression impossible');
          }
          await caisseMagasinService.enregistrerMouvement(client, {
            session_caisse_id: mvtRows[0].session_caisse_id,
            type: 'decaissement',
            categorie: 'remboursement_client',
            montant: parseFloat(payment.montant),
            methode_paiement: payment.methode_paiement,
            reference_type: 'paiement',
            reference_id: payment.id,
            libelle: mouvementLibelle(`Annulation paiement ${payment.numero_facture}`, payment.client_nom),
            user_id: userId || undefined,
          });
        }
      }

      // Customer ledger: reversal debit entry for payment deletion
      await client.query(
        `INSERT INTO compte_client_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'ajustement', $2, $3, $4, 0, $5, $6)`,
        [
          payment.tiers_id,
          payment.id,
          `ANNUL-PAI-${payment.id}`,
          payment.montant,
          `Annulation paiement PAI-${payment.id}`,
          userId,
        ]
      );

      await client.query('DELETE FROM paiements WHERE id = $1', [id]);

      await ClientAllocationService.recomputeClientAllocations(payment.tiers_id, {
        transaction: client,
        acomptePoolCap: countedAcomptes,
      });

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: userId,
        action: 'delete',
        table_name: 'paiements',
        record_id: id,
        old_values: { facture_id: payment.facture_id, montant: payment.montant, methode_paiement: payment.methode_paiement },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.debug({ err: error, paiementId: id }, 'Suppression paiement annulée');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const paiementService = new PaiementService();
