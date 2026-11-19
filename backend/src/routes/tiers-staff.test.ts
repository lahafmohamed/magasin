import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import app from '../server';
import pool from '../db/connection';
import { createRoleFixtures, removeRoleFixtures, RoleFixture, SupportedTestRole } from '../test/roleFixtures';

/**
 * Décision produit D4 (2026-10-23) — ventes de passage :
 *  - un « Client comptoir » (code PASS) existe sur toute base, y compris une
 *    base neuve (ci-ref-data.sql) ; GET /api/tiers/comptoir le renvoie ;
 *  - caissier et magasin_staff créent un CLIENT depuis les formulaires de
 *    vente, jamais un fournisseur, jamais de conditions de crédit.
 * Avant : POST /api/tiers était réservé à admin/manager (403 pour la caisse)
 * et une base neuve n'avait aucun client de passage.
 */
describe('Contacts — création par la caisse et client comptoir (D4)', () => {
  let fixtures: RoleFixture[] = [];
  const tokens = new Map<SupportedTestRole, string>();
  const createdTiersIds: number[] = [];
  const suffix = `${Date.now() % 1000000}`;

  const as = (role: SupportedTestRole) => ({ Authorization: `Bearer ${tokens.get(role)}` });
  const userId = (role: SupportedTestRole) => fixtures.find((f) => f.role === role)!.id;

  async function createAs(role: SupportedTestRole, body: Record<string, unknown>) {
    const res = await request(app).post('/api/tiers').set(as(role)).send(body);
    if (res.status === 201) createdTiersIds.push(res.body.data.id);
    return res;
  }

  beforeAll(async () => {
    fixtures = await createRoleFixtures();
    for (const f of fixtures) {
      const login = await request(app).post('/api/auth/login').send({ username: f.username, password: f.password });
      tokens.set(f.role, login.body.data.token);
    }
  });

  afterAll(async () => {
    if (createdTiersIds.length) {
      await pool.query(`DELETE FROM audit_log WHERE table_name = 'tiers' AND record_id = ANY($1::int[])`, [createdTiersIds]);
      await pool.query('DELETE FROM tiers WHERE id = ANY($1::int[])', [createdTiersIds]);
    }
    await removeRoleFixtures(fixtures);
  });

  it.each(['caissier', 'magasin_staff'] as const)('%s crée un client sans crédit, tracé dans le journal', async (role) => {
    const res = await createAs(role, {
      raison_sociale: `Client passage ${role} ${suffix}`,
      telephone: '0701020304',
      est_client: true,
      est_fournisseur: false,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ est_client: true, est_fournisseur: false });
    expect(Number(res.body.data.credit_max)).toBe(0);

    const { rows } = await pool.query(
      `SELECT user_id FROM audit_log WHERE table_name = 'tiers' AND action = 'create' AND record_id = $1`,
      [res.body.data.id]
    );
    expect(rows).toEqual([{ user_id: userId(role) }]);
  });

  it('refuse un fournisseur créé par la caisse', async () => {
    const res = await createAs('caissier', {
      raison_sociale: `Fournisseur interdit ${suffix}`,
      est_client: true,
      est_fournisseur: true,
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/pas un fournisseur/);
  });

  it.each([
    { credit_max: 500000 },
    { delai_paiement: 'net_30' },
  ])('refuse des conditions de crédit posées par la caisse (%o)', async (credit) => {
    const res = await createAs('magasin_staff', {
      raison_sociale: `Client crédit interdit ${suffix}`,
      est_client: true,
      est_fournisseur: false,
      ...credit,
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/fixés par le gérant/);
  });

  it('accepte le paiement immédiat explicite', async () => {
    const res = await createAs('caissier', {
      raison_sociale: `Client immédiat ${suffix}`,
      est_client: true,
      est_fournisseur: false,
      delai_paiement: 'immediat',
      credit_max: 0,
    });
    expect(res.status).toBe(201);
  });

  it.each(['viewer', 'depot_staff'] as const)('%s ne crée toujours pas de contact', async (role) => {
    const res = await createAs(role, { raison_sociale: `Refus ${role} ${suffix}`, est_client: true, est_fournisseur: false });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Permissions insuffisantes');
  });

  it('le gérant crée toujours un fournisseur avec ses conditions', async () => {
    const res = await createAs('manager', {
      raison_sociale: `Fournisseur gérant ${suffix}`,
      est_client: false,
      est_fournisseur: true,
      delai_paiement: 'net_30',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.est_fournisseur).toBe(true);
  });

  it('GET /tiers/comptoir renvoie le client comptoir d’une base neuve', async () => {
    const res = await request(app).get('/api/tiers/comptoir').set(as('caissier'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      code: 'PASS',
      raison_sociale: 'Client comptoir',
      est_client: true,
      est_fournisseur: false,
    });
  });
});

afterAll(async () => {
  await pool.end();
});

describe('Migration 104 — client comptoir idempotent, réutilise l’existant', () => {
  const sql = readFileSync(path.join(__dirname, '../db/104_client_comptoir.sql'), 'utf8');

  /** Runs `scenario` inside a transaction that is always rolled back. */
  async function inRolledBackTx(scenario: (q: (text: string, params?: unknown[]) => Promise<Record<string, any>[]>) => Promise<void>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Park the seeded PASS row so each scenario starts from its own state.
      await client.query(`UPDATE tiers SET code = 'PASS-PARK', deleted_at = CURRENT_TIMESTAMP WHERE code = 'PASS'`);
      await scenario(async (text, params) => (await client.query(text, params)).rows);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it('crée « Client comptoir » quand rien n’existe, une seule fois', async () => {
    await inRolledBackTx(async (q) => {
      await q(sql);
      await q(sql);
      const rows = await q(`SELECT raison_sociale, est_client, est_fournisseur, delai_paiement FROM tiers WHERE code = 'PASS'`);
      expect(rows).toEqual([{ raison_sociale: 'Client comptoir', est_client: true, est_fournisseur: false, delai_paiement: 'immediat' }]);
    });
  });

  it('rétablit et renomme le « Client Passager » semé par 043', async () => {
    await inRolledBackTx(async (q) => {
      const [{ id }] = await q(
        `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur, deleted_at)
         VALUES ('PASS', 'Client Passager', true, false, CURRENT_TIMESTAMP) RETURNING id`
      );
      await q(sql);
      const rows = await q(`SELECT id, raison_sociale, deleted_at FROM tiers WHERE code = 'PASS'`);
      expect(rows).toEqual([{ id, raison_sociale: 'Client comptoir', deleted_at: null }]);
    });
  });

  it('réutilise un client de passage créé à la main sans le renommer', async () => {
    await inRolledBackTx(async (q) => {
      const [{ id }] = await q(
        `INSERT INTO tiers (raison_sociale, est_client, est_fournisseur)
         VALUES ('DIVERS  CLIENT', true, false) RETURNING id`
      );
      await q(sql);
      const rows = await q(`SELECT id, raison_sociale FROM tiers WHERE code = 'PASS'`);
      expect(rows).toEqual([{ id, raison_sociale: 'DIVERS  CLIENT' }]);
    });
  });

  it('garde le nom choisi par la boutique pour un PASS existant', async () => {
    await inRolledBackTx(async (q) => {
      await q(`INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur) VALUES ('PASS', 'Vente directe', true, false)`);
      await q(sql);
      const rows = await q(`SELECT raison_sociale FROM tiers WHERE code = 'PASS'`);
      expect(rows).toEqual([{ raison_sociale: 'Vente directe' }]);
    });
  });
});
