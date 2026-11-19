import { Pool, PoolClient } from 'pg';
import { businessError } from '../utils/errors';

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

/** `mouvements_stock.type_mouvement` CHECK values. */
export type StockMovementType =
  | 'vente'
  | 'ajustement'
  | 'retour'
  | 'commande'
  | 'perte'
  | 'autre'
  | 'transfert';

export interface StockMovementInput {
  produitId: number;
  locationId: number;
  /** Signed quantity: > 0 enters the stock (costed), < 0 leaves it at cmp. Never 0. */
  delta: number;
  /** Unit cost of an inflow (see costedStockIn). Ignored for a removal. */
  unitCost?: number | null;
  type: StockMovementType;
  raison: string | null;
  reference: string | null;
}

export interface StockMovementResult {
  stockAvant: number;
  stockApres: number;
  mouvementId: number;
  /**
   * The product has no stock_par_location row at all: its stock still lives in
   * the legacy produits.stock column, which was adjusted instead.
   */
  legacy: boolean;
}

/**
 * « Stock insuffisant pour « Souris USB » à Hitek Plateau : 3 en stock, retrait de 5 demandé. »
 * Names the product and the location, never an id (422 STOCK_INSUFFISANT).
 */
async function insufficientStockError(
  db: Queryable,
  produitId: number,
  locationId: number,
  disponible: number,
  retrait: number
) {
  const { rows } = await db.query(
    `SELECT (SELECT nom FROM produits WHERE id = $1) AS produit,
            (SELECT nom FROM stock_locations WHERE id = $2) AS emplacement`,
    [produitId, locationId]
  );
  const produit = rows[0]?.produit ?? `n° ${produitId}`;
  const emplacement = rows[0]?.emplacement ? ` à ${rows[0].emplacement}` : '';
  return businessError(
    422,
    `Stock insuffisant pour « ${produit} »${emplacement} : ${disponible} en stock, retrait de ${retrait} demandé.`,
    'STOCK_INSUFFISANT'
  );
}

/**
 * One stock change at one location AND its mouvements_stock row, in the
 * caller's transaction — the two can no longer drift apart (a failed removal
 * used to leave its movement row behind).
 *
 * - The location's stock row is locked (SELECT … FOR UPDATE) before reading
 *   stock_avant, so concurrent movements serialize.
 * - A removal that would make the stock negative is refused with a French 422
 *   naming the product and the location; nothing is written.
 * - An inflow goes through costedStockIn (weighted cmp, 076 keeps
 *   valeur_stock = quantite × cmp); a removal is a plain decrement at cmp.
 * - A product with no stock_par_location row anywhere is a legacy product whose
 *   stock lives in produits.stock (same fallback as the sales paths): that
 *   column is adjusted instead, so the legacy quantity is never overwritten by a
 *   one-row SUM through trg_sync_produits_stock.
 */
export async function applyStockMovement(
  db: PoolClient,
  input: StockMovementInput
): Promise<StockMovementResult> {
  const { produitId, locationId, delta, type, raison, reference } = input;
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error(`applyStockMovement: delta must be a non-zero integer (got ${delta})`);
  }

  const { rows: splRows } = await db.query(
    `SELECT quantite FROM stock_par_location
     WHERE produit_id = $1 AND location_id = $2
     FOR UPDATE`,
    [produitId, locationId]
  );

  let stockAvant: number;
  let legacy = false;

  if (splRows.length > 0) {
    stockAvant = Number(splRows[0].quantite);
  } else {
    const { rows: anyRow } = await db.query(
      'SELECT 1 FROM stock_par_location WHERE produit_id = $1 LIMIT 1',
      [produitId]
    );
    if (anyRow.length > 0) {
      // Location-managed product, never stocked here.
      stockAvant = 0;
    } else {
      const { rows: legacyRows } = await db.query(
        'SELECT stock FROM produits WHERE id = $1 FOR UPDATE',
        [produitId]
      );
      stockAvant = Number(legacyRows[0]?.stock ?? 0);
      legacy = true;
    }
  }

  const stockApres = stockAvant + delta;
  if (delta < 0 && stockApres < 0) {
    throw await insufficientStockError(db, produitId, locationId, Math.max(stockAvant, 0), -delta);
  }

  if (legacy) {
    await db.query('UPDATE produits SET stock = stock + $1 WHERE id = $2', [delta, produitId]);
  } else if (delta > 0) {
    await costedStockIn(db, {
      produitId,
      locationId,
      quantite: delta,
      unitCost: input.unitCost ?? null,
    });
  } else {
    await db.query(
      `UPDATE stock_par_location
       SET quantite = quantite + $3, updated_at = CURRENT_TIMESTAMP
       WHERE produit_id = $1 AND location_id = $2`,
      [produitId, locationId, delta]
    );
  }

  const { rows: mvtRows } = await db.query(
    `INSERT INTO mouvements_stock
       (produit_id, type_mouvement, quantite, stock_avant, stock_apres, raison, reference_liee, location_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [produitId, type, delta, stockAvant, stockApres, raison, reference, locationId]
  );

  return { stockAvant, stockApres, mouvementId: Number(mvtRows[0].id), legacy };
}
