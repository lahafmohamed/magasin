import pool from '../db/connection';
import { businessError } from '../utils/errors';
import { checkPeriodIsOpen } from './PeriodService';
import { caisseMagasinService } from './CaisseMagasinService';
import { ClientAllocationService } from './ClientAllocationService';
import { PAYMENT_METHODS, PaymentMethod, toPaiementMethod } from '../utils/paymentMethods';
import { SupplierAllocationService, SupplierAllocationResult } from './SupplierAllocationService';

const CASH_METHODS: PaymentMethod[] = ['espece'];

export interface CreateAcompteInput {
  tiersId: number;
  montant: number;
  methode_paiement: PaymentMethod;
  notes?: string | null;
  magasin_id?: number | null;
  reference_number?: string | null;
  session_caisse_id?: number | null;
  idempotency_key?: string | null;
  userId: number | null;
}

export interface CreateAcompteResult {
  idempotent: boolean;
  acompte: any;
  mouvement_caisse_id: number | null;
  allocation?: SupplierAllocationResult;
}

export interface ApplyAcompteInput {
  acompteId: number;
  factureId: number;
  montant: number;
  idempotency_key?: string;
  userId: number | null;
}

export interface RefundAcompteInput {
  acompteId: number;
  montant: number;
  methode_paiement: PaymentMethod;
  session_caisse_id?: number;
  idempotency_key?: string;
  userId: number | null;
}

/**
 * Acompte (client + fournisseur) transaction orchestration. The two sides are
 * kept as explicit methods — tables, ledger targets, and caisse direction all
 * differ — but share the session-resolution and validation helpers below.
 * Business rules throw businessError (4xx); controllers map via businessStatusOf.
 */
export class AcompteService {

  /** Resolve an open caisse session for a magasin, or throw. */
  private async resolveOpenSession(
    client: any,
    sessionCaisseId: number | undefined | null,
    magasinId: number | null
  ): Promise<number> {
    if (sessionCaisseId) return sessionCaisseId;
    if (!magasinId) {
      throw businessError(422, 'magasin_id ou session_caisse_id requis');
    }
    const { rows } = await client.query(
      `SELECT id FROM sessions_caisse WHERE magasin_id = $1 AND statut = 'ouverte' LIMIT 1`,
      [magasinId]
    );
    if (rows.length === 0) {
      throw businessError(409, 'Aucune session caisse ouverte pour ce magasin');
    }
    return rows[0].id;
  }

  private assertRefundInput(montant: number, methode_paiement: string): void {
    if (!montant || Number(montant) <= 0) {
      throw businessError(400, 'montant > 0 obligatoire');
    }
    if (!methode_paiement || !PAYMENT_METHODS.includes(methode_paiement as PaymentMethod)) {
      throw businessError(400, 'methode_paiement invalide');
    }
  }

  /** Common acompte-row checks; returns the parsed remaining amount. */
  private assertAcompteUsable(acompte: any, montantNum: number): number {
    if (acompte.statut === 'rembourse') {
      throw businessError(409, 'Acompte déjà remboursé');
    }
    const acRestant = parseFloat(acompte.montant_restant);
    if (montantNum > acRestant + 0.005) {
      throw businessError(422, `Montant dépasse le restant (${acRestant})`);
    }
    return acRestant;
  }

  /** Record a customer deposit (money in; caisse + tiers ledger + acompte row). */
  async createClient(input: CreateAcompteInput): Promise<CreateAcompteResult> {
    return this.createAcompte('client', input);
  }

  /** Record a supplier advance (money out) and FIFO-allocate it to open invoices. */
  async createFournisseur(input: CreateAcompteInput): Promise<CreateAcompteResult> {
    return this.createAcompte('fournisseur', input);
  }

