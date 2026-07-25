import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';

/**
 * Integration tests for the two document PDFs added on 2026-07-23:
 *  - `GET /api/commandes/:id/pdf`  → bon de commande fournisseur
 *  - `GET /api/paiements/:id/recu` → reçu de paiement (quittance)
 *
 * These exercise the real SQL (column names, joins) — a typo in either query
 * only surfaces at request time, which unit mocks would not catch.
 *
 * Requires the disposable test database enforced by the shared test bootstrap.
 */

let authToken: string;
const auth = () => ({ Authorization: `Bearer ${authToken}` });

const createdTiersIds: number[] = [];
const createdProduitIds: number[] = [];
const createdCommandeIds: number[] = [];
const createdFactureIds: number[] = [];

async function getAuthToken(): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({
    username: 'admin',
    password: 'admin123',
  });
  return res.body.data.token;
}

beforeAll(async () => {
  authToken = await getAuthToken();
});

afterAll(async () => {
  // Ordered cleanup: children before parents (FKs are RESTRICT since 089).
  for (const id of createdFactureIds) {
    await pool.query('DELETE FROM paiements WHERE facture_id = $1', [id]);
    await pool.query(
      "DELETE FROM document_lignes WHERE document_type = 'facture' AND document_id = $1",
      [id]
    );
    await pool.query('DELETE FROM factures WHERE id = $1', [id]);
  }
  for (const id of createdCommandeIds) {
    await pool.query('DELETE FROM commande_lignes WHERE commande_id = $1', [id]);
    await pool.query('DELETE FROM commandes_fournisseur WHERE id = $1', [id]);
  }
  for (const id of createdProduitIds) {
    await pool.query('DELETE FROM mouvements_stock WHERE produit_id = $1', [id]);
    await pool.query('DELETE FROM stock_par_location WHERE produit_id = $1', [id]);
    await pool.query('DELETE FROM produits WHERE id = $1', [id]);
  }
  for (const id of createdTiersIds) {
    await pool.query('DELETE FROM compte_client_lignes WHERE tiers_id = $1', [id]);
    await pool.query('DELETE FROM compte_fournisseur_lignes WHERE tiers_id = $1', [id]);
    await pool.query('DELETE FROM ecritures_comptables WHERE tiers_id = $1', [id]);
    await pool.query('DELETE FROM factures_fournisseur WHERE tiers_id = $1', [id]);
    await pool.query('DELETE FROM tiers WHERE id = $1', [id]);
  }
  await pool.end();
});

async function newTiers(estFournisseur: boolean): Promise<number> {
  const res = await request(app)
    .post('/api/tiers')
    .set(auth())
    .send({
      raison_sociale: `PDF Test ${estFournisseur ? 'Fourn' : 'Client'} ${Date.now()}`,
      est_client: !estFournisseur,
      est_fournisseur: estFournisseur,
      telephone: '0700000000',
      adresse: 'Abidjan, Côte d\'Ivoire',
    });
  const id = res.body?.data?.id ?? res.body?.id;
  createdTiersIds.push(id);
  return id;
}

async function newProduit(): Promise<number> {
  const res = await request(app)
    .post('/api/produits')
    .set(auth())
    .send({
      reference: `PDFT-${Date.now()}`,
      nom: 'Produit test PDF',
      prix_achat: 1000,
      prix_vente: 1500,
      stock: 50,
      stock_min: 1,
    });
  const id = res.body?.data?.id ?? res.body?.id;
  createdProduitIds.push(id);
  return id;
}

/** A PDF stream always begins with the `%PDF-` magic bytes. */
function isPdf(body: Buffer): boolean {
  return Buffer.isBuffer(body) && body.subarray(0, 5).toString('latin1') === '%PDF-';
}

