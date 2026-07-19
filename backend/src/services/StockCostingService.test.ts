import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/connection';
import { costedStockIn, getLocationCmp } from './StockCostingService';
import { TestDB } from '../test/helpers';

/**
 * Integration tests for the weighted-average costed stock-in primitive.
 * Uses throwaway produits + stock_locations on the dev DB; every row created
 * here is deleted in afterAll.
 */

async function createTestLocation(suffix: string): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO stock_locations (code, nom, location_type, actif) VALUES ($1, $2, 'depot', true) RETURNING id`,
    [`TCMP-${suffix}-${Date.now() % 100000}`, `Test CMP ${suffix}`]
  );
  return rows[0].id;
}

async function readRow(produitId: number, locationId: number) {
  const { rows } = await pool.query(
    `SELECT quantite, cmp, valeur_stock FROM stock_par_location WHERE produit_id = $1 AND location_id = $2`,
    [produitId, locationId]
  );
  if (rows.length === 0) return null;
  return {
    quantite: Number(rows[0].quantite),
    cmp: Number(rows[0].cmp),
    valeur: Number(rows[0].valeur_stock),
  };
}

describe('StockCostingService (integration)', () => {
  let produitId: number;
  let locA: number;
  let locB: number;

  beforeAll(async () => {
    produitId = await TestDB.createTestProduct({ reference: 'TEST-CMP', stock: 0 });
    // helpers create products with prix_achat = 1000
    locA = await createTestLocation('A');
    locB = await createTestLocation('B');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM stock_par_location WHERE produit_id = $1', [produitId]);
    await pool.query('DELETE FROM stock_locations WHERE id = ANY($1::int[])', [[locA, locB]]);
    await pool.query('DELETE FROM produits WHERE id = $1', [produitId]);
  });

  it('creates a fresh row with cmp = unitCost and 076 derives valeur_stock', async () => {
    const res = await costedStockIn(pool, { produitId, locationId: locA, quantite: 10, unitCost: 100 });
    expect(res.stockAvant).toBe(0);
    expect(res.stockApres).toBe(10);
    expect(res.cmpApres).toBe(100);
    const row = await readRow(produitId, locA);
    expect(row).toEqual({ quantite: 10, cmp: 100, valeur: 1000 });
  });

  it('weighted-averages a second inflow at a different cost', async () => {
    const res = await costedStockIn(pool, { produitId, locationId: locA, quantite: 10, unitCost: 200 });
    // (10*100 + 10*200) / 20 = 150
    expect(res.stockApres).toBe(20);
    expect(res.cmpApres).toBe(150);
    const row = await readRow(produitId, locA);
    expect(row).toEqual({ quantite: 20, cmp: 150, valeur: 3000 });
  });

  it('unitCost null keeps the current cmp (inflow at current cost)', async () => {
    const res = await costedStockIn(pool, { produitId, locationId: locA, quantite: 5, unitCost: null });
    expect(res.cmpApres).toBe(150);
    const row = await readRow(produitId, locA);
    expect(row).toEqual({ quantite: 25, cmp: 150, valeur: 3750 });
  });

  it('unitCost null on a FRESH row falls back to produits.prix_achat (not 0)', async () => {
    // NB: trigger 065 (trg_sync_cmp) keeps produits.prix_achat in sync with the
    // latest cmp write, so read the CURRENT value rather than assuming the seed.
    const { rows } = await pool.query('SELECT prix_achat FROM produits WHERE id = $1', [produitId]);
    const prixAchat = Number(rows[0].prix_achat);
    expect(prixAchat).toBeGreaterThan(0);

    const res = await costedStockIn(pool, { produitId, locationId: locB, quantite: 4, unitCost: null });
    expect(res.cmpApres).toBe(prixAchat);
    const row = await readRow(produitId, locB);
    expect(row).toEqual({ quantite: 4, cmp: prixAchat, valeur: Math.round(4 * prixAchat * 100) / 100 });
  });

  it('a plain decrement (removal at cmp) leaves cmp intact and 076 tracks value', async () => {
    await pool.query(
      'UPDATE stock_par_location SET quantite = quantite - 5 WHERE produit_id = $1 AND location_id = $2',
      [produitId, locA]
    );
    const row = await readRow(produitId, locA);
    expect(row).toEqual({ quantite: 20, cmp: 150, valeur: 3000 });
  });

  it('conserves total inventory value across a transfer into an empty location', async () => {
    // Simulate the transfer pattern: read source cmp, decrement source, costed stock-in at dest.
    await pool.query('DELETE FROM stock_par_location WHERE produit_id = $1 AND location_id = $2', [produitId, locB]);

    const before = await readRow(produitId, locA);
    expect(before).not.toBeNull();
    const totalBefore = before!.valeur;

    const srcCmp = await getLocationCmp(pool, produitId, locA);
    expect(srcCmp).toBe(150);

    await pool.query(
      'UPDATE stock_par_location SET quantite = quantite - 8 WHERE produit_id = $1 AND location_id = $2',
      [produitId, locA]
    );
    await costedStockIn(pool, { produitId, locationId: locB, quantite: 8, unitCost: srcCmp });

    const src = await readRow(produitId, locA);
    const dst = await readRow(produitId, locB);
    expect(src!.valeur + dst!.valeur).toBe(totalBefore); // value moved, none vanished
    expect(dst).toEqual({ quantite: 8, cmp: 150, valeur: 1200 });
  });

  it('rejects non-positive quantities', async () => {
    await expect(costedStockIn(pool, { produitId, locationId: locA, quantite: 0, unitCost: 100 })).rejects.toThrow();
    await expect(costedStockIn(pool, { produitId, locationId: locA, quantite: -3, unitCost: 100 })).rejects.toThrow();
  });
});
