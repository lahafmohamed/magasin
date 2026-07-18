import pool from '../db/connection';
import { BaseService } from './BaseService';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';
import { checkPeriodIsOpen } from './PeriodService';

export interface FactureFournisseurLigneInput {
  produit_id?: number;
  description?: string;
  quantite: number;
  prix_unitaire: number;
  tva_taux?: number;
}

export interface CreateFactureFournisseurInput {
  tiers_id: number;
  fournisseur_id?: number;
  reception_id?: number;
  commande_id?: number;
  numero_facture_fournisseur: string;
  date_facture: string;
  date_echeance?: string;
  condition_paiement?: string;
  lignes: FactureFournisseurLigneInput[];
  notes?: string;
  cree_par?: number;
  req?: any;
}

export interface FactureFournisseurRecord {
  id: number;
  tiers_id: number;
  commande_id: number | null;
  reception_id: number | null;
  numero_facture_fournisseur: string;
  numero_facture_interne: string;
  date_facture: string;
  date_echeance: string | null;
  sous_total: number;
  tva: number;
  total: number;
  montant_paye: number;
  reste_due: number;
  statut: string;
  condition_paiement: string | null;
  notes: string | null;
  cree_par: number | null;
  created_at: string;
}

export class FactureFournisseurService extends BaseService<FactureFournisseurRecord> {
  protected tableName = 'factures_fournisseur';
  protected selectColumns = 'ff.id, ff.tiers_id, ff.commande_id, ff.reception_id, ff.numero_facture_fournisseur, ff.numero_facture_interne, ff.date_facture, ff.date_echeance, ff.sous_total, ff.tva, ff.total, ff.montant_paye, ff.reste_due, ff.statut, ff.condition_paiement, ff.notes, ff.cree_par, ff.created_at, t.raison_sociale as fournisseur_nom';
  protected defaultSortColumn = 'created_at';
  protected allowedSortColumns = ['created_at', 'date_facture', 'date_echeance', 'total', 'statut'];

  /**
   * Get all supplier invoices with pagination
   */
  async getAll(options?: { search?: string; statut?: string; tiers_id?: number; fournisseur_id?: number; page?: number; limit?: number }): Promise<{ data: any[]; total: number }> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;

