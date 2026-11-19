import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';
import { createRoleFixtures, removeRoleFixtures } from '../test/roleFixtures';

let authToken: string;
let createdProduitIds: number[] = [];

async function getAuthToken(): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({
    username: 'admin',
    password: 'admin123',
  });
  return res.body.data.token;
}

describe('Produits API (Integration)', () => {
  beforeAll(async () => {
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    // Cleanup
    for (const id of createdProduitIds) {
      await request(app)
        .delete(`/api/produits/${id}`)
        .set('Authorization', `Bearer ${authToken}`);
    }
  });

  // ---- POST /api/produits ----

  describe('POST /api/produits', () => {
    it('should create a new product', async () => {
      const reference = `PROD-${Date.now()}`;
      const res = await request(app)
        .post('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reference,
          nom: 'Test Laptop HP',
          description: 'Laptop HP 15 pouces',
          categorie: 'Laptops',
          prix_achat: 200000,
          prix_vente: 250000,
          stock: 50,
          stock_min: 10,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.reference).toBe(reference);
      expect(res.body.data.nom).toBe('Test Laptop HP');
      expect(res.body.data.stock).toBe(50);

      createdProduitIds.push(res.body.data.id);
    });

    it('should reject creating product without auth', async () => {
      const res = await request(app)
        .post('/api/produits')
        .send({
          reference: 'PROD-NOAUTH',
          nom: 'Unauthorized Product',
          prix_achat: 1000,
          prix_vente: 2000,
        });

      expect(res.status).toBe(401);
    });

    it('should reject product with missing required fields', async () => {
      const res = await request(app)
        .post('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reference: '', // Empty reference
          nom: '', // Empty name
          prix_achat: -100, // Negative price
          prix_vente: -200,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject product with negative prices', async () => {
      const res = await request(app)
        .post('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reference: `PROD-${Date.now()}-NEG`,
          nom: 'Negative Price Product',
          prix_achat: -100,
          prix_vente: -200,
        });

      expect(res.status).toBe(400);
    });

    it('should create product with minimal fields', async () => {
      const res = await request(app)
        .post('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reference: `PROD-MIN-${Date.now()}`,
          nom: 'Minimal Product',
          prix_achat: 500,
          prix_vente: 1000,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.stock).toBe(0); // default
      expect(res.body.data.stock_min).toBe(5); // default

      createdProduitIds.push(res.body.data.id);
    });
  });

  // ---- GET /api/produits ----

  describe('GET /api/produits', () => {
    beforeAll(async () => {
      // Create test products
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/produits')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            reference: `PROD-LIST-${Date.now()}-${i}`,
            nom: `List Test Product ${i}`,
            categorie: i < 3 ? 'Laptops' : 'Accessoires',
            prix_achat: 1000,
            prix_vente: 2000,
            stock: i < 2 ? 2 : 50, // Some low stock
            stock_min: 5,
          });
        createdProduitIds.push(res.body.data.id);
      }
    });

    it('should return paginated products', async () => {
      const res = await request(app)
        .get('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 3 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.pagination).toBeDefined();
      expect(res.body.data.length).toBeLessThanOrEqual(3);
    });

    it('should search products by name', async () => {
      const res = await request(app)
        .get('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ search: 'List Test' });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);
    });

    it('should filter products by category', async () => {
      const res = await request(app)
        .get('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ categorie: 'Laptops' });

      expect(res.status).toBe(200);
      res.body.data.forEach((p: any) => {
        expect(p.categorie).toBe('Laptops');
      });
    });

    it('should filter low stock products', async () => {
      const res = await request(app)
        .get('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ low_stock: 'true' });

      expect(res.status).toBe(200);
      res.body.data.forEach((p: any) => {
        expect(p.stock).toBeLessThanOrEqual(p.stock_min);
      });
    });

    it('U-10: the low-stock total counts low-stock products, not the catalogue', async () => {
      // The count query ignored the HAVING clause: with the filter on,
      // pagination.total was the whole catalogue (Dashboard « 40 produits sous
      // leur stock minimum » next to a KPI of 3).
      const scoped = await request(app)
        .get('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ low_stock: 'true', search: 'List Test Product', limit: 100 });
      expect(scoped.status).toBe(200);
      expect(scoped.body.data).toHaveLength(2);
      expect(scoped.body.pagination.total).toBe(2);

      const all = await request(app)
        .get('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ low_stock: 'true', limit: 1000 });
      const stats = await request(app)
        .get('/api/factures/stats')
        .set('Authorization', `Bearer ${authToken}`);
      expect(all.body.pagination.total).toBe(all.body.data.length);
      expect(all.body.pagination.total).toBe(Number(stats.body.data.alertes_stock));
    });

    it('should return empty result for non-matching search', async () => {
      const res = await request(app)
        .get('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ search: 'NONEXISTENT-PRODUCT-XYZ' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ---- GET /api/produits/:id ----

  describe('GET /api/produits/:id', () => {
    let testProductId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reference: `PROD-GET-${Date.now()}`,
          nom: 'Get By ID Test Product',
          prix_achat: 1000,
          prix_vente: 2000,
          stock: 25,
        });
      testProductId = res.body.data.id;
      createdProduitIds.push(testProductId);
    });

    it('should return product by ID', async () => {
      const res = await request(app)
        .get(`/api/produits/${testProductId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testProductId);
      expect(res.body.data.nom).toBe('Get By ID Test Product');
      expect(res.body.data.stock).toBe(25);
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .get('/api/produits/999999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ---- PUT /api/produits/:id ----

  describe('PUT /api/produits/:id', () => {
    let testProductId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reference: `PROD-UPDATE-${Date.now()}`,
          nom: 'Update Test Product',
          prix_achat: 1000,
          prix_vente: 2000,
          stock: 30,
        });
      testProductId = res.body.data.id;
      createdProduitIds.push(testProductId);
    });

    it('should update product fields', async () => {
      const res = await request(app)
        .put(`/api/produits/${testProductId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          nom: 'Updated Product Name',
          prix_vente: 3000,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nom).toBe('Updated Product Name');
      expect(parseFloat(res.body.data.prix_vente)).toBe(3000);
    });

    it('should reject update with no fields', async () => {
      const res = await request(app)
        .put(`/api/produits/${testProductId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Aucun champ à mettre à jour');
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .put('/api/produits/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ nom: 'New Name' });

      expect(res.status).toBe(404);
    });
  });

  // ---- PATCH /api/produits/:id/stock ----

  describe('PATCH /api/produits/:id/stock', () => {
    let testProductId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reference: `PROD-STOCK-${Date.now()}`,
          nom: 'Stock Test Product',
          prix_achat: 1000,
          prix_vente: 2000,
          stock: 50,
        });
      testProductId = res.body.data.id;
      createdProduitIds.push(testProductId);
    });

    it('should adjust stock positively', async () => {
      const res = await request(app)
        .patch(`/api/produits/${testProductId}/stock`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantite: 20 });

      expect(res.status).toBe(200);
      expect(res.body.data.stock).toBe(70); // 50 + 20
    });

    it('should adjust stock negatively', async () => {
      const res = await request(app)
        .patch(`/api/produits/${testProductId}/stock`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantite: -10 });

      expect(res.status).toBe(200);
      expect(res.body.data.stock).toBe(60); // 70 - 10
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .patch('/api/produits/999999/stock')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantite: 10 });

      expect(res.status).toBe(404);
    });
  });

  // ---- DELETE /api/produits/:id ----

  describe('DELETE /api/produits/:id', () => {
    it('should soft-delete a product', async () => {
      const createRes = await request(app)
        .post('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reference: `PROD-DELETE-${Date.now()}`,
          nom: 'Delete Test Product',
          prix_achat: 1000,
          prix_vente: 2000,
        });
      const produitId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/produits/${produitId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .delete('/api/produits/999999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ---- GET /api/produits/stock-valuation ----

  describe('GET /api/produits/stock-valuation', () => {
    it('should return stock valuation summary', async () => {
      const res = await request(app)
        .get('/api/produits/stock-valuation')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total_produits');
      expect(res.body.data).toHaveProperty('total_unites');
      expect(res.body.data).toHaveProperty('valeur_achat');
      expect(res.body.data).toHaveProperty('valeur_vente');
    });
  });

  // ---- GET /api/produits/stock-by-category ----

  describe('GET /api/produits/stock-by-category', () => {
    it('should return stock by category', async () => {
      const res = await request(app)
        .get('/api/produits/stock-by-category')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ---- Mouvements de stock : une transaction, un mouvement par changement ----

  describe('Mouvements de stock (POST /:id/mouvements, PATCH /:id/stock)', () => {
    const suffix = `${Date.now() % 100000000}`;
    let produitId: number;
    let produitNom: string;
    let principal: { id: number; nom: string };
    let depot: { id: number; nom: string };

    async function mouvementsCount(): Promise<number> {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM mouvements_stock WHERE produit_id = $1', [produitId]);
      return rows[0].n;
    }
    async function stockAt(locationId: number) {
      const { rows } = await pool.query(
        'SELECT quantite, cmp::float AS cmp, valeur_stock::float AS valeur FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
        [produitId, locationId]
      );
      return rows[0] ?? null;
    }

    beforeAll(async () => {
      const { rows: loc } = await pool.query(
        'SELECT id, nom FROM stock_locations WHERE est_principal = true AND actif = true ORDER BY id LIMIT 1'
      );
      principal = loc[0];
      const { rows: dep } = await pool.query(
        `INSERT INTO stock_locations (code, nom, location_type, actif)
         VALUES ($1, $2, 'depot', true) RETURNING id, nom`,
        [`DEPOT-MV-${suffix}`.slice(0, 20), `Dépôt mouvements ${suffix}`]
      );
      depot = dep[0];

      produitNom = `Souris mouvements ${suffix}`;
      const res = await request(app)
        .post('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reference: `MVT-${suffix}`, nom: produitNom, prix_achat: 1000, prix_vente: 2000, stock: 10 });
      produitId = res.body.data.id;
      createdProduitIds.push(produitId);
    });

    afterAll(async () => {
      await pool.query('DELETE FROM mouvements_stock WHERE produit_id = $1', [produitId]);
      await pool.query('DELETE FROM stock_par_location WHERE location_id = $1', [depot.id]);
      await pool.query('DELETE FROM stock_locations WHERE id = $1', [depot.id]);
    });

    it('retire du stock à l’emplacement principal et écrit le mouvement correspondant', async () => {
      const res = await request(app)
        .post(`/api/produits/${produitId}/mouvements`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type_mouvement: 'perte', quantite: -3, raison: 'Casse' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        produit_id: produitId,
        location_id: principal.id,
        location_nom: principal.nom,
        stock_avant: 10,
        stock: 7,
      });
      const { rows } = await pool.query('SELECT * FROM mouvements_stock WHERE id = $1', [res.body.data.mouvement_id]);
      expect(rows[0]).toMatchObject({
        type_mouvement: 'perte',
        quantite: -3,
        stock_avant: 10,
        stock_apres: 7,
        location_id: principal.id,
        raison: 'Casse',
      });
      expect((await stockAt(principal.id)).quantite).toBe(7);
    });

    it('refuse un retrait plus grand que le stock : 422 en français, aucun mouvement orphelin', async () => {
      const before = await mouvementsCount();

      const res = await request(app)
        .post(`/api/produits/${produitId}/mouvements`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type_mouvement: 'ajustement', quantite: -50, location_id: principal.id, raison: 'Inventaire' });

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        success: false,
        code: 'STOCK_INSUFFISANT',
        error: `Stock insuffisant pour « ${produitNom} » à ${principal.nom} : 7 en stock, retrait de 50 demandé.`,
      });
      expect(await mouvementsCount()).toBe(before);
      expect((await stockAt(principal.id)).quantite).toBe(7);
    });

    it('refuse un retrait là où le produit n’est pas stocké', async () => {
      const res = await request(app)
        .post(`/api/produits/${produitId}/mouvements`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type_mouvement: 'ajustement', quantite: -1, location_id: depot.id, raison: 'Inventaire' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe(`Stock insuffisant pour « ${produitNom} » à ${depot.nom} : 0 en stock, retrait de 1 demandé.`);
      expect(await stockAt(depot.id)).toBeNull();
    });

    it('une entrée dans un nouvel emplacement crée sa ligne de stock valorisée', async () => {
      const res = await request(app)
        .post(`/api/produits/${produitId}/mouvements`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type_mouvement: 'ajustement', quantite: 5, location_id: depot.id, raison: 'Inventaire' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ location_id: depot.id, stock_avant: 0, stock: 5 });
      const row = await stockAt(depot.id);
      expect(row.quantite).toBe(5);
      expect(row.cmp).toBe(1000);
      expect(row.valeur).toBe(5000);
    });

    it('PATCH /stock enregistre un mouvement « ajustement » avec son motif', async () => {
      const res = await request(app)
        .patch(`/api/produits/${produitId}/stock`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantite: 2, raison: 'Recomptage' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ location_id: principal.id, stock_avant: 7, stock: 9 });
      const { rows } = await pool.query('SELECT * FROM mouvements_stock WHERE id = $1', [res.body.data.mouvement_id]);
      expect(rows[0]).toMatchObject({ type_mouvement: 'ajustement', quantite: 2, stock_avant: 7, stock_apres: 9, raison: 'Recomptage' });
    });

    it('PATCH /stock refuse un retrait impossible (422) sans rien écrire', async () => {
      const before = await mouvementsCount();
      const res = await request(app)
        .patch(`/api/produits/${produitId}/stock`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantite: -100 });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('STOCK_INSUFFISANT');
      expect(await mouvementsCount()).toBe(before);
    });

    it('stock bas par emplacement : seulement les produits suivis à cet emplacement', async () => {
      // Jamais stocké au dépôt → absent de « stock bas » du dépôt.
      const jamais = await request(app)
        .post('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reference: `MVT-NONE-${suffix}`, nom: `Jamais au dépôt ${suffix}`, prix_achat: 1000, prix_vente: 2000, stock: 0, stock_min: 5 });
      createdProduitIds.push(jamais.body.data.id);

      const res = await request(app)
        .get('/api/produits')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ low_stock: 'true', location_id: depot.id, limit: 1000 });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((p: any) => p.id);
      expect(ids).toContain(produitId); // 5 au dépôt ≤ minimum 5
      expect(ids).not.toContain(jamais.body.data.id);
      expect(res.body.pagination.total).toBe(res.body.data.length);
    });

    it('recherche floue : stock de l’emplacement demandé, coût masqué hors gérant', async () => {
      const atDepot = await request(app)
        .get('/api/produits/search/fuzzy')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: produitNom, location_id: depot.id });
      expect(atDepot.status).toBe(200);
      const hit = atDepot.body.data.find((p: any) => p.id === produitId);
      expect(hit).toMatchObject({ stock: 5, stock_total: 14 });
      expect(hit).toHaveProperty('prix_achat');

      const unknown = await request(app)
        .get('/api/produits/search/fuzzy')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: produitNom, location_id: 999999 });
      expect(unknown.status).toBe(400);

      const fixtures = await createRoleFixtures();
      try {
        const caissier = fixtures.find((f) => f.role === 'caissier')!;
        const login = await request(app)
          .post('/api/auth/login')
          .send({ username: caissier.username, password: caissier.password });
        const res = await request(app)
          .get('/api/produits/search/fuzzy')
          .set('Authorization', `Bearer ${login.body.data.token}`)
          .query({ q: produitNom });
        expect(res.status).toBe(200);
        const row = res.body.data.find((p: any) => p.id === produitId);
        expect(row).toBeDefined();
        expect(row).not.toHaveProperty('prix_achat');
        expect(row.stock).toBe(14);
      } finally {
        await removeRoleFixtures(fixtures);
      }
    });
  });
});
