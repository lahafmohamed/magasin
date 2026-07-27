import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';

/**
 * Contrat d'enveloppe : toute réponse JSON de l'API porte `success`.
 *
 * Plusieurs handlers renvoyaient des formes concurrentes — `{ data: rows }`
 * sans `success`, `{ message }` seul, ou la ligne brute — ce que
 * l'intercepteur axios du frontend ne peut pas déballer. Les services
 * compensaient avec des `data?.data || []` défensifs, et l'un d'eux lisait
 * `.data` sur un tableau déjà déballé : la liste des acomptes disponibles
 * revenait systématiquement vide.
 *
 * Ces tests verrouillent le contrat pour que la dérive ne revienne pas.
 */
describe('enveloppe de réponse API', () => {
  let authToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    authToken = res.body.data.token;
  });

  afterAll(async () => {
    await pool.end();
  });

  const auth = () => ({ Authorization: `Bearer ${authToken}` });

  // Lectures représentatives des contrôleurs qui divergeaient.
  const readEndpoints = [
    '/api/paiements?page=1&limit=5',
    '/api/paiements/stats',
    '/api/commandes/stats',
    '/api/produits/alertes-stock',
  ];

  it.each(readEndpoints)('%s renvoie une enveloppe { success, data }', async (url) => {
    const res = await request(app).get(url).set(auth());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    // La charge utile ne doit pas être imbriquée une seconde fois.
    expect(res.body.data).not.toHaveProperty('success');
  });

  it('les réponses paginées portent data + pagination au même niveau', async () => {
    const res = await request(app).get('/api/paiements?page=1&limit=5').set(auth());

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({
      page: expect.any(Number),
      limit: expect.any(Number),
      total: expect.any(Number),
      totalPages: expect.any(Number),
    });
  });

  it('une route inconnue renvoie { success: false, error }', async () => {
    const res = await request(app).get('/api/route-qui-nexiste-pas').set(auth());

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
    expect(typeof res.body.error).toBe('string');
  });

  it('une erreur métier renvoie { success: false, error }', async () => {
    // Identifiant inexistant : le contrôleur doit répondre 404 enveloppé.
    const res = await request(app).get('/api/acomptes/99999999').set(auth());

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
    expect(typeof res.body.error).toBe('string');
  });

  it('un refus d\'authentification reste enveloppé', async () => {
    const res = await request(app).get('/api/paiements/stats');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('success', false);
  });

  it('les acomptes disponibles renvoient un tableau déballable', async () => {
    // La régression corrigée : l'enveloppe standard ici, combinée au
    // `data?.data || []` du service frontend, vidait la liste.
    const { rows: [tiers] } = await pool.query(
      `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`ENV-${Date.now()}`.slice(0, 20), `TEST ENVELOPE ${Date.now()}`]
    );
    try {
      const res = await request(app)
        .get(`/api/comptes/${tiers.id}/acomptes/disponibles`)
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    } finally {
      await pool.query('DELETE FROM tiers WHERE id = $1', [tiers.id]);
    }
  });
});
