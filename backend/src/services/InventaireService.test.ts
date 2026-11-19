import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';
import { inventaireService } from './InventaireService';
import { applyStockMovement, costedStockIn } from './StockCostingService';
import { TestDB } from '../test/helpers';
import { createRoleFixtures, removeRoleFixtures, RoleFixture, SupportedTestRole } from '../test/roleFixtures';

/**
 * Inventaire physique (migration 111).
 *
 * Couvre : la feuille créée à l'ouverture, un seul inventaire en cours par
 * emplacement, le comptage par saisie et par scan, la validation en une
 * transaction (stock, valeur, mouvements), l'écart appliqué en delta quand le
 * stock a bougé entre le comptage et la validation, le refus quand ce delta ne
 * tient plus, les lignes non comptées, la machine à états, et ce que chaque
 * rôle voit (comptage à l'aveugle, jamais de coût pour un compteur).
 */
describe('InventaireService (intégration)', () => {
  const suffix = `${Date.now() % 1000000}-${Math.floor(Math.random() * 1000)}`;
  let locationId: number;
  let autreLocationId: number;
  const produitIds: number[] = [];

  let fixtures: RoleFixture[] = [];
  const tokens = new Map<SupportedTestRole, string>();
  const as = (role: SupportedTestRole) => ({ Authorization: `Bearer ${tokens.get(role)}` });

  beforeAll(async () => {
    const { rows } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1, $2, 'magasin', true), ($3, $4, 'depot', true) RETURNING id`,
      [`TINV-${suffix}`.slice(0, 20), `Magasin Inventaire ${suffix}`,
        `TINW-${suffix}`.slice(0, 20), `Dépôt Inventaire ${suffix}`]
    );
    locationId = rows[0].id;
    autreLocationId = rows[1].id;

    fixtures = await createRoleFixtures();
    for (const f of fixtures) {
      const login = await request(app).post('/api/auth/login').send({ username: f.username, password: f.password });
      tokens.set(f.role, login.body.data.token);
    }
  });

  afterEach(async () => {
    // Les inventaires d'abord : leurs lignes référencent produits et mouvements.
    await pool.query('DELETE FROM inventaires WHERE location_id = ANY($1::int[])', [[locationId, autreLocationId]]);
    if (produitIds.length) {
      await pool.query('DELETE FROM mouvements_stock WHERE produit_id = ANY($1::int[])', [produitIds]);
      await pool.query('DELETE FROM stock_par_location WHERE produit_id = ANY($1::int[])', [produitIds]);
      await pool.query('DELETE FROM produits WHERE id = ANY($1::int[])', [produitIds]);
      produitIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM audit_log WHERE table_name = 'inventaires'`);
    await removeRoleFixtures(fixtures);
    await pool.query('DELETE FROM stock_locations WHERE id = ANY($1::int[])', [[locationId, autreLocationId]]);
    await pool.end();
  });

  /** Produit tenu en stock au magasin de test (0 = produit créé mais jamais stocké ici). */
  async function produit(qty: number, unitCost = 1000, at = locationId): Promise<number> {
    const id = await TestDB.createTestProduct({
      reference: `TEST-REF-INV-${suffix}-${produitIds.length}`,
      nom: `Produit inventaire ${produitIds.length}`,
      stock: 0,
    });
    produitIds.push(id);
    if (qty > 0) await costedStockIn(pool, { produitId: id, locationId: at, quantite: qty, unitCost });
    return id;
  }

  async function stockAt(produitId: number, at = locationId) {
    const { rows } = await pool.query(
      'SELECT quantite, cmp, valeur_stock FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
      [produitId, at]
    );
    if (!rows.length) return null;
    return { quantite: Number(rows[0].quantite), cmp: Number(rows[0].cmp), valeur: Number(rows[0].valeur_stock) };
  }

  async function sortir(produitId: number, quantite: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await applyStockMovement(client, {
        produitId, locationId, delta: -quantite, type: 'vente', raison: 'Vente de test', reference: null,
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }

  const lignesDe = async (id: number) => (await inventaireService.getLignes(id, { limit: 100 }, 'admin'))!.data;

  it('ouvre une feuille avec les produits en stock à cet emplacement, et eux seuls', async () => {
    const ici = await produit(10);
    const ailleurs = await produit(5, 1000, autreLocationId);
    const jamaisStocke = await produit(0);

    const inv = await inventaireService.create({ location_id: locationId });
    expect(inv.numero).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(inv.nb_lignes).toBe(1);

    const lignes = await lignesDe(inv.id);
    expect(lignes.map((l: any) => l.produit_id)).toEqual([ici]);
    expect(lignes[0]).toMatchObject({ quantite_theorique: 10, quantite_comptee: null, cmp: 1000 });
    expect(lignes.map((l: any) => l.produit_id)).not.toContain(ailleurs);
    expect(lignes.map((l: any) => l.produit_id)).not.toContain(jamaisStocke);

    const entete = await inventaireService.getById(inv.id, 'admin');
    expect(entete).toMatchObject({ statut: 'en_cours', nb_lignes: 1, nb_comptees: 0, nb_ecarts: 0 });
  });

  it('refuse un second inventaire en cours sur le même emplacement', async () => {
    await produit(3);
    const premier = await inventaireService.create({ location_id: locationId });

    await expect(inventaireService.create({ location_id: locationId })).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVENTAIRE_EN_COURS',
      message: expect.stringContaining(premier.numero),
    });

    // Un autre emplacement reste libre.
    await expect(inventaireService.create({ location_id: autreLocationId })).resolves.toMatchObject({ nb_lignes: 0 });
  });

  it('limite la feuille à une catégorie', async () => {
    const dansLaCategorie = await produit(4);
    const horsCategorie = await produit(4);
    await pool.query(`UPDATE produits SET categorie = 'Câbles inventaire' WHERE id = $1`, [dansLaCategorie]);

    const inv = await inventaireService.create({ location_id: locationId, categorie: 'Câbles inventaire' });
    const ids = (await lignesDe(inv.id)).map((l: any) => l.produit_id);
    expect(ids).toEqual([dansLaCategorie]);
    expect(ids).not.toContain(horsCategorie);
  });

  it('compte par saisie, par scan, et ajoute à la feuille un produit qui n’y était pas', async () => {
    const saisi = await produit(10);
    const scanne = await produit(6);
    const trouve = await produit(0);
    const code = `29${String(Date.now()).slice(-10)}7`;
    await pool.query('UPDATE produits SET code_barre = $1 WHERE id = $2', [code, scanne]);
    const { rows: [{ reference }] } = await pool.query('SELECT reference FROM produits WHERE id = $1', [trouve]);

    const inv = await inventaireService.create({ location_id: locationId });

    const l1 = await inventaireService.compter(inv.id, { produit_id: saisi, quantite: 8, mode: 'fixer' }, undefined, 'admin');
    expect(l1).toMatchObject({ quantite_comptee: 8, quantite_theorique: 10, ecart: -2, ajoutee_a_la_feuille: false });

    // Trois passages du lecteur : la quantité s'incrémente.
    for (let i = 0; i < 3; i++) {
      await inventaireService.compter(inv.id, { code, quantite: 1, mode: 'ajouter' }, undefined, 'admin');
    }
    const lignes = await lignesDe(inv.id);
    expect(lignes.find((l: any) => l.produit_id === scanne)).toMatchObject({ quantite_comptee: 3, ecart: -3 });

    // Produit jamais stocké ici, désigné par sa référence (sans tenir compte de la casse).
    const l3 = await inventaireService.compter(
      inv.id, { code: reference.toLowerCase(), quantite: 2, mode: 'fixer' }, undefined, 'admin'
    );
    expect(l3).toMatchObject({ produit_id: trouve, quantite_theorique: 0, quantite_comptee: 2, ajoutee_a_la_feuille: true });

    await expect(
      inventaireService.compter(inv.id, { code: 'code-inconnu-zzz', quantite: 1, mode: 'ajouter' }, undefined, 'admin')
    ).rejects.toMatchObject({ statusCode: 422, message: 'Aucun produit ne porte le code « code-inconnu-zzz ».' });

    expect(await inventaireService.getById(inv.id, 'admin')).toMatchObject({
      nb_lignes: 3, nb_comptees: 3, nb_ecarts: 3, unites_en_plus: 2, unites_en_moins: 5,
    });

    // Effacer un comptage rend la ligne « à compter ».
    const ligneSaisie = lignes.find((l: any) => l.produit_id === saisi);
    await inventaireService.effacerComptage(inv.id, ligneSaisie.id);
    const aCompter = (await inventaireService.getLignes(inv.id, { filtre: 'a_compter' }, 'admin'))!.data;
    expect(aCompter.map((l: any) => l.produit_id)).toEqual([saisi]);
  });

  it('valide : ajuste stock et valeur, écrit les mouvements, laisse intact ce qui n’est pas compté', async () => {
    const manquant = await produit(10, 1000);
    const enTrop = await produit(4, 500);
    const juste = await produit(7, 200);
    const nonCompte = await produit(9, 300);

    const inv = await inventaireService.create({ location_id: locationId });
    await inventaireService.compter(inv.id, { produit_id: manquant, quantite: 7, mode: 'fixer' });
    await inventaireService.compter(inv.id, { produit_id: enTrop, quantite: 6, mode: 'fixer' });
    await inventaireService.compter(inv.id, { produit_id: juste, quantite: 7, mode: 'fixer' });

    const result = await inventaireService.valider(inv.id, {});
    expect(result).toMatchObject({
      numero: inv.numero,
      lignes_ajustees: 2,
      unites_en_plus: 2,
      unites_en_moins: 3,
      valeur_ecart: 2 * 500 - 3 * 1000,
    });

    expect(await stockAt(manquant)).toEqual({ quantite: 7, cmp: 1000, valeur: 7000 });
    expect(await stockAt(enTrop)).toEqual({ quantite: 6, cmp: 500, valeur: 3000 });
    expect(await stockAt(juste)).toEqual({ quantite: 7, cmp: 200, valeur: 1400 });
    expect(await stockAt(nonCompte)).toEqual({ quantite: 9, cmp: 300, valeur: 2700 });

    const { rows: mouvements } = await pool.query(
      `SELECT produit_id, type_mouvement, quantite, stock_avant, stock_apres, raison, reference_liee, location_id
       FROM mouvements_stock WHERE reference_liee = $1 ORDER BY produit_id`,
      [inv.numero]
    );
    expect(mouvements).toEqual([
      {
        produit_id: manquant, type_mouvement: 'ajustement', quantite: -3, stock_avant: 10, stock_apres: 7,
        raison: `Inventaire ${inv.numero}`, reference_liee: inv.numero, location_id: locationId,
      },
      {
        produit_id: enTrop, type_mouvement: 'ajustement', quantite: 2, stock_avant: 4, stock_apres: 6,
        raison: `Inventaire ${inv.numero}`, reference_liee: inv.numero, location_id: locationId,
      },
    ]);

    const entete = await inventaireService.getById(inv.id, 'admin');
    expect(entete.statut).toBe('valide');
    expect(entete.date_validation).not.toBeNull();

    // Clôturé : ni second ajustement, ni nouveau comptage, ni annulation.
    await expect(inventaireService.valider(inv.id, {})).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      inventaireService.compter(inv.id, { produit_id: manquant, quantite: 1, mode: 'fixer' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVENTAIRE_CLOTURE' });
    await expect(inventaireService.annuler(inv.id)).rejects.toMatchObject({ statusCode: 409 });
    expect((await stockAt(manquant))!.quantite).toBe(7);
  });

  it('applique l’écart en delta : une vente passée après le comptage n’est ni perdue ni recomptée', async () => {
    const id = await produit(10);
    const inv = await inventaireService.create({ location_id: locationId });

    await inventaireService.compter(inv.id, { produit_id: id, quantite: 8, mode: 'fixer' }); // 2 manquants
    await sortir(id, 3); // le système passe à 7, le rayon à 5

    await inventaireService.valider(inv.id, {});
    expect((await stockAt(id))!.quantite).toBe(5);
  });

  it('recompter après une vente reprend le stock du moment', async () => {
    const id = await produit(10);
    const inv = await inventaireService.create({ location_id: locationId });

    await inventaireService.compter(inv.id, { produit_id: id, quantite: 10, mode: 'fixer' });
    await sortir(id, 4);
    const recompte = await inventaireService.compter(inv.id, { produit_id: id, quantite: 6, mode: 'fixer' }, undefined, 'admin');
    expect(recompte).toMatchObject({ quantite_theorique: 6, quantite_comptee: 6, ecart: 0 });

    const result = await inventaireService.valider(inv.id, {});
    expect(result.lignes_ajustees).toBe(0);
    expect((await stockAt(id))!.quantite).toBe(6);
  });

  it('demande un recomptage quand l’écart ne tient plus dans le stock, sans rien écrire', async () => {
    const perime = await produit(10);
    const autre = await produit(5);
    const inv = await inventaireService.create({ location_id: locationId });

    await inventaireService.compter(inv.id, { produit_id: autre, quantite: 2, mode: 'fixer' });
    await inventaireService.compter(inv.id, { produit_id: perime, quantite: 0, mode: 'fixer' }); // −10
    await sortir(perime, 6); // il n'en reste que 4 dans le système

    await expect(inventaireService.valider(inv.id, {})).rejects.toMatchObject({
      statusCode: 409,
      code: 'RECOMPTAGE_REQUIS',
      message: expect.stringMatching(/^Le stock de « Produit inventaire \d+ » a changé depuis son comptage/),
    });

    // Tout est annulé, y compris l'ajustement de l'autre produit.
    expect((await stockAt(perime))!.quantite).toBe(4);
    expect((await stockAt(autre))!.quantite).toBe(5);
    expect((await inventaireService.getById(inv.id, 'admin')).statut).toBe('en_cours');
    const { rows } = await pool.query('SELECT 1 FROM mouvements_stock WHERE reference_liee = $1', [inv.numero]);
    expect(rows).toHaveLength(0);
  });

  it('tient les lignes non comptées pour absentes seulement si on le demande', async () => {
    const compte = await produit(5);
    const oublie = await produit(8);
    const inv = await inventaireService.create({ location_id: locationId });
    await inventaireService.compter(inv.id, { produit_id: compte, quantite: 5, mode: 'fixer' });

    const result = await inventaireService.valider(inv.id, { non_comptes: 'zero' });
    expect(result).toMatchObject({ lignes_ajustees: 1, unites_en_moins: 8 });
    expect((await stockAt(oublie))!.quantite).toBe(0);
    expect((await stockAt(compte))!.quantite).toBe(5);
  });

  it('refuse de valider un inventaire où rien n’est compté', async () => {
    await produit(5);
    const inv = await inventaireService.create({ location_id: locationId });
    await expect(inventaireService.valider(inv.id, {})).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVENTAIRE_VIDE',
    });
  });

  it('annule sans toucher au stock, et libère l’emplacement', async () => {
    const id = await produit(5);
    const inv = await inventaireService.create({ location_id: locationId });
    await inventaireService.compter(inv.id, { produit_id: id, quantite: 1, mode: 'fixer' });

    await inventaireService.annuler(inv.id);
    expect((await inventaireService.getById(inv.id, 'admin')).statut).toBe('annule');
    expect((await stockAt(id))!.quantite).toBe(5);

    await expect(inventaireService.create({ location_id: locationId })).resolves.toMatchObject({ nb_lignes: 1 });
    await expect(inventaireService.annuler(99999999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('recherche dans la liste et filtre par statut', async () => {
    await produit(2);
    const inv = await inventaireService.create({ location_id: locationId });

    const parNumero = await inventaireService.getAll({ search: inv.numero }, 'admin');
    expect(parNumero.data.map((i: any) => i.id)).toEqual([inv.id]);
    expect(parNumero.total).toBe(1);

    const parEmplacement = await inventaireService.getAll({ search: `Magasin Inventaire ${suffix}`, statut: 'en_cours' }, 'admin');
    expect(parEmplacement.data.map((i: any) => i.id)).toEqual([inv.id]);

    const valides = await inventaireService.getAll({ location_id: locationId, statut: 'valide' }, 'admin');
    expect(valides).toEqual({ data: [], total: 0 });
  });

  describe('ce que chaque rôle voit et peut faire (HTTP)', () => {
    it('comptage à l’aveugle : le compteur ne voit ni stock théorique, ni écart, ni coût', async () => {
      const id = await produit(10, 1000);

      const created = await request(app).post('/api/inventaires').set(as('manager')).send({ location_id: locationId });
      expect(created.status).toBe(201);
      const invId = created.body.data.id;

      const compte = await request(app)
        .post(`/api/inventaires/${invId}/comptages`)
        .set(as('depot_staff'))
        .send({ produit_id: id, quantite: 7 });
      expect(compte.status).toBe(200);
      expect(compte.body.data).toMatchObject({ produit_id: id, quantite_comptee: 7 });
      for (const key of ['quantite_theorique', 'ecart', 'cmp', 'valeur_ecart']) {
        expect(compte.body.data, key).not.toHaveProperty(key);
      }

      const lignesDepot = await request(app).get(`/api/inventaires/${invId}/lignes`).set(as('depot_staff'));
      expect(lignesDepot.status).toBe(200);
      for (const key of ['quantite_theorique', 'ecart', 'cmp', 'valeur_ecart']) {
        expect(lignesDepot.body.data[0], key).not.toHaveProperty(key);
      }

      const enteteDepot = await request(app).get(`/api/inventaires/${invId}`).set(as('depot_staff'));
      expect(enteteDepot.body.data).toMatchObject({ nb_lignes: 1, nb_comptees: 1, voit_ecarts: false, voit_valeurs: false });
      expect(enteteDepot.body.data).not.toHaveProperty('nb_ecarts');
      expect(enteteDepot.body.data).not.toHaveProperty('valeur_ecart');

      const ecartsDepot = await request(app).get(`/api/inventaires/${invId}/lignes?filtre=ecarts`).set(as('depot_staff'));
      expect(ecartsDepot.status).toBe(403);

      const lignesGerant = await request(app).get(`/api/inventaires/${invId}/lignes?filtre=ecarts`).set(as('manager'));
      expect(lignesGerant.status).toBe(200);
      expect(lignesGerant.body.pagination.total).toBe(1);
      expect(lignesGerant.body.data[0]).toMatchObject({
        quantite_theorique: 10, quantite_comptee: 7, ecart: -3, cmp: 1000, valeur_ecart: -3000,
      });

      const listeDepot = await request(app).get(`/api/inventaires?location_id=${locationId}`).set(as('depot_staff'));
      expect(listeDepot.body.data[0]).not.toHaveProperty('valeur_ecart');
    });

    it('comptage ouvert : le compteur voit le stock théorique, jamais le coût', async () => {
      const id = await produit(10, 1000);
      const created = await request(app)
        .post('/api/inventaires')
        .set(as('admin'))
        .send({ location_id: locationId, comptage_aveugle: false });
      const invId = created.body.data.id;

      const compte = await request(app)
        .post(`/api/inventaires/${invId}/comptages`)
        .set(as('magasin_staff'))
        .send({ produit_id: id, quantite: 9 });
      expect(compte.body.data).toMatchObject({ quantite_theorique: 10, ecart: -1 });
      expect(compte.body.data).not.toHaveProperty('cmp');
      expect(compte.body.data).not.toHaveProperty('valeur_ecart');
    });

    it('ouvrir, valider et annuler reviennent au gérant ; caissier et lecteur n’entrent pas', async () => {
      await produit(3);
      for (const role of ['depot_staff', 'magasin_staff'] as const) {
        const refus = await request(app).post('/api/inventaires').set(as(role)).send({ location_id: locationId });
        expect(refus.status, role).toBe(403);
      }

      const created = await request(app).post('/api/inventaires').set(as('manager')).send({ location_id: locationId });
      const invId = created.body.data.id;

      expect((await request(app).post(`/api/inventaires/${invId}/valider`).set(as('depot_staff')).send({})).status).toBe(403);
      expect((await request(app).post(`/api/inventaires/${invId}/annuler`).set(as('magasin_staff'))).status).toBe(403);
      for (const role of ['caissier', 'viewer'] as const) {
        expect((await request(app).get('/api/inventaires').set(as(role))).status, role).toBe(403);
        expect((await request(app).get(`/api/inventaires/${invId}`).set(as(role))).status, role).toBe(403);
      }

      const invalide = await request(app)
        .post(`/api/inventaires/${invId}/comptages`)
        .set(as('manager'))
        .send({ quantite: 3 });
      expect(invalide.status).toBe(400);

      const doublon = await request(app).post('/api/inventaires').set(as('manager')).send({ location_id: locationId });
      expect(doublon.status).toBe(409);
      expect(doublon.body.error).toContain('déjà en cours');

      expect((await request(app).post(`/api/inventaires/${invId}/annuler`).set(as('manager'))).status).toBe(200);
      expect((await request(app).get('/api/inventaires/99999999').set(as('manager'))).status).toBe(404);
    });
  });
});
