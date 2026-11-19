import type { PoolClient } from 'pg';
import pool from '../db/connection';
import { logAudit } from '../middleware/audit';
import { logger } from '../utils/logger';
import { calculateTotals, roundMoney } from './PricingService';
import { generateDocumentNumber } from './NumberingService';
import { businessError } from '../utils/errors';
import { formatMontantFcfa } from '../utils/money';
import { paiementAcompteLisible } from '../utils/caisseLibelle';
import { ClientAllocationService } from './ClientAllocationService';
import { checkPeriodIsOpen } from './PeriodService';
import { creditService } from './CreditService';
import { NotificationService } from './NotificationService';
import { applyStockMovement } from './StockCostingService';
import {
  resolveSalesLocationId,
} from './StockMagasinService';

/** Ce que l'annulation d'une facture a fait, pour le message et l'écran. */
export interface FactureAnnulationResult {
  id: number;
  numero_facture: string;
  statut: 'annulee';
  /** Lignes de contre-passation écrites au grand livre. */
  ecritures_contre_passees: number;
  articles_remis_en_stock: Array<{
    produit_id: number;
    produit_nom: string;
    quantite: number;
    location_id: number;
    location_nom: string;
  }>;
  emplacements: Array<{ id: number; nom: string }>;
  /** Bons de livraison livrés de la vente, annulés avec elle. */
  bons_livraison_annules: Array<{ id: number; numero_bl: string }>;
  message: string;
}

/** Ligne de remise en stock, avant agrégation. */
interface RestockItem {
  produitId: number;
  locationId: number;
  quantite: number;
}

/** « 10/2026 » depuis le message du trigger 075 ou de PeriodService. */
function periodFromMessage(message: string): string | null {
  const match = /(\d{2})\/(\d{4})/.exec(message);
  return match ? `${match[1]}/${match[2]}` : null;
}

export interface FactureLigneInput {
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
}

export interface CreateFactureInput {
  tiers_id: number;
  client_id?: number; // legacy alias
  lignes: FactureLigneInput[];
  location_id?: number;
  notes?: string;
  cree_par?: number;
  req?: any; // Express request for audit
  remise_globale?: number;
  remise_globale_pct?: number;
}

/** Product name for a user-facing message (never an internal id alone). */
async function produitNom(client: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> }, produitId: number): Promise<string> {
  const { rows } = await client.query('SELECT nom FROM produits WHERE id = $1', [produitId]);
  return rows[0]?.nom ?? `n° ${produitId}`;
}

export class FactureService {
  private isMagasinLocation(location: { code?: string | null; nom?: string | null }): boolean {
    const code = String(location.code || '').toUpperCase();
    const nom = String(location.nom || '').toUpperCase();

    if (code.startsWith('MAG') || nom.includes('MAGASIN')) return true;
    if (code.startsWith('DEPOT') || nom.includes('DEPOT') || nom.includes('DÉPÔT')) return false;

    return true;
  }

  private async resolveMagasinLocationId(client: any, requestedLocationId?: number): Promise<number> {
    return resolveSalesLocationId(requestedLocationId ?? null, client);
  }

  private async ensureRequiredAccountsForInvoice(client: any): Promise<void> {
    await client.query(
      `INSERT INTO plan_comptable (numero, intitule, type_compte, categorie)
       VALUES
        ('411', 'Clients', 'actif', 'classe4'),
        ('701', 'Ventes de marchandises', 'produit', 'classe7'),
        ('4457', 'TVA collectée', 'passif', 'classe4')
       ON CONFLICT (numero) DO NOTHING`
    );
  }

  private async getPrincipalLocationId(client: any): Promise<number> {
    const { rows } = await client.query(
      'SELECT id FROM stock_locations WHERE est_principal = true AND actif = true LIMIT 1'
    );

    if (rows.length === 0) {
      throw new Error('Aucune location principale active configuree');
    }

    return rows[0].id;
  }

  private calculateDueDate(delaiPaiement?: string): Date {
    const now = new Date();
    const normalized = (delaiPaiement || 'immediat').toLowerCase();

    const daysByTerm: Record<string, number> = {
      immediat: 0,
      net_30: 30,
      net_60: 60,
      net_90: 90,
    };

    const daysToAdd = daysByTerm[normalized] ?? 0;
    now.setDate(now.getDate() + daysToAdd);

    return now;
  }

