import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import { receptionService } from './ReceptionService';
import { TestDB } from '../test/helpers';

/**
 * ReceptionService est la source du coût unitaire : c'est la seule entrée qui
 * recalcule le CMP (coût moyen pondéré) d'un emplacement. Une erreur ici
 * corrompt durablement la valorisation de tout le stock, sans message d'erreur.
 *
 * Couvre : compounding du CMP sur plusieurs lignes et plusieurs réceptions,
 * garde-fou de sur-réception (rapprochement 3 voies), synchronisation de
 * prix_achat, mouvements de stock, et réversibilité de la suppression.
 */
describe('ReceptionService (intégration)', () => {
  let locationId: number;
  let tiersId: number;
  const createdReceptionIds: number[] = [];
  const createdCommandeIds: number[] = [];
  const createdProduitIds: number[] = [];

  beforeAll(async () => {
    const suffix = `${Date.now() % 1000000}`;
    const { rows: [loc] } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1, $2, 'depot', true) RETURNING id`,
      [`TREC-${suffix}`.slice(0, 20), `Test Réception ${suffix}`]
    );
    locationId = loc.id;

    const { rows: [tiers] } = await pool.query(
      `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
       VALUES ($1, $2, false, true) RETURNING id`,
      [`TRF-${suffix}`.slice(0, 20), `TEST RECEPTION FOURN ${suffix}`]
    );
    tiersId = tiers.id;
  });

  afterEach(async () => {
    if (createdReceptionIds.length) {
      await pool.query('DELETE FROM reception_lignes WHERE reception_id = ANY($1::int[])', [createdReceptionIds]);
      await pool.query('DELETE FROM receptions WHERE id = ANY($1::int[])', [createdReceptionIds]);
      createdReceptionIds.length = 0;
    }
    if (createdProduitIds.length) {
      await pool.query('DELETE FROM mouvements_stock WHERE produit_id = ANY($1::int[])', [createdProduitIds]);
      await pool.query('DELETE FROM stock_par_location WHERE produit_id = ANY($1::int[])', [createdProduitIds]);
    }
    if (createdCommandeIds.length) {
      await pool.query('DELETE FROM facture_fournisseur_lignes WHERE facture_id IN (SELECT id FROM factures_fournisseur WHERE commande_id = ANY($1::int[]))', [createdCommandeIds]);
      await pool.query('DELETE FROM factures_fournisseur WHERE commande_id = ANY($1::int[])', [createdCommandeIds]);
      await pool.query('DELETE FROM commande_lignes WHERE commande_id = ANY($1::int[])', [createdCommandeIds]);
      await pool.query('DELETE FROM commandes_fournisseur WHERE id = ANY($1::int[])', [createdCommandeIds]);
      createdCommandeIds.length = 0;
    }
    if (createdProduitIds.length) {
      await pool.query('DELETE FROM produits WHERE id = ANY($1::int[])', [createdProduitIds]);
      createdProduitIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM stock_locations WHERE id = $1', [locationId]);
    await pool.query('DELETE FROM compte_fournisseur_lignes WHERE tiers_id = $1', [tiersId]);
    await pool.query('DELETE FROM tiers WHERE id = $1', [tiersId]);
    await pool.end();
  });

  async function newProduct(): Promise<number> {
    const id = await TestDB.createTestProduct({
      reference: `TEST-REF-REC-${Date.now() % 1000000}-${createdProduitIds.length}`,
      stock: 0,
    });
    createdProduitIds.push(id);
    return id;
  }

  /** Purchase order covering the given quantities, so the 3-way match lets the receipt through. */
  async function newCommande(lignes: { produit_id: number; quantite: number; prix_unitaire: number }[]): Promise<number> {
    const { rows: [cmd] } = await pool.query(
      `INSERT INTO commandes_fournisseur (numero_commande, tiers_id, sous_total)
       VALUES ($1, $2, $3) RETURNING id`,
      [`CMD-TEST-${Date.now()}-${createdCommandeIds.length}`.slice(0, 40), tiersId,
        lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0)]
    );
    for (const l of lignes) {
      await pool.query(
        `INSERT INTO commande_lignes (commande_id, produit_id, quantite, prix_unitaire, total_ligne)
         VALUES ($1, $2, $3, $4, $5)`,
        [cmd.id, l.produit_id, l.quantite, l.prix_unitaire, l.quantite * l.prix_unitaire]
      );
    }
    createdCommandeIds.push(cmd.id);
    return cmd.id;
  }

  async function stockRow(produitId: number) {
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

  it('valorise une première réception au coût unitaire reçu', async () => {
    const produitId = await newProduct();
    const commandeId = await newCommande([{ produit_id: produitId, quantite: 10, prix_unitaire: 500 }]);

    const rec = await receptionService.create({
      commande_id: commandeId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite_commandee: 10, quantite_recue: 10, cout_unitaire: 500 }],
    });
    createdReceptionIds.push(rec.id);

    const row = await stockRow(produitId);
    expect(row).toEqual({ quantite: 10, cmp: 500, valeur: 5000 });
  });

  it('recalcule le CMP en moyenne pondérée sur une seconde réception', async () => {
    const produitId = await newProduct();
    const commandeId = await newCommande([{ produit_id: produitId, quantite: 30, prix_unitaire: 500 }]);

    const first = await receptionService.create({
      commande_id: commandeId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite_commandee: 10, quantite_recue: 10, cout_unitaire: 500 }],
    });
    createdReceptionIds.push(first.id);

    const second = await receptionService.create({
      commande_id: commandeId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite_commandee: 10, quantite_recue: 10, cout_unitaire: 700 }],
    });
    createdReceptionIds.push(second.id);

    // (10×500 + 10×700) / 20 = 600
    const row = await stockRow(produitId);
    expect(row).toEqual({ quantite: 20, cmp: 600, valeur: 12000 });
  });

  it('compose séquentiellement deux lignes du même produit dans une seule réception', async () => {
    const produitId = await newProduct();
    const commandeId = await newCommande([{ produit_id: produitId, quantite: 30, prix_unitaire: 500 }]);

    // Deux lignes du même produit : le CMP doit se composer ligne à ligne, pas
    // être écrasé par la dernière — d'où l'appel costedStockIn par ligne.
    const rec = await receptionService.create({
      commande_id: commandeId,
      location_id: locationId,
      lignes: [
        { produit_id: produitId, quantite_commandee: 10, quantite_recue: 10, cout_unitaire: 400 },
        { produit_id: produitId, quantite_commandee: 10, quantite_recue: 10, cout_unitaire: 600 },
      ],
    });
    createdReceptionIds.push(rec.id);

    const row = await stockRow(produitId);
    expect(row).toEqual({ quantite: 20, cmp: 500, valeur: 10000 });
  });

  it('refuse une réception supérieure à la quantité commandée', async () => {
    const produitId = await newProduct();
    const commandeId = await newCommande([{ produit_id: produitId, quantite: 5, prix_unitaire: 500 }]);

    await expect(
      receptionService.create({
        commande_id: commandeId,
        location_id: locationId,
        lignes: [{ produit_id: produitId, quantite_commandee: 5, quantite_recue: 6, cout_unitaire: 500 }],
      })
    ).rejects.toMatchObject({ statusCode: 422, code: 'OVER_RECEIPT' });

    // Rien ne doit avoir été écrit.
    expect(await stockRow(produitId)).toBeNull();
  });

  it('cumule les réceptions successives pour le plafond de sur-réception', async () => {
    const produitId = await newProduct();
    const commandeId = await newCommande([{ produit_id: produitId, quantite: 10, prix_unitaire: 500 }]);

    const first = await receptionService.create({
      commande_id: commandeId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite_commandee: 10, quantite_recue: 8, cout_unitaire: 500 }],
    });
    createdReceptionIds.push(first.id);

    // 8 déjà reçus + 3 = 11 > 10 commandés
    await expect(
      receptionService.create({
        commande_id: commandeId,
        location_id: locationId,
        lignes: [{ produit_id: produitId, quantite_commandee: 10, quantite_recue: 3, cout_unitaire: 500 }],
      })
    ).rejects.toMatchObject({ code: 'OVER_RECEIPT' });

    expect((await stockRow(produitId))?.quantite).toBe(8);
  });

  it('rejette une réception sans ligne', async () => {
    const commandeId = await newCommande([]);
    await expect(
      receptionService.create({ commande_id: commandeId, location_id: locationId, lignes: [] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('enregistre un mouvement de stock traçable par réception', async () => {
    const produitId = await newProduct();
    const commandeId = await newCommande([{ produit_id: produitId, quantite: 10, prix_unitaire: 500 }]);

    const rec = await receptionService.create({
      commande_id: commandeId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite_commandee: 10, quantite_recue: 7, cout_unitaire: 500 }],
    });
    createdReceptionIds.push(rec.id);

    const { rows } = await pool.query(
      `SELECT type_mouvement, quantite, stock_avant, stock_apres, reference_liee
       FROM mouvements_stock WHERE produit_id = $1 ORDER BY id DESC LIMIT 1`,
      [produitId]
    );
    // Le type est 'commande' (l'entrée provient d'une commande fournisseur),
    // pas 'entree' — la référence pointe sur le numéro de réception.
    expect(rows[0]).toMatchObject({
      type_mouvement: 'commande',
      quantite: 7,
      reference_liee: rec.numero_reception,
    });
    expect(Number(rows[0].stock_avant)).toBe(0);
    expect(Number(rows[0].stock_apres)).toBe(7);
  });

  it('synchronise produits.prix_achat sur le dernier coût reçu', async () => {
    const produitId = await newProduct();
    const commandeId = await newCommande([{ produit_id: produitId, quantite: 10, prix_unitaire: 900 }]);

    const rec = await receptionService.create({
      commande_id: commandeId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite_commandee: 10, quantite_recue: 10, cout_unitaire: 900 }],
    });
    createdReceptionIds.push(rec.id);

    const { rows } = await pool.query('SELECT prix_achat FROM produits WHERE id = $1', [produitId]);
    expect(Number(rows[0].prix_achat)).toBe(900);
  });

  it('la suppression restitue la quantité reçue', async () => {
    const produitId = await newProduct();
    const commandeId = await newCommande([{ produit_id: produitId, quantite: 20, prix_unitaire: 500 }]);

    const rec = await receptionService.create({
      commande_id: commandeId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite_commandee: 10, quantite_recue: 10, cout_unitaire: 500 }],
    });
    expect((await stockRow(produitId))?.quantite).toBe(10);

    await receptionService.delete(rec.id);
    expect((await stockRow(produitId))?.quantite).toBe(0);

    // Déjà supprimée : ne doit plus être trouvée.
    expect(await receptionService.delete(rec.id)).toBe(false);
  });

  it('getById renvoie la réception avec ses lignes', async () => {
    const produitId = await newProduct();
    const commandeId = await newCommande([{ produit_id: produitId, quantite: 10, prix_unitaire: 500 }]);

    const rec = await receptionService.create({
      commande_id: commandeId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite_commandee: 10, quantite_recue: 4, cout_unitaire: 500 }],
    });
    createdReceptionIds.push(rec.id);

    const detail = await receptionService.getById(rec.id);
    expect(detail).toMatchObject({ id: rec.id, numero_reception: rec.numero_reception });
    expect(detail.lignes).toHaveLength(1);
    expect(Number(detail.lignes[0].quantite_recue)).toBe(4);

    expect(await receptionService.getById(99999999)).toBeNull();
  });
});
