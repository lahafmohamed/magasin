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
