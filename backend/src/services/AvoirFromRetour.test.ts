import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import app from '../server';
import pool from '../db/connection';
import { returnService } from './ReturnService';
import { FactureService } from './FactureService';
import { costedStockIn } from './StockCostingService';
import { TestDB } from '../test/helpers';

const factureService = new FactureService();

/**
 * Retour approuvé → avoir (U-08).
 *
 * `create_avoir_from_retour()` insérait encore `factures_avoir.client_id`
 * (colonne disparue en 043) : POST /api/avoirs/from-retour répondait 500
 * « Erreur serveur » après avoir consommé un numéro d'avoir. La migration 106
 * la réécrit sur `tiers_id`, avec ses lignes dans `document_lignes` et le
 * crédit au relevé du client. Le KPI « Total remboursé » additionnait aussi
 * les retours en attente et annulés.
 *
 * La base de test est construite depuis ci-baseline.sql : tant que la
 * baseline n'est pas régénérée, la migration est appliquée ici (idempotente).
 */
describe('Avoir depuis un retour (U-08)', () => {
  let authToken: string;
  let locationId: number;
  let tiersId: number;
  let autreTiersId: number;
  const suffix = `${Date.now() % 1000000}`;
  const retourIds: number[] = [];
  const factureIds: number[] = [];
  const produitIds: number[] = [];

  const auth = () => ({ Authorization: `Bearer ${authToken}` });

  /** A sold product and a return of `qty` of it, optionally approved. */
  async function retour(qty: number, approuver: boolean, prix = 2500) {
    const produitId = await TestDB.createTestProduct({ reference: `TEST-REF-AVR-${suffix}-${produitIds.length}`, prix_vente: prix, stock: 0 });
    produitIds.push(produitId);
    await costedStockIn(pool, { produitId, locationId, quantite: 10, unitCost: 1000 });
    const facture = await factureService.create({
      tiers_id: tiersId,
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite: 5, prix_unitaire: prix }],
    });
    factureIds.push(facture.id);
    const r = await returnService.create({
      tiers_id: tiersId,
      lignes: [{ facture_id: facture.id, produit_id: produitId, quantite: qty, raison: 'defectueux' }],
    });
    retourIds.push(r.id);
    if (approuver) await returnService.updateStatut(r.id, 'traite');
    return { retourId: r.id, numero: r.numero_retour, factureId: facture.id, produitId, total: qty * prix };
  }

  beforeAll(async () => {
    await pool.query(readFileSync(path.join(__dirname, '../db/106_fix_avoir_retour_et_messages_caisse.sql'), 'utf8'));

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    authToken = login.body.data.token;

    const { rows: [loc] } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif) VALUES ($1, $2, 'magasin', true) RETURNING id`,
      [`TAVR-${suffix}`, `Test Avoir Retour ${suffix}`]
    );
    locationId = loc.id;
    tiersId = await TestDB.createTestClient({ nom: `Client avoir retour ${suffix}` });
    autreTiersId = await TestDB.createTestClient({ nom: `Autre client avoir ${suffix}` });
  });

  afterAll(async () => {
    const { rows: avoirs } = await pool.query('SELECT id FROM factures_avoir WHERE retour_id = ANY($1::int[])', [retourIds]);
    const avoirIds = avoirs.map((a) => a.id);
    await pool.query(`DELETE FROM document_lignes WHERE document_type = 'avoir' AND document_id = ANY($1::int[])`, [avoirIds]);
    await pool.query('DELETE FROM factures_avoir WHERE id = ANY($1::int[])', [avoirIds]);
    await pool.query('DELETE FROM retour_lignes WHERE retour_id = ANY($1::int[])', [retourIds]);
    await pool.query('DELETE FROM retours WHERE id = ANY($1::int[])', [retourIds]);
    await TestDB.deleteInvoicesByIds(factureIds);
    await pool.query('DELETE FROM mouvements_stock WHERE produit_id = ANY($1::int[])', [produitIds]);
    await pool.query('DELETE FROM stock_par_location WHERE produit_id = ANY($1::int[])', [produitIds]);
    await pool.query('DELETE FROM produits WHERE id = ANY($1::int[])', [produitIds]);
    await pool.query('DELETE FROM stock_locations WHERE id = $1', [locationId]);
    await pool.query('DELETE FROM compte_client_lignes WHERE tiers_id = ANY($1::int[])', [[tiersId, autreTiersId]]);
    await pool.query('DELETE FROM tiers WHERE id = ANY($1::int[])', [[tiersId, autreTiersId]]);
    await pool.end();
  });

  it('crée l’avoir d’un retour approuvé : client, facture, lignes et relevé', async () => {
    const r = await retour(2, true);

    const res = await request(app).post('/api/avoirs/from-retour').set(auth()).send({ retour_id: r.retourId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.numero_avoir).toMatch(/^AVOIR-\d{4}-\d{5}$/);

    const detail = await request(app).get(`/api/avoirs/${res.body.data.avoir_id}`).set(auth());
    expect(detail.body.data).toMatchObject({
      tiers_id: tiersId,
      retour_id: r.retourId,
      facture_origine_id: r.factureId,
      statut: 'valide',
      avoir_type: 'retour',
    });
    expect(Number(detail.body.data.total)).toBe(r.total);
    expect(detail.body.data.lignes).toHaveLength(1);
    expect(detail.body.data.lignes[0]).toMatchObject({ produit_id: r.produitId, quantite: 2 });

    const { rows: releve } = await pool.query(
      `SELECT montant_credit FROM compte_client_lignes WHERE type_operation = 'avoir' AND document_id = $1`,
      [res.body.data.avoir_id]
    );
    expect(releve.map((l) => Number(l.montant_credit))).toEqual([r.total]);

    // The retour now points at its avoir.
    const ret = await request(app).get(`/api/retours/${r.retourId}`).set(auth());
    expect(ret.body.data).toMatchObject({ avoir_id: res.body.data.avoir_id, numero_avoir: res.body.data.numero_avoir });
  });

  it('refuse un retour non approuvé, en français, sans 500', async () => {
    const r = await retour(1, false);
    const res = await request(app).post('/api/avoirs/from-retour').set(auth()).send({ retour_id: r.retourId });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(`Approuvez le retour ${r.numero} avant de créer son avoir.`);
  });

  it('refuse un second avoir pour le même retour', async () => {
    const r = await retour(1, true);
    const first = await request(app).post('/api/avoirs/from-retour').set(auth()).send({ retour_id: r.retourId });
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/avoirs/from-retour').set(auth()).send({ retour_id: r.retourId });
    expect(second.status).toBe(409);
    expect(second.body.error).toContain(first.body.data.numero_avoir);
  });

  it('répond 404 pour un retour inconnu', async () => {
    const res = await request(app).post('/api/avoirs/from-retour').set(auth()).send({ retour_id: 999999999 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Retour introuvable.');
  });

  it('un avoir manuel rattaché à un retour suit les mêmes règles', async () => {
    const pending = await retour(1, false);
    const ligne = { produit_id: pending.produitId, quantite: 1, prix_unitaire: 2500 };
    const notApproved = await request(app).post('/api/avoirs/manual').set(auth()).send({
      tiers_id: tiersId, facture_origine_id: pending.factureId, retour_id: pending.retourId, avoir_type: 'retour', lignes: [ligne],
    });
    expect(notApproved.status).toBe(409);

    const approved = await retour(1, true);
    const ok = await request(app).post('/api/avoirs/manual').set(auth()).send({
      tiers_id: tiersId, facture_origine_id: approved.factureId, retour_id: approved.retourId, avoir_type: 'retour',
      lignes: [{ ...ligne, produit_id: approved.produitId }],
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const again = await request(app).post('/api/avoirs/from-retour').set(auth()).send({ retour_id: approved.retourId });
    expect(again.status).toBe(409);

    const { rows } = await pool.query(
      `SELECT notes FROM compte_client_lignes WHERE type_operation = 'avoir' AND document_id = $1`,
      [ok.body.data.avoir_id]
    );
    expect(rows[0].notes).toMatch(/^Avoir AVOIR-/);
  });

  it('refuse d’annuler un retour approuvé dont l’avoir est émis', async () => {
    const r = await retour(1, true);
    const avoir = await request(app).post('/api/avoirs/from-retour').set(auth()).send({ retour_id: r.retourId });
    await expect(returnService.updateStatut(r.retourId, 'annule')).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining(avoir.body.data.numero_avoir),
    });
  });

  it('« Total remboursé » ne compte que les retours approuvés', async () => {
    const statsAvant = await returnService.getStats();
    await retour(1, false); // en attente
    const annule = await retour(1, false);
    await returnService.updateStatut(annule.retourId, 'annule');
    const approuve = await retour(2, true, 1000);

    const stats = await returnService.getStats();
    expect(Number(stats.montant_total_rembourse) - Number(statsAvant.montant_total_rembourse)).toBe(approuve.total);
    expect(Number(stats.montant_en_attente) - Number(statsAvant.montant_en_attente)).toBe(2500);
  });
});
