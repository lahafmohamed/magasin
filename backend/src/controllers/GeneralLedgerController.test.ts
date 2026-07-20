import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../server';

/**
 * Regression for the P1 error-mapping fix: the manual journal-entry endpoint
 * must surface the service's user-facing validation (unbalanced entry, unknown
 * account) as 4xx, not a blanket 500.
 */
let adminToken: string;

describe('GeneralLedger manual entry — error mapping (Integration)', () => {
  beforeAll(async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = login.body.data.token;
  });

  it('returns 400 (not 500) for an unbalanced entry', async () => {
    const res = await request(app)
      .post('/api/general-ledger/manual-entry')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        numero_piece: `TST-${Date.now()}`,
        journal: 'OD',
        date_ecriture: '2099-01-15', // no period row → period check passes
        lignes: [
          { compte_id: 1, debit: 1000, credit: 0 },
          { compte_id: 2, debit: 0, credit: 500 }, // deliberately unbalanced
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/équilibrée/);
  });

  it('returns 404 (not 500) for an unknown account', async () => {
    const res = await request(app)
      .post('/api/general-ledger/manual-entry')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        numero_piece: `TST-${Date.now()}`,
        journal: 'OD',
        date_ecriture: '2099-01-15',
        lignes: [
          { compte_id: 999999999, debit: 1000, credit: 0 },
          { compte_id: 999999998, debit: 0, credit: 1000 },
        ],
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/introuvable/);
  });
});
