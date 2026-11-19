import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';
import { TestDB } from '../test/helpers';
import { createRoleFixtures, removeRoleFixtures, RoleFixture, SupportedTestRole } from '../test/roleFixtures';
import { ean13CheckDigit } from './NumberingService';

/**
 * Lot 3 — POST /api/produits/codes-barres : un EAN-13 interne (plage 20…,
 * migration 110) pour chaque produit sans code-barres ; un produit qui en a
 * déjà un le garde.
 */
describe('Codes-barres internes (POST /api/produits/codes-barres)', () => {
  const suffix = `${Date.now() % 1000000}-${Math.floor(Math.random() * 1000)}`;
  let fixtures: RoleFixture[] = [];
  const tokens = new Map<SupportedTestRole | 'root', string>();
  const as = (role: SupportedTestRole | 'root') => ({ Authorization: `Bearer ${tokens.get(role)}` });
  let sansCode: number;
  let sansCode2: number;
  let avecCode: number;

  const codeDe = async (id: number) =>
    (await pool.query('SELECT code_barre FROM produits WHERE id = $1', [id])).rows[0].code_barre as string | null;

  beforeAll(async () => {
    fixtures = await createRoleFixtures();
    for (const f of fixtures) {
      const login = await request(app).post('/api/auth/login').send({ username: f.username, password: f.password });
      tokens.set(f.role, login.body.data.token);
    }
    const root = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    tokens.set('root', root.body.data.token);

    sansCode = await TestDB.createTestProduct({ reference: `CB-A-${suffix}`, nom: 'Robe sans code' });
    sansCode2 = await TestDB.createTestProduct({ reference: `CB-B-${suffix}`, nom: 'Jupe sans code' });
    avecCode = await TestDB.createTestProduct({ reference: `CB-C-${suffix}`, nom: 'Jean avec code' });
    await pool.query(`UPDATE produits SET code_barre = NULL WHERE id = ANY($1::int[])`, [[sansCode, sansCode2]]);
    await pool.query(`UPDATE produits SET code_barre = $1 WHERE id = $2`, [`3700${suffix.replace(/\D/g, '')}`.slice(0, 13), avecCode]);
  });

  afterAll(async () => {
    try {
      await removeRoleFixtures(fixtures);
    } finally {
      await pool.end();
    }
  });

  it('est réservé au gérant et à l’administrateur', async () => {
    for (const role of ['caissier', 'magasin_staff', 'depot_staff'] as const) {
      const res = await request(app).post('/api/produits/codes-barres').set(as(role)).send({ produit_ids: [sansCode] });
      expect(res.status, role).toBe(403);
    }
    expect(await codeDe(sansCode)).toBeNull();
  });

  it('attribue des EAN-13 valides et distincts, et garde le code existant', async () => {
    const existant = await codeDe(avecCode);
    const res = await request(app)
      .post('/api/produits/codes-barres')
      .set(as('manager'))
      .send({ produit_ids: [sansCode, avecCode, sansCode2] });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('2 codes-barres créés.');

    const parId = new Map(res.body.data.map((p: any) => [p.produit_id, p]));
    expect(parId.get(avecCode)).toMatchObject({ code_barre: existant, cree: false });

    const a = await codeDe(sansCode);
    const b = await codeDe(sansCode2);
    for (const code of [a, b]) {
      expect(code).toMatch(/^20\d{11}$/);
      expect(Number(code!.slice(12))).toBe(ean13CheckDigit(code!.slice(0, 12)));
    }
    expect(a).not.toBe(b);

    // Deuxième appel : plus rien à créer, les codes ne bougent pas.
    const again = await request(app).post('/api/produits/codes-barres').set(as('root')).send({ produit_ids: [sansCode] });
    expect(again.body.message).toBe('Ces produits avaient déjà un code-barres.');
    expect(await codeDe(sansCode)).toBe(a);

    // Le code créé se retrouve à la douchette.
    const scan = await request(app).get(`/api/produits/search/fuzzy?q=${a}&limit=5`).set(as('root'));
    const found = (scan.body.data ?? scan.body) as Array<{ id: number }>;
    expect(found.map((p) => p.id)).toContain(sansCode);
  });

  it('saute un numéro déjà pris par un code saisi à la main', async () => {
    const { rows } = await pool.query(`SELECT last_value, is_called FROM code_barre_interne_seq`);
    const prochain = Number(rows[0].last_value) + (rows[0].is_called ? 1 : 0);
    const first12 = `20${String(prochain).padStart(10, '0')}`;
    const pris = `${first12}${ean13CheckDigit(first12)}`;
    const occupe = await TestDB.createTestProduct({ reference: `CB-D-${suffix}`, nom: 'Code saisi à la main' });
    await pool.query('UPDATE produits SET code_barre = $1 WHERE id = $2', [pris, occupe]);
    const cible = await TestDB.createTestProduct({ reference: `CB-E-${suffix}`, nom: 'Pantalon sans code' });
    await pool.query('UPDATE produits SET code_barre = NULL WHERE id = $1', [cible]);

    const res = await request(app).post('/api/produits/codes-barres').set(as('root')).send({ produit_ids: [cible] });
    expect(res.status).toBe(200);
    const code = await codeDe(cible);
    expect(code).toMatch(/^20\d{11}$/);
    expect(code).not.toBe(pris);
  });

  it('refuse un produit inconnu sans rien écrire', async () => {
    await pool.query('UPDATE produits SET code_barre = NULL WHERE id = $1', [sansCode2]);
    const res = await request(app)
      .post('/api/produits/codes-barres')
      .set(as('root'))
      .send({ produit_ids: [sansCode2, 999999999] });
    expect(res.status).toBe(404);
    expect(await codeDe(sansCode2)).toBeNull();
  });
});