  private formatDateForPg(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get paginated invoices with optional filters
   */
  async getAll(
    search?: string,
    statut?: string,
    page: number = 1,
    limit: number = 20,
    sort: string = 'date_facture',
    order: string = 'DESC'
  ): Promise<any> {
    const validSortColumns = ['numero_facture', 'date_facture', 'total', 'statut', 'client_nom', 'montant_paye'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'date_facture';
    // client_nom is a joined alias (tiers), not a factures column — qualify accordingly.
    const sortExpr = sortColumn === 'client_nom' ? 't.raison_sociale' : `f.${sortColumn}`;
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const offset = (page - 1) * limit;

    let query = `
      SELECT f.*, t.raison_sociale as client_nom, t.prenom as client_prenom
      FROM factures f
      LEFT JOIN tiers t ON f.tiers_id = t.id
      WHERE f.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean);
      for (const word of words) {
        const pattern = `%${word}%`;
        const n = params.length;
        query += ` AND (f.numero_facture ILIKE $${n + 1} OR t.raison_sociale ILIKE $${n + 2} OR COALESCE(t.prenom,'') ILIKE $${n + 3} OR COALESCE(t.telephone,'') ILIKE $${n + 4})`;
        params.push(pattern, pattern, pattern, pattern);
      }
    }

    if (statut) {
      query += ' AND f.statut = $' + (params.length + 1);
      params.push(statut);
    }

    query += ` ORDER BY ${sortExpr} ${sortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM factures f LEFT JOIN tiers t ON f.tiers_id = t.id WHERE f.deleted_at IS NULL`;
    const countParams: any[] = [];
    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean);
      for (const word of words) {
        const pattern = `%${word}%`;
        const n = countParams.length;
        countQuery += ` AND (f.numero_facture ILIKE $${n + 1} OR t.raison_sociale ILIKE $${n + 2} OR COALESCE(t.prenom,'') ILIKE $${n + 3} OR COALESCE(t.telephone,'') ILIKE $${n + 4})`;
        countParams.push(pattern, pattern, pattern, pattern);
      }
    }
    if (statut) {
      countQuery += ' AND f.statut = $' + (countParams.length + 1);
      countParams.push(statut);
    }
    const { rows: countRows } = await pool.query(countQuery, countParams);
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
   * Get invoice by ID with lines and payments
   */
  async getById(id: number): Promise<any> {
    // cree_par_nom : le vendeur, selon la règle des commissions (100) —
    // créateur de la facture, sinon du BL, sinon du devis d'origine : une
    // facture issue d'une conversion n'a souvent pas de cree_par.
    const { rows: factureRows } = await pool.query(
      `SELECT f.*, t.raison_sociale as client_nom, t.prenom as client_prenom, t.code AS client_code, t.email, t.telephone, t.adresse, t.nif,
              COALESCE(NULLIF(TRIM(u.nom_complet), ''), u.username) AS cree_par_nom
       FROM factures f
       LEFT JOIN tiers t ON f.tiers_id = t.id
       LEFT JOIN utilisateurs u ON u.id = COALESCE(
         f.cree_par,
         (SELECT bl.cree_par FROM bons_livraison bl WHERE bl.id = f.bl_id),
         (SELECT d.cree_par FROM devis d WHERE d.id = f.devis_id)
       )
       WHERE f.id = $1 AND f.deleted_at IS NULL`,
      [id]
    );

    if (factureRows.length === 0) return null;

    const { rows: lignesRows } = await pool.query(
      `SELECT dl.*,
              p.nom as produit_nom,
              p.reference as produit_reference,
              CASE
                WHEN dl.produit_id IS NULL THEN false
                WHEN EXISTS (
                  SELECT 1 FROM stock_par_location spl
                  JOIN stock_locations sl ON sl.id = spl.location_id
                  WHERE spl.produit_id = dl.produit_id
                    AND sl.actif = true
                    AND NOT (
                      UPPER(sl.code) LIKE 'DEPOT%'
                      OR UPPER(sl.nom) LIKE '%DÉPÔT%'
                      OR UPPER(sl.nom) LIKE '%DEPOT%'
                    )
                ) THEN false
                ELSE true
              END AS is_depot_only_history
       FROM document_lignes dl
       LEFT JOIN produits p ON dl.produit_id = p.id
       WHERE dl.document_type = 'facture' AND dl.document_id = $1`,
      [id]
    );

    // Chaque ligne dit si elle se supprime (`supprimable`) et sinon pourquoi
    // (`suppression_bloquee`), avec les mêmes règles que DELETE /paiements/:id :
    // une application d'acompte s'annule côté acompte (409 sinon), un
    // encaissement d'une session de caisse clôturée ou d'une période fermée ne
    // bouge plus. Les anciennes imputations d'acompte (avant 048, id négatif)
    // ne sont pas des paiements : jamais supprimables ici.
    const { rows: paiementsRows } = await pool.query(
      `SELECT p.id, p.montant, p.methode_paiement, p.date_paiement, p.reference, p.notes, p.source,
              (SELECT aa.acompte_id FROM acompte_applications aa WHERE aa.paiement_id = p.id LIMIT 1) AS acompte_id,
              CASE
                WHEN p.source = 'acompte_application'
                  THEN 'Paiement pris sur un acompte : annulez l’application de l’acompte.'
                WHEN s.statut IS NOT NULL AND s.statut <> 'ouverte'
                  THEN 'Encaissé dans une session de caisse clôturée.'
                WHEN pc.statut = 'fermee'
                  THEN 'Période comptable clôturée.'
              END AS suppression_bloquee
       FROM paiements p
       LEFT JOIN mouvements_caisse m ON m.id = p.mouvement_caisse_id
       LEFT JOIN sessions_caisse s ON s.id = m.session_caisse_id
       LEFT JOIN periodes_comptables pc
         ON pc.exercice = EXTRACT(YEAR FROM p.date_paiement)::int
        AND pc.periode = EXTRACT(MONTH FROM p.date_paiement)::int
       WHERE p.facture_id = $1 AND p.deleted_at IS NULL
       UNION ALL
       SELECT -ac.id AS id, ac.montant, 'acompte' AS methode_paiement, ac.date_utilisation AS date_paiement,
              'Acompte n° ' || ac.id AS reference, ac.notes, 'acompte_application' AS source,
              ac.id AS acompte_id,
              'Ancienne imputation d’acompte : elle ne se supprime pas ici.' AS suppression_bloquee
       FROM acomptes_clients ac
       WHERE ac.facture_id_applique = $1 AND ac.statut = 'utilise' AND ac.deleted_at IS NULL
       ORDER BY date_paiement DESC`,
      [id]
    );
    const paiements = paiementsRows.map((p: any) => ({
      ...paiementAcompteLisible(p),
      supprimable: p.suppression_bloquee === null,
    }));

    // Le lien d'origine est porté dans les deux sens selon le chemin de
    // création (factures.devis_id/bl_id côté conversions récentes,
    // devis.facture_id / bons_livraison.facture_id côté fonctions SQL et
    // données historiques) : on résout les deux, sinon le fil de vie affiche
    // « — » pour des documents qui existent.
    const { rows: originRows } = await pool.query(
      `SELECT d.id AS devis_id, d.numero_devis,
              bl.id AS bl_id, bl.numero_bl,
              av.id AS avoir_id, av.numero_avoir
       FROM factures f
       LEFT JOIN LATERAL (
         SELECT b.id, b.numero_bl, b.devis_id
         FROM bons_livraison b
         WHERE b.id = f.bl_id OR b.facture_id = f.id
         ORDER BY (b.id = f.bl_id) DESC NULLS LAST, b.id DESC
         LIMIT 1
       ) bl ON TRUE
       LEFT JOIN LATERAL (
         SELECT dv.id, dv.numero_devis
         FROM devis dv
         WHERE dv.id = COALESCE(f.devis_id, bl.devis_id) OR dv.facture_id = f.id
         ORDER BY (dv.id = f.devis_id) DESC NULLS LAST, dv.id DESC
         LIMIT 1
       ) d ON TRUE
       LEFT JOIN LATERAL (
         SELECT fa.id, fa.numero_avoir
         FROM factures_avoir fa
         WHERE fa.facture_origine_id = f.id AND fa.statut <> 'annule'
         ORDER BY fa.id DESC
         LIMIT 1
       ) av ON TRUE
       WHERE f.id = $1`,
      [id]
    );

    // E1-R1 : quand les paiements listés ne font pas le montant payé (données
    // ré-imputées selon E1, facture annulée), dire où est allé l'excédent et
    // d'où vient ce qui a été reçu d'une autre facture.
    const reports = await ClientAllocationService.getFactureReports(factureRows[0], paiementsRows);

    return {
      ...factureRows[0],
      lignes: lignesRows,
      paiements,
      ...reports,
      origine: originRows[0] || null,
    };
  }

  /**
   * Create invoice with automatic stock deduction (transactional)
   */
  async create(input: CreateFactureInput): Promise<{ id: number; numero_facture: string; total: number }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const { result, afterCommit } = await this.createInTransaction(client, input);
      await client.query('COMMIT');
      afterCommit();
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Error creating invoice');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Corps de `create`, dans une transaction ouverte par l'appelant (la vente
   * comptoir y ajoute ses paiements avant le COMMIT). `afterCommit` envoie les
   * notifications : à n'appeler qu'une fois la transaction validée.
   *
   * `paiementImmediat` : l'appelant encaisse le total dans la même
   * transaction, la facture n'ouvre donc aucun crédit — le plafond du client
   * n'a pas à être vérifié.
   */
  async createInTransaction(
    client: PoolClient,
    input: CreateFactureInput,
    options: { paiementImmediat?: boolean } = {}
  ): Promise<{ result: { id: number; numero_facture: string; total: number }; afterCommit: () => void }> {
    {
      // Reject posts to closed accounting periods
      await checkPeriodIsOpen(new Date(), client);

      const tiers_id = input.tiers_id ?? input.client_id!;
      const { lignes, notes, cree_par, req, remise_globale, remise_globale_pct } = input;
      const effectiveLocationId = await this.resolveMagasinLocationId(client, input.location_id);

      if (!lignes || lignes.length === 0) {
        throw businessError(422, 'La facture doit contenir au moins un produit');
      }

      // Verify stock availability and collect purchase prices — one query for
      // all products, per-line checks unchanged (identical error messages)
      const ligneProduitIds = [...new Set(lignes.map((l) => l.produit_id))];
      const purchasePricesMap = new Map<number, number>();
      for (const ligne of lignes) {
        if (!Number.isInteger(ligne.quantite) || ligne.quantite <= 0) {
          throw businessError(422, `Quantité invalide pour le produit ID ${ligne.produit_id} (doit être un entier positif)`);
        }
      }
      {
        const { rows: stockRows } = await client.query(
          `SELECT p.id, p.nom, COALESCE(p.prix_achat, 0.00) as prix_achat, COALESCE(spl.quantite, p.stock) as stock_location
           FROM produits p
           LEFT JOIN stock_par_location spl ON spl.produit_id = p.id AND spl.location_id = $2
           WHERE p.id = ANY($1::int[]) AND p.deleted_at IS NULL`,
          [ligneProduitIds, effectiveLocationId]
        );
        const infoByProduit = new Map(stockRows.map((r: any) => [Number(r.id), r]));

        for (const ligne of lignes) {
          const info = infoByProduit.get(ligne.produit_id);
          if (!info) {
            throw businessError(404, `Produit introuvable (n° ${ligne.produit_id}) : il a peut-être été supprimé.`);
          }
          if (parseInt(info.stock_location, 10) < ligne.quantite) {
            throw businessError(
              422,
              `Stock insuffisant pour « ${info.nom} » : ${info.stock_location} disponible(s) à cet emplacement, ${ligne.quantite} demandé(s).`
            );
          }
          purchasePricesMap.set(ligne.produit_id, parseFloat(info.prix_achat || '0.00'));
        }
      }

      // Generate invoice number
      const numeroFacture = await generateDocumentNumber('facture', client);

      // Get client financial policy for credit check and due date
      const { rows: clientRows } = await client.query(
        `SELECT
          raison_sociale as nom,
          prenom,
          COALESCE(credit_max, 0) as credit_max,
          COALESCE(solde_client_actuel, 0) as solde_actuel,
          COALESCE(delai_paiement, 'immediat') as delai_paiement
         FROM tiers
         WHERE id = $1 AND deleted_at IS NULL`,
        [tiers_id]
      );

      if (clientRows.length === 0) {
        throw businessError(404, `Tiers ID ${tiers_id} non trouvé`);
      }

      // Calculate totals (no TVA)
      const { sousTotal, remiseGlobale, remiseGlobalePct, total, totalLignes } = calculateTotals(
        lignes,
        remise_globale,
        remise_globale_pct
      );

      // Enforce client credit limit (live outstanding + row lock, shared with BL path)
      if (!options.paiementImmediat) {
        await creditService.assertWithinCreditLimit(client, tiers_id, total);
      }

      const delaiPaiement = clientRows[0].delai_paiement || 'immediat';
      const dateEcheance = this.formatDateForPg(this.calculateDueDate(delaiPaiement));

      // Guard against legacy DB trigger variants that assume these accounts already exist.
      await this.ensureRequiredAccountsForInvoice(client);

      // Insert invoice
      let factureResult: any[] = [];
      try {
        await client.query('SAVEPOINT facture_insert');
        const insertWithDueDate = await client.query(
          'INSERT INTO factures (numero_facture, tiers_id, sous_total, tva, total, montant_paye, remaining_due, statut, notes, cree_par, remise_globale, remise_globale_pct, date_echeance, delai_paiement, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id',
          [numeroFacture, tiers_id, sousTotal, 0, total, 0, total, 'en_attente', notes || null, cree_par || null, remiseGlobale, remiseGlobalePct, dateEcheance, delaiPaiement, effectiveLocationId]
        );
        factureResult = insertWithDueDate.rows;
      } catch (error: any) {
        if (error?.code !== '42703') {
          throw error;
        }

        await client.query('ROLLBACK TO SAVEPOINT facture_insert');
        const insertLegacy = await client.query(
          'INSERT INTO factures (numero_facture, tiers_id, sous_total, tva, total, montant_paye, remaining_due, statut, notes, cree_par, remise_globale, remise_globale_pct) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id',
          [numeroFacture, tiers_id, sousTotal, 0, total, 0, total, 'en_attente', notes || null, cree_par || null, remiseGlobale, remiseGlobalePct]
        );
        factureResult = insertLegacy.rows;
      }

      const factureId = factureResult[0].id;

      // Batch insert lines and update stock
      const produitIds: number[] = [];
      const quantities: number[] = [];
      const prices: number[] = [];
      const totals: number[] = [];
      const purchasePrices: number[] = [];

      for (const [index, ligne] of lignes.entries()) {
        produitIds.push(ligne.produit_id);
        quantities.push(ligne.quantite);
        prices.push(ligne.prix_unitaire);
        // Reuse the rounded per-line totals the header was built from. Recomputing
        // quantite * prix_unitaire here left the stored lines unrounded while
        // sous_total was rounded per line, so the two disagreed on fractional prices.
        totals.push(totalLignes[index]);
        purchasePrices.push(purchasePricesMap.get(ligne.produit_id) ?? 0.00);
      }

      // Lock every touched stock row in ONE ordered pass (produit_id ASC).
      // A stable lock order across concurrent invoices removes the deadlock
      // exposure the per-line FOR UPDATE loop had.
      const { rows: splRows } = await client.query(
        `SELECT produit_id, quantite
         FROM stock_par_location
         WHERE location_id = $2 AND produit_id = ANY($1::int[])
         ORDER BY produit_id
         FOR UPDATE`,
        [ligneProduitIds, effectiveLocationId]
      );
      const splStock = new Map<number, number>(
        splRows.map((r: any) => [Number(r.produit_id), parseInt(r.quantite, 10)])
      );

      // Products with no stock_par_location row fall back to produits.stock
      // (legacy store — authoritative for those products, see PLAN.md)
      const legacyIds = ligneProduitIds.filter((id) => !splStock.has(id));
      const legacyStock = new Map<number, number>();
      if (legacyIds.length > 0) {
        const { rows: legacyRows } = await client.query(
          `SELECT id, stock FROM produits
           WHERE id = ANY($1::int[]) AND deleted_at IS NULL
           ORDER BY id
           FOR UPDATE`,
          [legacyIds]
        );
        for (const r of legacyRows) legacyStock.set(Number(r.id), parseInt(r.stock, 10));
      }

      // Per-line validation on a running balance (duplicate lines of one
      // product see the stock left by the previous line, exactly like the
      // sequential loop did), building movement rows as we go.
      const mvtProduits: number[] = [];
      const mvtQuantites: number[] = [];
      const mvtAvant: number[] = [];
      const mvtApres: number[] = [];
      const deductSpl = new Map<number, number>();
      const deductLegacy = new Map<number, number>();
      for (const ligne of lignes) {
        const isLegacy = !splStock.has(ligne.produit_id);
        const balances = isLegacy ? legacyStock : splStock;
        const currentStock = balances.get(ligne.produit_id) ?? 0;
        if (currentStock < ligne.quantite) {
          throw businessError(422, `Stock insuffisant pour « ${await produitNom(client, ligne.produit_id)} » : ${currentStock} disponible(s) à cet emplacement, ${ligne.quantite} demandé(s).`);
        }
        balances.set(ligne.produit_id, currentStock - ligne.quantite);
        const deductions = isLegacy ? deductLegacy : deductSpl;
        deductions.set(ligne.produit_id, (deductions.get(ligne.produit_id) ?? 0) + ligne.quantite);
        mvtProduits.push(ligne.produit_id);
        mvtQuantites.push(-ligne.quantite);
        mvtAvant.push(currentStock);
        mvtApres.push(currentStock - ligne.quantite);
      }

      // Set-based deductions, race guard kept (quantite >= total demanded)
      if (deductSpl.size > 0) {
        const ids = [...deductSpl.keys()];
        const qtes = ids.map((id) => deductSpl.get(id)!);
        const { rows: updated } = await client.query(
          `UPDATE stock_par_location spl
           SET quantite = spl.quantite - v.qte
           FROM (SELECT unnest($1::int[]) AS pid, unnest($2::int[]) AS qte) v
           WHERE spl.produit_id = v.pid AND spl.location_id = $3 AND spl.quantite >= v.qte
           RETURNING spl.produit_id`,
          [ids, qtes, effectiveLocationId]
        );
        if (updated.length !== ids.length) {
          const ok = new Set(updated.map((r: any) => Number(r.produit_id)));
          const failed = ids.find((id) => !ok.has(id));
          throw businessError(422, `Stock insuffisant pour « ${await produitNom(client, failed!)} » : il vient d’être vendu depuis un autre poste. Vérifiez le stock et réessayez.`);
        }
      }
      if (deductLegacy.size > 0) {
        const ids = [...deductLegacy.keys()];
        const qtes = ids.map((id) => deductLegacy.get(id)!);
        const { rows: updated } = await client.query(
          `UPDATE produits p
           SET stock = p.stock - v.qte
           FROM (SELECT unnest($1::int[]) AS pid, unnest($2::int[]) AS qte) v
           WHERE p.id = v.pid AND p.stock >= v.qte
           RETURNING p.id`,
          [ids, qtes]
        );
        if (updated.length !== ids.length) {
          const ok = new Set(updated.map((r: any) => Number(r.id)));
          const failed = ids.find((id) => !ok.has(id));
          throw businessError(422, `Stock insuffisant pour « ${await produitNom(client, failed!)} » : il vient d’être vendu depuis un autre poste. Vérifiez le stock et réessayez.`);
        }
      }

      // One movement row per invoice line (committed with the facture)
      await client.query(
        `INSERT INTO mouvements_stock
           (produit_id, type_mouvement, quantite, stock_avant, stock_apres, raison, reference_liee, location_id)
         SELECT unnest($1::int[]), 'vente', unnest($2::int[]), unnest($3::int[]), unnest($4::int[]), $5, $6, $7`,
        [mvtProduits, mvtQuantites, mvtAvant, mvtApres, `Vente — facture ${numeroFacture}`, numeroFacture, effectiveLocationId]
      );

      // Batch insert invoice lines without tax, capturing purchase price
      await client.query(
        `INSERT INTO document_lignes (document_type, document_id, produit_id, quantite, prix_unitaire, total_ligne, prix_achat_unitaire)
         SELECT 'facture', $1, unnest($2::int[]), unnest($3::int[]), unnest($4::numeric[]), unnest($5::numeric[]), unnest($6::numeric[])`,
        [factureId, produitIds, quantities, prices, totals, purchasePrices]
      );

      // Customer ledger: debit entry for new invoice
      await client.query(
        `INSERT INTO compte_client_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'facture', $2, $3, $4, 0, $5, $6)`,
        [tiers_id, factureId, numeroFacture, total, notes || null, cree_par || null]
      );

      // Recompute FIFO allocation (also refreshes clients.solde_actuel)
      await ClientAllocationService.recomputeClientAllocations(tiers_id, { transaction: client });

      // Audit log inside transaction so it's atomic with the business event
      await client.query(
        `INSERT INTO audit_log
           (user_id, action, table_name, record_id, ip_address, user_agent, new_values)
         VALUES ($1, 'create', 'factures', $2, $3, $4, $5)`,
        [
          cree_par || null,
          factureId,
          (req as any)?.ip || null,
          (req as any)?.get?.('user-agent') || null,
          JSON.stringify({ numero_facture: numeroFacture, tiers_id, total }),
        ]
      );

      // Notifications temps réel — après le COMMIT et non bloquantes : une panne
      // de notification ne doit jamais annuler une vente déjà enregistrée.
      const afterCommit = () => {
        NotificationService.safely(() =>
          NotificationService.invoiceCreated({
            id: factureId,
            numero: numeroFacture,
            total,
            client_nom: clientRows[0].nom,
          })
        );
        NotificationService.safely(() => NotificationService.checkLowStock(produitIds));
      };

      return { result: { id: factureId, numero_facture: numeroFacture, total }, afterCommit };
    }
  }

  /**
   * Update invoice status. Only 'annulee' and 'en_attente' may be asked for:
   * 'payee' / 'partielle' derive from the payments.
   *
   * 'annulee' runs the full cancellation (see `annuler`): contra GL entries,
   * restock, client balance. 'en_attente' never revives a cancelled invoice
   * (its entries were reversed and its goods restocked) and never overrides a
   * paid status; on an unpaid invoice it is a no-op.
   */
  async updateStatut(id: number, statut: string, userId?: number, req?: any): Promise<boolean> {
    if (statut === 'payee' || statut === 'partielle') {
      throw businessError(
        400,
        'Le statut « payée » ou « partiellement payée » découle des paiements : il ne se choisit pas.'
      );
    }
    if (statut !== 'en_attente' && statut !== 'annulee') {
      throw businessError(400, 'Statut de facture inconnu.');
    }

    if (statut === 'annulee') {
      return (await this.annuler(id, userId, req)) !== null;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT numero_facture, statut, montant_paye FROM factures WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const facture = rows[0];
      if (facture.statut === 'annulee') {
        throw businessError(
          409,
          `La facture ${facture.numero_facture} est annulée : ses écritures ont été contre-passées et ses articles remis en stock. Établissez une nouvelle facture.`,
          'FACTURE_ANNULEE'
        );
      }
      if (parseFloat(facture.montant_paye) > 0) {
        throw businessError(
          409,
          `Le statut de la facture ${facture.numero_facture} découle de ses paiements : il ne se modifie pas à la main.`
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel an unpaid invoice (decision 2026-10-23: cancelling reverses its
   * accounting and restocks). One transaction, invoice row locked:
   *
   *  1. Refused (409) when anything is settled on it (payments, acompte
   *     applications, old-style acompte imputations, FIFO allocation), when a
   *     pending/approved return or an active avoir refers to it, or when it is
   *     already cancelled; refused (422 PERIOD_CLOSED) when the current
   *     accounting period is closed — the 075 trigger enforces the same thing
   *     on every contra line.
   *  2. Contra entries: every line the 072 trigger posted for the invoice
   *     (piece_type 'facture') is mirrored — same journal, account (compte_id
   *     AND compte_numero, whichever the posting carried), tiers, debit/credit
   *     swapped — dated today, libellé « Annulation facture FAC-… ». The
   *     invoice's net effect on every account is then zero.
   *  3. Restock with one mouvements_stock row per product: a counter invoice
   *     returns its own lines at its location; an invoice issued from delivery
   *     notes returns what those BLs delivered, at their location, and the BLs
   *     are cancelled with it (they cannot be cancelled again → no double
   *     restock). Inflows are costed at the sale-time unit cost (same rule as a
   *     client return), so cmp/valeur_stock stay consistent (076).
   *  4. Customer ledger credit line, FIFO recompute capped to the acompte money
   *     already counted (no deposit gets spent as a side effect), so the
   *     client's balance drops by the invoice total.
   *
   * Commissions need no write: payroll and the employee sheet already skip the
   * commissions of cancelled invoices (100).
   *
   * Returns null when the invoice does not exist (or is deleted).
   */
  async annuler(id: number, userId?: number, req?: any): Promise<FactureAnnulationResult | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: factRows } = await client.query(
        `SELECT id, numero_facture, statut, tiers_id, total, montant_paye, location_id, bl_id, devis_id
         FROM factures
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [id]
      );
      if (factRows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const facture = factRows[0];
      const numero: string = facture.numero_facture;

      if (facture.statut === 'annulee') {
        throw businessError(409, `La facture ${numero} est déjà annulée.`, 'FACTURE_DEJA_ANNULEE');
      }

      // Nothing may be settled on it: payment rows (direct or from an acompte),
      // pre-048 acompte imputations, or money the FIFO allocation put there.
      const { rows: paidRows } = await client.query(
        `SELECT
           COALESCE((SELECT SUM(montant) FROM paiements
                     WHERE facture_id = $1 AND deleted_at IS NULL), 0)
         + COALESCE((SELECT SUM(montant) FROM acomptes_clients
                     WHERE facture_id_applique = $1 AND statut = 'utilise' AND deleted_at IS NULL), 0) AS regle`,
        [id]
      );
      const regle = Math.max(
        roundMoney(parseFloat(paidRows[0].regle) || 0),
        roundMoney(parseFloat(facture.montant_paye) || 0)
      );
      if (regle > 0) {
        throw businessError(
          409,
          `Impossible d’annuler la facture ${numero} : ${formatMontantFcfa(regle)} y sont déjà réglés. Supprimez d’abord ses paiements, ou établissez un avoir.`,
          'FACTURE_REGLEE'
        );
      }

      const { rows: retourRows } = await client.query(
        `SELECT r.numero_retour
         FROM retours r
         WHERE r.statut IN ('en_attente', 'traite')
           AND EXISTS (SELECT 1 FROM retour_lignes rl WHERE rl.retour_id = r.id AND rl.facture_id = $1)
         ORDER BY r.id
         LIMIT 1`,
        [id]
      );
      if (retourRows[0]) {
        throw businessError(
          409,
          `Impossible d’annuler la facture ${numero} : le retour ${retourRows[0].numero_retour} la concerne. Annulez d’abord ce retour.`,
          'FACTURE_RETOUR_ACTIF'
        );
      }

      const { rows: avoirRows } = await client.query(
        `SELECT numero_avoir
         FROM factures_avoir
         WHERE (facture_origine_id = $1 OR facture_appliquee_id = $1)
           AND deleted_at IS NULL
           AND statut IS DISTINCT FROM 'annule'
         ORDER BY id
         LIMIT 1`,
        [id]
      );
      if (avoirRows[0]) {
        throw businessError(
          409,
          `Impossible d’annuler la facture ${numero} : l’avoir ${avoirRows[0].numero_avoir} la concerne. Annulez d’abord cet avoir.`,
          'FACTURE_AVOIR_ACTIF'
        );
      }

      // The contra entries are dated today: a closed current period refuses
      // them. Friendly check first; the 075 trigger stays the hard guarantee.
      try {
        await checkPeriodIsOpen(new Date(), client);
      } catch (err: any) {
        if (err?.code === 'PERIOD_CLOSED') throw this.periodClosedError(numero, err.message);
        throw err;
      }

      // Read before anything changes (see ClientAllocationService).
      const countedAcomptes = await ClientAllocationService.countedAcompteMoney(facture.tiers_id, client);

      const ecrituresContrePassees = await this.contrePasserEcritures(client, id, numero, userId);

      const restock = await this.remettreEnStock(client, facture);

      await client.query(
        `UPDATE factures
         SET statut = 'annulee', montant_paye = 0, remaining_due = 0, modifie_par = $2
         WHERE id = $1`,
        [id, userId ?? null]
      );

      await client.query(
        `INSERT INTO compte_client_lignes
           (tiers_id, type_operation, document_id, document_numero, montant_debit, montant_credit, notes, cree_par)
         VALUES ($1, 'ajustement', $2, $3, 0, $4, $5, $6)`,
        [facture.tiers_id, id, numero, facture.total, `Annulation facture ${numero}`, userId ?? null]
      );

      await ClientAllocationService.recomputeClientAllocations(facture.tiers_id, {
        transaction: client,
        userId: userId ?? null,
        acomptePoolCap: countedAcomptes,
      });

      const message = this.annulationMessage(numero, ecrituresContrePassees, restock);

      // Audit inside the transaction: atomic with the cancellation.
      await client.query(
        `INSERT INTO audit_log (user_id, action, table_name, record_id, ip_address, user_agent, old_values, new_values)
         VALUES ($1, 'cancel', 'factures', $2, $3, $4, $5, $6)`,
        [
          userId ?? null,
          id,
          req?.ip ?? null,
          req?.get?.('user-agent') ?? null,
          JSON.stringify({ statut: facture.statut }),
          JSON.stringify({
            statut: 'annulee',
            ecritures_contre_passees: ecrituresContrePassees,
            articles_remis_en_stock: restock.articles.map((a) => ({
              produit_id: a.produit_id,
              quantite: a.quantite,
              location_id: a.location_id,
            })),
            bons_livraison_annules: restock.bons_livraison.map((b) => b.numero_bl),
          }),
        ]
      );

      await client.query('COMMIT');

      logger.info({ factureId: id, ecrituresContrePassees, articles: restock.articles.length }, 'Invoice cancelled');

      return {
        id,
        numero_facture: numero,
        statut: 'annulee',
        ecritures_contre_passees: ecrituresContrePassees,
        articles_remis_en_stock: restock.articles,
        emplacements: restock.emplacements,
        bons_livraison_annules: restock.bons_livraison,
        message,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      // The 075 trigger fired (period closed between the check and the insert).
      if (err?.code === 'P0001' && /p[ée]riode comptable/i.test(String(err.message))) {
        const { rows } = await pool.query('SELECT numero_facture FROM factures WHERE id = $1', [id]);
        throw this.periodClosedError(rows[0]?.numero_facture ?? `n° ${id}`, err.message);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  private periodClosedError(numero: string, sourceMessage: string) {
    const periode = periodFromMessage(sourceMessage);
    return businessError(
      422,
      `Impossible d’annuler la facture ${numero} : la période comptable ${periode ?? 'en cours'} est clôturée, ses écritures ne peuvent pas être contre-passées.`,
      'PERIOD_CLOSED'
    );
  }

  /**
   * Mirror every GL line posted for the invoice: same journal, accounts and
   * tiers, debit and credit swapped, dated now. Copies compte_id AND
   * compte_numero as posted, so every report — whichever key it groups by —
   * nets the invoice to zero. Returns the number of contra lines written.
   */
  private async contrePasserEcritures(
    client: any,
    factureId: number,
    numero: string,
    userId?: number
  ): Promise<number> {
    const { rows } = await client.query(
      `INSERT INTO ecritures_comptables
         (numero_piece, date_ecriture, journal, piece_id, piece_type, ligne_numero,
          compte_id, compte_numero, debit, credit, libelle, tiers_id, reference_type, reference_id, cree_par)
       SELECT COALESCE(ec.numero_piece, $2), CURRENT_TIMESTAMP, ec.journal, ec.piece_id, ec.piece_type,
              m.max_ligne + ROW_NUMBER() OVER (ORDER BY ec.ligne_numero NULLS LAST, ec.id),
              ec.compte_id, ec.compte_numero, ec.credit, ec.debit, $3, ec.tiers_id,
              ec.reference_type, ec.reference_id, $4
       FROM ecritures_comptables ec
       CROSS JOIN (
         SELECT COALESCE(MAX(ligne_numero), 0) AS max_ligne
         FROM ecritures_comptables
         WHERE piece_type = 'facture' AND piece_id = $1
       ) m
       WHERE ec.piece_type = 'facture' AND ec.piece_id = $1
         AND (ec.debit <> 0 OR ec.credit <> 0)
       RETURNING id`,
      [factureId, numero, `Annulation facture ${numero}`, userId ?? null]
    );
    return rows.length;
  }

  /**
   * Put back in stock what the sale took out (see `annuler`, step 3).
   * Delivery-note sales: the BLs carried the stock-out, so their delivered
   * quantities return at their location and the BLs are cancelled.
   * Counter sales: the invoice lines return at the invoice's location.
   */
  private async remettreEnStock(
    client: any,
    facture: { id: number; numero_facture: string; location_id: number | null; bl_id: number | null; devis_id: number | null }
  ): Promise<{
    articles: FactureAnnulationResult['articles_remis_en_stock'];
    emplacements: FactureAnnulationResult['emplacements'];
    bons_livraison: FactureAnnulationResult['bons_livraison_annules'];
  }> {
    const numero = facture.numero_facture;
    const { rows: principalRows } = await client.query(
      'SELECT id FROM stock_locations WHERE est_principal = true AND actif = true ORDER BY id LIMIT 1'
    );
    const principalId: number | null = principalRows[0]?.id ?? null;

    // BLs of this sale: linked either way (factures.bl_id / bons_livraison.facture_id).
    let { rows: bls } = await client.query(
      `SELECT id, numero_bl, statut, location_id
       FROM bons_livraison
       WHERE deleted_at IS NULL AND (id = $2 OR facture_id = $1)
       ORDER BY id
       FOR UPDATE`,
      [facture.id, facture.bl_id]
    );
    // An invoice converted straight from its devis (devis.facture_id) bills the
    // devis' delivered BLs, which stay 'livre' and unlinked.
    if (bls.length === 0 && facture.devis_id) {
      const { rows: devisRows } = await client.query(
        'SELECT id FROM devis WHERE id = $1 AND facture_id = $2',
        [facture.devis_id, facture.id]
      );
      if (devisRows[0]) {
        ({ rows: bls } = await client.query(
          `SELECT id, numero_bl, statut, location_id
           FROM bons_livraison
           WHERE deleted_at IS NULL AND devis_id = $1 AND statut = 'livre'
           ORDER BY id
           FOR UPDATE`,
          [facture.devis_id]
        ));
      }
    }
    const delivered = bls.filter((b: any) => b.statut === 'livre' || b.statut === 'facture');

    const items: RestockItem[] = [];
    if (delivered.length > 0) {
      for (const bl of delivered) {
        const locationId = bl.location_id ?? facture.location_id ?? principalId;
        const { rows: lignes } = await client.query(
          `SELECT produit_id, COALESCE(NULLIF(quantite_livree, 0), quantite, 0) AS quantite
           FROM document_lignes
           WHERE document_type = 'bl' AND document_id = $1 AND produit_id IS NOT NULL`,
          [bl.id]
        );
        for (const l of lignes) {
          items.push({ produitId: Number(l.produit_id), locationId, quantite: Number(l.quantite) });
        }
      }
    } else {
      const locationId = facture.location_id ?? principalId;
      const { rows: lignes } = await client.query(
        `SELECT produit_id, quantite
         FROM document_lignes
         WHERE document_type = 'facture' AND document_id = $1 AND produit_id IS NOT NULL`,
        [facture.id]
      );
      for (const l of lignes) {
        items.push({ produitId: Number(l.produit_id), locationId: locationId as number, quantite: Number(l.quantite) });
      }
    }

    // One movement per product and location, in a stable lock order.
    const merged = new Map<string, RestockItem>();
    for (const item of items) {
      if (!(item.quantite > 0)) continue;
      if (item.locationId === null || item.locationId === undefined) {
        throw businessError(
          422,
          `Impossible d’annuler la facture ${numero} : aucun emplacement actif pour remettre ses articles en stock.`
        );
      }
      const key = `${item.produitId}:${item.locationId}`;
      const existing = merged.get(key);
      if (existing) existing.quantite += item.quantite;
      else merged.set(key, { ...item });
    }
    const toRestock = [...merged.values()].sort(
      (a, b) => a.produitId - b.produitId || a.locationId - b.locationId
    );

    // Sale-time unit cost recorded on the invoice lines (061), like a client return.
    const { rows: costRows } = await client.query(
      `SELECT produit_id,
              SUM(quantite * prix_achat_unitaire) / NULLIF(SUM(quantite), 0) AS cout
       FROM document_lignes
       WHERE document_type = 'facture' AND document_id = $1
         AND produit_id IS NOT NULL AND prix_achat_unitaire > 0
       GROUP BY produit_id`,
      [facture.id]
    );
    const costByProduit = new Map<number, number>(
      costRows.map((r: any) => [Number(r.produit_id), roundMoney(Number(r.cout))])
    );

    const blLabel = delivered.length > 0
      ? ` (${delivered.map((b: any) => b.numero_bl).join(', ')})`
      : '';
    for (const item of toRestock) {
      await applyStockMovement(client, {
        produitId: item.produitId,
        locationId: item.locationId,
        delta: item.quantite,
        unitCost: costByProduit.get(item.produitId) ?? null,
        type: 'vente',
        raison: `Annulation facture ${numero}${blLabel}`,
        reference: numero,
      });
    }

    if (delivered.length > 0) {
      await client.query(
        `UPDATE bons_livraison SET statut = 'annule', updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::int[])`,
        [delivered.map((b: any) => b.id)]
      );
    }

    const produitIds = [...new Set(toRestock.map((i) => i.produitId))];
    const locationIds = [...new Set(toRestock.map((i) => i.locationId))];
    const [{ rows: produitRows }, { rows: locationRows }] = await Promise.all([
      client.query('SELECT id, nom FROM produits WHERE id = ANY($1::int[])', [produitIds]),
      client.query('SELECT id, nom FROM stock_locations WHERE id = ANY($1::int[]) ORDER BY id', [locationIds]),
    ]);
    const produitNom = new Map<number, string>(produitRows.map((r: any) => [Number(r.id), r.nom]));
    const locationNom = new Map<number, string>(locationRows.map((r: any) => [Number(r.id), r.nom]));

    return {
      articles: toRestock.map((i) => ({
        produit_id: i.produitId,
        produit_nom: produitNom.get(i.produitId) ?? `n° ${i.produitId}`,
        quantite: i.quantite,
        location_id: i.locationId,
        location_nom: locationNom.get(i.locationId) ?? `n° ${i.locationId}`,
      })),
      emplacements: locationIds.map((lid) => ({ id: lid, nom: locationNom.get(lid) ?? `n° ${lid}` })),
      bons_livraison: delivered.map((b: any) => ({ id: Number(b.id), numero_bl: b.numero_bl })),
    };
  }

  /**
   * « Facture FAC-… annulée : écritures contre-passées, articles remis en stock
   * à Hitek Plateau. » (+ « Bon de livraison BL-… annulé. » for a BL sale).
   */
  private annulationMessage(
    numero: string,
    ecritures: number,
    restock: { emplacements: Array<{ nom: string }>; bons_livraison: Array<{ numero_bl: string }>; articles: unknown[] }
  ): string {
    const gl = ecritures > 0 ? 'écritures contre-passées' : 'aucune écriture à contre-passer';
    const lieux = restock.emplacements.map((e) => e.nom);
    const stock = restock.articles.length > 0
      ? `articles remis en stock à ${lieux.length > 1 ? `${lieux.slice(0, -1).join(', ')} et ${lieux[lieux.length - 1]}` : lieux[0]}`
      : 'aucun article à remettre en stock';
    let message = `Facture ${numero} annulée : ${gl}, ${stock}.`;
    const bls = restock.bons_livraison.map((b) => b.numero_bl);
    if (bls.length === 1) message += ` Le bon de livraison ${bls[0]} est annulé.`;
    else if (bls.length > 1) message += ` Les bons de livraison ${bls.join(', ')} sont annulés.`;
    return message;
  }

  /**
   * Soft delete invoice with optional stock restoration.
   *
   * The restock now writes its mouvements_stock rows (it used to change stock
   * silently) and is skipped for an invoice whose cancellation already put its
   * goods back — deleting a cancelled invoice with restaurer_stock=true no
   * longer restocks twice.
   */
  async delete(id: number, restaurerStock: boolean = false, userId?: number, req?: any): Promise<boolean> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: factureRows } = await client.query(
        'SELECT numero_facture, statut, tiers_id, location_id FROM factures WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (factureRows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      const clientId = factureRows[0].tiers_id;
      const numero: string = factureRows[0].numero_facture;

      let alreadyRestocked = false;
      if (restaurerStock && factureRows[0].statut === 'annulee') {
        const { rows } = await client.query(
          `SELECT 1 FROM mouvements_stock
           WHERE reference_liee = $1 AND quantite > 0 AND raison LIKE 'Annulation facture%'
           LIMIT 1`,
          [numero]
        );
        alreadyRestocked = rows.length > 0;
      }

      if (restaurerStock && !alreadyRestocked) {
        const { rows: locationRows } = await client.query(
          'SELECT COALESCE($1::int, (SELECT id FROM stock_locations WHERE est_principal = true AND actif = true ORDER BY id LIMIT 1)) as effective_location_id',
          [factureRows[0].location_id]
        );
        const effectiveLocationId = locationRows[0]?.effective_location_id;

        const { rows: lignesRows } = await client.query(
          `SELECT produit_id, SUM(quantite)::int AS quantite
           FROM document_lignes
           WHERE document_type = 'facture' AND document_id = $1 AND produit_id IS NOT NULL
           GROUP BY produit_id
           ORDER BY produit_id`,
          [id]
        );

        for (const ligne of lignesRows) {
          if (!(Number(ligne.quantite) > 0) || !effectiveLocationId) continue;
          await applyStockMovement(client, {
            produitId: Number(ligne.produit_id),
            locationId: Number(effectiveLocationId),
            delta: Number(ligne.quantite),
            unitCost: null,
            type: 'vente',
            raison: `Suppression facture ${numero}`,
            reference: numero,
          });
        }
      }

      await client.query('UPDATE factures SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

      // Recompute FIFO allocation for this client (deleted invoice releases its allocation)
      await ClientAllocationService.recomputeClientAllocations(clientId, { transaction: client });

      await client.query('COMMIT');

      if (userId) {
        await logAudit({
          utilisateur_id: userId,
          action: 'delete',
          table_name: 'factures',
          record_id: id,
          req,
        });
      }

      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get dashboard stats
   */
  async getStats(): Promise<any> {
    const { rows: totalFactures } = await pool.query(
      'SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as montant FROM factures WHERE statut != $1 AND deleted_at IS NULL',
      ['annulee']
    );
    const { rows: facturesMois } = await pool.query(
      'SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as montant FROM factures WHERE EXTRACT(MONTH FROM date_facture) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM date_facture) = EXTRACT(YEAR FROM CURRENT_DATE) AND statut != $1 AND deleted_at IS NULL',
      ['annulee']
    );

    return {
      total_factures: totalFactures[0],
      factures_mois: facturesMois[0],
    };
  }

  /**
   * Get revenue trends
   */
  async getRevenueTrends(days: number = 30): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT
        DATE(date_facture)::date as date,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as total
       FROM factures
       WHERE statut != 'annulee' AND deleted_at IS NULL
         AND date_facture >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY DATE(date_facture)
       ORDER BY date ASC`,
      [days]
    );
    return rows;
  }

  /**
   * Get top selling products
   */
  async getTopProducts(limit: number = 5): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT
        p.id,
        p.nom,
        p.reference,
        SUM(dl.quantite) as total_quantite,
        SUM(dl.total_ligne) as total_ventes
       FROM document_lignes dl
       LEFT JOIN produits p ON dl.produit_id = p.id
       WHERE dl.document_type = 'facture'
       GROUP BY p.id, p.nom, p.reference
       ORDER BY total_quantite DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }

  /**
   * Get top clients by spending
   */
  async getTopClients(limit: number = 5): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT
        t.raison_sociale as nom,
        t.prenom,
        COUNT(f.id) as nombre_factures,
        COALESCE(SUM(f.total), 0) as total_depenses
       FROM factures f
       LEFT JOIN tiers t ON f.tiers_id = t.id
       WHERE f.statut != 'annulee' AND f.deleted_at IS NULL
       GROUP BY t.id, t.raison_sociale, t.prenom
       ORDER BY total_depenses DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }
}

export const factureService = new FactureService();
