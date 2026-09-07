import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';

/**
 * Regression for the P1 error-mapping fix: the manual journal-entry endpoint
 * must surface the service's user-facing validation (unbalanced entry, unknown
 * account) as 4xx, not a blanket 500.
 *
 * L'endpoint a changé le 2026-09-07 : `/general-ledger/manual-entry` faisait
 * doublon avec `/comptabilite/ecritures`, en moins bien (numéro de pièce à
 * fournir à la main, pas de tiers par ligne, pas de journal d'audit). Il a été
 * supprimé ; la couverture suit le chemin survivant, qui est désormais le seul
 * point de saisie manuelle.
 */
let adminToken: string;
let compteNumero: string;

describe('Saisie comptable manuelle — error mapping (Integration)', () => {
  beforeAll(async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = login.body.data.token;
    // Un compte réel : les cas testés doivent échouer sur le motif visé
    // (déséquilibre, compte inconnu), pas sur un plan comptable vide.
    const { rows } = await pool.query('SELECT numero FROM plan_comptable ORDER BY numero LIMIT 1');
    compteNumero = rows[0]?.numero;
  });

  it('returns 422 (not 500) for an unbalanced entry', async () => {
    const res = await request(app)
      .post('/api/comptabilite/ecritures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        journal: 'OD',
        date_ecriture: '2099-01-15', // no period row → period check passes
        libelle: 'Test déséquilibre',
        lignes: [
          { compte_numero: compteNumero, debit: 1000, credit: 0 },
          { compte_numero: compteNumero, debit: 0, credit: 500 }, // deliberately unbalanced
        ],
      });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/équilibrée/);
  });

  it('returns 404 (not 500) for an unknown account', async () => {
    const res = await request(app)
      .post('/api/comptabilite/ecritures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        journal: 'OD',
        date_ecriture: '2099-01-15',
        libelle: 'Test compte inconnu',
        lignes: [
          { compte_numero: '999999999', debit: 1000, credit: 0 },
          { compte_numero: '999999998', debit: 0, credit: 1000 },
        ],
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/introuvable/);
  });
});
