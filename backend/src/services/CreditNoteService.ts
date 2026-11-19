import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';
import { calculateTotals, roundMoney } from './PricingService';
import { generateDocumentNumber } from './NumberingService';
import { businessError } from '../utils/errors';
import { checkPeriodIsOpen } from './PeriodService';
import { ClientAllocationService } from './ClientAllocationService';
import { caisseMagasinService } from './CaisseMagasinService';
import { formatMontantFcfa } from '../utils/money';
import { mouvementLibelle } from '../utils/caisseLibelle';
import { isPaymentMethod, PaymentMethod, paymentMethodPhrase, toPaiementMethod } from '../utils/paymentMethods';

/** POST /avoirs/:id/apply-to-facture — what was booked on the chosen invoice. */
export interface ApplyAvoirResult {
  avoir_id: number;
  numero_avoir: string;
  facture_id: number;
  numero_facture: string;
  montant_avoir: number;
  /** Booked on the chosen invoice: min(avoir, reste dû before). */
  montant_impute: number;
  /** Part the invoice could not take: client credit without a target. */
  credit_client: number;
  /** Of that credit, what is still available after the oldest-first spread. */
  credit_restant: number;
  reste_du: number;
  statut_facture: string;
  message: string;
}

export interface RembourserAvoirInput {
  methode_paiement: PaymentMethod;
  notes?: string | null;
  reference?: string | null;
  userId: number | null;
  req?: any;
}

export interface RembourserAvoirResult {
  avoir_id: number;
  numero_avoir: string;
  montant: number;
  methode_paiement: PaymentMethod;
  /** Till movement written (null for a non-cash refund while the till is closed). */
  mouvement_caisse_id: number | null;
  session_caisse_id: number | null;
  message: string;
}

export interface CreditNoteLigneInput {
  produit_id?: number;
  description?: string;
  quantite: number;
  prix_unitaire: number;
}

export interface CreateCreditNoteInput {
  tiers_id: number;
  client_id?: number;
  facture_origine_id?: number;
  retour_id?: number;
  lignes: CreditNoteLigneInput[];
  avoir_type?: 'retour' | 'echange' | 'remise_commerciale' | 'erreur';
  notes?: string;
  location_id?: number;
  cree_par?: number;
  req?: any;
}

