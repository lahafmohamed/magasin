import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';
import { TestDB } from '../test/helpers';

/** Les phrases du serveur portent U+00A0 dans les montants (formatMontantFcfa). */
const plain = (text: string) => text.split(String.fromCharCode(0xa0)).join(' ');

/**
 * Lot 2 — POST /api/factures/comptoir : facture + encaissement en UNE
 * transaction. Rien n'est écrit si l'encaissement échoue (caisse fermée,
 * montant faux) : ni facture, ni sortie de stock.
 */
describe('Vente comptoir (POST /api/factures/comptoir)', () => {
  const suffix = `${Date.now() % 1000000}-${Math.floor(Math.random() * 1000)}`;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let locationId: number;
  let magasinId: number;
  let produitId: number;
  const factureIds: number[] = [];

  const vendre = (body: Record<string, unknown>) =>
    request(app).post('/api/factures/comptoir').set(auth()).send(body);

  async function stockMagasin(): Promise<number> {
    const { rows } = await pool.query(
      'SELECT quantite FROM stock_par_location WHERE produit_id = $1 AND location_id = $2',
      [produitId, locationId]
    );
    return rows[0]?.quantite ?? 0;
  }

  async function facturesDuProduit(): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM document_lignes WHERE document_type = 'facture' AND produit_id = $1`,
      [produitId]
    );
    return rows[0].n;
  }

  beforeAll(async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = login.body.data.token;

    const { rows: locs } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1, $2, 'magasin', true) RETURNING id`,
      [`TVC-${suffix}`.slice(0, 20), `Magasin comptoir ${suffix}`]
    );
    locationId = locs[0].id;
    const { rows: mags } = await pool.query(
      `INSERT INTO magasins (location_id, code, nom, actif) VALUES ($1, $2, $3, true) RETURNING id`,
      [locationId, `MVC-${suffix}`.slice(0, 20), `Magasin comptoir ${suffix}`]
    );
    magasinId = mags[0].id;

    produitId = await TestDB.createTestProduct({ reference: `VC-${suffix}`, nom: 'T-shirt comptoir', prix_vente: 2500, stock: 0 });
    await pool.query(
      `INSERT INTO stock_par_location (produit_id, location_id, quantite) VALUES ($1, $2, 20)
       ON CONFLICT (produit_id, location_id) DO UPDATE SET quantite = 20`,
      [produitId, locationId]
    );
  });

  afterAll(async () => {
    try {
      await TestDB.deleteInvoicesByIds(factureIds);
    } catch {
      // les mouvements de caisse sont en ajout seul : le nettoyage ne doit pas faire échouer la suite
    } finally {
      await pool.end();
    }
  });

  it('refuse les espèces caisse fermée et ne laisse ni facture ni sortie de stock', async () => {
    const res = await vendre({
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite: 2, prix_unitaire: 2500 }],
      paiements: [{ methode_paiement: 'espece' }],
      especes_recues: 10000,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CAISSE_FERMEE');
    expect(await stockMagasin()).toBe(20);
    expect(await facturesDuProduit()).toBe(0);
  });

  it('refuse un paiement qui ne fait pas le total, sans rien écrire', async () => {
    const res = await vendre({
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite: 1, prix_unitaire: 2500 }],
      paiements: [
        { methode_paiement: 'carte', montant: 1000 },
        { methode_paiement: 'wave', montant: 1000 },
      ],
    });
    expect(res.status).toBe(422);
    expect(plain(res.body.error)).toBe('Le paiement (2 000 FCFA) ne correspond pas au total de la vente (2 500 FCFA).');
    expect(await stockMagasin()).toBe(20);
  });

  it('encaisse en espèces au client comptoir : facture payée, stock sorti, caisse créditée, monnaie rendue', async () => {
    const ouverture = await request(app)
      .post('/api/caisse/ouvrir')
      .set(auth())
      .send({ magasin_id: magasinId, fond_initial: 50000 });
    expect(ouverture.status).toBeLessThan(300);

    const key = `vc-test-${suffix}-a`;
    const res = await vendre({
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite: 3, prix_unitaire: 2500 }],
      paiements: [{ methode_paiement: 'espece' }],
      especes_recues: 10000,
      idempotency_key: key,
    });
    expect(res.status).toBe(201);
    const data = res.body.data;
    factureIds.push(data.facture_id);
    expect(data).toMatchObject({ idempotent: false, total: 7500, monnaie_rendue: 2500, especes_recues: 10000 });
    expect(plain(res.body.message)).toBe(`Vente ${data.numero_facture} : 7 500 FCFA payés en espèces. Monnaie à rendre : 2 500 FCFA.`);

    const { rows: [f] } = await pool.query(
      `SELECT f.statut, f.montant_paye, t.code FROM factures f JOIN tiers t ON t.id = f.tiers_id WHERE f.id = $1`,
      [data.facture_id]
    );
    expect(f.statut).toBe('payee');
    expect(parseFloat(f.montant_paye)).toBe(7500);
    expect(f.code).toBe('PASS');
    expect(await stockMagasin()).toBe(17);

    const { rows: mvts } = await pool.query(
      `SELECT m.montant, m.methode_paiement FROM mouvements_caisse m
       JOIN paiements p ON p.mouvement_caisse_id = m.id WHERE p.facture_id = $1`,
      [data.facture_id]
    );
    expect(mvts).toHaveLength(1);
    expect(parseFloat(mvts[0].montant)).toBe(7500);
    expect(mvts[0].methode_paiement).toBe('espece');

    // Double envoi (double clic, scan répété) : même vente, rien de plus.
    const again = await vendre({
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite: 3, prix_unitaire: 2500 }],
      paiements: [{ methode_paiement: 'espece' }],
      especes_recues: 10000,
      idempotency_key: key,
    });
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ idempotent: true, facture_id: data.facture_id });
    expect(await stockMagasin()).toBe(17);
  });

  it('accepte un paiement en plusieurs modes qui fait le total', async () => {
    const res = await vendre({
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite: 2, prix_unitaire: 2500 }],
      paiements: [
        { methode_paiement: 'espece', montant: 2000 },
        { methode_paiement: 'orange_money', montant: 3000, reference: 'OM-123' },
      ],
      especes_recues: 2000,
    });
    expect(res.status).toBe(201);
    factureIds.push(res.body.data.facture_id);
    expect(res.body.data.paiements).toHaveLength(2);
    expect(res.body.data.monnaie_rendue).toBe(0);
    const { rows: [f] } = await pool.query('SELECT statut FROM factures WHERE id = $1', [res.body.data.facture_id]);
    expect(f.statut).toBe('payee');
    expect(await stockMagasin()).toBe(15);
  });

  it('refuse des espèces reçues inférieures à la part en espèces', async () => {
    const res = await vendre({
      location_id: locationId,
      lignes: [{ produit_id: produitId, quantite: 1, prix_unitaire: 2500 }],
      paiements: [{ methode_paiement: 'espece' }],
      especes_recues: 2000,
    });
    expect(res.status).toBe(422);
    expect(plain(res.body.error)).toBe('Espèces reçues insuffisantes : 2 000 FCFA pour 2 500 FCFA à payer.');
    expect(await stockMagasin()).toBe(15);
  });

  it('exige une session ouverte', async () => {
    const res = await request(app).post('/api/factures/comptoir').send({});
    expect(res.status).toBe(401);
  });
});
