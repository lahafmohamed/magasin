import pool from '../db/connection';
import { businessError } from '../utils/errors';
import { checkPeriodIsOpen } from './PeriodService';
import { caisseMagasinService } from './CaisseMagasinService';
import { ClientAllocationService } from './ClientAllocationService';
import { logger } from '../utils/logger';

/** Single source of truth for accepted payment methods (was duplicated 4×). */
export const PAYMENT_METHODS = [
  'espece', 'carte', 'cheque', 'virement',
  'mobile_money', 'orange_money', 'mtn_money', 'wave',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface CreatePaiementInput {
  factureId: number;
  montant: number;
  methode_paiement: PaymentMethod;
  date_paiement?: string;
  reference?: string;
  notes?: string;
  session_caisse_id?: number;
  idempotency_key?: string;
  skip_acompte_application?: boolean;
  userId: number | null;
}

export interface CreatePaiementResult {
  idempotent?: boolean;
  existing?: Record<string, unknown>;
  facture_id: number;
  montant_recu: number;
  applique_depuis_acomptes: number;
  applications: { acompte_id: number; paiement_id: number; montant: number }[];
  direct_paiement_id: number | null;
  direct_montant: number;
  methode_paiement: PaymentMethod;
  session_caisse_id: number | null;
  message: string;
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
   *  2. Auto-apply available acomptes FIFO up to the invoice balance — each
   *     application creates a paiements row (source='acompte_application') and
   *     an acompte_applications ledger row. No caisse movement (no cash today).
   *  3. Remainder (montant - applied) recorded as a direct paiement plus one
   *     mouvement_caisse line when a session is resolvable. Caisse error = rollback.
   */
  async create(input: CreatePaiementInput): Promise<CreatePaiementResult> {
    const {
      factureId, montant, methode_paiement, date_paiement, reference, notes,
      session_caisse_id, idempotency_key, skip_acompte_application, userId,
    } = input;

    if (!montant || Number(montant) <= 0) {
      throw businessError(400, 'Le montant doit être supérieur à 0');
    }
    if (!methode_paiement || !PAYMENT_METHODS.includes(methode_paiement)) {
      throw businessError(400, 'Méthode de paiement invalide');
    }

    const datePaiement = date_paiement || new Date().toISOString();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Reject postings into a closed accounting period
      await checkPeriodIsOpen(new Date(datePaiement), client);

      // Idempotency
      if (idempotency_key) {
        const { rows: dup } = await client.query(
          'SELECT * FROM paiements WHERE idempotency_key = $1',
          [idempotency_key]
        );
        if (dup.length > 0) {
          await client.query('COMMIT');
          return { idempotent: true, existing: dup[0] } as unknown as CreatePaiementResult;
        }
      }

      // Lock facture row to serialize concurrent payments
      const { rows: factureRows } = await client.query(
        `SELECT id, tiers_id, statut, location_id, total, montant_paye,
                GREATEST(total - montant_paye, 0) AS remaining
         FROM factures WHERE id = $1 FOR UPDATE`,
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
        throw businessError(409, 'Aucune session caisse ouverte — impossible de recevoir des espèces');
      }

      // ── Step 1: auto-apply available acomptes FIFO ──
      let appliedFromAcomptes = 0;
      const applications: { acompte_id: number; paiement_id: number; montant: number }[] = [];

      if (!skip_acompte_application) {
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

        let remainingNeeded = remainingDue; // apply up to invoice balance, not just payload montant
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
              `ACO-APP-${ac.id}`, `Application acompte #${ac.id}`,
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
              `Application acompte #${ac.id} sur facture #${factureId}`, userId]
          );

          applications.push({ acompte_id: ac.id, paiement_id: payRows[0].id, montant: toApply });
          appliedFromAcomptes += toApply;
          remainingNeeded -= toApply;
        }
      }

      // ── Step 2: direct payment for remainder ──
      const directMontant = Math.max(0, montantNum - appliedFromAcomptes);
      let directPaiementId: number | null = null;

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
            libelle: `Paiement facture #${factureId}`,
            user_id: userId || undefined,
            idempotency_key: idempotency_key ? `${idempotency_key}:mvt` : undefined,
          });

          await client.query(
            'UPDATE paiements SET mouvement_caisse_id = $1 WHERE id = $2',
            [mouvement.id, directPaiementId]
          );
        }

        // Ledger
        await client.query(
          `INSERT INTO compte_client_lignes
             (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
           VALUES ($1, 'paiement', $2, $3, 0, $4, $5, $6)`,
          [clientId, directPaiementId, `PAI-${directPaiementId}`, directMontant, notes || null, userId]
        );
      }

      await ClientAllocationService.recomputeClientAllocations(clientId, { transaction: client });

      await client.query('COMMIT');

      return {
        facture_id: factureId,
        montant_recu: montantNum,
        applique_depuis_acomptes: appliedFromAcomptes,
        applications,
        direct_paiement_id: directPaiementId,
        direct_montant: directMontant,
        methode_paiement,
        session_caisse_id: effectiveSessionCaisseId,
        message: appliedFromAcomptes > 0
          ? `Acomptes appliqués (${appliedFromAcomptes}), reste encaissé: ${directMontant}`
          : 'Paiement enregistré',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update a payment (triggers FIFO reallocation). Financial fields are only
   * editable when the payment has no caisse movement and is not an acompte
   * application; the target period(s) must be open.
   */
  async update(id: number, input: UpdatePaiementInput): Promise<void> {
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

      await ClientAllocationService.recomputeClientAllocations(payment.tiers_id, { transaction: client });

      await client.query('COMMIT');
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

      // acompte_applications.paiement_id is ON DELETE SET NULL: deleting this row
      // would leave the acompte consumed while the facture becomes unpaid.
      if (payment.source === 'acompte_application') {
        throw businessError(409, 'Paiement issu d\'un acompte — annulez l\'application d\'acompte, pas ce paiement');
      }

      // Closed accounting periods are immutable
      await checkPeriodIsOpen(new Date(payment.date_paiement), client);

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
            libelle: `Annulation paiement PAI-${payment.id} (facture #${payment.facture_id})`,
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

      await ClientAllocationService.recomputeClientAllocations(payment.tiers_id, { transaction: client });

      await client.query('COMMIT');
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