export class CreditNoteService {
  /**
   * Get paginated credit notes with optional filters
   */
  async getAll(
    search?: string,
    statut?: string,
    client_id?: number,
    page: number = 1,
    limit: number = 20,
    sort: string = 'date_avoir',
    order: string = 'DESC',
    avoir_type?: string
  ): Promise<any> {
    const sortColumn = CreditNoteService.SORT_COLUMNS[sort] ?? 'fa.date_avoir';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const offset = (page - 1) * limit;

    const { where, params } = CreditNoteService.buildFilters({ search, statut, client_id, avoir_type });

    // La recherche porte sur `tiers`, donc le COUNT doit faire la même jointure
    // que le SELECT — sans elle, tout appel avec `search` échoue en 42P01.
    const from = `
      FROM factures_avoir fa
      LEFT JOIN tiers t ON fa.tiers_id = t.id
    `;

    const { rows } = await pool.query(
      `SELECT fa.*, t.raison_sociale as client_nom, t.prenom as client_prenom,
              sl.nom as location_nom, f.numero_facture as facture_origine_numero,
              r.numero_retour
       ${from}
       LEFT JOIN stock_locations sl ON fa.location_id = sl.id
       LEFT JOIN factures f ON fa.facture_origine_id = f.id
       LEFT JOIN retours r ON fa.retour_id = r.id
       ${where}
       ORDER BY ${sortColumn} ${sortOrder}, fa.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) ${from} ${where}`,
      params
    );
    const total = parseInt(countRows[0].count);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Totaux par statut sur l'ensemble du jeu filtré — alimente les tuiles KPI
   * sans que le client ait à rapatrier toutes les pages.
   */
  async getStats(client_id?: number): Promise<any> {
    const { where, params } = CreditNoteService.buildFilters({ client_id });
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE fa.statut = 'brouillon')                    AS brouillon_count,
         COALESCE(SUM(fa.total) FILTER (WHERE fa.statut = 'brouillon'), 0)  AS brouillon_total,
         COUNT(*) FILTER (WHERE fa.statut = 'valide')                       AS valide_count,
         COALESCE(SUM(fa.total) FILTER (WHERE fa.statut = 'valide'), 0)     AS valide_total,
         COUNT(*) FILTER (
           WHERE fa.statut = 'utilise'
             AND fa.date_avoir >= date_trunc('month', CURRENT_DATE)
         ) AS utilise_mois_count,
         COALESCE(SUM(fa.total) FILTER (
           WHERE fa.statut = 'utilise'
             AND fa.date_avoir >= date_trunc('month', CURRENT_DATE)
         ), 0) AS utilise_mois_total,
         COUNT(*) FILTER (WHERE fa.date_avoir >= date_trunc('month', CURRENT_DATE))                   AS mois_count,
         COALESCE(SUM(fa.total) FILTER (WHERE fa.date_avoir >= date_trunc('month', CURRENT_DATE)), 0) AS mois_total
       FROM factures_avoir fa
       LEFT JOIN tiers t ON fa.tiers_id = t.id
       ${where}`,
      params
    );
    const r = rows[0];
    return {
      brouillonCount: parseInt(r.brouillon_count),
      brouillonTotal: parseFloat(r.brouillon_total),
      valideCount: parseInt(r.valide_count),
      valideTotal: parseFloat(r.valide_total),
      utiliseMoisCount: parseInt(r.utilise_mois_count),
      utiliseMoisTotal: parseFloat(r.utilise_mois_total),
      moisCount: parseInt(r.mois_count),
      moisTotal: parseFloat(r.mois_total),
    };
  }

  /** Clés de tri exposées → colonnes qualifiées (allow-list). */
  private static readonly SORT_COLUMNS: Record<string, string> = {
    numero_avoir: 'fa.numero_avoir',
    date_avoir: 'fa.date_avoir',
    total: 'fa.total',
    statut: 'fa.statut',
    avoir_type: 'fa.avoir_type',
    // `client_nom` est un alias de projection : trier sur `fa.client_nom` échouerait.
    client_nom: 't.raison_sociale',
  };

  /** Clause WHERE + paramètres partagés par le SELECT, le COUNT et les stats. */
  private static buildFilters(filters: {
    search?: string;
    statut?: string;
    client_id?: number;
    avoir_type?: string;
  }): { where: string; params: any[] } {
    const clauses = ['fa.deleted_at IS NULL'];
    const params: any[] = [];

    if (filters.search) {
      params.push(`%${filters.search}%`);
      clauses.push(
        `(fa.numero_avoir ILIKE $${params.length} OR t.raison_sociale ILIKE $${params.length})`
      );
    }
    if (filters.statut) {
      params.push(filters.statut);
      clauses.push(`fa.statut = $${params.length}`);
    }
    if (filters.client_id) {
      params.push(filters.client_id);
      clauses.push(`fa.tiers_id = $${params.length}`);
    }
    if (filters.avoir_type) {
      params.push(filters.avoir_type);
      clauses.push(`fa.avoir_type = $${params.length}`);
    }

    return { where: `WHERE ${clauses.join(' AND ')}`, params };
  }

  /**
   * Get credit note by ID with lines
   */
  async getById(id: number): Promise<any> {
    const { rows: avoirRows } = await pool.query(
      `SELECT fa.*, t.raison_sociale as client_nom, t.prenom as client_prenom, t.email, t.telephone, t.adresse, t.nif,
              sl.nom as location_nom,
              f.numero_facture as facture_origine_numero,
              r.numero_retour
       FROM factures_avoir fa
       LEFT JOIN tiers t ON fa.tiers_id = t.id
       LEFT JOIN stock_locations sl ON fa.location_id = sl.id
       LEFT JOIN factures f ON fa.facture_origine_id = f.id
       LEFT JOIN retours r ON fa.retour_id = r.id
       WHERE fa.id = $1`,
      [id]
    );

    if (avoirRows.length === 0) return null;

    const { rows: lignesRows } = await pool.query(
      `SELECT dl.*, p.nom as produit_nom, p.reference as produit_reference
       FROM document_lignes dl
       LEFT JOIN produits p ON dl.produit_id = p.id
       WHERE dl.document_type = 'avoir' AND dl.document_id = $1
       ORDER BY dl.id`,
      [id]
    );

    // A refunded credit note (E3) is 'utilise' without facture_appliquee_id;
    // its refund is the 'rembourser' audit row written in the same transaction.
    const { rows: remboursementRows } = await pool.query(
      `SELECT a.created_at AS date,
              (a.new_values->>'montant')::numeric AS montant,
              a.new_values->>'methode_paiement' AS methode_paiement,
              NULLIF(a.new_values->>'reference', '') AS reference,
              NULLIF(a.new_values->>'mouvement_caisse_id', '')::int AS mouvement_caisse_id,
              COALESCE(u.nom_complet, u.username) AS rembourse_par_nom
       FROM audit_log a
       LEFT JOIN utilisateurs u ON u.id = a.user_id
       WHERE a.table_name = 'factures_avoir' AND a.action = 'rembourser' AND a.record_id = $1
       ORDER BY a.id DESC
       LIMIT 1`,
      [id]
    );
    const remboursement = remboursementRows[0]
      ? { ...remboursementRows[0], montant: parseFloat(remboursementRows[0].montant) || 0 }
      : null;

    return {
      ...avoirRows[0],
      lignes: lignesRows,
      remboursement,
    };
  }

  /**
   * Create the credit note of an approved return (DB function
   * `create_avoir_from_retour`, migration 106): one active avoir per return,
   * lines copied from the return, credit on the client statement. The
   * function raises French messages with SQLSTATE HK404/HK409/HK422, mapped
   * here to business errors (HTTP status = the last three digits).
   */
  async createFromRetour(retour_id: number, userId: number, req?: any): Promise<{ avoir_id: number; numero_avoir: string }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await checkPeriodIsOpen(new Date(), client);

      // Call database function
      const { rows } = await client.query(
        'SELECT create_avoir_from_retour($1, $2) as avoir_id',
        [retour_id, userId]
      ).catch((err: any) => {
        const match = typeof err?.code === 'string' ? /^HK(\d{3})$/.exec(err.code) : null;
        throw match ? businessError(Number(match[1]), err.message) : err;
      });

      const avoirId = rows[0].avoir_id;

      // Get avoir number
      const { rows: avoirRows } = await client.query(
        'SELECT numero_avoir FROM factures_avoir WHERE id = $1',
        [avoirId]
      );

      await client.query('COMMIT');

      // Audit log
      if (userId) {
        await logAudit({
          utilisateur_id: userId,
          action: 'create_from_retour',
          table_name: 'factures_avoir',
          record_id: avoirId,
          req,
          new_values: { retour_id, numero_avoir: avoirRows[0].numero_avoir },
        });
      }

      logger.info({ avoirId, retour_id }, 'Credit note created from return');
      return { avoir_id: avoirId, numero_avoir: avoirRows[0].numero_avoir };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error creating credit note from return');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create manual credit note
   */
  async createManual(input: CreateCreditNoteInput): Promise<{ avoir_id: number; numero_avoir: string }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await checkPeriodIsOpen(new Date(), client);

      const tiers_id = input.tiers_id ?? input.client_id!;
      const { facture_origine_id, retour_id, lignes, avoir_type, notes, location_id, cree_par, req } = input;

      if (!lignes || lignes.length === 0) {
        throw businessError(422, 'Un avoir doit comporter au moins une ligne');
      }

      if (!facture_origine_id) {
        throw businessError(422, 'Un avoir doit être rattaché à une facture validée');
      }

      const { rows: factureRows } = await client.query(
        `SELECT id, tiers_id, statut
         FROM factures
         WHERE id = $1
           AND deleted_at IS NULL
         FOR UPDATE`,
        [facture_origine_id]
      );

      if (factureRows.length === 0) {
        throw businessError(404, 'Facture d\'origine introuvable');
      }

      const facture = factureRows[0];

      if (Number(facture.tiers_id) !== Number(tiers_id)) {
        throw businessError(422, 'L’avoir doit être au nom du client de la facture d’origine.');
      }

      // An invoice must be validated (not cancelled) to allow credit note creation
      if (facture.statut === 'annulee') {
        throw businessError(422, 'On ne peut pas créer un avoir sur une facture annulée');
      }

      // Linked to a return: same rules as POST /avoirs/from-retour — an
      // approved return of this client, and one active avoir per return.
      if (retour_id) {
        const { rows: retourRows } = await client.query(
          'SELECT id, numero_retour, tiers_id, statut FROM retours WHERE id = $1 FOR UPDATE',
          [retour_id]
        );
        const retour = retourRows[0];
        if (!retour) {
          throw businessError(404, 'Retour introuvable.');
        }
        if (Number(retour.tiers_id) !== Number(tiers_id)) {
          throw businessError(422, `Le retour ${retour.numero_retour} concerne un autre client.`);
        }
        if (retour.statut !== 'traite') {
          throw businessError(409, `Approuvez le retour ${retour.numero_retour} avant de créer son avoir.`);
        }
        const { rows: existing } = await client.query(
          `SELECT numero_avoir FROM factures_avoir
           WHERE retour_id = $1 AND deleted_at IS NULL AND statut IS DISTINCT FROM 'annule'
           LIMIT 1`,
          [retour_id]
        );
        if (existing[0]) {
          throw businessError(409, `Le retour ${retour.numero_retour} a déjà son avoir : ${existing[0].numero_avoir}.`);
        }
      }

      // Generate avoir number
      const numeroAvoir = await generateDocumentNumber('avoir', client);

      // Calculate totals
      const { sousTotal, total, totalLignes } = calculateTotals(lignes);

      // Insert credit note
      const { rows: avoirResult } = await client.query(
        'INSERT INTO factures_avoir (numero_avoir, tiers_id, facture_origine_id, retour_id, date_avoir, sous_total, tva, total, total_ht, total_ttc, statut, avoir_type, notes, location_id, cree_par) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, 0, $6, $6, $6, $7, $8, $9, $10, $11) RETURNING id',
        [numeroAvoir, tiers_id, facture_origine_id || null, retour_id || null, sousTotal, total, 'valide', avoir_type || 'remise_commerciale', notes || null, location_id || null, cree_par || null]
      );

      const avoirId = avoirResult[0].id;

      // Insert lines
      const produitIds: (number | null)[] = [];
      const descriptions: (string | null)[] = [];
      const quantities: number[] = [];
      const prices: number[] = [];
      const totals: number[] = [];

      for (const [index, ligne] of lignes.entries()) {
        produitIds.push(ligne.produit_id || null);
        descriptions.push(ligne.description || null);
        quantities.push(ligne.quantite);
        prices.push(ligne.prix_unitaire);
        // Rounded per-line total from calculateTotals — recomputing it here left
        // the stored lines out of step with the stored sous_total.
        totals.push(totalLignes[index]);
      }

      await client.query(
        `INSERT INTO document_lignes (document_type, document_id, produit_id, description, quantite, prix_unitaire, total_ligne)
         SELECT 'avoir', $1, unnest($2::int[]), unnest($3::text[]), unnest($4::int[]), unnest($5::numeric[]), unnest($6::numeric[])`,
        [avoirId, produitIds, descriptions, quantities, prices, totals]
      );

      // Adjust customer account
      await client.query(
        `INSERT INTO compte_client_lignes (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'avoir', $2, $3, 0, $4, 'Avoir ' || $5, $6)`,
        [tiers_id, avoirId, numeroAvoir, total, numeroAvoir, cree_par || null]
      );

      await client.query('COMMIT');

      // Audit log
      if (cree_par) {
        await logAudit({
          utilisateur_id: cree_par,
          action: 'create',
          table_name: 'factures_avoir',
          record_id: avoirId,
          req,
          new_values: { numero_avoir: numeroAvoir, tiers_id, total },
        });
      }

      logger.info({ avoirId, numero_avoir: numeroAvoir }, 'Manual credit note created');
      return { avoir_id: avoirId, numero_avoir: numeroAvoir };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error creating manual credit note');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update credit note status
   */
  async updateStatut(id: number, statut: string, req?: any): Promise<void> {
    const validStatuts = ['brouillon', 'valide', 'annule', 'utilise'];
    if (!validStatuts.includes(statut)) {
      throw businessError(400, 'Statut d’avoir inconnu.');
    }
    // 'utilise' carries money (imputed on an invoice or paid back): it is only
    // reached through those two actions and never left — flipping it back to
    // 'valide' would let the same credit note be imputed or refunded twice.
    if (statut === 'utilise') {
      throw businessError(422, 'Pour utiliser un avoir, imputez-le sur une facture ou remboursez-le.');
    }
    const { rows: currentRows } = await pool.query(
      'SELECT numero_avoir, statut FROM factures_avoir WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (currentRows[0]?.statut === 'utilise') {
      throw businessError(409, `L’avoir ${currentRows[0].numero_avoir} a déjà été utilisé : son statut ne change plus.`);
    }

    await pool.query(
      `UPDATE factures_avoir SET statut = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND statut IS DISTINCT FROM 'utilise'`,
      [statut, id]
    );

    // Audit log
    if (req?.user?.id) {
      await logAudit({
        utilisateur_id: req.user.id,
        action: 'update_statut',
        table_name: 'factures_avoir',
        record_id: id,
        req,
        new_values: { statut },
      });
    }

    logger.info({ avoirId: id, statut }, 'Credit note statut updated');
  }

  /**
   * Apply a credit note to the invoice the user chose (marks it 'utilise').
   *
   * E1 (2026-10-24): the credit settles THAT invoice. The credit note becomes
   * an acompte, and min(avoir, reste dû) of it is booked on the chosen invoice
   * as an acompte application — a payment row the allocation engine keeps
   * pinned there, exactly like POST /acomptes/:id/apply. Only the part the
   * invoice cannot take (it was already partly or fully paid) stays client
   * credit without a target, which the recompute spreads oldest-first.
   * Before, the whole credit went through the FIFO pool and landed on the
   * client's oldest open invoice, whatever invoice the user had picked.
   */
  async applyToFacture(avoirId: number, factureId: number, req?: any): Promise<ApplyAvoirResult> {
    const client = await pool.connect();
    const userId: number | null = req?.user?.id ?? null;

    try {
      await client.query('BEGIN');

      // The application is booked today: refuse a closed period up front.
      await checkPeriodIsOpen(new Date(), client);

      // Lock both records
      const { rows: avoirRows } = await client.query(
        'SELECT id, tiers_id, statut, total, numero_avoir FROM factures_avoir WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [avoirId]
      );
      if (avoirRows.length === 0) {
        throw businessError(404, 'Avoir non trouvé');
      }
      const avoir = avoirRows[0];
      if (avoir.statut !== 'valide') {
        throw businessError(422, 'Seul un avoir validé peut être imputé sur une facture.');
      }

      const { rows: factureRows } = await client.query(
        `SELECT id, tiers_id, statut, total, numero_facture, location_id,
                GREATEST(total - COALESCE(montant_paye, 0), 0) AS remaining
         FROM factures WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [factureId]
      );
      if (factureRows.length === 0) {
        throw businessError(404, 'Facture non trouvée');
      }
      const facture = factureRows[0];
      if (facture.statut === 'annulee') {
        throw businessError(422, 'Impossible d\'appliquer un avoir sur une facture annulée');
      }
      if (Number(facture.tiers_id) !== Number(avoir.tiers_id)) {
        throw businessError(422, 'L’avoir et la facture doivent concerner le même client.');
      }

