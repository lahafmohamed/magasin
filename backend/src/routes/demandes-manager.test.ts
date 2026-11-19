import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';
import { demandeService } from '../services/DemandeService';
import { createRoleFixtures, removeRoleFixtures, RoleFixture, SupportedTestRole } from '../test/roleFixtures';

/**
 * Décision produit D2 (2026-10-23) : le gérant décide et exécute les demandes
 * de réapprovisionnement comme l'administrateur, sans être affecté au dépôt.
 *
 * Avant : la route laissait passer `manager` (CAN_DECIDE) mais le contrôleur
 * exigeait une affectation au dépôt pour tout autre rôle qu'`admin` —
 * `POST /demandes/:id/decider` répondait 403 « Seul le personnel du dépôt
 * concerné peut décider », et `GET /demandes/:id` répondait 403
 * « Permissions insuffisantes ». La cloche et le tableau de bord l'invitaient
 * pourtant à décider : impasse.
 */
describe('Demandes — le gérant décide et exécute (D2)', () => {
  let fixtures: RoleFixture[] = [];
  const tokens = new Map<SupportedTestRole, string>();
  let magasinId: number;
  let depotId: number;
  let produitId: number;
  const produitNom = `Produit demande gérant ${Date.now() % 1000000}`;
  const demandeIds: number[] = [];

  const as = (role: SupportedTestRole) => ({ Authorization: `Bearer ${tokens.get(role)}` });
  const userId = (role: SupportedTestRole) => fixtures.find((f) => f.role === role)!.id;

  async function demandeEnvoyee(quantite: number): Promise<number> {
    const { id } = await demandeService.create({
      magasin_id: magasinId,
      depot_id: depotId,
      lignes: [{ produit_id: produitId, quantite_demandee: quantite }],
      created_by_user_id: userId('admin'),
    });
    demandeIds.push(id);
    await demandeService.send(id, userId('admin'));
    return id;
  }

  beforeAll(async () => {
    fixtures = await createRoleFixtures();
    for (const f of fixtures) {
      const login = await request(app).post('/api/auth/login').send({ username: f.username, password: f.password });
      tokens.set(f.role, login.body.data.token);
    }

    const suffix = `${Date.now() % 1000000}`;
    const { rows: locs } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1, $2, 'magasin', true), ($3, $4, 'depot', true)
       RETURNING id, location_type`,
      [`TDM-${suffix}`, `Magasin D2 ${suffix}`, `TDD2-${suffix}`, `Dépôt D2 ${suffix}`]
    );
    magasinId = locs.find((l) => l.location_type === 'magasin').id;
    depotId = locs.find((l) => l.location_type === 'depot').id;

    const { rows: [p] } = await pool.query(
      `INSERT INTO produits (reference, nom, prix_achat, prix_vente, stock, stock_min)
       VALUES ($1, $2, 500, 1000, 0, 0) RETURNING id`,
      [`TEST-REF-D2-${suffix}`, produitNom]
    );
    produitId = p.id;
    await pool.query(
      `INSERT INTO stock_par_location (produit_id, location_id, quantite, cmp)
       VALUES ($1, $2, 10, 500)`,
      [produitId, depotId]
    );
  });

  afterAll(async () => {
    await pool.query(
      'DELETE FROM stock_transfer_lignes WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE demande_id = ANY($1::int[]))',
      [demandeIds]
    );
    await pool.query('UPDATE demandes_reapprovisionnement SET transfert_id = NULL WHERE id = ANY($1::int[])', [demandeIds]);
    await pool.query('DELETE FROM stock_transfers WHERE demande_id = ANY($1::int[])', [demandeIds]);
    await pool.query('DELETE FROM demandes_reapprovisionnement WHERE id = ANY($1::int[])', [demandeIds]);
    await pool.query('DELETE FROM mouvements_stock WHERE produit_id = $1', [produitId]);
    await pool.query('DELETE FROM stock_par_location WHERE produit_id = $1', [produitId]);
    await pool.query('DELETE FROM produits WHERE id = $1', [produitId]);
    await pool.query('DELETE FROM stock_locations WHERE id = ANY($1::int[])', [[magasinId, depotId]]);
    await removeRoleFixtures(fixtures);
    await pool.end();
  });

  it('le gérant ouvre le détail d’une demande sans affectation (403 avant D2)', async () => {
    const id = await demandeEnvoyee(2);
    const res = await request(app).get(`/api/demandes/${id}`).set(as('manager'));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('le gérant applique les filtres d’emplacement de la liste, comme l’administrateur', async () => {
    const res = await request(app).get(`/api/demandes?depot_id=${depotId}&limit=100`).set(as('manager'));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((d: any) => d.depot_id === depotId)).toBe(true);
  });

  it('le personnel d’un autre dépôt reste refusé', async () => {
    const id = await demandeEnvoyee(1);
    const res = await request(app)
      .post(`/api/demandes/${id}/decider`)
      .set(as('depot_staff'))
      .send({ decision: 'approuvee' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/gérant/);
  });

  it('le gérant approuve puis exécute la demande : le stock passe du dépôt au magasin', async () => {
    const id = await demandeEnvoyee(3);

    const decision = await request(app)
      .post(`/api/demandes/${id}/decider`)
      .set(as('manager'))
      .send({ decision: 'approuvee' });
    expect(decision.status, JSON.stringify(decision.body)).toBe(200);

    const execution = await request(app).post(`/api/demandes/${id}/executer`).set(as('manager'));
    expect(execution.status, JSON.stringify(execution.body)).toBe(200);
    expect(execution.body.data.transfert_id).toEqual(expect.any(Number));

    const { rows } = await pool.query(
      'SELECT statut, executed_by_user_id FROM demandes_reapprovisionnement WHERE id = $1',
      [id]
    );
    expect(rows[0]).toEqual({ statut: 'livree', executed_by_user_id: userId('manager') });

    const { rows: stock } = await pool.query(
      'SELECT location_id, quantite FROM stock_par_location WHERE produit_id = $1 ORDER BY location_id',
      [produitId]
    );
    const byLocation = new Map(stock.map((r: any) => [r.location_id, Number(r.quantite)]));
    expect(byLocation.get(depotId)).toBe(7);
    expect(byLocation.get(magasinId)).toBe(3);
  });

  it('le gérant envoie, modifie et annule une demande, même créée par un autre', async () => {
    const { id } = await demandeService.create({
      magasin_id: magasinId,
      depot_id: depotId,
      lignes: [{ produit_id: produitId, quantite_demandee: 2 }],
      created_by_user_id: userId('admin'),
    });
    demandeIds.push(id);

    const update = await request(app).put(`/api/demandes/${id}`).set(as('manager'))
      .send({ lignes: [{ produit_id: produitId, quantite_demandee: 3 }] });
    expect(update.status).toBe(200);

    const sent = await request(app).post(`/api/demandes/${id}/envoyer`).set(as('manager'));
    expect(sent.status).toBe(200);

    const cancelled = await request(app).post(`/api/demandes/${id}/annuler`).set(as('manager'));
    expect(cancelled.status).toBe(200);
  });

  it('liste : plusieurs statuts séparés par des virgules et recherche, statut inconnu refusé', async () => {
    await demandeEnvoyee(1);
    const { rows: [mag] } = await pool.query('SELECT nom FROM stock_locations WHERE id = $1', [magasinId]);

    const res = await request(app)
      .get('/api/demandes')
      .query({ statut: 'envoyee,approuvee', search: mag.nom, limit: 100 })
      .set(as('manager'));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((d: any) => ['envoyee', 'approuvee'].includes(d.statut))).toBe(true);
    expect(res.body.data.every((d: any) => d.magasin_id === magasinId)).toBe(true);
    expect(res.body.pagination.total).toBe(res.body.data.length);

    const bad = await request(app).get('/api/demandes').query({ statut: 'envoyee,perdue' }).set(as('manager'));
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Statut de demande inconnu.');
  });

  it('le caissier ne voit que ses propres demandes, comme sur le détail', async () => {
    const autre = await demandeEnvoyee(1);
    const { id: sienne } = await demandeService.create({
      magasin_id: magasinId,
      depot_id: depotId,
      lignes: [{ produit_id: produitId, quantite_demandee: 1 }],
      created_by_user_id: userId('caissier'),
    });
    demandeIds.push(sienne);

    const list = await request(app).get('/api/demandes').query({ limit: 100 }).set(as('caissier'));
    expect(list.status).toBe(200);
    const ids = list.body.data.map((d: any) => d.id);
    expect(ids).toContain(sienne);
    expect(ids).not.toContain(autre);
    expect(list.body.data.every((d: any) => d.created_by_user_id === userId('caissier'))).toBe(true);

    expect((await request(app).get(`/api/demandes/${sienne}`).set(as('caissier'))).status).toBe(200);
    expect((await request(app).get(`/api/demandes/${autre}`).set(as('caissier'))).status).toBe(403);
  });

  it('un stock dépôt insuffisant nomme le produit au lieu de son identifiant', async () => {
    const id = await demandeEnvoyee(50);
    await request(app).post(`/api/demandes/${id}/decider`).set(as('manager')).send({ decision: 'approuvee' });

    const res = await request(app).post(`/api/demandes/${id}/executer`).set(as('manager'));
    expect(res.status).toBe(422);
    expect(res.body.error).toContain(`« ${produitNom} »`);
    expect(res.body.error).not.toMatch(/produit \d+/);
  });
});
