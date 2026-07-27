import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import { returnService } from './ReturnService';
import { FactureService } from './FactureService';
import { costedStockIn } from './StockCostingService';
import { TestDB } from '../test/helpers';

const factureService = new FactureService();

/**
 * Les retours clients ne remettent en stock qu'à l'approbation ('traite'), pas
 * à la création — et l'annulation d'un retour déjà traité doit reprendre le
 * stock rendu. La machine à états est gardée : une transition illégale ne doit
 * jamais laisser le stock dans un état intermédiaire.
 *
 * Couvre : plafond de quantité retournable, restock à l'approbation seulement,
 * réversibilité de l'annulation, transitions interdites, statut inconnu.
 */
describe('ReturnService (intégration)', () => {
  let locationId: number;
  let tiersId: number;
  const createdRetourIds: number[] = [];
  const createdFactureIds: number[] = [];
  const createdProduitIds: number[] = [];

  beforeAll(async () => {
    const suffix = `${Date.now() % 1000000}`;
    const { rows: [loc] } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1, $2, 'magasin', true) RETURNING id`,
      [`TRET-${suffix}`.slice(0, 20), `Test Retour ${suffix}`]
    );
    locationId = loc.id;

    const { rows: [tiers] } = await pool.query(
      `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`TRC-${suffix}`.slice(0, 20), `TEST RETOUR CLIENT ${suffix}`]
    );
    tiersId = tiers.id;
  });

  afterEach(async () => {
    if (createdRetourIds.length) {
      await pool.query('DELETE FROM retour_lignes WHERE retour_id = ANY($1::int[])', [createdRetourIds]);
      await pool.query('DELETE FROM retours WHERE id = ANY($1::int[])', [createdRetourIds]);
      createdRetourIds.length = 0;
    }
    if (createdFactureIds.length) {
      await TestDB.deleteInvoicesByIds(createdFactureIds);
      createdFactureIds.length = 0;
    }
    if (createdProduitIds.length) {
      await pool.query('DELETE FROM mouvements_stock WHERE produit_id = ANY($1::int[])', [createdProduitIds]);
      await pool.query('DELETE FROM stock_par_location WHERE produit_id = ANY($1::int[])', [createdProduitIds]);
      await pool.query('DELETE FROM produits WHERE id = ANY($1::int[])', [createdProduitIds]);
      createdProduitIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM stock_locations WHERE id = $1', [locationId]);
    // compte_client_lignes references tiers with ON DELETE RESTRICT (089) and
    // survives the invoices, so it has to go before the tiers row.
    await pool.query('DELETE FROM compte_client_lignes WHERE tiers_id = $1', [tiersId]);
    await pool.query('DELETE FROM tiers WHERE id = $1', [tiersId]);
    await pool.end();
  });

  /** A product in stock at the test location, sold on a real invoice. */
  async function soldProduct(qtyStock: number, qtySold: number, prix = 1000) {
    const produitId = await TestDB.createTestProduct({
      reference: `TEST-REF-RET-${Date.now() % 1000000}-${createdProduitIds.length}`,
      prix_vente: prix,
      stock: 0,
    });
    createdProduitIds.push(produitId);

    await costedStockIn(pool, { produitId, locationId, quantite: qtyStock, unitCost: 600 });

    const facture = await factureService.create({
      tiers_id: tiersId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite: qtySold, prix_unitaire: prix }],
    });
    createdFactureIds.push(facture.id);

    return { produitId, factureId: facture.id };
  }

  async function stockAt(produitId: number): Promise<number> {
    const { rows } = await pool.query(
      'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
      [produitId, locationId]
    );
    return rows.length ? Number(rows[0].quantite) : 0;
  }

  it('ne remet pas en stock à la création', async () => {
    const { produitId, factureId } = await soldProduct(10, 4);
    expect(await stockAt(produitId)).toBe(6); // 10 - 4 vendus

    const retour = await returnService.create({
      tiers_id: tiersId,
      lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 2, raison: 'Test' }],
    });
    createdRetourIds.push(retour.id);

    // Toujours 6 : le retour est en attente d'approbation.
    expect(await stockAt(produitId)).toBe(6);
    expect(Number(retour.total)).toBe(2000); // 2 × 1000
  });

  it('remet en stock à l\'approbation', async () => {
    const { produitId, factureId } = await soldProduct(10, 4);

    const retour = await returnService.create({
      tiers_id: tiersId,
      lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 3, raison: 'Test' }],
    });
    createdRetourIds.push(retour.id);

    expect(await returnService.updateStatut(retour.id, 'traite')).toBe(true);
    expect(await stockAt(produitId)).toBe(9); // 6 + 3
  });

  it('annuler un retour traité reprend le stack rendu', async () => {
    const { produitId, factureId } = await soldProduct(10, 4);

    const retour = await returnService.create({
      tiers_id: tiersId,
      lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 3, raison: 'Test' }],
    });
    createdRetourIds.push(retour.id);

    await returnService.updateStatut(retour.id, 'traite');
    expect(await stockAt(produitId)).toBe(9);

    await returnService.updateStatut(retour.id, 'annule');
    expect(await stockAt(produitId)).toBe(6);
  });

  it('annuler un retour jamais approuvé ne touche pas au stock', async () => {
    const { produitId, factureId } = await soldProduct(10, 4);

    const retour = await returnService.create({
      tiers_id: tiersId,
      lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 2, raison: 'Test' }],
    });
    createdRetourIds.push(retour.id);

    await returnService.updateStatut(retour.id, 'annule');
    expect(await stockAt(produitId)).toBe(6);
  });

  it('interdit de rouvrir un retour annulé', async () => {
    const { produitId, factureId } = await soldProduct(10, 4);

    const retour = await returnService.create({
      tiers_id: tiersId,
      lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 2, raison: 'Test' }],
    });
    createdRetourIds.push(retour.id);

    await returnService.updateStatut(retour.id, 'annule');

    await expect(returnService.updateStatut(retour.id, 'traite')).rejects.toMatchObject({ statusCode: 409 });
    await expect(returnService.updateStatut(retour.id, 'en_attente')).rejects.toMatchObject({ statusCode: 409 });
    expect(await stockAt(produitId)).toBe(6);
  });

  it('interdit de repasser un retour traité en attente', async () => {
    const { produitId, factureId } = await soldProduct(10, 4);

    const retour = await returnService.create({
      tiers_id: tiersId,
      lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 2, raison: 'Test' }],
    });
    createdRetourIds.push(retour.id);

    await returnService.updateStatut(retour.id, 'traite');
    await expect(returnService.updateStatut(retour.id, 'en_attente')).rejects.toMatchObject({ statusCode: 409 });

    // Le stock rendu reste en place : la transition refusée n'a rien écrit.
    expect(await stockAt(produitId)).toBe(8);
  });

  it('réappliquer le même statut est un no-op', async () => {
    const { produitId, factureId } = await soldProduct(10, 4);

    const retour = await returnService.create({
      tiers_id: tiersId,
      lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 3, raison: 'Test' }],
    });
    createdRetourIds.push(retour.id);

    await returnService.updateStatut(retour.id, 'traite');
    expect(await stockAt(produitId)).toBe(9);

    // Ne doit pas remettre en stock une seconde fois.
    expect(await returnService.updateStatut(retour.id, 'traite')).toBe(true);
    expect(await stockAt(produitId)).toBe(9);
  });

  it('rejette un statut inconnu', async () => {
    await expect(returnService.updateStatut(1, 'expedie')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('renvoie false pour un retour inexistant', async () => {
    expect(await returnService.updateStatut(99999999, 'traite')).toBe(false);
  });

  it('refuse de retourner plus que la quantité facturée', async () => {
    const { produitId, factureId } = await soldProduct(10, 4);

    await expect(
      returnService.create({
        tiers_id: tiersId,
        lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 5, raison: 'Test' }],
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('cumule les retours antérieurs dans le plafond', async () => {
    const { produitId, factureId } = await soldProduct(10, 4);

    const first = await returnService.create({
      tiers_id: tiersId,
      lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 3, raison: 'Test' }],
    });
    createdRetourIds.push(first.id);

    // 3 déjà retournés sur 4 facturés → 2 de plus est excessif.
    await expect(
      returnService.create({
        tiers_id: tiersId,
        lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 2, raison: 'Test' }],
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuse une facture qui n\'appartient pas au client', async () => {
    const { produitId, factureId } = await soldProduct(10, 4);

    const { rows: [autre] } = await pool.query(
      `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`TRX-${Date.now() % 1000000}`.slice(0, 20), `TEST AUTRE ${Date.now()}`]
    );
    try {
      await expect(
        returnService.create({
          tiers_id: autre.id,
          lignes: [{ facture_id: factureId, produit_id: produitId, quantite: 1, raison: 'Test' }],
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      await pool.query('DELETE FROM tiers WHERE id = $1', [autre.id]);
    }
  });

  it('rejette un retour sans ligne', async () => {
    await expect(
      returnService.create({ tiers_id: tiersId, lignes: [] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
