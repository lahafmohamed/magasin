import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import bonLivraisonService from './BonLivraisonService';
import devisService from './DevisService';
import { costedStockIn } from './StockCostingService';
import { TestDB } from '../test/helpers';
import { calculateDueDate, formatDateForPg } from '../utils/dueDate';

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

  it('un BL saisi sans emplacement prend celui de son devis, comme le BL automatique', async () => {
    const produitId = await stockedProduct(10);
    const devisId = await makeDevis(produitId, 2);
    const bl = await bonLivraisonService.create({
      tiers_id: tiersId,
      devis_id: devisId,
      lignes: [{ produit_id: produitId, quantite_commandee: 2, quantite_livree: 2, prix_unitaire: 1000 }],
    });
    createdBlIds.push(bl.id);

    const { rows } = await pool.query('SELECT location_id FROM bons_livraison WHERE id = $1', [bl.id]);
    expect(rows[0].location_id).toBe(locationId);

    // La livraison sort donc le stock du magasin du devis.
    await bonLivraisonService.updateStatut(bl.id, 'livre');
    expect(await stockAt(produitId)).toBe(8);
  });

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

    await expect(bonLivraisonService.updateStatut(blId, 'expedie')).rejects.toMatchObject({ statusCode: 400, message: 'Statut de bon de livraison inconnu.' });
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

  // ---- Défauts #3 et #4 du plan v1 (SIGNOFF 2026-10-23) ----
  // Les conversions passaient par des fonctions SQL d'avant le schéma unifié :
  // devis → facture insérait `factures.client_id` (colonne disparue, 500), et
  // BL → facture laissait l'échéance et l'auteur vides et le coût d'achat à 0
  // (marges surestimées). Il n'y a plus qu'un chemin, `convertBlToFactureInTx`.

  it('la facture issue d’un bon porte l’échéance du client, son auteur et le coût d’achat', async () => {
    await pool.query(`UPDATE tiers SET delai_paiement = 'net_30' WHERE id = $1`, [tiersId]);
    try {
      const produitId = await stockedProduct(10);
      const blId = await makeBl(produitId, 4);
      await bonLivraisonService.updateStatut(blId, 'livre');

      const { rows: [auteur] } = await pool.query('SELECT id FROM utilisateurs ORDER BY id LIMIT 1');
      const { facture_id } = await bonLivraisonService.convertToFacture(blId, auteur.id);
      createdFactureIds.push(facture_id);

      const { rows: [fac] } = await pool.query(
        `SELECT to_char(date_echeance, 'YYYY-MM-DD') AS echeance, delai_paiement, cree_par,
                bl_id, total, remaining_due, statut
         FROM factures WHERE id = $1`,
        [facture_id]
      );
      expect(fac.echeance).toBe(formatDateForPg(calculateDueDate('net_30')));
      expect(fac.delai_paiement).toBe('net_30');
      expect(fac.cree_par).toBe(auteur.id);
      expect(fac.bl_id).toBe(blId);
      expect(Number(fac.total)).toBe(4000);
      expect(Number(fac.remaining_due)).toBe(4000);
      expect(fac.statut).toBe('en_attente');

      const { rows: lignes } = await pool.query(
        `SELECT fl.quantite, fl.prix_unitaire, fl.total_ligne, fl.prix_achat_unitaire, fl.parent_ligne_id,
                p.prix_achat
         FROM document_lignes fl JOIN produits p ON p.id = fl.produit_id
         WHERE fl.document_type = 'facture' AND fl.document_id = $1`,
        [facture_id]
      );
      expect(lignes).toHaveLength(1);
      expect(Number(lignes[0].quantite)).toBe(4);
      expect(Number(lignes[0].total_ligne)).toBe(4000);
      // Coût reporté sur la ligne : jamais 0 pour un produit qui a un coût.
      expect(Number(lignes[0].prix_achat_unitaire)).toBeGreaterThan(0);
      expect(Number(lignes[0].prix_achat_unitaire)).toBe(Number(lignes[0].prix_achat));
      // Lien vers la ligne du bon : c'est lui qui trace devis ↔ BL ↔ facture.
      expect(lignes[0].parent_ligne_id).not.toBeNull();
    } finally {
      await pool.query(`UPDATE tiers SET delai_paiement = 'immediat' WHERE id = $1`, [tiersId]);
    }
  });

  it('un client sans délai est facturé à échéance immédiate', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 2);
    await bonLivraisonService.updateStatut(blId, 'livre');

    const { facture_id } = await bonLivraisonService.convertToFacture(blId, 1);
    createdFactureIds.push(facture_id);

    const { rows: [fac] } = await pool.query(
      `SELECT to_char(date_echeance, 'YYYY-MM-DD') AS echeance FROM factures WHERE id = $1`,
      [facture_id]
    );
    expect(fac.echeance).toBe(formatDateForPg(calculateDueDate('immediat')));
  });

  it('convertir le devis facture son bon livré par le même chemin, et marque devis et bon', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 3);
    await bonLivraisonService.updateStatut(blId, 'livre');
    const { rows: [bl] } = await pool.query('SELECT devis_id FROM bons_livraison WHERE id = $1', [blId]);

    const { rows: [auteur] } = await pool.query('SELECT id FROM utilisateurs ORDER BY id LIMIT 1');
    const { facture_id, numero_facture } = await devisService.convertToFacture(bl.devis_id, auteur.id);
    createdFactureIds.push(facture_id);

    expect(numero_facture).toMatch(/^FAC-\d{4}-\d{5}$/);

    const { rows: [fac] } = await pool.query(
      `SELECT tiers_id, devis_id, bl_id, total, cree_par, date_echeance FROM factures WHERE id = $1`,
      [facture_id]
    );
    expect(fac.tiers_id).toBe(tiersId);
    expect(fac.devis_id).toBe(bl.devis_id);
    expect(fac.bl_id).toBe(blId);
    expect(Number(fac.total)).toBe(3000);
    expect(fac.cree_par).toBe(auteur.id);
    expect(fac.date_echeance).not.toBeNull();

    const { rows: [devis] } = await pool.query('SELECT statut, facture_id FROM devis WHERE id = $1', [bl.devis_id]);
    expect(devis.statut).toBe('converti');
    expect(devis.facture_id).toBe(facture_id);

    const { rows: [blApres] } = await pool.query('SELECT statut, facture_id FROM bons_livraison WHERE id = $1', [blId]);
    expect(blApres.statut).toBe('facture');
    expect(blApres.facture_id).toBe(facture_id);

    // Le relevé du client porte la facture, une seule fois.
    const { rows: releve } = await pool.query(
      `SELECT montant_debit FROM compte_client_lignes
       WHERE tiers_id = $1 AND type_operation = 'facture' AND document_id = $2`,
      [tiersId, facture_id]
    );
    expect(releve).toHaveLength(1);
    expect(Number(releve[0].montant_debit)).toBe(3000);

    // Reconvertir est refusé avec une phrase, pas une erreur SQL.
    await expect(devisService.convertToFacture(bl.devis_id, auteur.id)).rejects.toThrow(/déjà converti/);
  });

  it('un devis sans bon livré ne se facture pas', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 2); // bon créé, pas encore livré
    const { rows: [bl] } = await pool.query('SELECT devis_id FROM bons_livraison WHERE id = $1', [blId]);

    await expect(devisService.convertToFacture(bl.devis_id, 1)).rejects.toThrow(/bon de livraison marqué comme livré/);

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM factures WHERE devis_id = $1', [bl.devis_id]);
    expect(rows[0].n).toBe(0);
  });

  it('les fonctions SQL de conversion d’avant le schéma unifié n’existent plus (migration 113)', async () => {
    // Un baseline régénéré depuis une base non migrée les ramènerait en silence.
    const { rows } = await pool.query(
      `SELECT proname FROM pg_proc
       WHERE proname IN ('convert_devis_to_facture', 'convert_bl_to_facture', 'convert_devis_to_bl')`
    );
    expect(rows).toEqual([]);
  });

  // ---- Read paths, now served by the shared SalesDocumentQuery engine ----

  it('liste, filtre et compte de façon cohérente', async () => {
    const produitId = await stockedProduct(30);
    const a = await makeBl(produitId, 1);
    const b = await makeBl(produitId, 2);
    await makeBl(produitId, 3);
    await bonLivraisonService.updateStatut(a, 'livre');
    await bonLivraisonService.updateStatut(b, 'annule');

    const all = await bonLivraisonService.getAll(undefined, undefined, tiersId);
    expect(all.data).toHaveLength(3);
    expect(all.pagination.total).toBe(3);

    const livres = await bonLivraisonService.getAll(undefined, 'livre', tiersId);
    expect(livres.data).toHaveLength(1);
    expect(livres.pagination.total).toBe(1);

    // Le total doit suivre le filtre : c'est exactement la dérive que le moteur
    // partagé rend impossible (une seule clause WHERE pour page et comptage).
    const annules = await bonLivraisonService.getAll(undefined, 'annule', tiersId);
    expect(annules.pagination.total).toBe(1);
  });

  it('pagine sans fausser le total', async () => {
    const produitId = await stockedProduct(30);
    await makeBl(produitId, 1);
    await makeBl(produitId, 2);
    await makeBl(produitId, 3);

    const page1 = await bonLivraisonService.getAll(undefined, undefined, tiersId, 1, 2);
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const page2 = await bonLivraisonService.getAll(undefined, undefined, tiersId, 2, 2);
    expect(page2.data).toHaveLength(1);
    expect(page2.pagination.total).toBe(3);
  });

  it('recherche par numéro de bon', async () => {
    const produitId = await stockedProduct(10);
    const blId = await makeBl(produitId, 1);
    const { rows } = await pool.query('SELECT numero_bl FROM bons_livraison WHERE id = $1', [blId]);

    const found = await bonLivraisonService.getAll(rows[0].numero_bl, undefined, tiersId);
    expect(found.data).toHaveLength(1);
    expect(found.pagination.total).toBe(1);
    expect(found.data[0].id).toBe(blId);
  });

  it('expose le numéro de devis lié dans la liste', async () => {
    const produitId = await stockedProduct(10);
    await makeBl(produitId, 1);

    const list = await bonLivraisonService.getAll(undefined, undefined, tiersId);
    expect(list.data[0].numero_devis).toMatch(/^DEV-TEST-/);
    expect(list.data[0].client_nom).toContain('TEST BL CLIENT');
  });

  it('ignore une clé de tri hors liste blanche', async () => {
    const produitId = await stockedProduct(10);
    await makeBl(produitId, 1);

    // Ne doit pas lever : la clé inconnue retombe sur la date du document.
    const list = await bonLivraisonService.getAll(undefined, undefined, tiersId, 1, 20, 'DROP TABLE', 'asc');
    expect(list.data).toHaveLength(1);
  });

  it('getStats renvoie les compteurs du bon de livraison', async () => {
    const produitId = await stockedProduct(30);
    const a = await makeBl(produitId, 1);
    await makeBl(produitId, 2);
    await bonLivraisonService.updateStatut(a, 'livre');

    const stats = await bonLivraisonService.getStats();
    expect(stats.total.count).toBeGreaterThanOrEqual(2);
    expect(stats.a_facturer.count).toBeGreaterThanOrEqual(1);
    expect(stats.mois).toHaveProperty('montant');
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
