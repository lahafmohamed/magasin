import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import devisService from './DevisService';
import { costedStockIn } from './StockCostingService';
import { TestDB } from '../test/helpers';

/**
 * Confirmer un devis n'est pas un simple changement d'étiquette : cela crée
 * automatiquement le bon de livraison, et donc engage le crédit client. Le
 * service était à 16 % de couverture.
 *
 * Couvre : règle « produit vendable en magasin », totaux, création du BL à la
 * confirmation (et son idempotence), annulation en cascade, états terminaux.
 */
describe('DevisService (intégration)', () => {
  let magasinId: number;
  let depotId: number;
  let tiersId: number;
  const createdDevisIds: number[] = [];
  const createdBlIds: number[] = [];
  const createdProduitIds: number[] = [];

  beforeAll(async () => {
    const suffix = `${Date.now() % 1000000}`;
    const { rows: locs } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1,$2,'magasin',true), ($3,$4,'depot',true) RETURNING id`,
      [`TDVM-${suffix}`.slice(0, 20), `Test Devis Magasin ${suffix}`,
        `DEPOT-TDV-${suffix}`.slice(0, 20), `Test Devis Dépôt ${suffix}`]
    );
    magasinId = locs[0].id;
    depotId = locs[1].id;

    const { rows: [tiers] } = await pool.query(
      `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`TDVC-${suffix}`.slice(0, 20), `TEST DEVIS CLIENT ${suffix}`]
    );
    tiersId = tiers.id;
  });

  afterEach(async () => {
    const { rows: bls } = await pool.query(
      'SELECT id FROM bons_livraison WHERE devis_id = ANY($1::int[])',
      [createdDevisIds.length ? createdDevisIds : [0]]
    );
    const blIds = [...createdBlIds, ...bls.map((b: any) => b.id)];
    if (blIds.length) {
      await pool.query(`DELETE FROM document_lignes WHERE document_type = 'bl' AND document_id = ANY($1::int[])`, [blIds]);
      await pool.query('DELETE FROM bons_livraison WHERE id = ANY($1::int[])', [blIds]);
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
    await pool.query('DELETE FROM stock_locations WHERE id = ANY($1::int[])', [[magasinId, depotId]]);
    await pool.end();
  });

  /** Product stocked at the store (sellable) or only at the depot (not sellable). */
  async function product(where: 'magasin' | 'depot', qty = 10): Promise<number> {
    const produitId = await TestDB.createTestProduct({
      reference: `TEST-REF-DV-${Date.now() % 1000000}-${createdProduitIds.length}`,
      prix_vente: 1000,
      stock: 0,
    });
    createdProduitIds.push(produitId);
    await costedStockIn(pool, {
      produitId,
      locationId: where === 'magasin' ? magasinId : depotId,
      quantite: qty,
      unitCost: 600,
    });
    return produitId;
  }

  async function makeDevis(produitId: number, quantite = 4): Promise<number> {
    const devis = await devisService.create({
      tiers_id: tiersId,
      location_id: magasinId,
      lignes: [{ produit_id: produitId, quantite, prix_unitaire: 1000 }],
    });
    createdDevisIds.push(devis.id);
    return devis.id;
  }

  async function blFor(devisId: number) {
    const { rows } = await pool.query(
      'SELECT id, numero_bl, statut, total FROM bons_livraison WHERE devis_id = $1 ORDER BY id DESC',
      [devisId]
    );
    return rows;
  }

  it('calcule les totaux du devis', async () => {
    const produitId = await product('magasin');
    const devis = await devisService.create({
      tiers_id: tiersId,
      location_id: magasinId,
      lignes: [
        { produit_id: produitId, quantite: 3, prix_unitaire: 1500 },
        { produit_id: produitId, quantite: 2, prix_unitaire: 1000 },
      ],
    });
    createdDevisIds.push(devis.id);

    expect(Number(devis.total)).toBe(6500);
    expect(devis.numero_devis).toMatch(/^DEV-/);
  });

  it('refuse un devis sans ligne', async () => {
    await expect(
      devisService.create({ tiers_id: tiersId, location_id: magasinId, lignes: [] })
    ).rejects.toThrow(/au moins un produit/);
  });

  it('refuse de vendre un produit présent uniquement en dépôt', async () => {
    const produitId = await product('depot');

    await expect(
      devisService.create({
        tiers_id: tiersId,
        location_id: magasinId,
        lignes: [{ produit_id: produitId, quantite: 1, prix_unitaire: 1000 }],
      })
    ).rejects.toThrow();
  });

  it('ne crée pas de bon de livraison tant que le devis n\'est pas accepté', async () => {
    const produitId = await product('magasin');
    const devisId = await makeDevis(produitId);

    await devisService.updateStatut(devisId, 'envoye');
    expect(await blFor(devisId)).toHaveLength(0);
  });

  it('crée le bon de livraison à l\'acceptation', async () => {
    const produitId = await product('magasin');
    const devisId = await makeDevis(produitId, 4);

    await devisService.updateStatut(devisId, 'accepte');

    const bls = await blFor(devisId);
    expect(bls).toHaveLength(1);
    expect(bls[0].numero_bl).toMatch(/^BL-/);
    expect(Number(bls[0].total)).toBe(4000);
  });

  it('n\'en crée pas un deuxième si on ré-accepte', async () => {
    const produitId = await product('magasin');
    const devisId = await makeDevis(produitId);

    await devisService.updateStatut(devisId, 'accepte');
    await devisService.updateStatut(devisId, 'accepte');

    expect(await blFor(devisId)).toHaveLength(1);
  });

  it('la confirmation ne sort pas le stock — c\'est la livraison qui le fait', async () => {
    const produitId = await product('magasin', 10);
    const devisId = await makeDevis(produitId, 4);

    await devisService.updateStatut(devisId, 'accepte');

    const { rows } = await pool.query(
      'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
      [produitId, magasinId]
    );
    expect(Number(rows[0].quantite)).toBe(10);
  });

  it('annuler un devis annule ses bons de livraison non facturés', async () => {
    const produitId = await product('magasin');
    const devisId = await makeDevis(produitId);

    await devisService.updateStatut(devisId, 'accepte');
    expect((await blFor(devisId))[0].statut).not.toBe('annule');

    await devisService.updateStatut(devisId, 'annule');
    expect((await blFor(devisId))[0].statut).toBe('annule');
  });

  it('refuse d\'annuler un devis dont un bon est déjà facturé', async () => {
    const produitId = await product('magasin');
    const devisId = await makeDevis(produitId);
    await devisService.updateStatut(devisId, 'accepte');

    const [bl] = await blFor(devisId);
    // Simule la facturation du BL sans passer par toute la chaîne.
    await pool.query(`UPDATE bons_livraison SET statut = 'facture' WHERE id = $1`, [bl.id]);

    await expect(devisService.updateStatut(devisId, 'annule')).rejects.toThrow(/déjà facturé/);

    // Rollback : le devis n'a pas basculé.
    const { rows } = await pool.query('SELECT statut FROM devis WHERE id = $1', [devisId]);
    expect(rows[0].statut).not.toBe('annule');

    await pool.query(`UPDATE bons_livraison SET statut = 'annule' WHERE id = $1`, [bl.id]);
  });

  it('rejette un statut inconnu', async () => {
    const produitId = await product('magasin');
    const devisId = await makeDevis(produitId);

    await expect(devisService.updateStatut(devisId, 'expedie')).rejects.toThrow(/Invalid statut/);
  });

  it('renvoie une erreur pour un devis inexistant', async () => {
    await expect(devisService.updateStatut(99999999, 'accepte')).rejects.toThrow(/non trouvé/);
  });

  // ---- Read paths, now served by the shared SalesDocumentQuery engine ----

  it('liste et compte de façon cohérente sous filtre', async () => {
    const produitId = await product('magasin', 30);
    const a = await makeDevis(produitId, 1);
    await makeDevis(produitId, 2);
    await makeDevis(produitId, 3);
    await devisService.updateStatut(a, 'envoye');

    const all = await devisService.getAll(undefined, undefined, tiersId);
    expect(all.data).toHaveLength(3);
    expect(all.pagination.total).toBe(3);

    const envoyes = await devisService.getAll(undefined, 'envoye', tiersId);
    expect(envoyes.data).toHaveLength(1);
    expect(envoyes.pagination.total).toBe(1);
  });

  it('pagine sans fausser le total', async () => {
    const produitId = await product('magasin', 30);
    await makeDevis(produitId, 1);
    await makeDevis(produitId, 2);
    await makeDevis(produitId, 3);

    const page1 = await devisService.getAll(undefined, undefined, tiersId, 1, 2);
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('recherche par numéro de devis', async () => {
    const produitId = await product('magasin');
    const devisId = await makeDevis(produitId, 1);
    const { rows } = await pool.query('SELECT numero_devis FROM devis WHERE id = $1', [devisId]);

    const found = await devisService.getAll(rows[0].numero_devis, undefined, tiersId);
    expect(found.data).toHaveLength(1);
    expect(found.data[0].id).toBe(devisId);
    expect(found.data[0].client_nom).toContain('TEST DEVIS CLIENT');
  });

  it('accepte date_validite comme clé de tri et ignore les autres', async () => {
    const produitId = await product('magasin', 30);
    await makeDevis(produitId, 1);
    await makeDevis(produitId, 2);

    const sorted = await devisService.getAll(undefined, undefined, tiersId, 1, 20, 'date_validite', 'asc');
    expect(sorted.data).toHaveLength(2);

    const bogus = await devisService.getAll(undefined, undefined, tiersId, 1, 20, 'nope; DROP', 'asc');
    expect(bogus.data).toHaveLength(2);
  });

  it('getStats renvoie les compteurs du devis', async () => {
    const produitId = await product('magasin', 30);
    await makeDevis(produitId, 1);

    const stats = await devisService.getStats();
    expect(stats.total.count).toBeGreaterThanOrEqual(1);
    expect(stats.en_cours.count).toBeGreaterThanOrEqual(1);
    expect(stats.mois).toHaveProperty('montant');
  });

  it('getById renvoie le devis avec ses lignes', async () => {
    const produitId = await product('magasin');
    const devisId = await makeDevis(produitId, 3);

    const detail = await devisService.getById(devisId);
    expect(detail).toMatchObject({ id: devisId, tiers_id: tiersId });
    expect(detail.lignes).toHaveLength(1);
    expect(Number(detail.lignes[0].quantite)).toBe(3);

    expect(await devisService.getById(99999999)).toBeNull();
  });
});
