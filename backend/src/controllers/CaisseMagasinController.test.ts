import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';

/**
 * Integration tests for the caisse session lifecycle:
 * open -> mouvements divers (running balance) -> clôture (écart espèces) ->
 * closed-session guard. Uses a dedicated throwaway magasin so the dev DB's
 * real sessions are never touched.
 */

let authToken: string;
let magasinId: number;
let sessionId: number;

const auth = () => ({ Authorization: `Bearer ${authToken}` });

describe('Caisse magasin API (Integration)', () => {
  beforeAll(async () => {
    const login = await request(app).post('/api/auth/login').send({
      username: 'admin',
      password: 'admin123',
    });
    authToken = login.body.data.token;

    const { rows } = await pool.query(
      `INSERT INTO magasins (code, nom, actif) VALUES ($1, 'Caisse Test Magasin', true) RETURNING id`,
      [`TST-${Date.now().toString(36)}`]
    );
    magasinId = rows[0].id;
  });

  afterAll(async () => {
    try {
      await pool.query(
        `DELETE FROM mouvements_caisse WHERE session_caisse_id IN (SELECT id FROM sessions_caisse WHERE magasin_id = $1)`,
        [magasinId]
      );
      await pool.query(`DELETE FROM sessions_caisse WHERE magasin_id = $1`, [magasinId]);
      await pool.query(`DELETE FROM magasins WHERE id = $1`, [magasinId]);
    } catch {
      // cleanup must never fail the suite
    }
  });

  it('rejects opening without auth', async () => {
    const res = await request(app).post('/api/caisse/ouvrir').send({ magasin_id: magasinId, fond_initial: 1000 });
    expect(res.status).toBe(401);
  });

  it('rejects a negative fond_initial (Zod)', async () => {
    const res = await request(app)
      .post('/api/caisse/ouvrir')
      .set(auth())
      .send({ magasin_id: magasinId, fond_initial: -5 });
    expect(res.status).toBe(400);
  });

  it('opens a session with fond_initial 10000', async () => {
    const res = await request(app)
      .post('/api/caisse/ouvrir')
      .set(auth())
      .send({ magasin_id: magasinId, fond_initial: 10000 });
    expect(res.status).toBeLessThan(300);
    const data = res.body.data ?? res.body;
    expect(data.id).toBeDefined();
    expect(data.statut).toBe('ouverte');
    sessionId = data.id;
  });

  it('rejects opening a second session on the same magasin', async () => {
    const res = await request(app)
      .post('/api/caisse/ouvrir')
      .set(auth())
      .send({ magasin_id: magasinId, fond_initial: 500 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toMatch(/déjà ouverte/);
  });

  it('records an apport espèces and computes the running balance', async () => {
    const res = await request(app)
      .post(`/api/caisse/${sessionId}/mouvement-divers`)
      .set(auth())
      .send({
        type: 'encaissement',
        categorie: 'apport',
        montant: 5000,
        methode_paiement: 'espece',
        libelle: 'Apport de fond test',
      });
    expect(res.status).toBeLessThan(300);
    const mvt = res.body.data ?? res.body;
    expect(parseFloat(mvt.solde_apres)).toBe(15000); // 10000 fond + 5000
  });

  it('records a retrait banque and decrements the balance', async () => {
    const res = await request(app)
      .post(`/api/caisse/${sessionId}/mouvement-divers`)
      .set(auth())
      .send({
        type: 'decaissement',
        categorie: 'retrait_banque',
        montant: 2000,
        methode_paiement: 'espece',
        libelle: 'Retrait banque test',
      });
    expect(res.status).toBeLessThan(300);
    const mvt = res.body.data ?? res.body;
    expect(parseFloat(mvt.solde_apres)).toBe(13000); // 15000 - 2000
  });

  it('U-03: the active session states the cash the drawer should hold, non-cash apart', async () => {
    // Mobile money never enters the drawer: before U-03 the headline
    // « Solde théorique » added it, so every till check showed a false gap.
    const mm = await request(app)
      .post(`/api/caisse/${sessionId}/mouvement-divers`)
      .set(auth())
      .send({
        type: 'encaissement',
        categorie: 'autre_entree',
        montant: 4000,
        methode_paiement: 'orange_money',
        libelle: 'Entrée Orange Money test',
      });
    expect(mm.status).toBeLessThan(300);

    const res = await request(app).get(`/api/caisse/session-active?magasin_id=${magasinId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      expected_cash: 13000, // 10 000 fond + 5 000 apport − 2 000 retrait
      especes_encaissees: 5000,
      especes_decaissees: 2000,
      hors_especes_encaissees: 4000,
      hors_especes_decaissees: 0,
      solde_theorique: 17000, // legacy, all methods
    });
    const parMethode = new Map(res.body.data.par_methode.map((p: any) => [p.methode_paiement, p]));
    expect(parMethode.get('espece')).toMatchObject({ total_encaissements: 5000, total_decaissements: 2000, nb: 2 });
    expect(parMethode.get('orange_money')).toMatchObject({ total_encaissements: 4000, total_decaissements: 0, nb: 1 });
  });

  it('rejects a source-linked categorie on the divers endpoint (Zod)', async () => {
    const res = await request(app)
      .post(`/api/caisse/${sessionId}/mouvement-divers`)
      .set(auth())
      .send({
        type: 'encaissement',
        categorie: 'paiement_client',
        montant: 100,
        methode_paiement: 'espece',
        libelle: 'Interdit ici',
      });
    expect(res.status).toBe(400);
  });

  it('rejects clôture with an unexplained écart', async () => {
    const res = await request(app)
      .post(`/api/caisse/cloturer/${sessionId}`)
      .set(auth())
      .send({ fond_final_compte: 12000 }); // expected cash is 13000
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toMatch(/Écart/);
  });

  it('clôtures the session: expected espèces = fond + apports - retraits, écart 0', async () => {
    const res = await request(app)
      .post(`/api/caisse/cloturer/${sessionId}`)
      .set(auth())
      .send({ fond_final_compte: 13000 });
    expect(res.status).toBeLessThan(300);
    const data = res.body.data ?? res.body;
    expect(data.statut).toBe('cloturee');
    expect(parseFloat(data.expected_cash)).toBe(13000);
    expect(parseFloat(data.ecart)).toBe(0);
  });

  it('historique « du … au … » the same day includes the sessions opened that day', async () => {
    // date_ouverture is a timestamp: `<= 'YYYY-MM-DD'` stopped at midnight and
    // dropped every session opened on the « au » day.
    const { rows } = await pool.query(
      `SELECT to_char(date_ouverture, 'YYYY-MM-DD') AS jour FROM sessions_caisse WHERE id = $1`,
      [sessionId]
    );
    const jour = rows[0].jour;

    const res = await request(app)
      .get('/api/caisse/historique')
      .set(auth())
      .query({ magasin_id: magasinId, from: jour, to: jour });
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: any) => s.id)).toContain(sessionId);
    expect(res.body.pagination.total).toBe(res.body.data.length);

    const veille = await request(app)
      .get('/api/caisse/historique')
      .set(auth())
      .query({ magasin_id: magasinId, to: '2000-01-01' });
    expect(veille.body.data.map((s: any) => s.id)).not.toContain(sessionId);

    const invalid = await request(app)
      .get('/api/caisse/historique')
      .set(auth())
      .query({ magasin_id: magasinId, to: '23/10/2026' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('Date invalide : utilisez le format AAAA-MM-JJ.');
  });

  it('rejects mouvements on a closed session', async () => {
    const res = await request(app)
      .post(`/api/caisse/${sessionId}/mouvement-divers`)
      .set(auth())
      .send({
        type: 'encaissement',
        categorie: 'apport',
        montant: 100,
        methode_paiement: 'espece',
        libelle: 'Trop tard',
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toMatch(/fermée|Fermée|clôturée/i);
  });

  it('rejects double clôture', async () => {
    const res = await request(app)
      .post(`/api/caisse/cloturer/${sessionId}`)
      .set(auth())
      .send({ fond_final_compte: 13000 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toMatch(/non trouvée|déjà clôturée/);
  });

  it('accepts a non-zero écart when a commentaire explains it', async () => {
    // Fresh session on the same (now free) magasin
    const open = await request(app)
      .post('/api/caisse/ouvrir')
      .set(auth())
      .send({ magasin_id: magasinId, fond_initial: 1000 });
    expect(open.status).toBeLessThan(300);
    const sid = (open.body.data ?? open.body).id;

    const res = await request(app)
      .post(`/api/caisse/cloturer/${sid}`)
      .set(auth())
      .send({ fond_final_compte: 900, commentaire_cloture: 'Manque 100 FCFA — erreur de rendu monnaie' });
    expect(res.status).toBeLessThan(300);
    const data = res.body.data ?? res.body;
    expect(parseFloat(data.ecart)).toBe(-100);
  });
});
