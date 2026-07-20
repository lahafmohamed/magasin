import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';

/**
 * Integration tests for admin user management security:
 *  - password policy enforced on create (Zod)
 *  - deactivating a user immediately kills their live sessions (actif check
 *    in authenticate + revokeAllUserSessions on deactivation)
 */

let adminToken: string;
let createdUserId: number | null = null;
const username = `ci-sec-${Date.now().toString(36)}`;

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Admin user security (Integration)', () => {
  beforeAll(async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = login.body.data.token;
  });

  afterAll(async () => {
    try {
      if (createdUserId) {
        await pool.query('DELETE FROM user_sessions WHERE utilisateur_id = $1', [createdUserId]);
        await pool.query('DELETE FROM user_location_roles WHERE utilisateur_id = $1', [createdUserId]);
        await pool.query('DELETE FROM utilisateurs WHERE id = $1', [createdUserId]);
      }
    } catch {
      // cleanup must never fail the suite
    }
  });

  it('rejects a weak password on create (Zod policy)', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(adminToken))
      .send({ username: `${username}-weak`, password: 'short', role_id: 3 });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: any) => d.field)).toContain('password');
  });

  it('creates a user with a strong password', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(adminToken))
      .send({ username, password: 'Strong1234', role_id: 3 });
    expect(res.status).toBe(201);
    createdUserId = res.body.data.id;
    expect(createdUserId).toBeTruthy();
  });

  it('the new user can authenticate', async () => {
    const login = await request(app).post('/api/auth/login').send({ username, password: 'Strong1234' });
    expect(login.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set(auth(login.body.data.token));
    expect(me.status).toBe(200);
  });

  it('deactivating the user immediately invalidates their live session', async () => {
    const login = await request(app).post('/api/auth/login').send({ username, password: 'Strong1234' });
    const userToken = login.body.data.token;
    // session is live
    expect((await request(app).get('/api/auth/me').set(auth(userToken))).status).toBe(200);

    // admin deactivates
    const upd = await request(app)
      .put(`/api/admin/users/${createdUserId}`)
      .set(auth(adminToken))
      .send({ actif: false });
    expect(upd.status).toBe(200);

    // the previously-valid token is now rejected
    const me = await request(app).get('/api/auth/me').set(auth(userToken));
    expect(me.status).toBe(401);
  });
});