    let query = `
      SELECT ${this.selectColumns}
      FROM factures_fournisseur ff
      LEFT JOIN tiers t ON ff.tiers_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    const filterTiersId = options?.tiers_id ?? options?.fournisseur_id;
    if (filterTiersId) { query += ` AND ff.tiers_id = $${params.length + 1}`; params.push(filterTiersId); }

    if (options?.statut) {
      query += ` AND ff.statut = $${params.length + 1}`;
      params.push(options.statut);
    }

    if (options?.search) {
      query += ` AND (ff.numero_facture_fournisseur ILIKE $${params.length + 1} OR ff.numero_facture_interne ILIKE $${params.length + 2} OR t.raison_sociale ILIKE $${params.length + 3})`;
      params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
    }

    query += ' ORDER BY ff.date_facture DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM factures_fournisseur ff LEFT JOIN tiers t ON ff.tiers_id = t.id WHERE 1=1`;
    const countParams: any[] = [];
    if (filterTiersId) { countQuery += ` AND ff.tiers_id = $${countParams.length + 1}`; countParams.push(filterTiersId); }
    if (options?.statut) {
      countQuery += ` AND ff.statut = $${countParams.length + 1}`;
      countParams.push(options.statut);
    }
    if (options?.search) {
      countQuery += ` AND (ff.numero_facture_fournisseur ILIKE $${countParams.length + 1} OR ff.numero_facture_interne ILIKE $${countParams.length + 2} OR t.raison_sociale ILIKE $${countParams.length + 3})`;
      countParams.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
    }
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);

    return { data: rows, total };
  }

  /**
   * Get supplier invoice with line items
   */
  async getById(id: number): Promise<any | null> {
    const { rows: invoiceRows } = await pool.query(
      `SELECT ${this.selectColumns}, r.numero_reception
       FROM factures_fournisseur ff
       LEFT JOIN tiers t ON ff.tiers_id = t.id
       LEFT JOIN receptions r ON ff.reception_id = r.id
       WHERE ff.id = $1`,
      [id]
    );

    if (invoiceRows.length === 0) return null;

    const { rows: lignesRows } = await pool.query(
      `SELECT ffl.*, p.nom as produit_nom, p.reference as produit_reference
       FROM facture_fournisseur_lignes ffl
       LEFT JOIN produits p ON ffl.produit_id = p.id
       WHERE ffl.facture_id = $1`,
      [id]
    );

    return {
      ...invoiceRows[0],
      lignes: lignesRows,
    };
  }

  /**
   * Three-way match for a purchase order: reconcile ordered (commande) vs
   * received (receptions) vs invoiced (existing supplier invoices + an optional
   * candidate invoice being created) per product.
   *
   * `candidate` lines (the not-yet-persisted invoice) are folded into the
   * invoiced totals so creation-time enforcement sees the full picture.
   */
  async computeMatch(
    commandeId: number,
    candidate?: FactureFournisseurLigneInput[],
    client?: any
  ): Promise<{
    commande_id: number;
    coherent: boolean;
    within_tolerance: boolean;
    config: { qte_tolerance_pct: number; prix_tolerance_pct: number; bloquer: boolean };
    lignes: any[];
    violations: any[];
  }> {
    const q = client || pool;

    const { rows: cfgRows } = await q.query(
      `SELECT qte_tolerance_pct, prix_tolerance_pct, bloquer FROM three_way_match_config WHERE id = 1`
    );
    const config = cfgRows[0]
      ? { qte_tolerance_pct: Number(cfgRows[0].qte_tolerance_pct), prix_tolerance_pct: Number(cfgRows[0].prix_tolerance_pct), bloquer: cfgRows[0].bloquer }
      : { qte_tolerance_pct: 0, prix_tolerance_pct: 0.05, bloquer: false };

    const { rows: ordered } = await q.query(
      `SELECT cl.produit_id, p.nom AS produit_nom, p.reference,
              SUM(cl.quantite) AS qte_commandee, MAX(cl.prix_unitaire) AS prix_commande
       FROM commande_lignes cl LEFT JOIN produits p ON p.id = cl.produit_id
       WHERE cl.commande_id = $1 GROUP BY cl.produit_id, p.nom, p.reference`,
      [commandeId]
    );
    const { rows: received } = await q.query(
      `SELECT rl.produit_id, SUM(rl.quantite_recue) AS qte_recue
       FROM reception_lignes rl JOIN receptions r ON rl.reception_id = r.id
       WHERE r.commande_id = $1 GROUP BY rl.produit_id`,
      [commandeId]
    );
    const { rows: invoiced } = await q.query(
      `SELECT ffl.produit_id, SUM(ffl.quantite) AS qte_facturee, MAX(ffl.prix_unitaire) AS prix_facture
       FROM facture_fournisseur_lignes ffl JOIN factures_fournisseur ff ON ffl.facture_id = ff.id
       WHERE ff.commande_id = $1 AND ff.statut <> 'annulee' GROUP BY ffl.produit_id`,
      [commandeId]
    );

    const recMap = new Map<number, number>(received.map((r: any) => [r.produit_id, Number(r.qte_recue)]));
    const invMap = new Map<number, { qte: number; prix: number | null }>(
      invoiced.map((r: any) => [r.produit_id, { qte: Number(r.qte_facturee), prix: r.prix_facture != null ? Number(r.prix_facture) : null }])
    );
    // Fold the candidate (in-flight) invoice into invoiced totals.
    for (const l of candidate || []) {
      if (!l.produit_id) continue;
      const prev = invMap.get(l.produit_id) || { qte: 0, prix: null };
      invMap.set(l.produit_id, { qte: prev.qte + Number(l.quantite), prix: Number(l.prix_unitaire) });
    }

    const lignes: any[] = [];
    const violations: any[] = [];
    for (const o of ordered) {
      const qteCommandee = Number(o.qte_commandee);
      const qteRecue = recMap.get(o.produit_id) || 0;
      const inv = invMap.get(o.produit_id);
      const qteFacturee = inv ? inv.qte : 0;
      const prixCommande = o.prix_commande != null ? Number(o.prix_commande) : null;
      const prixFacture = inv && inv.prix != null ? inv.prix : null;

      const ecartReception = qteRecue - qteCommandee;
      const ecartFacturation = qteFacturee - qteRecue;
      const ecartPrix = prixCommande != null && prixFacture != null ? prixFacture - prixCommande : null;
      const ecartPrixPct = prixCommande && prixCommande !== 0 && ecartPrix != null ? ecartPrix / prixCommande : null;

      // Tolerance: invoiced qty must not exceed received qty (+tol); price must stay within tol of PO.
      const qteOk = qteFacturee <= qteRecue * (1 + config.qte_tolerance_pct) + 0.0001;
      const prixOk = ecartPrixPct == null || Math.abs(ecartPrixPct) <= config.prix_tolerance_pct + 0.0001;
      const coherent = ecartFacturation <= 0.0001 && (ecartPrix == null || Math.abs(ecartPrix) < 0.01);

      const ligne = {
        produit_id: o.produit_id, produit_nom: o.produit_nom, reference: o.reference,
        qte_commandee: qteCommandee, qte_recue: qteRecue, qte_facturee: qteFacturee,
        prix_commande: prixCommande, prix_facture: prixFacture,
        ecart_reception: ecartReception, ecart_facturation: ecartFacturation,
        ecart_prix: ecartPrix, ecart_prix_pct: ecartPrixPct,
        coherent, within_tolerance: qteOk && prixOk,
      };
      lignes.push(ligne);
      if (!qteOk || !prixOk) {
        const reasons: string[] = [];
        if (!qteOk) reasons.push(`quantité facturée (${qteFacturee}) > quantité reçue (${qteRecue})`);
        if (!prixOk) reasons.push(`prix facturé ${prixFacture} s'écarte du prix commandé ${prixCommande}`);
        violations.push({ produit_id: o.produit_id, produit_nom: o.produit_nom, reasons });
      }
    }

    // Invoiced products absent from the PO are violations too.
    for (const [produit_id, inv] of invMap) {
      if (!ordered.some((o: any) => o.produit_id === produit_id)) {
        violations.push({ produit_id, produit_nom: null, reasons: [`produit facturé (qté ${inv.qte}) absent de la commande`] });
      }
    }

    return {
      commande_id: commandeId,
      coherent: lignes.every((l) => l.coherent) && violations.length === 0,
      within_tolerance: violations.length === 0,
      config,
      lignes,
      violations,
    };
  }

  /** Read the three-way match tolerance config. */
  async getMatchConfig(): Promise<{ qte_tolerance_pct: number; prix_tolerance_pct: number; bloquer: boolean }> {
    const { rows } = await pool.query(
      `SELECT qte_tolerance_pct, prix_tolerance_pct, bloquer FROM three_way_match_config WHERE id = 1`
    );
    return rows[0]
      ? { qte_tolerance_pct: Number(rows[0].qte_tolerance_pct), prix_tolerance_pct: Number(rows[0].prix_tolerance_pct), bloquer: rows[0].bloquer }
      : { qte_tolerance_pct: 0, prix_tolerance_pct: 0.05, bloquer: false };
  }

  /** Update the three-way match tolerance config (singleton row). */
  async updateMatchConfig(input: { qte_tolerance_pct?: number; prix_tolerance_pct?: number; bloquer?: boolean }): Promise<any> {
    await pool.query(
      `UPDATE three_way_match_config SET
         qte_tolerance_pct  = COALESCE($1, qte_tolerance_pct),
         prix_tolerance_pct = COALESCE($2, prix_tolerance_pct),
         bloquer            = COALESCE($3, bloquer),
         updated_at         = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [input.qte_tolerance_pct ?? null, input.prix_tolerance_pct ?? null, input.bloquer ?? null]
    );
    return this.getMatchConfig();
  }

  /**
   * Create supplier invoice
   */
  async create(input: CreateFactureFournisseurInput): Promise<{ id: number; numero_facture_interne: string }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await checkPeriodIsOpen(new Date(), client);

      const tiers_id_fourn = input.tiers_id ?? input.fournisseur_id!;
      const { reception_id, numero_facture_fournisseur, date_facture, date_echeance, condition_paiement, lignes, notes, cree_par, req } = input;

      if (!lignes || lignes.length === 0) {
        throw new Error('La facture doit contenir au moins une ligne');
      }

      // Resolve the PO link: explicit commande_id wins, else derive from reception.
      let commande_id = input.commande_id ?? null;
      if (!commande_id && reception_id) {
        const { rows: recRows } = await client.query('SELECT commande_id FROM receptions WHERE id = $1', [reception_id]);
        if (recRows[0]) commande_id = recRows[0].commande_id;
      }

      // Three-way match: reconcile this invoice against PO + receptions.
      if (commande_id) {
        const match = await this.computeMatch(commande_id, lignes, client);
        if (match.config.bloquer && !match.within_tolerance) {
          const err: any = new Error(
            'Rapprochement 3 voies échoué: ' + match.violations.map((v) => `${v.produit_nom || 'produit ' + v.produit_id}: ${v.reasons.join('; ')}`).join(' | ')
          );
          err.statusCode = 422;
          err.code = 'THREE_WAY_MATCH_FAILED';
          err.violations = match.violations;
          throw err;
        }
      }

      // Generate internal invoice number
      const { rows: seqRows } = await client.query("SELECT nextval('facture_fournisseur_numero_seq') as num");
      const numeroFactureInterne = `FF-${new Date().getFullYear()}-${String(seqRows[0].num).padStart(5, '0')}`;

      // Calculate totals
      let sousTotal = 0;

      for (const ligne of lignes) {
        const totalLigne = ligne.quantite * ligne.prix_unitaire;
        sousTotal += totalLigne;
      }

      const total = sousTotal;

      // Insert invoice
      const { rows: invoiceResult } = await client.query(
        `INSERT INTO factures_fournisseur
         (tiers_id, commande_id, reception_id, numero_facture_fournisseur, numero_facture_interne, date_facture, date_echeance, condition_paiement, sous_total, tva, total, reste_due, notes, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $10, $11, $12)
         RETURNING id`,
        [tiers_id_fourn, commande_id, reception_id || null, numero_facture_fournisseur, numeroFactureInterne, date_facture, date_echeance || null, condition_paiement || null, sousTotal, total, notes || null, cree_par || null]
      );

      const invoiceId = invoiceResult[0].id;

      // Insert line items
      for (const ligne of lignes) {
        const totalLigne = ligne.quantite * ligne.prix_unitaire;

        await client.query(
          `INSERT INTO facture_fournisseur_lignes
           (facture_id, produit_id, description, quantite, prix_unitaire, total_ligne)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [invoiceId, ligne.produit_id || null, ligne.description || null, ligne.quantite, ligne.prix_unitaire, totalLigne]
        );
      }

      // Supplier ledger: credit entry (new invoice increases AP liability)
      await client.query(
        `INSERT INTO compte_fournisseur_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'facture', $2, $3, 0, $4, $5, $6)`,
        [tiers_id_fourn, invoiceId, numeroFactureInterne, total, notes || null, cree_par || null]
      );

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: cree_par || (req?.user?.id),
        action: 'create',
        table_name: 'factures_fournisseur',
        record_id: invoiceId,
        req,
        new_values: { numero_facture_interne: numeroFactureInterne, tiers_id: tiers_id_fourn, total },
      });

      logger.info({ invoiceId, numeroFactureInterne, tiers_id: tiers_id_fourn }, 'Supplier invoice created');

      return { id: invoiceId, numero_facture_interne: numeroFactureInterne };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error creating supplier invoice');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Record payment for supplier invoice
   */
  async recordPayment(factureId: number, montant: number, methodePaiement: string, reference?: string, effectuePar?: number, req?: any): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get invoice total
      const { rows: invoiceRows } = await client.query(
        'SELECT total, montant_paye FROM factures_fournisseur WHERE id = $1',
        [factureId]
      );

      if (invoiceRows.length === 0) {
        throw new Error('Facture non trouvée');
      }

      const invoice = invoiceRows[0];
      const total = parseFloat(invoice.total);
      const montantPaye = parseFloat(invoice.montant_paye);
      const remainingDue = total - montantPaye;

      if (montant <= 0) {
        throw new Error('Le montant du paiement doit être positif');
      }

      if (montant > remainingDue + 0.01) {
        throw new Error(`Le montant du paiement (${montant}) dépasse le reste dû (${remainingDue})`);
      }

      // Get fournisseur_id for ledger entry
      const { rows: ffRows } = await client.query(
        'SELECT tiers_id, numero_facture_interne FROM factures_fournisseur WHERE id = $1',
        [factureId]
      );
      const { tiers_id: ff_tiers_id, numero_facture_interne } = ffRows[0];

      // Insert payment
      const { rows: paiementResult } = await client.query(
        `INSERT INTO paiements_fournisseur (facture_id, montant, methode_paiement, reference, effectue_par)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [factureId, montant, methodePaiement, reference || null, effectuePar || null]
      );

      // Supplier ledger: debit entry (payment reduces AP liability)
      await client.query(
        `INSERT INTO compte_fournisseur_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'paiement', $2, $3, $4, 0, $5, $6)`,
        [ff_tiers_id, paiementResult[0].id, `PAI-FF-${paiementResult[0].id}`, montant, null, effectuePar || null]
      );

      // Update the invoice balance and status.
      const newMontantPaye = montantPaye + montant;
      const newReste = total - newMontantPaye;
      const newStatut = newReste <= 0.01 ? 'payee' : newMontantPaye > 0 ? 'partiellement_payee' : 'en_attente';
      await client.query(
        `UPDATE factures_fournisseur
         SET montant_paye = $1, reste_due = $2, statut = $3
         WHERE id = $4`,
        [newMontantPaye, Math.max(0, newReste), newStatut, factureId]
      );

      await client.query('COMMIT');

      await logAudit({
        utilisateur_id: effectuePar || (req?.user?.id),
        action: 'create',
        table_name: 'paiements_fournisseur',
        record_id: factureId,
        req,
        new_values: { montant, methode_paiement: methodePaiement },
      });

      logger.info({ factureId, montant }, 'Supplier payment recorded');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error recording supplier payment');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get payable invoices (due or overdue)
   */
  async getPayableInvoices(): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT ff.*, t.raison_sociale as fournisseur_nom,
              ff.total - ff.montant_paye as reste_du,
              CASE 
                WHEN ff.date_echeance < CURRENT_DATE THEN 'en_retard'
                WHEN ff.date_echeance <= CURRENT_DATE + INTERVAL '7 days' THEN 'bientot_echu'
                ELSE 'a_echeance'
              END as statut_echeance
       FROM factures_fournisseur ff
       LEFT JOIN tiers t ON ff.tiers_id = t.id
       WHERE ff.statut NOT IN ('payee', 'annulee')
         AND (ff.total - ff.montant_paye) > 0
       ORDER BY ff.date_echeance ASC`
    );
    return rows;
  }

  /**
   * Get supplier invoice statistics
   */
  async getStats(): Promise<any> {
    const { rows } = await pool.query(
      `SELECT
        COUNT(*) as total_factures,
        COALESCE(SUM(total), 0) as valeur_totale,
        COALESCE(SUM(total - montant_paye), 0) as reste_du_total,
        COUNT(CASE WHEN statut = 'en_attente' THEN 1 END) as factures_en_attente,
        COUNT(CASE WHEN statut = 'payee' THEN 1 END) as factures_payees
       FROM factures_fournisseur`
    );
    return rows[0];
  }
}

export const factureFournisseurService = new FactureFournisseurService();