  /**
   * Shared create flow for both sides. The differences (table, tiers role,
   * caisse direction, ledger target, post-insert allocation) are parametrized;
   * everything else — idempotency, session resolution, movement, ledger — is
   * strictly the behavior the two former controller transactions shared.
   */
  private async createAcompte(side: 'client' | 'fournisseur', input: CreateAcompteInput): Promise<CreateAcompteResult> {
    const {
      tiersId, montant, methode_paiement, notes, magasin_id,
      reference_number, session_caisse_id, idempotency_key, userId,
    } = input;

    const montantNum = Number(montant);
    if (!montantNum || montantNum <= 0) {
      throw businessError(400, 'Montant doit être > 0');
    }
    if (!methode_paiement || !PAYMENT_METHODS.includes(methode_paiement)) {
      throw businessError(400, 'methode_paiement invalide');
    }

    const isClient = side === 'client';
    const acompteTable = isClient ? 'acomptes_clients' : 'acomptes_fournisseur';
    const roleColumn = isClient ? 'est_client' : 'est_fournisseur';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (idempotency_key) {
        const { rows: dup } = await client.query(
          `SELECT * FROM ${acompteTable} WHERE idempotency_key = $1`,
          [idempotency_key]
        );
        if (dup.length > 0) {
          await client.query('COMMIT');
          return { idempotent: true, acompte: dup[0], mouvement_caisse_id: dup[0].mouvement_caisse_id ?? null };
        }
      }

      const { rows: tiersRows } = await client.query(
        `SELECT id, ${roleColumn} AS has_role FROM tiers WHERE id = $1 AND deleted_at IS NULL`,
        [tiersId]
      );
      if (tiersRows.length === 0) {
        throw businessError(404, 'Tiers introuvable');
      }
      if (tiersRows[0].has_role === false) {
        throw businessError(422, isClient
          ? 'Tiers n\'est pas un client — promouvoir d\'abord'
          : 'Tiers n\'est pas un fournisseur — promouvoir d\'abord');
      }

      // Resolve target session for cash payments — fail hard if no open session
      let effectiveSessionId: number | null = session_caisse_id || null;
      let effectiveMagasinId: number | null = magasin_id || null;

      if (CASH_METHODS.includes(methode_paiement)) {
        if (!effectiveSessionId) {
          if (!effectiveMagasinId) {
            throw businessError(422, 'magasin_id ou session_caisse_id requis pour paiement espèces');
          }
          const { rows: sessRows } = await client.query(
            `SELECT id FROM sessions_caisse WHERE magasin_id = $1 AND statut = 'ouverte' LIMIT 1`,
            [effectiveMagasinId]
          );
          if (sessRows.length === 0) {
            throw businessError(409, 'Aucune session caisse ouverte pour ce magasin');
          }
          effectiveSessionId = sessRows[0].id;
        } else {
          const { rows: sessRows } = await client.query(
            `SELECT magasin_id FROM sessions_caisse WHERE id = $1 AND statut = 'ouverte'`,
            [effectiveSessionId]
          );
          if (sessRows.length === 0) {
            throw businessError(409, 'Session caisse non ouverte');
          }
          effectiveMagasinId = effectiveMagasinId || sessRows[0].magasin_id;
        }
      }

      // Insert acompte (montant_restant = montant)
      const { rows: acompteRows } = await client.query(
        `INSERT INTO ${acompteTable} (
          tiers_id, montant, montant_restant, methode_paiement, notes,
          cree_par, magasin_id, session_caisse_id, reference_number, idempotency_key
        ) VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [tiersId, montantNum, methode_paiement, notes || null, userId,
          effectiveMagasinId, effectiveSessionId, reference_number || null, idempotency_key || null]
      );
      const acompte = acompteRows[0];

      // Caisse movement when a session is attached — FAIL the transaction on
      // error, no swallow. Non-cash methods tracked too for the full breakdown.
      let mouvement: any = null;
      if (effectiveSessionId) {
        mouvement = await caisseMagasinService.enregistrerMouvement(client, {
          session_caisse_id: effectiveSessionId,
          type: isClient ? 'encaissement' : 'decaissement',
          categorie: isClient ? 'acompte_client' : 'paiement_fournisseur',
          montant: montantNum,
          methode_paiement,
          reference_type: isClient ? 'acompte' : 'acompte_fournisseur',
          reference_id: acompte.id,
          libelle: isClient ? `Acompte client #${tiersId}` : `Acompte fournisseur #${tiersId}`,
          user_id: userId ?? undefined,
          idempotency_key: idempotency_key ? `${idempotency_key}:mvt` : undefined,
        });

