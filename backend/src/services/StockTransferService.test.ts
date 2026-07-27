import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import { stockTransferService } from './StockTransferService';
import { costedStockIn } from './StockCostingService';
import { TestDB } from '../test/helpers';

/**
 * Un transfert déplace de la valeur, pas seulement des unités : la destination
 * doit absorber le stock au CMP de la source (primitive costedStockIn), sinon
 * la valorisation globale fond à chaque mouvement — le défaut P0-1 corrigé par
 * 076 + StockCostingService.
 *
 * Couvre : conservation quantité/valeur, CMP pondéré à l'arrivée, garde de
 * stock insuffisant, source ≠ destination, machine à états (complete/cancel).
 */
describe('StockTransferService (intégration)', () => {
  let sourceId: number;
  let destId: number;
  const createdTransferIds: number[] = [];
  const createdProduitIds: number[] = [];

  beforeAll(async () => {
    const suffix = `${Date.now() % 1000000}`;
    const { rows } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1, $2, 'depot', true), ($3, $4, 'magasin', true) RETURNING id`,
      [`TSRC-${suffix}`.slice(0, 20), `Test Source ${suffix}`,
        `TDST-${suffix}`.slice(0, 20), `Test Dest ${suffix}`]
    );
    sourceId = rows[0].id;
    destId = rows[1].id;
  });

  afterEach(async () => {
    if (createdTransferIds.length) {
      await pool.query('DELETE FROM stock_transfer_lignes WHERE transfer_id = ANY($1::int[])', [createdTransferIds]);
      await pool.query('DELETE FROM stock_transfers WHERE id = ANY($1::int[])', [createdTransferIds]);
      createdTransferIds.length = 0;
    }
    if (createdProduitIds.length) {
      await pool.query('DELETE FROM mouvements_stock WHERE produit_id = ANY($1::int[])', [createdProduitIds]);
      await pool.query('DELETE FROM stock_par_location WHERE produit_id = ANY($1::int[])', [createdProduitIds]);
      await pool.query('DELETE FROM produits WHERE id = ANY($1::int[])', [createdProduitIds]);
      createdProduitIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM stock_locations WHERE id = ANY($1::int[])', [[sourceId, destId]]);
    await pool.end();
  });

  async function stockedProduct(qty: number, unitCost: number): Promise<number> {
    const produitId = await TestDB.createTestProduct({
      reference: `TEST-REF-TRF-${Date.now() % 1000000}-${createdProduitIds.length}`,
      stock: 0,
    });
    createdProduitIds.push(produitId);
    await costedStockIn(pool, { produitId, locationId: sourceId, quantite: qty, unitCost });
    return produitId;
  }

  async function rowAt(produitId: number, locationId: number) {
    const { rows } = await pool.query(
      'SELECT quantite, cmp, valeur_stock FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
      [produitId, locationId]
    );
    if (!rows.length) return null;
    return {
      quantite: Number(rows[0].quantite),
      cmp: Number(rows[0].cmp),
      valeur: Number(rows[0].valeur_stock),
    };
  }

  it('conserve quantité et valeur en transférant vers un emplacement vide', async () => {
    const produitId = await stockedProduct(10, 800);

    const transfer = await stockTransferService.create({
      location_source_id: sourceId,
      location_destination_id: destId,
      lignes: [{ produit_id: produitId, quantite_demandee: 4 }],
    });
    createdTransferIds.push(transfer.id);

    await stockTransferService.complete(transfer.id);

    const src = await rowAt(produitId, sourceId);
    const dst = await rowAt(produitId, destId);

    expect(src).toEqual({ quantite: 6, cmp: 800, valeur: 4800 });
    // La destination n'existait pas : elle doit naître au CMP de la source,
    // pas à zéro — c'est exactement la valeur que le bug P0-1 détruisait.
    expect(dst).toEqual({ quantite: 4, cmp: 800, valeur: 3200 });
    expect(src!.valeur + dst!.valeur).toBe(8000); // 10 × 800 conservés
  });

  it('recalcule le CMP de la destination en moyenne pondérée', async () => {
    const produitId = await stockedProduct(10, 800);
    // La destination détient déjà 10 unités à 300.
    await costedStockIn(pool, { produitId, locationId: destId, quantite: 10, unitCost: 300 });

    const transfer = await stockTransferService.create({
      location_source_id: sourceId,
      location_destination_id: destId,
      lignes: [{ produit_id: produitId, quantite_demandee: 10 }],
    });
    createdTransferIds.push(transfer.id);

    await stockTransferService.complete(transfer.id);

    // (10×300 + 10×800) / 20 = 550
    expect(await rowAt(produitId, destId)).toEqual({ quantite: 20, cmp: 550, valeur: 11000 });
    expect(await rowAt(produitId, sourceId)).toEqual({ quantite: 0, cmp: 800, valeur: 0 });
  });

  it('refuse un transfert supérieur au stock source', async () => {
    const produitId = await stockedProduct(3, 800);

    await expect(
      stockTransferService.create({
        location_source_id: sourceId,
        location_destination_id: destId,
        lignes: [{ produit_id: produitId, quantite_demandee: 4 }],
      })
    ).rejects.toThrow(/Stock insuffisant/);

    // La transaction est annulée : aucun transfert ne subsiste.
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM stock_transfers WHERE location_source_id = $1',
      [sourceId]
    );
    expect(rows[0].n).toBe(0);
  });

  it('refuse source et destination identiques', async () => {
    const produitId = await stockedProduct(5, 800);

    await expect(
      stockTransferService.create({
        location_source_id: sourceId,
        location_destination_id: sourceId,
        lignes: [{ produit_id: produitId, quantite_demandee: 1 }],
      })
    ).rejects.toThrow(/différentes/);
  });

  it('refuse un transfert sans ligne', async () => {
    await expect(
      stockTransferService.create({
        location_source_id: sourceId,
        location_destination_id: destId,
        lignes: [],
      })
    ).rejects.toThrow(/au moins un produit/);
  });

  it('ne complète pas deux fois le même transfert', async () => {
    const produitId = await stockedProduct(10, 800);

    const transfer = await stockTransferService.create({
      location_source_id: sourceId,
      location_destination_id: destId,
      lignes: [{ produit_id: produitId, quantite_demandee: 4 }],
    });
    createdTransferIds.push(transfer.id);

    await stockTransferService.complete(transfer.id);
    await expect(stockTransferService.complete(transfer.id)).rejects.toThrow();

    // Le stock n'a bougé qu'une fois.
    expect((await rowAt(produitId, destId))!.quantite).toBe(4);
  });

  it('annule un transfert en préparation sans toucher au stock', async () => {
    const produitId = await stockedProduct(10, 800);

    const transfer = await stockTransferService.create({
      location_source_id: sourceId,
      location_destination_id: destId,
      lignes: [{ produit_id: produitId, quantite_demandee: 4 }],
    });
    createdTransferIds.push(transfer.id);

    expect(await stockTransferService.cancel(transfer.id)).toBe(true);
    expect((await rowAt(produitId, sourceId))!.quantite).toBe(10);
    expect(await rowAt(produitId, destId)).toBeNull();
  });

  it('ne peut plus annuler un transfert déjà complété', async () => {
    const produitId = await stockedProduct(10, 800);

    const transfer = await stockTransferService.create({
      location_source_id: sourceId,
      location_destination_id: destId,
      lignes: [{ produit_id: produitId, quantite_demandee: 4 }],
    });
    createdTransferIds.push(transfer.id);

    await stockTransferService.complete(transfer.id);
    expect(await stockTransferService.cancel(transfer.id)).toBe(false);
    expect((await rowAt(produitId, destId))!.quantite).toBe(4);
  });

  it('getById renvoie le transfert avec ses lignes', async () => {
    const produitId = await stockedProduct(10, 800);

    const transfer = await stockTransferService.create({
      location_source_id: sourceId,
      location_destination_id: destId,
      lignes: [{ produit_id: produitId, quantite_demandee: 4 }],
    });
    createdTransferIds.push(transfer.id);

    const detail = await stockTransferService.getById(transfer.id);
    expect(detail).toMatchObject({ id: transfer.id, numero_transfer: transfer.numero_transfer });
    expect(detail.lignes).toHaveLength(1);

    expect(await stockTransferService.getById(99999999)).toBeNull();
  });
});
