import { afterAll, afterEach, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import { factureFournisseurService } from './FactureFournisseurService';

/**
 * Régression : la facture fournisseur accumulait sous_total en flottant brut
 * (sousTotal += quantite * prix_unitaire) puis recalculait total_ligne une
 * seconde fois à l'insertion. Postgres arrondissant chaque colonne
 * NUMERIC(15,2) séparément, l'en-tête et ses lignes pouvaient diverger — alors
 * que les factures clients passaient déjà par un calcul arrondi par ligne.
 */
describe('FactureFournisseurService — cohérence sous_total / lignes', () => {
  const createdInvoiceIds: number[] = [];
  const createdTiersIds: number[] = [];

  afterEach(async () => {
    if (createdInvoiceIds.length) {
      await pool.query('DELETE FROM compte_fournisseur_lignes WHERE document_id = ANY($1::int[])', [createdInvoiceIds]);
      await pool.query('DELETE FROM facture_fournisseur_lignes WHERE facture_id = ANY($1::int[])', [createdInvoiceIds]);
      await pool.query('DELETE FROM factures_fournisseur WHERE id = ANY($1::int[])', [createdInvoiceIds]);
      createdInvoiceIds.length = 0;
    }
    if (createdTiersIds.length) {
      await pool.query('DELETE FROM tiers WHERE id = ANY($1::int[])', [createdTiersIds]);
      createdTiersIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createSupplier(): Promise<number> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const { rows: [tiers] } = await pool.query(
      `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
       VALUES ($1, $2, false, true) RETURNING id`,
      [`FF-${suffix}`.slice(0, 20), `TEST FF TOTALS ${suffix}`]
    );
    createdTiersIds.push(tiers.id);
    return tiers.id;
  }

  async function createInvoice(lignes: { quantite: number; prix_unitaire: number }[]) {
    const tiersId = await createSupplier();
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const created = await factureFournisseurService.create({
      tiers_id: tiersId,
      numero_facture_fournisseur: `SUP-${suffix}`.slice(0, 40),
      date_facture: new Date().toISOString().split('T')[0],
      lignes: lignes.map((l) => ({ ...l, description: 'Ligne test' })),
    });
    createdInvoiceIds.push(created.id);

    const { rows: [header] } = await pool.query(
      'SELECT sous_total, total, reste_due FROM factures_fournisseur WHERE id = $1',
      [created.id]
    );
    const { rows: [agg] } = await pool.query(
      'SELECT COUNT(*)::int AS n, COALESCE(SUM(total_ligne), 0) AS somme FROM facture_fournisseur_lignes WHERE facture_id = $1',
      [created.id]
    );

    return {
      sousTotal: Number(header.sous_total),
      total: Number(header.total),
      resteDue: Number(header.reste_due),
      lineCount: agg.n,
      lineSum: Number(agg.somme),
    };
  }

  it('sous_total égale la somme des lignes stockées sur des prix fractionnaires', async () => {
    // Sommer avant d'arrondir donnerait 0.015 → 0.02 en en-tête, contre 0.03
    // pour les trois lignes stockées.
    const invoice = await createInvoice([
      { quantite: 1, prix_unitaire: 0.005 },
      { quantite: 1, prix_unitaire: 0.005 },
      { quantite: 1, prix_unitaire: 0.005 },
    ]);

    expect(invoice.lineCount).toBe(3);
    expect(invoice.lineSum).toBe(0.03);
    expect(invoice.sousTotal).toBe(invoice.lineSum);
    expect(invoice.total).toBe(invoice.lineSum);
    expect(invoice.resteDue).toBe(invoice.lineSum);
  });

  it('reste cohérent sur des montants réalistes', async () => {
    const invoice = await createInvoice([
      { quantite: 3, prix_unitaire: 33.333 },
      { quantite: 7, prix_unitaire: 1.005 },
      { quantite: 11, prix_unitaire: 0.101 },
    ]);

    expect(invoice.lineCount).toBe(3);
    expect(invoice.sousTotal).toBe(invoice.lineSum);
    expect(invoice.total).toBe(invoice.sousTotal);
  });

  it('accepte une ligne fournisseur gratuite', async () => {
    // Remplacement sous garantie : prix nul légitime côté achat, refusé côté vente.
    const invoice = await createInvoice([
      { quantite: 2, prix_unitaire: 15000 },
      { quantite: 1, prix_unitaire: 0 },
    ]);

    expect(invoice.lineCount).toBe(2);
    expect(invoice.sousTotal).toBe(30000);
    expect(invoice.sousTotal).toBe(invoice.lineSum);
  });
});