        await client.query(
          `UPDATE ${acompteTable} SET mouvement_caisse_id = $1 WHERE id = $2`,
          [mouvement.id, acompte.id]
        );
      }

      // Tiers ledger: client pays us → credit; we pay the supplier → debit (AP down)
      if (isClient) {
        await client.query(
          `INSERT INTO compte_client_lignes
             (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
           VALUES ($1, 'acompte', $2, $3, 0, $4, $5, $6)`,
          [tiersId, acompte.id, `ACO-${acompte.id}`, montantNum, notes || null, userId]
        );
      } else {
        await client.query(
          `INSERT INTO compte_fournisseur_lignes
             (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
           VALUES ($1, 'acompte', $2, $3, $4, 0, $5, $6)`,
          [tiersId, acompte.id, `ACOF-${acompte.id}`, montantNum, notes || null, userId]
        );
      }

      // Supplier advances FIFO-allocate to open invoices immediately; the client
      // side has no equivalent here — client allocation derives from the fund
      // pool on facture/paiement events (ClientAllocationService).
      let allocation: SupplierAllocationResult | undefined;
      if (!isClient) {
        allocation = await SupplierAllocationService.allocateAvailableAdvances(tiersId, {
          transaction: client,
          userId,
        });
      }

      await client.query('COMMIT');
      return { idempotent: false, acompte, mouvement_caisse_id: mouvement?.id ?? null, allocation };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Manually apply a client acompte (or part of it) to a facture.
   * No caisse movement (money already entered when the acompte was created).
   */
  async applyClient(input: ApplyAcompteInput): Promise<{ acompte_id: number; facture_id: number; paiement_id: number; montant_applique: number } | { idempotent: true; application: any }> {
    const { acompteId, factureId, montant, idempotency_key, userId } = input;

    if (!factureId || !montant || Number(montant) <= 0) {
      throw businessError(400, 'facture_id et montant > 0 obligatoires');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Postings happen at CURRENT_TIMESTAMP — reject if that period is closed
      await checkPeriodIsOpen(new Date(), client);

      if (idempotency_key) {
        const { rows: dup } = await client.query(
          `SELECT app.* FROM acompte_applications app
           JOIN paiements p ON app.paiement_id = p.id
           WHERE p.idempotency_key = $1`,
          [idempotency_key]
        );
        if (dup.length > 0) {
          await client.query('COMMIT');
          return { idempotent: true, application: dup[0] };
        }
      }

      const { rows: acRows } = await client.query(
        `SELECT id, tiers_id, montant, montant_restant, statut, methode_paiement
         FROM acomptes_clients
         WHERE id = $1 AND (deleted_at IS NULL)
         FOR UPDATE`,
        [acompteId]
      );
      if (acRows.length === 0) {
        throw businessError(404, 'Acompte introuvable');
      }
      const acompte = acRows[0];
      const montantNum = Number(montant);
      const acRestant = this.assertAcompteUsable(acompte, montantNum);
      void acRestant;

      const { rows: facRows } = await client.query(
        `SELECT id, tiers_id, total, montant_paye,
                GREATEST(total - montant_paye, 0) AS remaining, location_id, statut
         FROM factures WHERE id = $1 FOR UPDATE`,
        [factureId]
      );
      if (facRows.length === 0) {
        throw businessError(404, 'Facture introuvable');
      }
      const facture = facRows[0];
      if (facture.tiers_id !== acompte.tiers_id) {
        throw businessError(422, 'Acompte et facture appartiennent à des tiers différents');
      }
      if (facture.statut === 'annulee') {
        throw businessError(409, 'Facture annulée');
      }
      const remaining = parseFloat(facture.remaining);
      if (montantNum > remaining + 0.005) {
        throw businessError(422, `Montant dépasse le reste dû de la facture (${remaining})`);
      }

      const magasinId = facture.location_id
        ? (await client.query('SELECT id FROM magasins WHERE location_id = $1 LIMIT 1', [facture.location_id])).rows[0]?.id
        : null;

      const { rows: payRows } = await client.query(
        `INSERT INTO paiements (
          facture_id, montant, methode_paiement, date_paiement,
          reference, notes, magasin_id, source, idempotency_key, cree_par
        ) VALUES ($1,$2,$3,CURRENT_TIMESTAMP,$4,$5,$6,'acompte_application',$7,$8)
        RETURNING id`,
        [factureId, montantNum, toPaiementMethod(acompte.methode_paiement),
          `ACO-APP-${acompteId}`, `Application acompte #${acompteId}`,
          magasinId, idempotency_key || null, userId]
      );

      await client.query(
        `INSERT INTO acompte_applications (acompte_id, facture_id, paiement_id, montant, cree_par)
         VALUES ($1,$2,$3,$4,$5)`,
        [acompteId, factureId, payRows[0].id, montantNum, userId]
      );

      await client.query(
        `INSERT INTO compte_client_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'paiement', $2, $3, 0, $4, $5, $6)`,
        [acompte.tiers_id, payRows[0].id, `PAI-${payRows[0].id}`, montantNum,
          `Application acompte #${acompteId} sur facture #${factureId}`, userId]
      );

      await ClientAllocationService.recomputeClientAllocations(acompte.tiers_id, { transaction: client, userId });

      await client.query('COMMIT');
      return {
        acompte_id: acompteId,
        facture_id: factureId,
        paiement_id: payRows[0].id,
        montant_applique: montantNum,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Refund the unused portion of a client acompte (cash out of the till).
   */
  async refundClient(input: RefundAcompteInput): Promise<{ acompte_id: number; montant_rembourse: number; nouveau_restant: number; statut: string; mouvement_caisse_id: number }> {
    const { acompteId, montant, methode_paiement, session_caisse_id, idempotency_key, userId } = input;
    this.assertRefundInput(montant, methode_paiement);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await checkPeriodIsOpen(new Date(), client);

      const { rows: acRows } = await client.query(
        `SELECT * FROM acomptes_clients WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [acompteId]
      );
      if (acRows.length === 0) {
        throw businessError(404, 'Acompte introuvable');
      }
      const acompte = acRows[0];
      const montantNum = Number(montant);
      const acRestant = this.assertAcompteUsable(acompte, montantNum);

      const effectiveSessionId = await this.resolveOpenSession(client, session_caisse_id, acompte.magasin_id);

      const mouvement = await caisseMagasinService.enregistrerMouvement(client, {
        session_caisse_id: effectiveSessionId,
        type: 'decaissement',
        categorie: 'remboursement_client',
        montant: montantNum,
        methode_paiement,
        reference_type: 'acompte',
        reference_id: acompteId,
        libelle: `Remboursement acompte #${acompteId}`,
        user_id: userId || undefined,
        idempotency_key: idempotency_key || undefined,
      });

      // Decrement montant_restant; statut→rembourse only if fully refunded
      const newRestant = acRestant - montantNum;
      const newStatut = newRestant <= 0.005 ? 'rembourse' : acompte.statut;
      // montant_rembourse feeds the 095 sync/cap triggers: without it, a later
      // application event would resurrect the refunded amount.
      await client.query(
        `UPDATE acomptes_clients
         SET montant_restant = $1,
             montant_rembourse = COALESCE(montant_rembourse, 0) + $2,
             statut = $3,
             rembourse_par_user_id = COALESCE(rembourse_par_user_id, $4),
             date_remboursement = COALESCE(date_remboursement, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [Math.max(0, newRestant), montantNum, newStatut, userId, acompteId]
      );

      // Ledger: debit (we owe customer less now — restore balance)
      await client.query(
        `INSERT INTO compte_client_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'ajustement', $2, $3, $4, 0, $5, $6)`,
        [acompte.tiers_id, acompteId, `REMB-ACO-${acompteId}`, montantNum,
          `Remboursement acompte #${acompteId}`, userId]
      );

      await ClientAllocationService.recomputeClientAllocations(acompte.tiers_id, { transaction: client, userId });

      await client.query('COMMIT');
      return {
        acompte_id: acompteId,
        montant_rembourse: montantNum,
        nouveau_restant: Math.max(0, newRestant),
        statut: newStatut,
        mouvement_caisse_id: mouvement.id,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Apply a supplier acompte (or part of it) to a facture fournisseur.
   * Mirrors applyClient but supplier-side: no caisse movement (money already out).
   */
  async applyFournisseur(input: ApplyAcompteInput): Promise<{ acompte_id: number; facture_id: number; paiement_id: number; montant_applique: number } | { idempotent: true; application: any }> {
    const { acompteId, factureId, montant, idempotency_key, userId } = input;

    if (!factureId || !montant || Number(montant) <= 0) {
      throw businessError(400, 'facture_id et montant > 0 obligatoires');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await checkPeriodIsOpen(new Date(), client);

      if (idempotency_key) {
        const { rows: dup } = await client.query(
          `SELECT app.* FROM acompte_applications_fournisseur app
           JOIN paiements_fournisseur p ON app.paiement_id = p.id
           WHERE p.idempotency_key = $1`,
          [idempotency_key]
        );
        if (dup.length > 0) {
          await client.query('COMMIT');
          return { idempotent: true, application: dup[0] };
        }
      }

      const { rows: acRows } = await client.query(
        `SELECT id, tiers_id, montant, montant_restant, statut, methode_paiement, magasin_id
         FROM acomptes_fournisseur
         WHERE id = $1 AND (deleted_at IS NULL)
         FOR UPDATE`,
        [acompteId]
      );
      if (acRows.length === 0) {
        throw businessError(404, 'Acompte fournisseur introuvable');
      }
      const acompte = acRows[0];
      const montantNum = Number(montant);
      this.assertAcompteUsable(acompte, montantNum);

      const { rows: facRows } = await client.query(
        `SELECT id, tiers_id, total, montant_paye,
                GREATEST(total - COALESCE(montant_paye,0), 0) AS remaining, statut
         FROM factures_fournisseur WHERE id = $1 FOR UPDATE`,
        [factureId]
      );
      if (facRows.length === 0) {
        throw businessError(404, 'Facture fournisseur introuvable');
      }
      const facture = facRows[0];
      if (facture.tiers_id !== acompte.tiers_id) {
        throw businessError(422, 'Acompte et facture appartiennent à des fournisseurs différents');
      }
      if (facture.statut === 'annulee') {
        throw businessError(409, 'Facture annulée');
      }
      const remaining = parseFloat(facture.remaining);
      if (montantNum > remaining + 0.005) {
        throw businessError(422, `Montant dépasse le reste dû de la facture (${remaining})`);
      }

      const { rows: payRows } = await client.query(
        `INSERT INTO paiements_fournisseur (
          facture_id, montant, methode_paiement, date_paiement,
          reference, notes, magasin_id, source, idempotency_key, effectue_par
        ) VALUES ($1,$2,$3,CURRENT_TIMESTAMP,$4,$5,$6,'acompte_application',$7,$8)
        RETURNING id`,
        [factureId, montantNum, toPaiementMethod(acompte.methode_paiement),
          `ACOF-APP-${acompteId}`, `Application acompte fournisseur #${acompteId}`,
          acompte.magasin_id, idempotency_key || null, userId]
      );

      await client.query(
        `INSERT INTO acompte_applications_fournisseur (acompte_id, facture_id, paiement_id, montant, cree_par)
         VALUES ($1,$2,$3,$4,$5)`,
        [acompteId, factureId, payRows[0].id, montantNum, userId]
      );

      // Ledger: credit fournisseur ledger (we paid via acompte → reduces AP)
      await client.query(
        `INSERT INTO compte_fournisseur_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'paiement', $2, $3, $4, 0, $5, $6)`,
        [acompte.tiers_id, payRows[0].id, `PAIF-${payRows[0].id}`, montantNum,
          `Application acompte fournisseur #${acompteId} sur facture #${factureId}`, userId]
      );

      await client.query('COMMIT');
      return {
        acompte_id: acompteId,
        facture_id: factureId,
        paiement_id: payRows[0].id,
        montant_applique: montantNum,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Refund an unused supplier acompte (cash IN — the supplier returns money).
   */
  async refundFournisseur(input: RefundAcompteInput): Promise<{ acompte_id: number; montant_rembourse: number; nouveau_restant: number; statut: string; mouvement_caisse_id: number }> {
    const { acompteId, montant, methode_paiement, session_caisse_id, idempotency_key, userId } = input;
    this.assertRefundInput(montant, methode_paiement);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await checkPeriodIsOpen(new Date(), client);

      const { rows: acRows } = await client.query(
        `SELECT * FROM acomptes_fournisseur WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [acompteId]
      );
      if (acRows.length === 0) {
        throw businessError(404, 'Acompte fournisseur introuvable');
      }
      const acompte = acRows[0];
      const montantNum = Number(montant);
      const acRestant = this.assertAcompteUsable(acompte, montantNum);

      const effectiveSessionId = await this.resolveOpenSession(client, session_caisse_id, acompte.magasin_id);

      const mouvement = await caisseMagasinService.enregistrerMouvement(client, {
        session_caisse_id: effectiveSessionId,
        type: 'encaissement',
        categorie: 'autre_entree',
        montant: montantNum,
        methode_paiement,
        reference_type: 'acompte_fournisseur',
        reference_id: acompteId,
        libelle: `Remboursement acompte fournisseur #${acompteId}`,
        user_id: userId || undefined,
        idempotency_key: idempotency_key || undefined,
      });

      const newRestant = acRestant - montantNum;
      const newStatut = newRestant <= 0.005 ? 'rembourse' : acompte.statut;
      // montant_rembourse feeds the 095 sync/cap triggers (same reason as client side)
      await client.query(
        `UPDATE acomptes_fournisseur
         SET montant_restant = $1,
             montant_rembourse = COALESCE(montant_rembourse, 0) + $2,
             statut = $3,
             rembourse_par_user_id = COALESCE(rembourse_par_user_id, $4),
             date_remboursement = COALESCE(date_remboursement, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [Math.max(0, newRestant), montantNum, newStatut, userId, acompteId]
      );

      // Ledger: credit (supplier returned funds → AP increases)
      await client.query(
        `INSERT INTO compte_fournisseur_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'ajustement', $2, $3, 0, $4, $5, $6)`,
        [acompte.tiers_id, acompteId, `REMB-ACOF-${acompteId}`, montantNum,
          `Remboursement acompte fournisseur #${acompteId}`, userId]
      );

      await client.query('COMMIT');
      return {
        acompte_id: acompteId,
        montant_rembourse: montantNum,
        nouveau_restant: Math.max(0, newRestant),
        statut: newStatut,
        mouvement_caisse_id: mouvement.id,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const acompteService = new AcompteService();
