import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../server';

let token: string;

describe('Company Settings Routes', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    token = res.body?.data?.token || res.body?.token || '';
  });

  it('GET /api/company-settings should return 200', async () => {
    const res = await request(app)
      .get('/api/company-settings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe(1);
  });

  it('PUT /api/company-settings with admin role should return 200', async () => {
    const res = await request(app)
      .put('/api/company-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ nom: 'Updated Corp', devise: 'USD' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nom).toBe('Updated Corp');
  });

  it('enregistre le profil métier et le message du ticket (migration 109)', async () => {
    const put = (body: Record<string, unknown>) =>
      request(app).put('/api/company-settings').set('Authorization', `Bearer ${token}`).send(body);

    const ok = await put({ type_activite: 'habillement', ticket_message: '  Échange sous 7 jours avec le ticket  ' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.type_activite).toBe('habillement');
    expect(ok.body.data.ticket_message).toBe('Échange sous 7 jours avec le ticket');

    // Un message vide n'imprime rien : NULL, et le profil n'est pas touché.
    const vide = await put({ ticket_message: '   ' });
    expect(vide.body.data.ticket_message).toBeNull();
    expect(vide.body.data.type_activite).toBe('habillement');

    const inconnu = await put({ type_activite: 'boulangerie' });
    expect(inconnu.status).toBe(400);

    await put({ type_activite: 'general' });
  });

  it('GET /api/company-settings without auth should return 401', async () => {
    const res = await request(app).get('/api/company-settings');
    expect(res.status).toBe(401);
  });

  it('PUT /api/company-settings without auth should return 401', async () => {
    const res = await request(app).put('/api/company-settings').send({ nom: 'Test' });
    expect(res.status).toBe(401);
  });
});
