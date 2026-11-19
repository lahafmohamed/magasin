import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

/**
 * The global limiter used to count every request per IP. A shop's PCs share
 * one public IP, so one busy till could lock the whole shop out. Signed-in
 * traffic is now counted per user, anonymous traffic per IP, and the login
 * limiter only counts failed attempts. Ceilings come from the environment.
 */
describe('API rate limiting', () => {
  let app: Express;
  let token: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_MAX = '8';
    process.env.AUTH_RATE_LIMIT_MAX = '2';
    app = (await import('../server')).default;
  });

  it('does not count successful logins against the login limit', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
      expect(res.status, `login ${i + 1}`).toBe(200);
      token = res.body.data.token;
    }
  });

  it('gives each signed-in user a bucket of their own', async () => {
    for (let i = 0; i < 8; i++) {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status, `request ${i + 1}`).toBe(200);
    }
    const limited = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(limited.status).toBe(429);

    // The same IP, without a token, is still served from its own bucket.
    const anonymous = await request(app).get('/api/auth/me');
    expect(anonymous.status).toBe(401);
  });

  it('still blocks repeated failed logins', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'mauvais-mot-de-passe' });
      expect(res.status, `failed attempt ${i + 1}`).toBe(401);
    }
    const blocked = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'mauvais-mot-de-passe' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('Trop de tentatives de connexion, veuillez réessayer plus tard');
  });
});
