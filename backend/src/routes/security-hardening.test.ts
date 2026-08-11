import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';
import {
  createRoleFixtures,
  removeRoleFixtures,
  RoleFixture,
} from '../test/roleFixtures';

/**
 * Regression coverage for the 2026-08-11 security audit fixes:
 *  - SSE stream must reject a JWT passed in the query string (token leakage).
 *  - A role change must revoke the target's live sessions (JWT-carried role).
 *  - The must_change_password gate must block other endpoints, using an exact
 *    method+path match (not a loose suffix), while letting change-password through.
 */
describe('Security hardening regressions', () => {
  let fixtures: RoleFixture[] = [];
  const tokenOf = new Map<string, string>();

  beforeAll(async () => {
    fixtures = await createRoleFixtures();
    for (const fixture of fixtures) {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ username: fixture.username, password: fixture.password });
      expect(login.status, `login ${fixture.role}`).toBe(200);
      tokenOf.set(fixture.role, login.body.data.token);
    }
  });

  afterAll(async () => {
    await removeRoleFixtures(fixtures);
  });

  describe('SSE /stream token transport', () => {
    it('rejects a JWT supplied in the query string', async () => {
      const token = tokenOf.get('viewer')!;
      const res = await request(app).get(`/api/notifications/stream?token=${token}`);
      expect(res.status).toBe(401);
    });

    it('rejects an unauthenticated stream request', async () => {
      const res = await request(app).get('/api/notifications/stream');
      expect(res.status).toBe(401);
    });
  });

  describe('role change revokes live sessions', () => {
    it("invalidates the target's existing token when an admin changes its role", async () => {
      const target = fixtures.find((f) => f.role === 'viewer')!;
      const targetToken = tokenOf.get('viewer')!;
      const adminToken = tokenOf.get('admin')!;

      // The token works before the change.
      const before = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${targetToken}`);
      expect(before.status).toBe(200);

      const { rows } = await pool.query("SELECT id FROM roles WHERE nom = 'caissier'");
      const caissierRoleId = rows[0].id;

      const update = await request(app)
        .put(`/api/auth/users/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role_id: caissierRoleId });
      expect(update.status).toBe(200);

      // The old token must be dead now — the role in the JWT is stale.
      const after = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${targetToken}`);
      expect(after.status).toBe(401);
    });
  });

  describe('must_change_password gate', () => {
    let username: string;
    let password: string;
    let userId: number;
    let token: string;

    beforeAll(async () => {
      const suffix = `${fixtures[0].id}-mcp`;
      username = `sec-mcp-${suffix}`;
      password = 'ChangeMe1234';
      const hash = await bcrypt.hash(password, 12);
      const { rows } = await pool.query(
        `INSERT INTO utilisateurs (username, email, password_hash, nom_complet, role_id, actif, must_change_password)
         SELECT $1, $2, $3, $4, r.id, true, true
         FROM roles r WHERE r.nom = 'admin'
         RETURNING id`,
        [username, `${username}@test.local`, hash, 'MCP User']
      );
      userId = Number(rows[0].id);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ username, password });
      expect(login.status).toBe(200);
      token = login.body.data.token;
    });

    afterAll(async () => {
      await pool.query('DELETE FROM user_sessions WHERE utilisateur_id = $1', [userId]);
      await pool.query('DELETE FROM utilisateurs WHERE id = $1', [userId]);
    });

    it('blocks a normal endpoint with 403 + must_change_password flag', async () => {
      const res = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.must_change_password).toBe(true);
    });

    it('lets the change-password endpoint itself through the gate', async () => {
      const res = await request(app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: password, newPassword: 'NewPass1234' });
      // Passes the gate (not 403) and succeeds.
      expect(res.status).toBe(200);
    });
  });
});
