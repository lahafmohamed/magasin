import { Request, Response } from 'express';
import { consoleError as loggerError } from '../utils/logError';
import pool from '../db/connection';
import { produitService } from '../services/ProduitService';
import {
  buildMagasinProductsQuery,
  isMagasinLocationId,
  getDefaultMagasinLocationId,
  SALES_DEPOT_ERROR_MESSAGE,
} from '../services/StockMagasinService';
import { successResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../middleware/audit';
import { parsePagination } from '../utils/pagination';

/** `produits` carries two UNIQUE columns — name the offending one. */
function uniqueViolationMessage(error: { constraint?: string }): string {
  if (error.constraint?.includes('code_barre')) {
    return 'Ce code-barres est déjà attribué à un autre produit';
  }
  return 'Cette référence existe déjà';
}

export class ProduitController {

  /**
   * GET /api/produits/ventes
   * Magasin-only product picker for Factures and Devis forms.
   * Dépôt rows are excluded at SQL level. If a location_id is provided,
   * it MUST be a magasin or the request is rejected with 422.
   */
  static async getAllVentes(req: Request, res: Response): Promise<void> {
    try {
      const { search, categorie, location_id } = req.query;
      const locationId = location_id ? parseInt(location_id as string, 10) : undefined;

      if (location_id !== undefined && Number.isNaN(locationId)) {
        res.status(400).json({ success: false, error: 'Location ID invalide' });
        return;
      }

      if (locationId !== undefined) {
        const ok = await isMagasinLocationId(locationId);
        if (!ok) {
          res.status(422).json({ success: false, error: SALES_DEPOT_ERROR_MESSAGE });
          return;
        }
      } else {
        // Surface a clear error if no magasin is configured at all.
        try {
          await getDefaultMagasinLocationId();
        } catch (err: any) {
          loggerError('GET /api/produits/ventes (magasin par défaut)', err);
          res.status(500).json({ success: false, error: 'Erreur serveur' });
          return;
        }
      }

      const { page, limit, sort, order } = parsePagination(req.query, { sort: 'nom', order: 'ASC' });

      const { sql, params } = buildMagasinProductsQuery({
        search: search ? String(search) : undefined,
        categorie: categorie ? String(categorie) : undefined,
        locationId,
      });

      const ALLOWED_SORT: Record<string, string> = {
        nom: 'p.nom',
        reference: 'p.reference',
        categorie: 'p.categorie',
        prix_vente: 'p.prix_vente',
        stock: 'stock',
        created_at: 'p.created_at',
      };
      const sortColumn = ALLOWED_SORT[String(sort)] || 'p.nom';
      const sortOrder = String(order).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      const offset = (page - 1) * limit;

      const dataSql = `${sql} ORDER BY ${sortColumn} ${sortOrder} LIMIT ${limit} OFFSET ${offset}`;
      const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS picker`;

      const [dataResult, countResult] = await Promise.all([
        pool.query(dataSql, params),
        pool.query(countSql, params),
      ]);

      const total = parseInt(countResult.rows[0].total, 10);
      res.json(
        successResponse(dataResult.rows, undefined, {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        }),
      );
    } catch (error: any) {
      loggerError('GET /api/produits/ventes', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * GET /api/produits/ventes/locations
   * Magasin-only locations for the Ventes location selector.
   */
  static async getVentesLocations(_req: Request, res: Response): Promise<void> {
    try {
      const { rows } = await pool.query(
        `SELECT id, code, nom, est_principal
         FROM stock_locations
         WHERE actif = true
           AND NOT (
             UPPER(code) LIKE 'DEPOT%'
             OR UPPER(nom) LIKE '%DÉPÔT%'
             OR UPPER(nom) LIKE '%DEPOT%'
           )
         ORDER BY est_principal DESC, id ASC`,
      );
      res.json(successResponse(rows));
    } catch (error: any) {
      loggerError('GET /api/produits/ventes/locations', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { search, categorie, low_stock, location_id } = req.query;
      const locationId = location_id ? parseInt(location_id as string, 10) : undefined;

      if (location_id && Number.isNaN(locationId)) {
        res.status(400).json({ success: false, error: 'Location ID invalide' });
        return;
      }

      const { page, limit, sort, order } = parsePagination(req.query, { sort: 'nom', order: 'ASC' });
      const result = await produitService.getAll(
        search as string,
        categorie as string,
        low_stock === 'true',
        { page, limit, sort, order },
        locationId
      );
      res.json(successResponse(result.data, undefined, result.pagination));
    } catch (error: any) {
      if (error?.message === 'Depot invalide ou inactif') {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      loggerError('GET /api/produits', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const produit = await produitService.findById(parseInt(req.params.id));
      if (!produit) {
        res.status(404).json({ success: false, error: 'Produit non trouvé' });
        return;
      }
      res.json(successResponse(produit));
    } catch (error) {
      loggerError('GET /api/produits/:id', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthRequest;
      const produit = await produitService.create({
        ...req.body,
        cree_par: authReq.user?.id,
      });

      await logAudit({
        utilisateur_id: authReq.user?.id || null,
        action: 'create',
        table_name: 'produits',
        record_id: produit.id,
        req,
        new_values: produit,
      });

      res.status(201).json(successResponse(produit, 'Produit créé'));
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(400).json({ success: false, error: uniqueViolationMessage(error) });
        return;
      }
      if (error.message === 'Depot invalide ou inactif' || error.message === 'Stock initial invalide') {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      loggerError('POST /api/produits', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthRequest;
      if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({ success: false, error: 'Aucun champ à mettre à jour' });
        return;
      }
      const produit = await produitService.update(parseInt(req.params.id), {
        ...req.body,
        modifie_par: authReq.user?.id,
      });

      if (!produit) {
        res.status(404).json({ success: false, error: 'Produit non trouvé' });
        return;
      }

      await logAudit({
        utilisateur_id: authReq.user?.id || null,
        action: 'update',
        table_name: 'produits',
        record_id: produit.id,
        req,
        new_values: req.body,
      });

      res.json(successResponse(produit, 'Produit modifié'));
    } catch (error: any) {
      if (error.message === 'Aucun champ à mettre à jour') {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      if (error.code === '23505') {
        res.status(400).json({ success: false, error: uniqueViolationMessage(error) });
        return;
      }
      loggerError('PUT /api/produits/:id', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const deleted = await produitService.softDelete(id);

      if (!deleted) {
        res.status(404).json({ success: false, error: 'Produit non trouvé' });
        return;
      }

      await logAudit({
        utilisateur_id: (req as AuthRequest).user?.id || null,
        action: 'delete',
        table_name: 'produits',
        record_id: id,
        req,
      });

      res.json(successResponse(null, 'Produit supprimé'));
    } catch (error: any) {
      if (error.code === '23503') {
        res.status(400).json({ success: false, error: 'Ce produit est lié à des factures' });
        return;
      }
      loggerError('DELETE /api/produits/:id', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async adjustStock(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { quantite, location_id } = req.body;
      const result = await produitService.adjustStock(id, quantite, location_id);

      if (!result) {
        res.status(404).json({ success: false, error: 'Produit non trouvé' });
        return;
      }

      await logAudit({
        utilisateur_id: (req as AuthRequest).user?.id || null,
        action: 'update',
        table_name: 'produits',
        record_id: id,
        req,
        new_values: { stock: result.stock, quantite, location_id: location_id || null },
      });

      res.json(successResponse(result, 'Stock mis à jour'));
    } catch (error: any) {
      if (error.message === 'Depot invalide ou inactif' || error.message.startsWith('Stock insuffisant')) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      loggerError('PATCH /api/produits/:id/stock', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getStockValuation(req: Request, res: Response): Promise<void> {
    try {
      const data = await produitService.getStockValuation();
      res.json(successResponse(data));
    } catch (error) {
      loggerError('GET /api/produits/stock-valuation', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getStockByCategory(req: Request, res: Response): Promise<void> {
    try {
      const data = await produitService.getStockByCategory();
      res.json(successResponse(data));
    } catch (error) {
      loggerError('GET /api/produits/stock-by-category', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getAlertesStock(req: Request, res: Response): Promise<void> {
    try {
      const { page, limit } = parsePagination(req.query);
      const result = await produitService.getAll(undefined, undefined, true, { page, limit, sort: 'p.nom', order: 'ASC' });
      successResponse(res, result.data, undefined, result.pagination);
    } catch (error) {
      loggerError('GET /api/produits/alertes-stock', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getReorderSuggestions(_req: Request, res: Response): Promise<void> {
    try {
      const data = await produitService.getReorderSuggestions();
      res.json(successResponse(data));
    } catch (error) {
      loggerError('GET /api/produits/reorder-suggestions', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async getStockHistory(req: Request, res: Response): Promise<void> {
    try {
      const data = await produitService.getStockHistory(parseInt(req.params.id), parseInt(req.query.limit as string) || 50);
      res.json(successResponse(data));
    } catch (error) {
      loggerError('GET /api/produits/:id/mouvements', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  static async addStockMovement(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { type_mouvement, quantite, location_id, raison, reference_liee } = req.body;
      // NOTE: service signature is (produitId, type, quantite, locationId?, raison?, reference_liee?)
      const result = await produitService.addStockMovement(id, type_mouvement, quantite, location_id, raison, reference_liee);

      if (!result) {
        res.status(404).json({ success: false, error: 'Produit non trouvé' });
        return;
      }

      await logAudit({
        utilisateur_id: (req as AuthRequest).user?.id || null,
        action: 'update',
        table_name: 'produits',
        record_id: id,
        req,
        new_values: { type_mouvement, quantite },
      });

      res.status(201).json(successResponse(result, 'Mouvement enregistré'));
    } catch (error) {
      loggerError('POST /api/produits/:id/mouvements', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * GET /api/produits/:id/info-achat
   * Returns supplier info, purchase prices, and top buyer for a product.
   */
  static async getPurchaseInfo(req: Request, res: Response): Promise<void> {
    try {
      const productId = parseInt(req.params.id, 10);
      if (!productId) {
        res.status(400).json({ success: false, error: 'ID produit invalide' });
        return;
      }

      // 1. Default supplier + purchase price from product record
      const supplierResult = await pool.query(
        `SELECT t.id, t.raison_sociale, t.telephone, t.email, p.prix_achat
         FROM produits p
         LEFT JOIN tiers t ON p.fournisseur_id = t.id
         WHERE p.id = $1 AND p.deleted_at IS NULL`,
        [productId],
      );

      if (supplierResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Produit non trouvé' });
        return;
      }

      const defaultSupplier = supplierResult.rows[0];

      // Queries 2-6 are independent of each other (only keyed on productId) and
      // run after the existence check above — fire them in parallel rather than
      // as six sequential round-trips.
      const [
        priceStatsResult,
        recentPurchaseResult,
        purchaseHistoryResult,
        orderHistoryResult,
        topBuyerResult,
      ] = await Promise.all([
        // 2. Purchase price stats (min, max, avg, count)
        pool.query(
          `SELECT COUNT(*)::int as total_achats,
                  MIN(prix_unitaire) as prix_min,
                  MAX(prix_unitaire) as prix_max,
                  ROUND(AVG(prix_unitaire), 0)::numeric(15,0) as prix_moyen
           FROM (
             SELECT ffl.prix_unitaire
             FROM facture_fournisseur_lignes ffl
             JOIN factures_fournisseur ff ON ffl.facture_id = ff.id AND ff.statut != 'annulee'
             WHERE ffl.produit_id = $1
             UNION ALL
             SELECT cl.prix_unitaire
             FROM commande_lignes cl
             JOIN commandes_fournisseur cf ON cl.commande_id = cf.id AND cf.statut NOT IN ('annulee')
             WHERE cl.produit_id = $1
           ) all_prices`,
          [productId],
        ),
        // 3. Most recent actual purchase price (from supplier invoices or orders)
        pool.query(
          `SELECT prix_unitaire, fournisseur_nom, source, date_achat FROM (
             SELECT ffl.prix_unitaire, t.raison_sociale as fournisseur_nom,
                    'facture' as source, ff.date_facture as date_achat
             FROM facture_fournisseur_lignes ffl
             JOIN factures_fournisseur ff ON ffl.facture_id = ff.id AND ff.statut != 'annulee'
             LEFT JOIN tiers t ON ff.tiers_id = t.id
             WHERE ffl.produit_id = $1
             UNION ALL
             SELECT cl.prix_unitaire, t.raison_sociale as fournisseur_nom,
                    'commande' as source, cf.date_commande as date_achat
             FROM commande_lignes cl
             JOIN commandes_fournisseur cf ON cl.commande_id = cf.id AND cf.statut NOT IN ('annulee')
             LEFT JOIN tiers t ON cf.tiers_id = t.id
             WHERE cl.produit_id = $1
           ) combined
           ORDER BY date_achat DESC
           LIMIT 1`,
          [productId],
        ),
        // 4a. Purchase history from supplier invoices
        pool.query(
          `SELECT ff.numero_facture_fournisseur, ff.date_facture,
                  ffl.prix_unitaire, ffl.quantite,
                  t.raison_sociale as fournisseur_nom
           FROM facture_fournisseur_lignes ffl
           JOIN factures_fournisseur ff ON ffl.facture_id = ff.id
             AND ff.statut != 'annulee'
           LEFT JOIN tiers t ON ff.tiers_id = t.id
           WHERE ffl.produit_id = $1
           ORDER BY ff.date_facture DESC
           LIMIT 10`,
          [productId],
        ),
        // 4b. Also from commandes_fournisseur for additional purchase history
        pool.query(
          `SELECT cl.prix_unitaire, cl.quantite,
                  cf.numero_commande, cf.date_commande,
                  t.raison_sociale as fournisseur_nom
           FROM commande_lignes cl
           JOIN commandes_fournisseur cf ON cl.commande_id = cf.id
             AND cf.statut NOT IN ('annulee')
           LEFT JOIN tiers t ON cf.tiers_id = t.id
           WHERE cl.produit_id = $1
           ORDER BY cf.date_commande DESC
           LIMIT 10`,
          [productId],
        ),
        // 5. Top buyer (client who buys this product the most)
        pool.query(
          `SELECT t.id, t.raison_sociale, t.prenom, t.telephone,
                  SUM(dl.quantite)::int as total_quantite,
                  SUM(dl.total_ligne) as total_depense,
                  COUNT(DISTINCT f.id) as nombre_factures
           FROM document_lignes dl
           JOIN factures f ON dl.document_id = f.id
             AND f.deleted_at IS NULL AND f.statut != 'annulee'
           JOIN tiers t ON f.tiers_id = t.id
           WHERE dl.document_type = 'facture' AND dl.produit_id = $1
           GROUP BY t.id, t.raison_sociale, t.prenom, t.telephone
           ORDER BY total_quantite DESC
           LIMIT 1`,
          [productId],
        ),
      ]);

      const recentPurchase = recentPurchaseResult.rows[0];
      const priceStats = priceStatsResult.rows[0];

      res.json(
        successResponse({
          default_supplier: defaultSupplier.raison_sociale
            ? { id: defaultSupplier.id, raison_sociale: defaultSupplier.raison_sociale, telephone: defaultSupplier.telephone, email: defaultSupplier.email }
            : null,
          prix_achat: parseFloat(defaultSupplier.prix_achat) || 0,
          price_stats: priceStats?.total_achats > 0
            ? {
                total_achats: priceStats.total_achats,
                prix_min: parseFloat(priceStats.prix_min) || 0,
                prix_max: parseFloat(priceStats.prix_max) || 0,
                prix_moyen: parseFloat(priceStats.prix_moyen) || 0,
              }
            : null,
          recent_purchase: recentPurchase
            ? {
                prix_unitaire: parseFloat(recentPurchase.prix_unitaire) || 0,
                fournisseur: recentPurchase.fournisseur_nom,
                source: recentPurchase.source,
                date: recentPurchase.date_achat,
              }
            : null,
          purchase_history: purchaseHistoryResult.rows.map((r) => ({
            fournisseur: r.fournisseur_nom,
            numero: r.numero_facture_fournisseur,
            date: r.date_facture,
            prix_unitaire: parseFloat(r.prix_unitaire) || 0,
            quantite: r.quantite,
          })),
          order_history: orderHistoryResult.rows.map((r) => ({
            fournisseur: r.fournisseur_nom,
            numero: r.numero_commande,
            date: r.date_commande,
            prix_unitaire: parseFloat(r.prix_unitaire) || 0,
            quantite: r.quantite,
          })),
          top_buyer: topBuyerResult.rows[0]
            ? {
                id: topBuyerResult.rows[0].id,
                raison_sociale: topBuyerResult.rows[0].raison_sociale,
                prenom: topBuyerResult.rows[0].prenom,
                telephone: topBuyerResult.rows[0].telephone,
                total_quantite: parseInt(topBuyerResult.rows[0].total_quantite) || 0,
                total_depense: parseFloat(topBuyerResult.rows[0].total_depense) || 0,
                nombre_factures: parseInt(topBuyerResult.rows[0].nombre_factures) || 0,
              }
            : null,
        }),
      );
    } catch (error: any) {
      loggerError('GET /api/produits/:id/info-achat', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * GET /api/produits/search/fuzzy
   * Fuzzy search with similarity scoring
   */
  static async searchFuzzy(req: Request, res: Response): Promise<void> {
    try {
      const { q, limit, threshold } = req.query;
      const results = await produitService.searchFuzzy(
        q as string,
        limit ? parseInt(limit as string, 10) : 10,
        threshold ? parseFloat(threshold as string) : 0.1
      );
      res.json(successResponse(results));
    } catch (error) {
      loggerError('GET /api/produits/search/fuzzy', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * GET /api/produits/suggestions
   * Quick autocomplete suggestions
   */
  static async getSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const { q, limit } = req.query;
      const results = await produitService.getSuggestions(
        q as string,
        limit ? parseInt(limit as string, 10) : 5
      );
      res.json(successResponse(results));
    } catch (error) {
      loggerError('GET /api/produits/suggestions', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}
