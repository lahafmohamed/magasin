import { Pool, PoolClient } from 'pg';

/**
 * Weighted-average "costed stock-in" primitive.
 *
 * Every flow that INCREASES stock at a location must go through this helper so
 * the location's CMP (coût moyen pondéré) absorbs the inflow at its real unit
 * cost. Before this existed, transfers/returns/initial-stock inserted rows with
 * cmp DEFAULT 0, and trigger 076 (valeur_stock = quantite × cmp) then valued the
 * received units at ZERO — inventory value vanished on every transfer into a
 * location without an existing stock row.
 *
 * Cost source per flow:
 *  - réception            → cout_unitaire of the reception line
 *  - transfert / demande  → the SOURCE location's cmp (read in the same tx)
 *  - retour client        → the sale-time prix_achat_unitaire when recorded
 *  - stock initial / ajustement → null (falls back to current cmp, else produits.prix_achat)
 *
 * DECREASES must NOT use this helper: under weighted-average costing a removal
 * happens at cmp, which leaves cmp unchanged — a plain `UPDATE ... SET quantite
 * = quantite - x` is correct (076 keeps valeur_stock in sync).
 *
 * The single upsert statement computes the new weighted cmp SQL-side from the
 * locked current row, so it is atomic and race-safe without a separate
 * SELECT ... FOR UPDATE.
 */

export interface CostedStockInInput {
  produitId: number;
  locationId: number;
  /** Units received. Must be > 0. */
  quantite: number;
  /**
   * Unit cost of the inflow. null = "no better information": keeps the
   * location's current cmp; for a brand-new row falls back to produits.prix_achat.
   */
  unitCost: number | null;
}

export interface CostedStockInResult {
  stockAvant: number;
  stockApres: number;
  cmpApres: number;
}

type Queryable = Pool | PoolClient;

export async function costedStockIn(
  db: Queryable,
  { produitId, locationId, quantite, unitCost }: CostedStockInInput
): Promise<CostedStockInResult> {
  if (!(quantite > 0)) {
    throw new Error(`costedStockIn: quantite must be > 0 (got ${quantite})`);
  }
  if (unitCost !== null && !(unitCost >= 0)) {
    throw new Error(`costedStockIn: unitCost must be >= 0 or null (got ${unitCost})`);
  }

  const { rows } = await db.query(
    `INSERT INTO stock_par_location (produit_id, location_id, quantite, cmp)
     VALUES (
       $1, $2, $3,
       COALESCE($4::numeric, (SELECT COALESCE(prix_achat, 0) FROM produits WHERE id = $1), 0)
     )
     ON CONFLICT (produit_id, location_id) DO UPDATE SET
       cmp = CASE
         WHEN stock_par_location.quantite + EXCLUDED.quantite > 0 THEN
           ROUND(
             (GREATEST(stock_par_location.quantite, 0) * COALESCE(stock_par_location.cmp, 0)
              + EXCLUDED.quantite * COALESCE($4::numeric, COALESCE(stock_par_location.cmp, 0)))
             / (GREATEST(stock_par_location.quantite, 0) + EXCLUDED.quantite),
             2
           )
         ELSE COALESCE($4::numeric, COALESCE(stock_par_location.cmp, 0))
       END,
       quantite = stock_par_location.quantite + EXCLUDED.quantite,
       updated_at = CURRENT_TIMESTAMP
     RETURNING quantite, cmp`,
    [produitId, locationId, quantite, unitCost]
  );

  const stockApres = Number(rows[0].quantite);
  return {
    stockAvant: stockApres - quantite,
    stockApres,
    cmpApres: Number(rows[0].cmp),
  };
}

/**
 * Read a location's current cmp (0 when no row). Call inside the same
 * transaction as the source-side decrement when costing a transfer.
 */
export async function getLocationCmp(
  db: Queryable,
  produitId: number,
  locationId: number
): Promise<number> {
  const { rows } = await db.query(
    'SELECT COALESCE(cmp, 0) AS cmp FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
    [produitId, locationId]
  );
  return rows.length > 0 ? Number(rows[0].cmp) : 0;
}
