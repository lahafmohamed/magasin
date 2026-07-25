import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server';
import {
  createRoleFixtures,
  removeRoleFixtures,
  RoleFixture,
  SupportedTestRole,
} from '../test/roleFixtures';

const CORE_READ_PATH: Record<SupportedTestRole, string> = {
  admin: '/api/auth/users',
  manager: '/api/reports/dashboard',
  caissier: '/api/caisse/magasins',
  magasin_staff: '/api/factures?limit=1',
  depot_staff: '/api/commandes?limit=1',
  viewer: '/api/produits?limit=1',
};

const DENIED_PATH: Partial<Record<SupportedTestRole, string>> = {
  manager: '/api/auth/users',
  caissier: '/api/reports/dashboard',
  magasin_staff: '/api/reports/dashboard',
  depot_staff: '/api/reports/dashboard',
  viewer: '/api/reports/dashboard',
};

describe('Supported role login and authorization smoke matrix', () => {
  let fixtures: RoleFixture[] = [];
  const tokens = new Map<SupportedTestRole, string>();

  beforeAll(async () => {
    fixtures = await createRoleFixtures();
  });

  afterAll(async () => {
    await removeRoleFixtures(fixtures);
  });

  it('allows every supported role to sign in and reach its first useful read path', async () => {
    for (const fixture of fixtures) {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ username: fixture.username, password: fixture.password });

      expect(login.status, `connexion ${fixture.role}`).toBe(200);
      expect(login.body.data.user.role).toBe(fixture.role);
      tokens.set(fixture.role, login.body.data.token);

      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${login.body.data.token}`);
      expect(me.status, `profil ${fixture.role}`).toBe(200);

      const corePath = await request(app)
        .get(CORE_READ_PATH[fixture.role])
        .set('Authorization', `Bearer ${login.body.data.token}`);
      expect(corePath.status, `parcours principal ${fixture.role}`).toBe(200);
    }
  });

  it('rejects direct access to routes outside each non-admin role', async () => {
    for (const [role, path] of Object.entries(DENIED_PATH) as [SupportedTestRole, string][]) {
      const response = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${tokens.get(role)}`);

      expect(response.status, `interdiction ${role}`).toBe(403);
      expect(response.body.error).toBe('Permissions insuffisantes');
    }

    const viewerMutation = await request(app)
      .post('/api/produits')
      .set('Authorization', `Bearer ${tokens.get('viewer')}`)
      .send({});
    expect(viewerMutation.status).toBe(403);
  });

  it('revokes the server session on logout', async () => {
    const token = tokens.get('caissier');
    expect(token).toBeTruthy();

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const afterLogout = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(afterLogout.status).toBe(401);
  });
});
