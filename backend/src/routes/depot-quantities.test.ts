import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';
import { commandeService } from '../services/CommandeService';
import { createRoleFixtures, removeRoleFixtures, RoleFixture, SupportedTestRole } from '../test/roleFixtures';

/**
 * E2 (2026-10-24) — le personnel de dépôt voit des quantités seulement :
 * aucun montant, coût, prix de vente, valeur de commande ni client dans les
 * réponses de réception, de stock et de transfert ; créer, modifier ou
 * valider une commande fournisseur est réservé au gérant et à
 * l'administrateur. Une réception saisie par le dépôt prend le prix de la
 * commande comme coût (son écran n'a plus de prix à envoyer).
 *
 * Plus `stocke_ici` (G-STOCK-01) sur GET /produits?location_id=… : « Non
 * stocké ici » au lieu d'une « Rupture » pour un produit jamais tenu à cet
 * emplacement.
 */
describe('Dépôt : des quantités, pas d’argent (E2) — et stocke_ici', () => {
  const suffix = `${Date.now() % 1000000}-${Math.floor(Math.random() * 1000)}`;
  let fixtures: RoleFixture[] = [];
  const tokens = new Map<SupportedTestRole, string>();
  const as = (role: SupportedTestRole) => ({ Authorization: `Bearer ${tokens.get(role)}` });
  const reference = `TEST-REF-E2-${suffix}`;

  let depotId: number;
  let fournisseurId: number;
  let produitId: number;
  let autreProduitId: number;
  let commandeId: number;
  const receptionIds: number[] = [];
  const commandeIds: number[] = [];

  const money = ['prix_achat', 'prix_vente', 'prix_unitaire', 'total_ligne', 'sous_total', 'cout_unitaire'];
  const expectNoMoney = (row: Record<string, unknown>) => {
    for (const key of money) expect(row, key).not.toHaveProperty(key);
  };

  beforeAll(async () => {
    fixtures = await createRoleFixtures();
    for (const f of fixtures) {
      const login = await request(app).post('/api/auth/login').send({ username: f.username, password: f.password });
      tokens.set(f.role, login.body.data.token);
    }

    const { rows: [loc] } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif) VALUES ($1, $2, 'depot', true) RETURNING id`,
      [`TE2D-${suffix}`.slice(0, 20), `Dépôt E2 ${suffix}`]
    );
    depotId = loc.id;

    const { rows: [t] } = await pool.query(
      `INSERT INTO tiers (raison_sociale, est_client, est_fournisseur) VALUES ($1, false, true) RETURNING id`,
      [`Fournisseur E2 ${suffix}`]
    );
    fournisseurId = t.id;

    const { rows: prods } = await pool.query(
      `INSERT INTO produits (reference, nom, categorie, prix_achat, prix_vente, stock, stock_min)
       VALUES ($1, $2, 'Test E2', 900, 1500, 0, 0), ($3, $4, 'Test E2', 100, 200, 0, 0)
       RETURNING id`,
      [reference, `Produit E2 ${suffix}`, `${reference}-B`, `Produit E2 jamais au dépôt ${suffix}`]
    );
    produitId = prods[0].id;
    autreProduitId = prods[1].id;

    const commande = await commandeService.create({
      tiersId: fournisseurId,
      lignes: [{ produit_id: produitId, quantite: 5, prix_unitaire: 1000 }],
      userId: null,
    } as any);
    commandeId = commande.id;
    commandeIds.push(commandeId);
    await commandeService.updateStatut(commandeId, 'validee');
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM reception_lignes WHERE reception_id = ANY($1::int[])', [receptionIds]);
      await pool.query('DELETE FROM receptions WHERE id = ANY($1::int[])', [receptionIds]);
      await pool.query('DELETE FROM mouvements_stock WHERE produit_id = ANY($1::int[])', [[produitId, autreProduitId]]);
      await pool.query('DELETE FROM stock_par_location WHERE produit_id = ANY($1::int[])', [[produitId, autreProduitId]]);
      await pool.query('DELETE FROM facture_fournisseur_lignes WHERE facture_id IN (SELECT id FROM factures_fournisseur WHERE commande_id = ANY($1::int[]))', [commandeIds]);
      await pool.query('DELETE FROM factures_fournisseur WHERE commande_id = ANY($1::int[])', [commandeIds]);
      await pool.query('DELETE FROM commande_lignes WHERE commande_id = ANY($1::int[])', [commandeIds]);
      await pool.query('DELETE FROM commandes_fournisseur WHERE id = ANY($1::int[])', [commandeIds]);
      await pool.query('DELETE FROM produits WHERE id = ANY($1::int[])', [[produitId, autreProduitId]]);
      await pool.query('DELETE FROM stock_locations WHERE id = $1', [depotId]);
      await pool.query('DELETE FROM compte_fournisseur_lignes WHERE tiers_id = $1', [fournisseurId]);
      await pool.query('DELETE FROM tiers WHERE id = $1', [fournisseurId]);
      await removeRoleFixtures(fixtures);
    } catch {
      // cleanup must never fail the suite
    } finally {
      await pool.end();
    }
  });

  it('les commandes fournisseur se créent, se modifient et se valident par le gérant ou l’administrateur seulement', async () => {
    const body = { tiers_id: fournisseurId, lignes: [{ produit_id: produitId, quantite: 1, prix_unitaire: 1000 }] };

    expect((await request(app).post('/api/commandes').set(as('depot_staff')).send(body)).status).toBe(403);
    expect((await request(app).put(`/api/commandes/${commandeId}`).set(as('depot_staff')).send(body)).status).toBe(403);
    expect((await request(app).put(`/api/commandes/${commandeId}/statut`).set(as('depot_staff')).send({ statut: 'annulee' })).status).toBe(403);
    expect((await request(app).get(`/api/commandes/${commandeId}/pdf`).set(as('depot_staff'))).status).toBe(403);
    // Créer un produit fixe ses prix : réservé au gérant et à l’administrateur.
    expect((await request(app).post('/api/produits').set(as('depot_staff'))
      .send({ reference: 'DEPOT-NO-CREATE', nom: 'Interdit au dépôt', prix_achat: 1, prix_vente: 2 })).status).toBe(403);

    const parGerant = await request(app).post('/api/commandes').set(as('manager')).send(body);
    expect(parGerant.status).toBe(201);
    commandeIds.push(parGerant.body.id ?? parGerant.body.data?.id);
  });

  it('une commande se lit sans prix ni valeur pour le dépôt, avec pour le gérant', async () => {
    const depot = await request(app).get(`/api/commandes/${commandeId}`).set(as('depot_staff'));
    expect(depot.status).toBe(200);
    expectNoMoney(depot.body.data);
    expect(depot.body.data.lignes[0]).toMatchObject({ produit_id: produitId, quantite: 5 });
    expectNoMoney(depot.body.data.lignes[0]);

    const gerant = await request(app).get(`/api/commandes/${commandeId}`).set(as('manager'));
    expect(Number(gerant.body.data.sous_total)).toBe(5000);
    expect(Number(gerant.body.data.lignes[0].prix_unitaire)).toBe(1000);

    const match = await request(app).get(`/api/commandes/${commandeId}/match`).set(as('depot_staff'));
    expect(match.status).toBe(200);
    expect(match.body.data.lignes[0]).not.toHaveProperty('prix_commande');
    expect(match.body.data.lignes[0]).toHaveProperty('qte_commandee', 5);
  });

  it('réception par le dépôt : quantités seulement, et le coût vient du prix de la commande', async () => {
    const pending = await request(app).get('/api/receptions/pending').set(as('depot_staff'));
    expect(pending.status).toBe(200);
    const row = pending.body.data.find((c: any) => c.id === commandeId);
    expect(row).toBeTruthy();
    expectNoMoney(row);

    const order = await request(app).get(`/api/receptions/order/${commandeId}`).set(as('depot_staff'));
    expect(order.status).toBe(200);
    expectNoMoney(order.body.data);
    expectNoMoney(order.body.data.lignes[0]);
    expect(order.body.data.lignes[0]).toMatchObject({ quantite: 5, quantite_restante: 5 });

    // A depot screen without prices sends 0 (or nothing): the order price is used.
    const created = await request(app)
      .post('/api/receptions')
      .set(as('depot_staff'))
      .send({
        commande_id: commandeId,
        location_id: depotId,
        lignes: [{ produit_id: produitId, quantite_commandee: 5, quantite_recue: 2, cout_unitaire: 0 }],
      });
    expect(created.status).toBe(201);
    receptionIds.push(created.body.data.id);

    const { rows: [ligne] } = await pool.query(
      'SELECT cout_unitaire, total_ligne FROM reception_lignes WHERE reception_id = $1',
      [created.body.data.id]
    );
    expect(Number(ligne.cout_unitaire)).toBe(1000);
    expect(Number(ligne.total_ligne)).toBe(2000);
    const { rows: [spl] } = await pool.query(
      'SELECT quantite, cmp FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
      [produitId, depotId]
    );
    expect(Number(spl.quantite)).toBe(2);
    expect(Number(spl.cmp)).toBe(1000);

    const detail = await request(app).get(`/api/receptions/${created.body.data.id}`).set(as('depot_staff'));
    expect(detail.status).toBe(200);
    expectNoMoney(detail.body.data.lignes[0]);
    expect(detail.body.data.lignes[0]).toMatchObject({ quantite_recue: 2 });

    // Without a cost, an admin reception also takes the order price.
    const sansCout = await request(app)
      .post('/api/receptions')
      .set(as('admin'))
      .send({
        commande_id: commandeId,
        location_id: depotId,
        lignes: [{ produit_id: produitId, quantite_commandee: 5, quantite_recue: 1 }],
      });
    expect(sansCout.status).toBe(201);
    receptionIds.push(sansCout.body.data.id);
    const { rows: [l2] } = await pool.query('SELECT cout_unitaire FROM reception_lignes WHERE reception_id = $1', [sansCout.body.data.id]);
    expect(Number(l2.cout_unitaire)).toBe(1000);
  });

  it('produits et stock : sans prix pour le dépôt ; stocke_ici distingue « non stocké ici » de la rupture', async () => {
    const depot = await request(app).get(`/api/produits?search=${reference}&location_id=${depotId}&limit=10`).set(as('depot_staff'));
    expect(depot.status).toBe(200);
    const recu = depot.body.data.find((p: any) => p.id === produitId);
    const jamais = depot.body.data.find((p: any) => p.id === autreProduitId);
    expectNoMoney(recu);
    expect(recu).toMatchObject({ stock: 3, stocke_ici: true });
    expect(jamais).toMatchObject({ stock: 0, stocke_ici: false });

    const admin = await request(app).get(`/api/produits?search=${reference}&location_id=${depotId}&limit=10`).set(as('admin'));
    const recuAdmin = admin.body.data.find((p: any) => p.id === produitId);
    expect(Number(recuAdmin.prix_vente)).toBe(1500);
    expect(recuAdmin.stocke_ici).toBe(true);

    const fiche = await request(app).get(`/api/produits/${produitId}`).set(as('depot_staff'));
    expectNoMoney(fiche.body.data);

    const levels = await request(app).get(`/api/stock-locations/${depotId}/products-with-stock`).set(as('depot_staff'));
    expect(levels.status).toBe(200);
    for (const row of levels.body.data) expectNoMoney(row);

    const categories = await request(app).get('/api/produits/stock-by-category').set(as('depot_staff'));
    const cat = categories.body.data.find((c: any) => c.categorie === 'Test E2');
    expect(cat).toBeTruthy();
    expect(cat).not.toHaveProperty('valeur_vente');
    expect(cat).not.toHaveProperty('valeur_achat');
  });

  it('informations d’achat : le fournisseur, jamais un prix ni un client', async () => {
    const res = await request(app).get(`/api/produits/${produitId}/info-achat`).set(as('depot_staff'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ prix_achat: null, price_stats: null, top_buyer: null });
    const history = res.body.data.order_history as any[];
    expect(history.length).toBeGreaterThan(0);
    for (const h of history) expect(h).not.toHaveProperty('prix_unitaire');
    expect(history.map((h) => h.quantite)).toContain(5);

    const gerant = await request(app).get(`/api/produits/${produitId}/info-achat`).set(as('manager'));
    expect((gerant.body.data.order_history as any[]).every((h) => h.prix_unitaire === 1000)).toBe(true);
  });

  it('le dépôt ne change pas un prix qu’il ne voit pas', async () => {
    const res = await request(app)
      .put(`/api/produits/${produitId}`)
      .set(as('depot_staff'))
      .send({ nom: `Produit E2 renommé ${suffix}`, prix_vente: 0, prix_achat: 0 });
    expect(res.status).toBe(200);
    expectNoMoney(res.body.data);

    const { rows: [p] } = await pool.query('SELECT nom, prix_vente, prix_achat FROM produits WHERE id = $1', [produitId]);
    expect(p.nom).toBe(`Produit E2 renommé ${suffix}`);
    expect(Number(p.prix_vente)).toBe(1500);

    const prixSeuls = await request(app).put(`/api/produits/${produitId}`).set(as('depot_staff')).send({ prix_vente: 1 });
    expect(prixSeuls.status).toBe(400);
  });
});