describe('GET /api/commandes/:id/pdf — bon de commande fournisseur', () => {
  it('generates a PDF for an existing purchase order', async () => {
    const fournisseurId = await newTiers(true);
    const produitId = await newProduit();

    const created = await request(app)
      .post('/api/commandes')
      .set(auth())
      .send({
        tiers_id: fournisseurId,
        date_livraison_prevue: '2026-12-31',
        notes: 'Commande de test PDF',
        lignes: [{ produit_id: produitId, quantite: 3, prix_unitaire: 1000 }],
      });

    const commandeId = created.body?.data?.id ?? created.body?.id;
    expect(commandeId, `création commande: ${JSON.stringify(created.body)}`).toBeTruthy();
    createdCommandeIds.push(commandeId);

    const res = await request(app)
      .get(`/api/commandes/${commandeId}/pdf`)
      .set(auth())
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('bon-commande-');
    expect(isPdf(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(500);
  });

  it('returns 404 for an unknown purchase order', async () => {
    const res = await request(app).get('/api/commandes/999999999/pdf').set(auth());
    expect(res.status).toBe(404);
  });
});

describe('GET /api/paiements/:id/recu — reçu de paiement', () => {
  it('generates a PDF receipt for an existing payment', async () => {
    const clientId = await newTiers(false);
    const produitId = await newProduit();

    const facture = await request(app)
      .post('/api/factures')
      .set(auth())
      .send({
        tiers_id: clientId,
        lignes: [{ produit_id: produitId, quantite: 2, prix_unitaire: 1500 }],
      });
    const factureId = facture.body?.data?.id ?? facture.body?.id;
    expect(factureId, `création facture: ${JSON.stringify(facture.body)}`).toBeTruthy();
    createdFactureIds.push(factureId);

    const paiement = await request(app)
      .post('/api/paiements')
      .set(auth())
      .send({
        facture_id: factureId,
        montant: 1000,
        // A receipt does not require a cash session; use a non-cash method so
        // this fixture stays independent from the cash-session test suites.
        methode_paiement: 'virement',
        reference: 'TEST-RECU',
      });
    expect([200, 201]).toContain(paiement.status);

    const { rows } = await pool.query(
      'SELECT id FROM paiements WHERE facture_id = $1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1',
      [factureId]
    );
    const paiementId = rows[0]?.id;
    expect(paiementId).toBeTruthy();

    const res = await request(app)
      .get(`/api/paiements/${paiementId}/recu`)
      .set(auth())
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('recu-paiement-');
    expect(isPdf(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(500);
  });

  it('returns 404 for an unknown payment', async () => {
    const res = await request(app).get('/api/paiements/999999999/recu').set(auth());
    expect(res.status).toBe(404);
  });
});

/**
 * Regression guard for the 2026-07-23 fix: the four sales-document PDF
 * generators queried per-document line tables that either no longer exist
 * (`facture_lignes`, `avoir_lignes` → SQL error → HTTP 500) or survive empty
 * (`devis_lignes`, `bon_livraison_lignes` → a PDF with no lines and a 0 total).
 * Every document line now lives in the unified `document_lignes` table.
 */
describe('Sales-document PDFs render their lines (document_lignes)', () => {
  it('renders a facture PDF containing the product line', async () => {
    const clientId = await newTiers(false);
    const produitId = await newProduit();

    const facture = await request(app)
      .post('/api/factures')
      .set(auth())
      .send({
        tiers_id: clientId,
        lignes: [{ produit_id: produitId, quantite: 4, prix_unitaire: 1500 }],
      });
    const factureId = facture.body?.data?.id ?? facture.body?.id;
    expect(factureId, `création facture: ${JSON.stringify(facture.body)}`).toBeTruthy();
    createdFactureIds.push(factureId);

    // The generator must find the lines the service actually wrote.
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM document_lignes WHERE document_type = 'facture' AND document_id = $1",
      [factureId]
    );
    expect(rows[0].n).toBe(1);

    const res = await request(app)
      .get(`/api/factures/${factureId}/pdf`)
      .set(auth())
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    // Before the fix this was a 500 (relation "facture_lignes" does not exist).
    expect(res.status).toBe(200);
    expect(isPdf(res.body)).toBe(true);
  });

  it('renders a devis PDF containing the product line', async () => {
    const clientId = await newTiers(false);
    const produitId = await newProduit();

    const devis = await request(app)
      .post('/api/devis')
      .set(auth())
      .send({
        tiers_id: clientId,
        lignes: [{ produit_id: produitId, quantite: 2, prix_unitaire: 1500 }],
      });
    const devisId = devis.body?.data?.id ?? devis.body?.id;
    expect(devisId, `création devis: ${JSON.stringify(devis.body)}`).toBeTruthy();

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM document_lignes WHERE document_type = 'devis' AND document_id = $1",
      [devisId]
    );
    expect(rows[0].n).toBe(1);

    const res = await request(app)
      .get(`/api/devis/${devisId}/pdf`)
      .set(auth())
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(isPdf(res.body)).toBe(true);

    await pool.query(
      "DELETE FROM document_lignes WHERE document_type = 'devis' AND document_id = $1",
      [devisId]
    );
    await pool.query('DELETE FROM devis WHERE id = $1', [devisId]);
  });
});