      await client.query(
        `UPDATE factures_avoir
         SET statut = 'utilise', facture_appliquee_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [factureId, avoirId]
      );

      // The credit note becomes client credit (an acompte). montant_restant is
      // NOT NULL without default (048): omitting it made every application fail.
      const montantAvoir = roundMoney(parseFloat(avoir.total) || 0);
      const { rows: acompteRows } = await client.query(
        `INSERT INTO acomptes_clients (tiers_id, montant, montant_restant, date_acompte, statut, notes, cree_par)
         VALUES ($1, $2, $2, CURRENT_TIMESTAMP, 'disponible', $3, $4)
         RETURNING id`,
        [avoir.tiers_id, montantAvoir, `Issu de l'avoir ${avoir.numero_avoir}`, userId]
      );
      const acompteId: number = acompteRows[0].id;

      // Pinned part: what the chosen invoice still owes, at most the avoir.
      const montantImpute = roundMoney(Math.min(montantAvoir, parseFloat(facture.remaining) || 0));
      if (montantImpute > 0) {
        const magasinId = facture.location_id
          ? (await client.query('SELECT id FROM magasins WHERE location_id = $1 LIMIT 1', [facture.location_id])).rows[0]?.id ?? null
          : null;
        const { rows: payRows } = await client.query(
          `INSERT INTO paiements (
             facture_id, montant, methode_paiement, date_paiement,
             reference, notes, magasin_id, source, cree_par
           ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, 'acompte_application', $7)
           RETURNING id`,
          [factureId, montantImpute, toPaiementMethod(null), avoir.numero_avoir,
            `Imputation de l'avoir ${avoir.numero_avoir}`, magasinId, userId]
        );
        await client.query(
          `INSERT INTO acompte_applications (acompte_id, facture_id, paiement_id, montant, cree_par, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [acompteId, factureId, payRows[0].id, montantImpute, userId, `Avoir ${avoir.numero_avoir}`]
        );
        await client.query(
          `INSERT INTO compte_client_lignes
             (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
           VALUES ($1, 'paiement', $2, $3, 0, $4, $5, $6)`,
          [avoir.tiers_id, payRows[0].id, `PAI-${payRows[0].id}`, montantImpute,
            `Avoir ${avoir.numero_avoir} imputé sur la facture ${facture.numero_facture}`, userId]
        );
      }

      // Re-derive balances; the remainder (if any) is credit without a target.
      await ClientAllocationService.recomputeClientAllocations(avoir.tiers_id, { transaction: client, userId });

      const { rows: afterRows } = await client.query(
        `SELECT f.statut, GREATEST(f.total - COALESCE(f.montant_paye, 0), 0) AS reste_du,
                (SELECT montant_restant FROM acomptes_clients WHERE id = $2) AS credit_restant
         FROM factures f WHERE f.id = $1`,
        [factureId, acompteId]
      );
      const resteDu = roundMoney(parseFloat(afterRows[0].reste_du) || 0);
      const creditRestant = roundMoney(parseFloat(afterRows[0].credit_restant) || 0);
      const surplus = roundMoney(montantAvoir - montantImpute);

      await client.query('COMMIT');

      if (userId) {
        await logAudit({
          utilisateur_id: userId,
          action: 'apply_to_facture',
          table_name: 'factures_avoir',
          record_id: avoirId,
          req,
          new_values: { facture_appliquee_id: factureId, statut: 'utilise', montant_impute: montantImpute, surplus },
        });
      }

      logger.info({ avoirId, factureId, montantImpute }, 'Credit note applied to invoice');

      let message: string;
      if (montantImpute <= 0) {
        message = `La facture ${facture.numero_facture} est déjà soldée : les ${formatMontantFcfa(montantAvoir)} de l’avoir ${avoir.numero_avoir} passent au crédit du client.`;
      } else {
        message = `Avoir ${avoir.numero_avoir} imputé sur la facture ${facture.numero_facture} : ${formatMontantFcfa(montantImpute)}. `
          + (resteDu > 0.005 ? `Reste dû : ${formatMontantFcfa(resteDu)}.` : 'Facture soldée.');
        if (surplus > 0.005) {
          message += ` Les ${formatMontantFcfa(surplus)} restants passent au crédit du client.`;
        }
      }

      return {
        avoir_id: avoirId,
        numero_avoir: avoir.numero_avoir,
        facture_id: factureId,
        numero_facture: facture.numero_facture,
        montant_avoir: montantAvoir,
        montant_impute: montantImpute,
        credit_client: surplus,
        credit_restant: creditRestant,
        reste_du: resteDu,
        statut_facture: afterRows[0].statut,
        message,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * « Rembourser l’avoir » (E3): pay a valid, unused credit note back to the
   * client. Built on the deposit refund (AcompteService.refundClient): the
   * money goes out through a `remboursement_client` till movement (which posts
   * to the general ledger when CAISSE_GL_POSTING is on) and the client's
   * statement gets the matching debit. Espèces must leave the open till of the
   * credit note's shop (409 CAISSE_FERMEE otherwise); another method uses that
   * till when it is open, so the closing count sees it, and needs none
   * otherwise. The credit note ends 'utilise' with no invoice: the audit_log
   * row ('rembourser') records method, amount, reference and movement.
   */
  async rembourser(avoirId: number, input: RembourserAvoirInput): Promise<RembourserAvoirResult> {
    const { methode_paiement, userId } = input;
    const notes = input.notes?.trim() || null;
    const reference = input.reference?.trim() || null;
    if (!isPaymentMethod(methode_paiement)) {
      throw businessError(400, 'Choisissez un mode de paiement.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await checkPeriodIsOpen(new Date(), client);

      const { rows: avoirRows } = await client.query(
        `SELECT fa.id, fa.numero_avoir, fa.tiers_id, fa.statut, fa.total,
                COALESCE(fa.location_id, f.location_id) AS location_id,
                TRIM(CONCAT_WS(' ', t.raison_sociale, NULLIF(t.prenom, ''))) AS client_nom
         FROM factures_avoir fa
         LEFT JOIN factures f ON f.id = fa.facture_origine_id
         LEFT JOIN tiers t ON t.id = fa.tiers_id
         WHERE fa.id = $1 AND fa.deleted_at IS NULL
         FOR UPDATE OF fa`,
        [avoirId]
      );
      const avoir = avoirRows[0];
      if (!avoir) {
        throw businessError(404, 'Avoir introuvable.');
      }
      const numero: string = avoir.numero_avoir;
      if (avoir.statut === 'utilise') {
        throw businessError(409, `L’avoir ${numero} a déjà été utilisé : il ne peut plus être remboursé.`, 'AVOIR_DEJA_UTILISE');
      }
      if (avoir.statut === 'annule') {
        throw businessError(409, `L’avoir ${numero} est annulé : il ne peut pas être remboursé.`, 'AVOIR_ANNULE');
      }
      if (avoir.statut !== 'valide') {
        throw businessError(409, `Validez l’avoir ${numero} avant de le rembourser.`, 'AVOIR_NON_VALIDE');
      }
      const montant = roundMoney(parseFloat(avoir.total) || 0);
      if (montant <= 0) {
        throw businessError(422, `L’avoir ${numero} n’a aucun montant à rembourser.`);
      }

      // The credit note's shop and its open till.
      const magasin = avoir.location_id
        ? (await client.query('SELECT id, nom FROM magasins WHERE location_id = $1 ORDER BY id LIMIT 1', [avoir.location_id])).rows[0] ?? null
        : null;
      const session = magasin
        ? (await client.query(
            `SELECT id FROM sessions_caisse WHERE magasin_id = $1 AND statut = 'ouverte' ORDER BY id DESC LIMIT 1`,
            [magasin.id]
          )).rows[0] ?? null
        : null;

      if (methode_paiement === 'espece' && !session) {
        if (!magasin) {
          throw businessError(
            422,
            `L’avoir ${numero} n’est rattaché à aucun magasin : remboursez-le par un autre mode de paiement.`,
            'CAISSE_INTROUVABLE'
          );
        }
        // The UI names the till and links to it (E3: warning + link).
        throw Object.assign(
          businessError(
            409,
            `La caisse de ${magasin.nom} est fermée : ouvrez-la avant de rembourser des espèces.`,
            'CAISSE_FERMEE'
          ),
          { details: { magasin_id: magasin.id, magasin_nom: magasin.nom } }
        );
      }

      const clientNom: string | null = avoir.client_nom || null;
      let mouvementId: number | null = null;
      if (session) {
        const mouvement = await caisseMagasinService.enregistrerMouvement(client, {
          session_caisse_id: session.id,
          type: 'decaissement',
          categorie: 'remboursement_client',
          montant,
          methode_paiement,
          reference_type: 'avoir',
          reference_id: avoirId,
          libelle: mouvementLibelle(`Remboursement avoir ${numero}`, clientNom),
          user_id: userId ?? undefined,
        });
        mouvementId = mouvement.id;
      }

      await client.query(
        `UPDATE factures_avoir SET statut = 'utilise', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [avoirId]
      );

      // Client statement: the credit the avoir gave is paid out (same entry
      // as a deposit refund).
      const ledgerNotes = [`Remboursement de l’avoir ${numero} ${paymentMethodPhrase(methode_paiement)}`, reference ? `réf. ${reference}` : null, notes]
        .filter(Boolean)
        .join(' — ');
      await client.query(
        `INSERT INTO compte_client_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'ajustement', $2, $3, $4, 0, $5, $6)`,
        [avoir.tiers_id, avoirId, `REMB-${numero}`.slice(0, 100), montant, ledgerNotes, userId ?? null]
      );

      // Audit inside the transaction: the refund exists iff its record does.
      await client.query(
        `INSERT INTO audit_log (user_id, action, table_name, record_id, ip_address, user_agent, old_values, new_values)
         VALUES ($1, 'rembourser', 'factures_avoir', $2, $3, $4, $5, $6)`,
        [
          userId ?? null,
          avoirId,
          input.req?.ip ?? null,
          input.req?.get?.('user-agent') ?? null,
          JSON.stringify({ statut: 'valide' }),
          JSON.stringify({
            statut: 'utilise',
            numero_avoir: numero,
            montant,
            methode_paiement,
            reference,
            notes,
            mouvement_caisse_id: mouvementId,
            session_caisse_id: session?.id ?? null,
            magasin_id: magasin?.id ?? null,
          }),
        ]
      );

      await client.query('COMMIT');

      logger.info({ avoirId, montant, methode_paiement, mouvementId }, 'Credit note refunded');

      return {
        avoir_id: avoirId,
        numero_avoir: numero,
        montant,
        methode_paiement,
        mouvement_caisse_id: mouvementId,
        session_caisse_id: session?.id ?? null,
        message: `Avoir ${numero} remboursé : ${formatMontantFcfa(montant)} ${paymentMethodPhrase(methode_paiement)}.`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete credit note (soft delete)
   */
  async delete(id: number, req?: any): Promise<void> {
    await pool.query(
      'UPDATE factures_avoir SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    // Audit log
    if (req?.user?.id) {
      await logAudit({
        utilisateur_id: req.user.id,
        action: 'delete',
        table_name: 'factures_avoir',
        record_id: id,
        req,
      });
    }

    logger.info({ avoirId: id }, 'Credit note deleted');
  }
}

export default new CreditNoteService();
