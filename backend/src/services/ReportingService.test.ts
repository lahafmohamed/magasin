import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { reportingService } from './ReportingService';
import { FactureService } from './FactureService';
import pool from '../db/connection';
import { TestDB } from '../test/helpers';

const factureService = new FactureService();

describe('ReportingService', () => {
  let testClientId: number;
  let testProductId: number;
  let createdInvoiceId: number;

  beforeAll(async () => {
    testClientId = await TestDB.createTestClient({ nom: 'Reporting Client' });
    testProductId = await TestDB.createTestProduct({
      nom: 'Reporting Product',
      prix_vente: 10000,
      stock: 100,
    });
    // Update the purchase price of the product
    await pool.query('UPDATE produits SET prix_achat = 6000 WHERE id = $1', [testProductId]);

    // Create an invoice: total = 200000, cost = 120000, margin = 80000 (40%)
    const invoice = await factureService.create({
      tiers_id: testClientId,
      lignes: [{ produit_id: testProductId, quantite: 20, prix_unitaire: 10000 }],
    });
    createdInvoiceId = invoice.id;
  });

  afterAll(async () => {
    await TestDB.cleanupInvoices();
    await TestDB.cleanupProducts();
    await TestDB.cleanupClients();
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
});
