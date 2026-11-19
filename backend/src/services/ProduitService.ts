import pool from '../db/connection';
import { BaseService, PaginatedResult, PaginationParams } from './BaseService';
import { applyStockMovement, costedStockIn, StockMovementType } from './StockCostingService';
import { businessError } from '../utils/errors';

/** What a recorded stock movement reports back (stock = at that location). */
export interface StockMovementOutcome {
  produit_id: number;
  produit_nom: string;
  location_id: number;
  location_nom: string;
  stock_avant: number;
  /** Stock at `location_id` after the movement. */
  stock: number;
  mouvement_id: number;
}

export interface ProduitRecord {
  id: number;
  reference: string;
  nom: string;
  code_barre: string | null;
  description: string | null;
  categorie: string | null;
  prix_achat: string;
  prix_vente: string;
  stock: number;
  stock_min: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateProduitInput {
  reference: string;
  nom: string;
  code_barre?: string;
  description?: string;
  categorie?: string;
  prix_achat: number;
  prix_vente: number;
  stock?: number;
  stock_min?: number;
  fournisseur_id?: number;
  location_id?: number;
  initial_stock?: number;
  cree_par?: number;
}

export interface UpdateProduitInput {
  reference?: string;
  nom?: string;
  code_barre?: string | null;
  description?: string;
  categorie?: string;
  prix_achat?: number;
  prix_vente?: number;
  stock?: number;
  stock_min?: number;
  fournisseur_id?: number | null;
  modifie_par?: number;
}

/**
 * `produits.code_barre` is UNIQUE, so a blank barcode must land as NULL —
 * two products saved with '' would collide on the constraint.
 */
function normalizeCodeBarre(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Shared with ProduitController, which maps it to 400/422. */
export const EMPLACEMENT_INVALIDE = 'Emplacement invalide ou inactif.';

export class ProduitService extends BaseService<ProduitRecord> {
  protected tableName = 'produits';
  protected selectColumns = 'id, reference, nom, code_barre, description, categorie, prix_achat, prix_vente, stock, stock_min, fournisseur_id, created_at, updated_at';
  protected defaultSortColumn = 'nom';
  protected allowedSortColumns = ['nom', 'reference', 'categorie', 'prix_vente', 'stock', 'created_at'];

  /**
   * Get paginated products with optional filters
   * Uses stock_par_location for stock calculations
   */
  async getAll(
    search?: string,
    categorie?: string,
    lowStock?: boolean,
    pagination: PaginationParams = { page: 1, limit: 20, sort: 'p.nom', order: 'ASC' },
    locationId?: number
  ): Promise<PaginatedResult<ProduitRecord>> {
    if (locationId !== undefined) {
      const { rows: locationRows } = await pool.query(
        'SELECT id FROM stock_locations WHERE id = $1 AND actif = true LIMIT 1',
        [locationId]
      );

      if (!locationRows[0]) {
        throw new Error(EMPLACEMENT_INVALIDE);
      }
    }

    const locationFilterJoin = locationId !== undefined
      ? ' AND spl.location_id = $1'
      : '';

    let baseQuery = `
      FROM produits p
      LEFT JOIN stock_par_location spl ON p.id = spl.produit_id${locationFilterJoin}
      LEFT JOIN stock_locations sl ON spl.location_id = sl.id AND sl.actif = true
      WHERE p.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (locationId !== undefined) {
      params.push(locationId);
    }

    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean);
      for (const word of words) {
        const pattern = `%${word}%`;
        const n = params.length;
        baseQuery += ` AND (p.nom ILIKE $${n + 1} OR p.reference ILIKE $${n + 2} OR COALESCE(p.categorie,'') ILIKE $${n + 3} OR COALESCE(p.description,'') ILIKE $${n + 4} OR COALESCE(p.code_barre,'') = $${n + 5})`;
        params.push(pattern, pattern, pattern, pattern, word);
      }
    }

    if (categorie) {
      baseQuery += ' AND p.categorie = $' + (params.length + 1);
      params.push(categorie);
    }

    // Per-location low stock counts only the products carried at that location
    // (a stock_par_location row exists there). The LEFT JOIN otherwise turned
    // every product never stocked at a depot into « 0 ≤ minimum »: a dépôt
    // dashboard listed the whole catalogue as low stock.
    const havingClause = lowStock
      ? locationId !== undefined
        ? ' HAVING COUNT(spl.id) > 0 AND COALESCE(SUM(spl.quantite), 0) <= p.stock_min'
        : ' HAVING COALESCE(SUM(spl.quantite), 0) <= p.stock_min'
      : '';

    // `stocke_ici`: the product is carried at the filtered location (a
    // stock_par_location row exists there, even at 0) — the UI says « Non
    // stocké ici » instead of a red « Rupture » for a product the location
    // never had. Without a location: carried somewhere.
    const dataQuery = `
      SELECT p.id, p.reference, p.nom, p.code_barre, p.description, p.categorie,
             p.prix_achat, p.prix_vente,
             COALESCE(SUM(spl.quantite), 0)::integer as stock,
             (COUNT(spl.id) > 0) AS stocke_ici,
             p.stock_min, p.created_at, p.updated_at
      ${baseQuery}
      GROUP BY p.id
      ${havingClause}
    `;

    // The low-stock filter lives in HAVING, so the count must group exactly
    // like the data query. COUNT(DISTINCT p.id) over the bare WHERE counted the
    // whole catalogue (U-10: « 40 produits sous leur stock minimum » for 3).
    const countQuery = lowStock
      ? `SELECT COUNT(*) as total FROM (SELECT p.id ${baseQuery} GROUP BY p.id ${havingClause}) low_stock_products`
      : `SELECT COUNT(DISTINCT p.id) as total ${baseQuery}`;

    // Handle sorting — whitelist to prevent SQL injection
    const ALLOWED_SORT = ['nom', 'reference', 'categorie', 'prix_vente', 'stock', 'created_at'];
    const rawSort = (pagination.sort || 'nom').replace(/^p\./, '');
    const safeSortColumn = ALLOWED_SORT.includes(rawSort) ? `p.${rawSort}` : 'p.nom';
    const safeSortOrder = pagination.order === 'DESC' ? 'DESC' : 'ASC';
    const safeLimit = Number.isFinite(pagination.limit) ? Math.max(1, Math.min(1000, Math.trunc(pagination.limit))) : 50;
    const safePage = Number.isFinite(pagination.page) ? Math.max(1, Math.trunc(pagination.page)) : 1;
    const safeOffset = (safePage - 1) * safeLimit;

    const finalDataQuery = `${dataQuery} ORDER BY ${safeSortColumn} ${safeSortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(finalDataQuery, [...params, safeLimit, safeOffset]),
      pool.query(countQuery, params)
    ]);

    const total = parseInt(countResult.rows[0].total);

    return {
      data: dataResult.rows,
      pagination: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit)
      }
    };
  }

  /**
   * Create a new product
   */
  async create(input: CreateProduitInput): Promise<ProduitRecord> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const requestedInitialStock = input.initial_stock ?? input.stock ?? 0;
      if (requestedInitialStock < 0) {
        throw new Error('Stock initial invalide');
      }

      let effectiveLocationId: number | null = null;

      if (input.location_id !== undefined) {
        const { rows: locationRows } = await client.query(
          'SELECT id FROM stock_locations WHERE id = $1 AND actif = true LIMIT 1',
          [input.location_id]
        );

        if (!locationRows[0]) {
          throw new Error(EMPLACEMENT_INVALIDE);
        }

        effectiveLocationId = locationRows[0].id;
      } else if (requestedInitialStock > 0) {
        try {
          const { rows: principalRows } = await client.query(
            'SELECT id FROM stock_locations WHERE est_principal = true AND actif = true LIMIT 1'
          );
          if (principalRows[0]) {
            effectiveLocationId = principalRows[0].id;
          }
        } catch (error: any) {
          if (error?.code !== '42P01' && error?.code !== '42703') {
            throw error;
          }
        }
      }

      const initialProductStock = effectiveLocationId ? 0 : requestedInitialStock;

      const { rows: insertRows } = await client.query(
        `INSERT INTO produits (reference, nom, code_barre, description, categorie, prix_achat, prix_vente, stock, stock_min, fournisseur_id, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          input.reference,
          input.nom,
          normalizeCodeBarre(input.code_barre),
          input.description || null,
          input.categorie || null,
          input.prix_achat,
          input.prix_vente,
          initialProductStock,
          input.stock_min ?? 5,
          input.fournisseur_id ?? null,
          input.cree_par || null,
        ]
      );

      const createdProduct = insertRows[0];

      if (effectiveLocationId && requestedInitialStock > 0) {
        // Costed stock-in: initial stock valued at the product's purchase price
        // (was: bare upsert leaving cmp=0 -> stock valued at zero until first reception).
        await costedStockIn(client, {
          produitId: createdProduct.id,
          locationId: effectiveLocationId,
          quantite: requestedInitialStock,
          unitCost: input.prix_achat != null && input.prix_achat > 0 ? input.prix_achat : null,
        });
      }

      const { rows: finalRows } = await client.query('SELECT * FROM produits WHERE id = $1', [createdProduct.id]);

      await client.query('COMMIT');

      return finalRows[0] || createdProduct;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update a product
   */
  async update(id: number, input: UpdateProduitInput): Promise<ProduitRecord | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (input.reference !== undefined) { fields.push(`reference = $${paramIndex++}`); params.push(input.reference); }
    if (input.nom !== undefined) { fields.push(`nom = $${paramIndex++}`); params.push(input.nom); }
    if (input.code_barre !== undefined) { fields.push(`code_barre = $${paramIndex++}`); params.push(normalizeCodeBarre(input.code_barre)); }
    if (input.description !== undefined) { fields.push(`description = $${paramIndex++}`); params.push(input.description || null); }
    if (input.categorie !== undefined) { fields.push(`categorie = $${paramIndex++}`); params.push(input.categorie || null); }
    if (input.prix_achat !== undefined) { fields.push(`prix_achat = $${paramIndex++}`); params.push(input.prix_achat); }
    if (input.prix_vente !== undefined) { fields.push(`prix_vente = $${paramIndex++}`); params.push(input.prix_vente); }
    // stock is intentionally excluded: use adjustStock() or the reception flow
    if (input.stock_min !== undefined) { fields.push(`stock_min = $${paramIndex++}`); params.push(input.stock_min); }
    if (input.fournisseur_id !== undefined) { fields.push(`fournisseur_id = $${paramIndex++}`); params.push(input.fournisseur_id ?? null); }
    if (input.modifie_par !== undefined) { fields.push(`modifie_par = $${paramIndex++}`); params.push(input.modifie_par); }

    if (fields.length === 0) throw new Error('Aucun champ à mettre à jour');

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE produits SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    return rows[0] || null;
  }

  /**
   * PATCH /produits/:id/stock — a manual stock adjustment. It used to change
   * stock_par_location without writing any mouvements_stock row (the history
   * missed every such change); it is now an « ajustement » movement through the
   * same transactional path as POST /produits/:id/mouvements.
   */
  async adjustStock(
    id: number,
    quantite: number,
    locationId?: number,
    raison?: string
  ): Promise<StockMovementOutcome | null> {
    return this.addStockMovement(
      id,
      'ajustement',
      quantite,
      locationId,
      raison?.trim() || 'Ajustement manuel du stock'
    );
  }

  /**
   * Get stock valuation summary - Uses stock_par_location
   */
  async getStockValuation(): Promise<any> {
    const { rows } = await pool.query(
      `SELECT
        COUNT(DISTINCT p.id) as total_produits,
        COALESCE(SUM(spl.quantite), 0) as total_unites,
        -- Cost basis = maintained per-location valeur_stock (= quantite × cmp), trigger 076.
        COALESCE(SUM(spl.valeur_stock), 0) as valeur_achat,
        COALESCE(SUM(spl.quantite * p.prix_vente), 0) as valeur_vente,
        COALESCE(SUM(spl.quantite * p.prix_vente), 0) - COALESCE(SUM(spl.valeur_stock), 0) as marge_potentielle
       FROM produits p
       LEFT JOIN stock_par_location spl ON p.id = spl.produit_id
       LEFT JOIN stock_locations sl ON spl.location_id = sl.id AND sl.actif = true
       WHERE p.deleted_at IS NULL`
    );
    return rows[0];
  }

  /**
   * Get stock by category - Uses stock_par_location
   */
  async getStockByCategory(): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT
        COALESCE(p.categorie, 'Sans catégorie') as categorie,
        COUNT(DISTINCT p.id) as nombre_produits,
        COALESCE(SUM(spl.quantite), 0) as total_unites,
        -- Cost basis = maintained per-location valeur_stock (= quantite × cmp), trigger 076.
        COALESCE(SUM(spl.valeur_stock), 0) as valeur_achat,
        COALESCE(SUM(spl.quantite * p.prix_vente), 0) as valeur_vente
       FROM produits p
       LEFT JOIN stock_par_location spl ON p.id = spl.produit_id
       LEFT JOIN stock_locations sl ON spl.location_id = sl.id AND sl.actif = true
       WHERE p.deleted_at IS NULL
       GROUP BY p.categorie
       ORDER BY valeur_vente DESC`
    );
    return rows;
  }

  /**
   * Get stock movement history for a product
   */
  async getStockHistory(produitId: number, limit: number = 50): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT * FROM mouvements_stock
       WHERE produit_id = $1
       ORDER BY date_mouvement DESC
       LIMIT $2`,
      [produitId, limit]
    );
    return rows;
  }

  /**
   * Record one stock movement at one location (POST /produits/:id/mouvements).
   *
   * One transaction: the location's stock row is locked FOR UPDATE, the
   * change and its mouvements_stock row are written together, and a removal
   * larger than the stock is refused with a French 422 naming the product and
   * the location (STOCK_INSUFFISANT). Before, the movement row was inserted
   * first and the stock change could then fail — an orphan row stayed behind
   * and the user got a 500 with the SQL function's English message.
   *
   * Without `locationId` the movement lands on the active principal location;
   * stock_avant / stock_apres are that location's stock (they used to mix the
   * all-locations total with a change applied to the principal one).
   *
   * Returns null when the product does not exist (or is deleted).
   */
  async addStockMovement(
    produitId: number,
    type_mouvement: StockMovementType,
    quantite: number,
    locationId?: number,
    raison?: string,
    reference_liee?: string
  ): Promise<StockMovementOutcome | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: produitRows } = await client.query(
        'SELECT id, nom FROM produits WHERE id = $1 AND deleted_at IS NULL',
        [produitId]
      );
      if (!produitRows[0]) {
        await client.query('ROLLBACK');
        return null;
      }

      let location: { id: number; nom: string } | undefined;
      if (locationId !== undefined && locationId !== null) {
        const { rows } = await client.query(
          'SELECT id, nom FROM stock_locations WHERE id = $1 AND actif = true',
          [locationId]
        );
        if (!rows[0]) throw new Error(EMPLACEMENT_INVALIDE);
        location = rows[0];
      } else {
        const { rows } = await client.query(
          'SELECT id, nom FROM stock_locations WHERE est_principal = true AND actif = true ORDER BY id LIMIT 1'
        );
        if (!rows[0]) {
          throw businessError(
            422,
            'Aucun emplacement principal actif : précisez l’emplacement du mouvement.',
            'EMPLACEMENT_REQUIS'
          );
        }
        location = rows[0];
      }

      const movement = await applyStockMovement(client, {
        produitId,
        locationId: location!.id,
        delta: quantite,
        unitCost: null,
        type: type_mouvement,
        raison: raison?.trim() || null,
        reference: reference_liee?.trim() || null,
      });

      await client.query('COMMIT');

      return {
        produit_id: produitId,
        produit_nom: produitRows[0].nom,
        location_id: location!.id,
        location_nom: location!.nom,
        stock_avant: movement.stockAvant,
        stock: movement.stockApres,
        mouvement_id: movement.mouvementId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fuzzy search with suggestions - Uses pg_trgm for similarity matching
   * Returns products ranked by similarity to the search query
   */
  async searchFuzzy(
    query: string,
    limit: number = 10,
    threshold: number = 0.1,
    locationId?: number
  ): Promise<Array<ProduitRecord & { similarity: number; stock_total: number }>> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchTerm = query.trim();
    const location = locationId ?? null;

    // With a location, `stock` is the stock AT that location (a legacy product
    // without any stock_par_location row keeps its produits.stock, the same
    // fallback the sales paths apply); `stock_total` is always every location.
    const stockSelect = `
          CASE WHEN $LOC::int IS NULL THEN p.stock
               ELSE COALESCE(
                 spl.quantite,
                 CASE WHEN EXISTS (SELECT 1 FROM stock_par_location s2 WHERE s2.produit_id = p.id)
                      THEN 0 ELSE p.stock END
               )
          END AS stock,
          p.stock AS stock_total`;
    const stockJoin = 'LEFT JOIN stock_par_location spl ON spl.produit_id = p.id AND spl.location_id = $LOC::int';

    try {
      const { rows } = await pool.query(
        `SELECT
          p.id,
          p.reference,
          p.nom,
          p.code_barre,
          p.description,
          p.categorie,
          p.prix_achat,
          p.prix_vente,
          ${stockSelect.replace(/\$LOC/g, '$4')},
          p.stock_min,
          p.created_at,
          p.updated_at,
          CASE WHEN p.code_barre = $1 THEN 1 ELSE GREATEST(
            similarity(p.nom, $1),
            similarity(p.reference, $1) * 0.9,
            similarity(COALESCE(p.description, ''), $1) * 0.7,
            similarity(COALESCE(p.categorie, ''), $1) * 0.5
          ) END as similarity
        FROM produits p
        ${stockJoin.replace(/\$LOC/g, '$4')}
        WHERE p.deleted_at IS NULL
          AND (
            p.nom % $1
            OR p.reference % $1
            OR COALESCE(p.description, '') % $1
            OR p.nom ILIKE '%' || $1 || '%'
            OR p.reference ILIKE '%' || $1 || '%'
            OR p.code_barre = $1
          )
          AND (p.code_barre = $1 OR GREATEST(
            similarity(p.nom, $1),
            similarity(p.reference, $1) * 0.9,
            similarity(COALESCE(p.description, ''), $1) * 0.7,
            similarity(COALESCE(p.categorie, ''), $1) * 0.5
          ) > $2)
        ORDER BY similarity DESC, p.nom ASC
        LIMIT $3`,
        [searchTerm, threshold, limit, location]
      );
      return rows;
    } catch (error: any) {
      // Fallback to simple ILIKE search if pg_trgm is not available
      if (error.message?.includes('similarity') || error.message?.includes('operator does not exist')) {
        const { rows } = await pool.query(
          `SELECT
            p.id,
            p.reference,
            p.nom,
            p.code_barre,
            p.description,
            p.categorie,
            p.prix_achat,
            p.prix_vente,
            ${stockSelect.replace(/\$LOC/g, '$3')},
            p.stock_min,
            p.created_at,
            p.updated_at,
            CASE WHEN p.code_barre = $1 THEN 1 ELSE 0.5 END as similarity
          FROM produits p
          ${stockJoin.replace(/\$LOC/g, '$3')}
          WHERE p.deleted_at IS NULL
            AND (
              p.nom ILIKE '%' || $1 || '%'
              OR p.reference ILIKE '%' || $1 || '%'
              OR COALESCE(p.description, '') ILIKE '%' || $1 || '%'
              OR p.code_barre = $1
            )
          ORDER BY similarity DESC, p.nom ASC
          LIMIT $2`,
          [searchTerm, limit, location]
        );
        return rows;
      }
      throw error;
    }
  }

  /**
   * Get suggestions for autocomplete - fast fuzzy search
   */
  async getSuggestions(
    query: string,
    limit: number = 5
  ): Promise<Array<{ id: number; nom: string; reference: string; categorie: string | null; similarity: number }>> {
    if (!query || query.trim().length < 1) {
      return [];
    }

    const searchTerm = query.trim();

    try {
      const { rows } = await pool.query(
        `SELECT 
          p.id, 
          p.nom, 
          p.reference,
          p.categorie,
          GREATEST(
            similarity(p.nom, $1),
            similarity(p.reference, $1) * 0.9
          ) as similarity
        FROM produits p
        WHERE p.deleted_at IS NULL
          AND (p.nom % $1 OR p.reference % $1 OR p.nom ILIKE '%' || $1 || '%')
        ORDER BY similarity DESC, p.nom ASC
        LIMIT $2`,
        [searchTerm, limit]
      );
      return rows;
    } catch (error: any) {
      // Fallback to simple ILIKE if pg_trgm is not available
      if (error.message?.includes('similarity') || error.message?.includes('operator does not exist')) {
        const { rows } = await pool.query(
          `SELECT 
            p.id, 
            p.nom, 
            p.reference,
            p.categorie,
            0.5 as similarity
          FROM produits p
          WHERE p.deleted_at IS NULL
            AND (p.nom ILIKE '%' || $1 || '%' OR p.reference ILIKE '%' || $1 || '%')
          ORDER BY p.nom ASC
          LIMIT $2`,
          [searchTerm, limit]
        );
        return rows;
      }
      throw error;
    }
  }

  /**
   * Get low stock alert count - Uses stock_par_location
   */
  async getLowStockCount(): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM (
        SELECT p.id
        FROM produits p
        LEFT JOIN stock_par_location spl ON p.id = spl.produit_id
        LEFT JOIN stock_locations sl ON spl.location_id = sl.id AND sl.actif = true
        WHERE p.deleted_at IS NULL
        GROUP BY p.id, p.stock_min
        HAVING COALESCE(SUM(spl.quantite), 0) <= p.stock_min
      ) as low_stock_products`
    );
    return parseInt(rows[0].count);
  }

  /**
   * Reorder suggestions: products at/below their stock_min, with a suggested
   * reorder quantity (top up to 2× the minimum, at least 1) and their default
   * supplier so the UI can group draft purchase orders per fournisseur.
   */
  async getReorderSuggestions(): Promise<any[]> {
    const { rows } = await pool.query(
      `SELECT p.id AS produit_id, p.reference, p.nom, p.prix_achat, p.stock_min,
              p.fournisseur_id, t.raison_sociale AS fournisseur_nom,
              COALESCE(SUM(spl.quantite), 0)::int AS stock,
              GREATEST(p.stock_min * 2 - COALESCE(SUM(spl.quantite), 0), 1)::int AS quantite_suggeree
       FROM produits p
       LEFT JOIN stock_par_location spl ON p.id = spl.produit_id
       LEFT JOIN stock_locations sl ON spl.location_id = sl.id AND sl.actif = true
       LEFT JOIN tiers t ON p.fournisseur_id = t.id
       WHERE p.deleted_at IS NULL
       GROUP BY p.id, p.reference, p.nom, p.prix_achat, p.stock_min, p.fournisseur_id, t.raison_sociale
       HAVING COALESCE(SUM(spl.quantite), 0) <= p.stock_min
       ORDER BY t.raison_sociale NULLS LAST, p.nom ASC`
    );
    return rows;
  }
}

export const produitService = new ProduitService();
