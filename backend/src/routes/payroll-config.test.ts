import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import app from '../server';
import pool from '../db/connection';
import { createRoleFixtures, removeRoleFixtures, RoleFixture, SupportedTestRole } from '../test/roleFixtures';

/**
 * Paie — paramètres légaux (U-11).
 *
 * Une base neuve n'avait ni cotisation CNPS ni barème ITS (`081` baselinée
 * sans être exécutée) et aucun endpoint ne créait de cotisation : la page
 * restait sur « Aucune cotisation configurée » et chaque bulletin était
 * calculé sans retenue. ci-ref-data.sql + migration 105 sèment les valeurs
 * de 081 ; POST /api/payroll/config/cotisations permet d'en ajouter.
 */
describe('Paie — cotisations par défaut et création (U-11)', () => {
  let fixtures: RoleFixture[] = [];
  const tokens = new Map<SupportedTestRole, string>();
  const createdCodes: string[] = [];
  const suffix = `${Date.now() % 100000}`;

  const as = (role: SupportedTestRole) => ({ Authorization: `Bearer ${tokens.get(role)}` });

  beforeAll(async () => {
    fixtures = await createRoleFixtures();
    for (const f of fixtures) {
      const login = await request(app).post('/api/auth/login').send({ username: f.username, password: f.password });
      tokens.set(f.role, login.body.data.token);
    }
  });

  afterAll(async () => {
    if (createdCodes.length) {
      await pool.query('DELETE FROM payroll_cotisations WHERE code = ANY($1::text[])', [createdCodes]);
    }
    await pool.query(`DELETE FROM audit_log WHERE table_name = 'payroll_cotisations'`);
    await removeRoleFixtures(fixtures);
    await pool.end();
  });

  it('une base neuve porte la CNPS retraite et le barème ITS de 081', async () => {
    const res = await request(app).get('/api/payroll/config').set(as('manager'));
    expect(res.status).toBe(200);
    expect(res.body.data.cotisations).toEqual([
      expect.objectContaining({ code: 'CNPS_RET', libelle: 'CNPS Retraite', taux_salarial: '0.0630', taux_patronal: '0.0770', plafond: '1647315.00', actif: true }),
    ]);
    expect(res.body.data.baremes.map((b: { tranche_min: string; tranche_max: string | null; taux: string }) => [Number(b.tranche_min), b.tranche_max === null ? null : Number(b.tranche_max), Number(b.taux)])).toEqual([
      [0, 75000, 0],
      [75000, 240000, 0.16],
      [240000, 800000, 0.21],
      [800000, 2400000, 0.24],
      [2400000, null, 0.32],
    ]);
  });

  it('l’administrateur ajoute une cotisation', async () => {
    const code = `CMU_${suffix}`;
    const res = await request(app)
      .post('/api/payroll/config/cotisations')
      .set(as('admin'))
      .send({ code: code.toLowerCase(), libelle: 'Couverture maladie universelle', taux_salarial: 0.01, taux_patronal: 0.01, plafond: null });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    createdCodes.push(code);
    expect(res.body.data).toMatchObject({ code, libelle: 'Couverture maladie universelle', actif: true });
    expect(Number(res.body.data.taux_salarial)).toBe(0.01);

    const { rows } = await pool.query(
      `SELECT action FROM audit_log WHERE table_name = 'payroll_cotisations' AND record_id = $1`,
      [res.body.data.id]
    );
    expect(rows).toEqual([{ action: 'create' }]);
  });

  it('refuse un code déjà utilisé, en français', async () => {
    const res = await request(app)
      .post('/api/payroll/config/cotisations')
      .set(as('admin'))
      .send({ code: 'CNPS_RET', libelle: 'Doublon', taux_salarial: 0.05, taux_patronal: 0.05 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Une cotisation porte déjà le code CNPS_RET.');
  });

  it('refuse un taux exprimé en pourcentage au lieu d’une fraction', async () => {
    const res = await request(app)
      .post('/api/payroll/config/cotisations')
      .set(as('admin'))
      .send({ code: `PCT_${suffix}`, libelle: 'Taux en pourcentage', taux_salarial: 6.3, taux_patronal: 7.7 });
    expect(res.status).toBe(400);
  });

  it.each(['manager', 'caissier'] as const)('%s ne crée pas de cotisation (même règle que la modification)', async (role) => {
    const res = await request(app)
      .post('/api/payroll/config/cotisations')
      .set(as(role))
      .send({ code: `REF_${role}`, libelle: 'Refus', taux_salarial: 0.01, taux_patronal: 0 });
    expect(res.status).toBe(403);
  });

  it('la migration 105 ne sème qu’une configuration de paie vierge', async () => {
    const sql = readFileSync(path.join(__dirname, '../db/105_seed_payroll_defaults.sql'), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Base qui a déjà sa propre configuration : rien ne bouge.
      await client.query(`UPDATE payroll_cotisations SET taux_salarial = 0.0700 WHERE code = 'CNPS_RET'`);
      await client.query(sql);
      const { rows: kept } = await client.query(`SELECT taux_salarial FROM payroll_cotisations WHERE code = 'CNPS_RET'`);
      expect(kept).toEqual([{ taux_salarial: '0.0700' }]);

      // Configuration commencée à la main (cas de la production : une cotisation,
      // aucun barème ITS) : aucun barème n'est ajouté dans son dos.
      await client.query('DELETE FROM payroll_bareme_its');
      await client.query(sql);
      const { rows: noBareme } = await client.query('SELECT COUNT(*)::int AS n FROM payroll_bareme_its');
      expect(noBareme).toEqual([{ n: 0 }]);

      // Base vide : les valeurs de 081 arrivent, une seule fois.
      await client.query('DELETE FROM payroll_cotisations');
      await client.query('DELETE FROM payroll_bareme_its');
      await client.query(sql);
      await client.query(sql);
      const { rows: cot } = await client.query('SELECT code FROM payroll_cotisations');
      const { rows: bar } = await client.query('SELECT COUNT(*)::int AS n FROM payroll_bareme_its');
      expect(cot).toEqual([{ code: 'CNPS_RET' }]);
      expect(bar).toEqual([{ n: 5 }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
