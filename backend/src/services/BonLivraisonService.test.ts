import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import bonLivraisonService from './BonLivraisonService';
import { costedStockIn } from './StockCostingService';
import { TestDB } from '../test/helpers';

/**
 * Le bon de livraison est le point où la marchandise sort réellement et où le
 * crédit client est engagé — la facture suit. Le service était à 0 % de
 * couverture alors qu'il porte à la fois le stock et l'argent.
 *
 * Couvre : lien obligatoire au devis confirmé, sortie de stock à la livraison
 * uniquement, restitution à l'annulation, états terminaux, conversion en
 * facture et son idempotence.
 */
describe('BonLivraisonService (intégration)', () => {
  let locationId: number;
  let tiersId: number;
  const createdBlIds: number[] = [];
  const createdDevisIds: number[] = [];
  const createdFactureIds: number[] = [];
  const createdProduitIds: number[] = [];

  beforeAll(async () => {
    const suffix = `${Date.now() % 1000000}`;
    const { rows: [loc] } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1, $2, 'magasin', true) RETURNING id`,
      [`TBL-${suffix}`.slice(0, 20), `Test BL ${suffix}`]
    );
    locationId = loc.id;

    const { rows: [tiers] } = await pool.query(
      `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`TBLC-${suffix}`.slice(0, 20), `TEST BL CLIENT ${suffix}`]
    );
    tiersId = tiers.id;
  });

  afterEach(async () => {
    if (createdFactureIds.length) {
      await TestDB.deleteInvoicesByIds(createdFactureIds);
      createdFactureIds.length = 0;
    }
    if (createdBlIds.length) {
      await pool.query(`DELETE FROM document_lignes WHERE document_type = 'bl' AND document_id = ANY($1::int[])`, [createdBlIds]);
      await pool.query('DELETE FROM bons_livraison WHERE id = ANY($1::int[])', [createdBlIds]);
      createdBlIds.length = 0;
    }
    if (createdDevisIds.length) {
      await pool.query(`DELETE FROM document_lignes WHERE document_type = 'devis' AND document_id = ANY($1::int[])`, [createdDevisIds]);
      await pool.query('DELETE FROM devis WHERE id = ANY($1::int[])', [createdDevisIds]);
      createdDevisIds.length = 0;
    }
    if (createdProduitIds.length) {
      await pool.query('DELETE FROM mouvements_stock WHERE produit_id = ANY($1::int[])', [createdProduitIds]);
      await pool.query('DELETE FROM stock_par_location WHERE produit_id = ANY($1::int[])', [createdProduitIds]);
      await pool.query('DELETE FROM produits WHERE id = ANY($1::int[])', [createdProduitIds]);
      createdProduitIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM compte_client_lignes WHERE tiers_id = $1', [tiersId]);
    await pool.query('DELETE FROM tiers WHERE id = $1', [tiersId]);
    await pool.query('DELETE FROM stock_locations WHERE id = $1', [locationId]);
    await pool.end();
  });

  async function stockedProduct(qty: number): Promise<number> {
    const produitId = await TestDB.createTestProduct({
      reference: `TEST-REF-BL-${Date.now() % 1000000}-${createdProduitIds.length}`,
      prix_vente: 1000,
      stock: 0,
    });
    createdProduitIds.push(produitId);
    if (qty > 0) {
      await costedStockIn(pool, { produitId, locationId, quantite: qty, unitCost: 600 });
    }
    return produitId;
  }

  /** A quote in the given status, with one line for the product. */
  async function makeDevis(produitId: number, quantite: number, statut = 'accepte'): Promise<number> {
    const { rows: [devis] } = await pool.query(
      `INSERT INTO devis (numero_devis, tiers_id, sous_total, total, statut, location_id)
       VALUES ($1, $2, $3, $3, $4, $5) RETURNING id`,
      [`DEV-TEST-${Date.now()}-${createdDevisIds.length}`.slice(0, 50), tiersId, quantite * 1000, statut, locationId]
    );
    createdDevisIds.push(devis.id);
    await pool.query(
      `INSERT INTO document_lignes (document_type, document_id, produit_id, quantite, prix_unitaire, total_ligne)
       VALUES ('devis', $1, $2, $3, 1000, $4)`,
      [devis.id, produitId, quantite, quantite * 1000]
    );
    return devis.id;
  }

  async function makeBl(produitId: number, quantite: number): Promise<number> {
    const devisId = await makeDevis(produitId, quantite);
    const bl = await bonLivraisonService.create({
      tiers_id: tiersId,
      devis_id: devisId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite_commandee: quantite, quantite_livree: quantite, prix_unitaire: 1000 }],
    });
    createdBlIds.push(bl.id);
    return bl.id;
  }

  async function stockAt(produitId: number): Promise<number> {
    const { rows } = await pool.query(
      'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
      [produitId, locationId]
    );
    return rows.length ? Number(rows[0].quantite) : 0;
  }

  it('exige un devis confirmé', async () => {
    const produitId = await stockedProduct(10);
    const brouillon = await makeDevis(produitId, 2, 'brouillon');

    await expect(
      bonLivraisonService.create({
        tiers_id: tiersId,
        devis_id: brouillon,
        location_id: locationId,
        lignes: [{ produit_id: produitId, quantite_commandee: 2, quantite_livree: 2, prix_unitaire: 1000 }],
      })
    ).rejects.toThrow(/confirmé/);
  });

  it('refuse un bon de livraison sans devis', async () => {
    const produitId = await stockedProduct(10);

    await expect(
      bonLivraisonService.create({
        tiers_id: tiersId,
        location_id: locationId,
        lignes: [{ produit_id: produitId, quantite_commandee: 2, quantite_livree: 2, prix_unitaire: 1000 }],
      })
    ).rejects.toThrow(/lié à un devis/);
  });

  it('refuse un bon de livraison sans ligne', async () => {
    const produitId = await stockedProduct(10);
    const devisId = await makeDevis(produitId, 2);

    await expect(
      bonLivraisonService.create({ tiers_id: tiersId, devis_id: devisId, location_id: locationId, lignes: [] })
    ).rejects.toThrow(/au moins un produit/);
  });

  it('refuse un devis appartenant à un autre tiers', async () => {
    const produitId = await stockedProduct(10);
    const devisId = await makeDevis(produitId, 2);

    const { rows: [autre] } = await pool.query(
      `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`TBX-${Date.now() % 1000000}`.slice(0, 20), `TEST BL AUTRE ${Date.now()}`]
    );
    try {
      await expect(
        bonLivraisonService.create({
          tiers_id: autre.id,
          devis_id: devisId,
          location_id: locationId,
          lignes: [{ produit_id: produitId, quantite_commandee: 2, quantite_livree: 2, prix_unitaire: 1000 }],
        })
      ).rejects.toThrow(/doit correspondre/);
    } finally {
      await pool.query('DELETE FROM tiers WHERE id = $1', [autre.id]);
    }
  });

  it('ne sort pas le stock à la création', async () => {
    const produitId = await stockedProduct(10);
    await makeBl(produitId, 4);

    // La marchandise ne part qu'au passage en 'livre'.
    expect(await stockAt(produitId)).toBe(10);
  });

  it('sort le stock au passage en livré, avec mouvement tracé', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);

    await bonLivraisonService.updateStatut(blId, 'livre');
    expect(await stockAt(produitId)).toBe(6);

    const { rows } = await pool.query(
      `SELECT type_mouvement, quantite, stock_avant, stock_apres
       FROM mouvements_stock WHERE produit_id = $1 ORDER BY id DESC LIMIT 1`,
      [produitId]
    );
    expect(rows[0].type_mouvement).toBe('vente');
    expect(Number(rows[0].quantite)).toBe(-4);
    expect(Number(rows[0].stock_avant)).toBe(10);
    expect(Number(rows[0].stock_apres)).toBe(6);
  });

  it('refuse la livraison si le stock est insuffisant', async () => {
    const produitId = await stockedProduct(2);
    const blId = await makeBl(produitId, 2);

    // Le stock disparaît avant la livraison.
    await pool.query(
      'UPDATE stock_par_location SET quantite = 1 WHERE produit_id = $1 AND location_id = $2',
      [produitId, locationId]
    );

    await expect(bonLivraisonService.updateStatut(blId, 'livre')).rejects.toThrow(/Stock insuffisant/);
    expect(await stockAt(produitId)).toBe(1); // rollback, rien de déduit
  });

  it('ne sort pas le stock deux fois', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);

    await bonLivraisonService.updateStatut(blId, 'livre');
    await bonLivraisonService.updateStatut(blId, 'livre');
    expect(await stockAt(produitId)).toBe(6);
  });

  it('restitue le stock en annulant un bon livré', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);

    await bonLivraisonService.updateStatut(blId, 'livre');
    expect(await stockAt(produitId)).toBe(6);

    await bonLivraisonService.updateStatut(blId, 'annule');
    expect(await stockAt(produitId)).toBe(10);
  });

  it('annuler un bon non livré ne touche pas au stock', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);

    await bonLivraisonService.updateStatut(blId, 'annule');
    expect(await stockAt(produitId)).toBe(10);
  });

  it('un bon annulé est terminal', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);

    await bonLivraisonService.updateStatut(blId, 'annule');
    await expect(bonLivraisonService.updateStatut(blId, 'livre')).rejects.toThrow(/facturé ou annulé/);
  });

  it('refuse de poser le statut facture à la main', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);

    await expect(bonLivraisonService.updateStatut(blId, 'facture')).rejects.toThrow(/automatiquement/);
  });

  it('rejette un statut inconnu', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);

    await expect(bonLivraisonService.updateStatut(blId, 'expedie')).rejects.toThrow(/Invalid statut/);
  });

  it('ne facture que depuis un bon livré', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);

    await expect(bonLivraisonService.convertToFacture(blId, 1)).rejects.toThrow(/livré/);
  });

  it('convertit un bon livré en facture et marque le bon facturé', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);
    await bonLivraisonService.updateStatut(blId, 'livre');

    const { facture_id, numero_facture } = await bonLivraisonService.convertToFacture(blId, 1);
    createdFactureIds.push(facture_id);

    expect(numero_facture).toMatch(/^FAC-/);

    const { rows } = await pool.query('SELECT statut, facture_id FROM bons_livraison WHERE id = $1', [blId]);
    expect(rows[0].statut).toBe('facture');
    expect(rows[0].facture_id).toBe(facture_id);

    const { rows: fac } = await pool.query('SELECT total, tiers_id FROM factures WHERE id = $1', [facture_id]);
    expect(Number(fac[0].total)).toBe(4000);
    expect(fac[0].tiers_id).toBe(tiersId);
  });

  it('convertir deux fois renvoie la même facture', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);
    await bonLivraisonService.updateStatut(blId, 'livre');

    const first = await bonLivraisonService.convertToFacture(blId, 1);
    createdFactureIds.push(first.facture_id);
    const second = await bonLivraisonService.convertToFacture(blId, 1);

    expect(second.facture_id).toBe(first.facture_id);

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM factures WHERE tiers_id = $1 AND deleted_at IS NULL',
      [tiersId]
    );
    expect(rows[0].n).toBe(1);
  });

  it('la conversion ne re-sort pas le stock', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 4);
    await bonLivraisonService.updateStatut(blId, 'livre');
    expect(await stockAt(produitId)).toBe(6);

    const { facture_id } = await bonLivraisonService.convertToFacture(blId, 1);
    createdFactureIds.push(facture_id);

    // La sortie a eu lieu à la livraison ; la facturation ne doit pas la refaire.
    expect(await stockAt(produitId)).toBe(6);
  });
});
