import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { reportingService } from './ReportingService';
import { FactureService } from './FactureService';
import pool from '../db/connection';
import { TestDB } from '../test/helpers';
import app from '../server';

const factureService = new FactureService();

describe('ReportingService', () => {
  let testClientId: number;
  let middleAgingClientId: number;
  let oldAgingClientId: number;
  let testProductId: number;
  let principalLocationId: number;
  let authToken: string;
  const createdInvoiceIds: number[] = [];

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    authToken = login.body.data.token;

    testClientId = await TestDB.createTestClient({ nom: 'Reporting Client' });
    middleAgingClientId = await TestDB.createTestClient({
      nom: 'Test Client Étoile',
      prenom: 'Aline',
    });
    oldAgingClientId = await TestDB.createTestClient({
      nom: 'Test Client Ancien',
      prenom: 'Benoît',
    });
    testProductId = await TestDB.createTestProduct({
      nom: 'Reporting Product',
      prix_vente: 10000,
      stock: 100,
    });
    // Update the purchase price of the product
    await pool.query('UPDATE produits SET prix_achat = 6000 WHERE id = $1', [testProductId]);

    // Create an invoice: total = 200000, cost = 120000, margin = 80000 (40%)
    const currentInvoice = await factureService.create({
      tiers_id: testClientId,
      lignes: [{ produit_id: testProductId, quantite: 20, prix_unitaire: 10000 }],
    });
    createdInvoiceIds.push(currentInvoice.id);

    const middleInvoice = await factureService.create({
      tiers_id: middleAgingClientId,
      lignes: [{ produit_id: testProductId, quantite: 3, prix_unitaire: 10000 }],
    });
    createdInvoiceIds.push(middleInvoice.id);
    await pool.query(
      "UPDATE factures SET date_facture = CURRENT_DATE - INTERVAL '45 days' WHERE id = $1",
      [middleInvoice.id]
    );

    const oldInvoice = await factureService.create({
      tiers_id: oldAgingClientId,
      lignes: [{ produit_id: testProductId, quantite: 2, prix_unitaire: 10000 }],
    });
    createdInvoiceIds.push(oldInvoice.id);
    await pool.query(
      "UPDATE factures SET date_facture = CURRENT_DATE - INTERVAL '90 days' WHERE id = $1",
      [oldInvoice.id]
    );

    const { rows: locations } = await pool.query(
      'SELECT id FROM stock_locations WHERE est_principal = true AND actif = true ORDER BY id LIMIT 1'
    );
    principalLocationId = locations[0].id;
  });

  afterAll(async () => {
    for (const invoiceId of createdInvoiceIds) {
      await factureService.delete(invoiceId, true);
    }
    await TestDB.cleanupProducts();
    await pool.query(
      'UPDATE tiers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])',
      [[testClientId, middleAgingClientId, oldAgingClientId]]
    );
  });

  it('should compute PnL margins correctly using historical purchase price', async () => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateDebut = today.toISOString().split('T')[0];
    const dateFin = tomorrow.toISOString().split('T')[0];

    const pnl = await reportingService.getPnL(dateDebut, dateFin);
    expect(pnl).toBeDefined();
    // Chiffre d'affaires should be at least 200000
    expect(parseFloat(pnl.chiffre_affaires)).toBeGreaterThanOrEqual(200000);
    // Cost of sales should be at least 120000
    expect(parseFloat(pnl.cout_ventes)).toBeGreaterThanOrEqual(120000);
    
    // Check gross profit and margin math
    const expectedMargin = parseFloat(pnl.chiffre_affaires) - parseFloat(pnl.cout_ventes);
    expect(parseFloat(pnl.marge_brute)).toBeCloseTo(expectedMargin, 2);
    const expectedPct = (expectedMargin / parseFloat(pnl.chiffre_affaires)) * 100;
    expect(parseFloat(pnl.marge_pourcentage)).toBeCloseTo(expectedPct, 1);
  });

  it('should return detailed margins report', async () => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateDebut = today.toISOString().split('T')[0];
    const dateFin = tomorrow.toISOString().split('T')[0];

    const report = await reportingService.getMarginsReport(dateDebut, dateFin);

    expect(report.monthly_trend).toBeDefined();
    expect(report.top_tiers).toBeDefined();
    expect(report.top_categories).toBeDefined();
    expect(report.top_products).toBeDefined();

    expect(report.top_products.length).toBeGreaterThan(0);
    const prod = report.top_products.find((p: any) => p.produit_id === testProductId);
    expect(prod).toBeDefined();
    expect(parseFloat(prod.marge_pourcentage)).toBe(40.00);
  });

  it('paginates debtors while preserving complete filtered totals', async () => {
    const report = await reportingService.getReceivablesAging({ page: 1, limit: 2 });

    expect(report.data).toHaveLength(2);
    expect(report.total).toBe(3);
    expect(report.totalPages).toBe(2);
    expect(report.montantTotal).toBe(250000);
    expect(Number(report.data[0].total_du)).toBeGreaterThanOrEqual(Number(report.data[1].total_du));
  });

  it('filters receivables by customer, amount, aging bucket, and location', async () => {
    const byCustomer = await reportingService.getReceivablesAging({
      search: 'Étoile',
      page: 1,
      limit: 20,
    });
    expect(byCustomer.total).toBe(1);
    expect(byCustomer.data[0].client_id).toBe(middleAgingClientId);

    const byAmount = await reportingService.getReceivablesAging({
      minAmount: 50000,
      page: 1,
      limit: 20,
    });
    expect(byAmount.total).toBe(1);
    expect(byAmount.data[0].client_id).toBe(testClientId);

    const middleBucket = await reportingService.getReceivablesAging({
      bucket: 'entre_30_60_jours',
      page: 1,
      limit: 20,
    });
    expect(middleBucket.total).toBe(1);
    expect(middleBucket.data[0].client_id).toBe(middleAgingClientId);
    expect(Number(middleBucket.data[0].entre_30_60_jours)).toBe(30000);

    const oldBucket = await reportingService.getReceivablesAging({
      bucket: 'plus_60_jours',
      locationId: principalLocationId,
      page: 1,
      limit: 20,
    });
    expect(oldBucket.total).toBe(1);
    expect(oldBucket.data[0].client_id).toBe(oldAgingClientId);

    const otherLocation = await reportingService.getReceivablesAging({
      locationId: 2147483647,
      page: 1,
      limit: 20,
    });
    expect(otherLocation.total).toBe(0);
    expect(otherLocation.data).toEqual([]);
  });

  it('exposes the paginated contract and filtered export through the API', async () => {
    const page = await request(app)
      .get('/api/reports/receivables')
      .query({ page: 1, limit: 2, bucket: 'all' })
      .set('Authorization', `Bearer ${authToken}`);

    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(Number(page.body.summary.montant_total)).toBe(250000);

    const exported = await request(app)
      .get('/api/reports/receivables/export')
      .query({ search: 'Ancien', bucket: 'plus_60_jours' })
      .set('Authorization', `Bearer ${authToken}`);

    expect(exported.status).toBe(200);
    expect(exported.body.total).toBe(1);
    expect(exported.body.truncated).toBe(false);
    expect(exported.body.data[0].client_id).toBe(oldAgingClientId);

    const invalid = await request(app)
      .get('/api/reports/receivables')
      .query({ bucket: 'inconnu' })
      .set('Authorization', `Bearer ${authToken}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('Paramètres de requête invalides');
  });
});
