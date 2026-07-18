import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';

/**
 * Integration tests for the payment flow (PaiementController) and the FIFO
 * client-allocation engine (ClientAllocationService).
 *
 * Domain semantics under test (verified against the code, not assumed):
 *  - factures.montant_paye/statut derive from a FULL FIFO recompute across the
 *    client's account (payments + unapplied acompte remainders), oldest facture
 *    first. Tests therefore use a FRESH tiers per scenario.
 *  - Acomptes auto-allocate to open factures at recompute time (facture create,
 *    payment, etc.). Facture statuts: en_attente / partielle / payee.
 *  - Payment payload `montant` is the total to settle: available acomptes are
 *    applied first, only the remainder is recorded as a direct payment.
 *
 * Requires the dev database (same convention as the other integration tests).
 */

let authToken: string;
const createdTiersIds: number[] = [];
const createdProduitIds: number[] = [];
const trackedPaiementIds: number[] = [];

// A long-closed period used to test the period lock without touching live months
const CLOSED_EXERCICE = 2019;
const CLOSED_PERIODE = 2;

const auth = () => ({ Authorization: `Bearer ${authToken}` });

async function getAuthToken(): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({
    username: 'admin',
    password: 'admin123',
  });
  return res.body.data.token;
}

async function newTiers(): Promise<number> {
  const res = await request(app)
    .post('/api/tiers')
    .set(auth())
    .send({
      raison_sociale: `Paiement Test ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      est_client: true,
      est_fournisseur: false,
    });
  const id = res.body.data.id;
  createdTiersIds.push(id);
  return id;
}

async function newProduit(): Promise<number> {
  const res = await request(app)
    .post('/api/produits')
    .set(auth())
    .send({
      reference: `PAI-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nom: 'Paiement Test Product',
      prix_achat: 500,
      prix_vente: 1000,
      stock: 100,
      stock_min: 1,
    });
  const id = res.body.data.id;
  createdProduitIds.push(id);
  return id;
}

/** Facture of `quantite` x 1000 XOF. */
async function newFacture(tiersId: number, quantite: number): Promise<{ id: number; total: number }> {
  const produitId = await newProduit();
  const res = await request(app)
    .post('/api/factures')
    .set(auth())
    .send({
      tiers_id: tiersId,
      lignes: [{ produit_id: produitId, quantite, prix_unitaire: 1000 }],
    });
  expect(res.status).toBe(201);
  return { id: res.body.data.id, total: quantite * 1000 };
}

/** Non-cash acompte (no caisse session involved). */
async function newAcompte(tiersId: number, montant: number): Promise<number> {
  const res = await request(app)
    .post(`/api/tiers/${tiersId}/acomptes-client`)
    .set(auth())
    .send({ montant, methode_paiement: 'virement' });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

/** Pays a facture; tracks created paiement ids for caisse-movement cleanup. */
async function pay(factureId: number, body: Record<string, unknown>) {
  const res = await request(app)
    .post(`/api/factures/${factureId}/paiements`)
    .set(auth())
    .send(body);
  if (res.status === 201) {
    if (res.body.direct_paiement_id) trackedPaiementIds.push(res.body.direct_paiement_id);
    for (const a of res.body.applications ?? []) trackedPaiementIds.push(a.paiement_id);
  }
  return res;
}

async function getFacture(id: number) {
  const res = await request(app).get(`/api/factures/${id}`).set(auth());
  return res.body.data;
}

describe('Paiements API (Integration)', () => {
  beforeAll(async () => {
    authToken = await getAuthToken();
    await pool.query(
      `INSERT INTO periodes_comptables (exercice, periode, date_debut, date_fin, statut)
       VALUES ($1, $2, '2019-02-01', '2019-02-28', 'fermee')
       ON CONFLICT (exercice, periode) DO UPDATE SET statut = 'fermee'`,
      [CLOSED_EXERCICE, CLOSED_PERIODE]
    );
  });

  afterAll(async () => {
    // Best-effort cleanup of test data only, FK-safe order.
    try {
      await pool.query(`DELETE FROM periodes_comptables WHERE exercice = $1 AND periode = $2`, [
        CLOSED_EXERCICE,
        CLOSED_PERIODE,
      ]);
      // Caisse movements created for tracked payments (incl. delete-reversals
      // whose paiement row is already gone)
      if (trackedPaiementIds.length > 0) {
        await pool.query(
          `DELETE FROM mouvements_caisse WHERE reference_type = 'paiement' AND reference_id = ANY($1::int[])`,
          [trackedPaiementIds]
        );
      }
      for (const tiersId of createdTiersIds) {
        await pool.query(
          `DELETE FROM acompte_applications
           WHERE acompte_id IN (SELECT id FROM acomptes_clients WHERE tiers_id = $1)`,
          [tiersId]
        );
        await pool.query(
          `DELETE FROM paiements WHERE facture_id IN (SELECT id FROM factures WHERE tiers_id = $1)`,
          [tiersId]
        );
        await pool.query(`DELETE FROM acomptes_clients WHERE tiers_id = $1`, [tiersId]);
        await pool.query(`DELETE FROM compte_client_lignes WHERE tiers_id = $1`, [tiersId]);
        await pool.query(`UPDATE factures SET deleted_at = CURRENT_TIMESTAMP WHERE tiers_id = $1`, [tiersId]);
        await request(app).delete(`/api/tiers/${tiersId}`).set(auth());
      }
      for (const id of createdProduitIds) {
        await request(app).delete(`/api/produits/${id}`).set(auth());
      }
    } catch {
      // cleanup must never fail the suite
    }
  });

  // ---- POST /api/factures/:factureId/paiements ----

  describe('create — validation & guards', () => {
    it('rejects without auth', async () => {
      const res = await request(app)
        .post('/api/factures/1/paiements')
        .send({ montant: 100, methode_paiement: 'virement' });
      expect(res.status).toBe(401);
    });

    it('rejects montant <= 0 (Zod)', async () => {
      const res = await request(app)
        .post('/api/factures/1/paiements')
        .set(auth())
        .send({ montant: 0, methode_paiement: 'virement' });
      expect(res.status).toBe(400);
    });

    it('rejects unknown payment method (Zod)', async () => {
      const res = await request(app)
        .post('/api/factures/1/paiements')
        .set(auth())
        .send({ montant: 100, methode_paiement: 'bitcoin' });
      expect(res.status).toBe(400);
    });

    it('rejects unknown facture (404)', async () => {
      const res = await request(app)
        .post('/api/factures/999999999/paiements')
        .set(auth())
        .send({ montant: 100, methode_paiement: 'virement', skip_acompte_application: true });
      expect(res.status).toBe(404);
    });

    it('rejects payment above remaining due (422)', async () => {
      const tiersId = await newTiers();
      const { id, total } = await newFacture(tiersId, 5);
      const res = await pay(id, {
        montant: total + 1000,
        methode_paiement: 'virement',
        skip_acompte_application: true,
      });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/dépasse/);
    });

    it('rejects payment dated in a closed accounting period (422)', async () => {
      const tiersId = await newTiers();
      const { id } = await newFacture(tiersId, 5);
      const res = await pay(id, {
        montant: 1000,
        methode_paiement: 'virement',
        date_paiement: '2019-02-15T12:00:00.000Z',
        skip_acompte_application: true,
      });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/clôturée/);
    });

    it('rejects payment on an annulee facture (400)', async () => {
      const tiersId = await newTiers();
      const { id } = await newFacture(tiersId, 2);
      await request(app).put(`/api/factures/${id}/statut`).set(auth()).send({ statut: 'annulee' });

      const res = await pay(id, {
        montant: 1000,
        methode_paiement: 'virement',
        skip_acompte_application: true,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/annulée/);
    });
  });

  describe('create — payment recording & FIFO allocation', () => {
    it('records a full direct payment: montant_paye = total, statut payee', async () => {
      const tiersId = await newTiers();
      const { id, total } = await newFacture(tiersId, 10); // 10 000

      const res = await pay(id, {
        montant: total,
        methode_paiement: 'virement',
        skip_acompte_application: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.direct_montant).toBe(total);
      expect(res.body.applique_depuis_acomptes).toBe(0);

      const facture = await getFacture(id);
      expect(parseFloat(facture.montant_paye)).toBe(total);
      expect(facture.statut).toBe('payee');
    });

    it('partial payment leaves statut partielle', async () => {
      const tiersId = await newTiers();
      const { id } = await newFacture(tiersId, 10); // 10 000

      const res = await pay(id, {
        montant: 4000,
        methode_paiement: 'virement',
        skip_acompte_application: true,
      });
      expect(res.status).toBe(201);

      const facture = await getFacture(id);
      expect(parseFloat(facture.montant_paye)).toBe(4000);
      expect(facture.statut).toBe('partielle');
    });

    it('pre-existing acompte auto-allocates at facture creation', async () => {
      const tiersId = await newTiers();
      await newAcompte(tiersId, 4000);
      const { id } = await newFacture(tiersId, 10); // 10 000

      const facture = await getFacture(id);
      expect(parseFloat(facture.montant_paye)).toBe(4000);
      expect(facture.statut).toBe('partielle');
    });

    it('payment-time FIFO applies a disponible acompte, remainder as direct', async () => {
      const tiersId = await newTiers();
      const { id } = await newFacture(tiersId, 10); // 10 000
      const acompteId = await newAcompte(tiersId, 4000); // created after -> still disponible

      const res = await pay(id, { montant: 6000, methode_paiement: 'virement' });
      expect(res.status).toBe(201);
      expect(res.body.applique_depuis_acomptes).toBe(4000);
      expect(res.body.direct_montant).toBe(2000); // montant is the total to settle
      expect(res.body.applications).toHaveLength(1);
      expect(res.body.applications[0].acompte_id).toBe(acompteId);

      const { rows } = await pool.query(
        'SELECT statut, montant_restant FROM acomptes_clients WHERE id = $1',
        [acompteId]
      );
      expect(parseFloat(rows[0].montant_restant)).toBe(0);
    });

    it('REGRESSION: applied acompte money is not double-counted by the recompute', async () => {
      // Bug fixed 2026-07-18: the FIFO pool loaded applied acomptes at full
      // montant while their acompte_application paiements rows were also in the
      // pool — 6 000 of real money marked a 10 000 facture 'payee' and could
      // mark further factures paid with phantom funds.
      const tiersId = await newTiers();
      const { id: factureA } = await newFacture(tiersId, 10); // 10 000
      await newAcompte(tiersId, 4000);

      const res = await pay(factureA, { montant: 6000, methode_paiement: 'virement' });
      expect(res.status).toBe(201);

      // Real money in the system: 4 000 (acompte) + 2 000 (direct) = 6 000
      const a = await getFacture(factureA);
      expect(parseFloat(a.montant_paye)).toBe(6000);
      expect(a.statut).toBe('partielle');

      // A second facture must NOT attract phantom funds
      const { id: factureB } = await newFacture(tiersId, 4); // 4 000
      const b = await getFacture(factureB);
      expect(parseFloat(b.montant_paye)).toBe(0);
      expect(b.statut).toBe('en_attente');

      // And facture A's allocation must be unchanged
      const aAfter = await getFacture(factureA);
      expect(parseFloat(aAfter.montant_paye)).toBe(6000);
    });

    it('honors idempotency_key on duplicate POST', async () => {
      const tiersId = await newTiers();
      const { id, total } = await newFacture(tiersId, 3);
      const key = `pai-idem-${Date.now()}`;
      const payload = {
        montant: total,
        methode_paiement: 'virement',
        idempotency_key: key,
        skip_acompte_application: true,
      };

      const r1 = await pay(id, payload);
      expect(r1.status).toBe(201);

      const r2 = await pay(id, payload);
      expect(r2.status).toBe(200);
      expect(r2.body.idempotent).toBe(true);

      const { rows } = await pool.query('SELECT COUNT(*) FROM paiements WHERE idempotency_key = $1', [key]);
      expect(parseInt(rows[0].count)).toBe(1);
    });
  });

  // ---- PUT /api/paiements/:id ----

  describe('update guards', () => {
    it('allows editing notes/reference freely', async () => {
      const tiersId = await newTiers();
      const { id, total } = await newFacture(tiersId, 3);
      const payRes = await pay(id, {
        montant: total,
        methode_paiement: 'virement',
        skip_acompte_application: true,
      });

      const res = await request(app)
        .put(`/api/paiements/${payRes.body.direct_paiement_id}`)
        .set(auth())
        .send({ notes: 'note modifiée' });
      expect(res.status).toBe(200);
    });

    it('financial edits: allowed only when the payment has no caisse movement', async () => {
      const tiersId = await newTiers();
      const { id } = await newFacture(tiersId, 10); // 10 000
      const payRes = await pay(id, {
        montant: 5000,
        methode_paiement: 'virement',
        skip_acompte_application: true,
      });
      const paiementId = payRes.body.direct_paiement_id;

      const { rows } = await pool.query('SELECT mouvement_caisse_id FROM paiements WHERE id = $1', [paiementId]);
      const caisseLinked = rows[0].mouvement_caisse_id != null;

      const res = await request(app)
        .put(`/api/paiements/${paiementId}`)
        .set(auth())
        .send({ montant: 8000 });

      if (caisseLinked) {
        // Environment has an open caisse session: the guard must block the edit
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/caisse/i);
      } else {
        expect(res.status).toBe(200);
        const facture = await getFacture(id);
        expect(parseFloat(facture.montant_paye)).toBe(8000);
      }
    });

    it('rejects financial edits on an acompte_application payment (409)', async () => {
      const tiersId = await newTiers();
      const { id } = await newFacture(tiersId, 5); // 5 000
      await newAcompte(tiersId, 3000);
      const payRes = await pay(id, { montant: 5000, methode_paiement: 'virement' });
      expect(payRes.status).toBe(201);
      expect(payRes.body.applications).toHaveLength(1);

      const res = await request(app)
        .put(`/api/paiements/${payRes.body.applications[0].paiement_id}`)
        .set(auth())
        .send({ montant: 100 });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/acompte/);
    });
  });

  // ---- DELETE /api/paiements/:id ----

  describe('delete guards', () => {
    it('deletes a direct payment and restores the facture balance', async () => {
      const tiersId = await newTiers();
      const { id, total } = await newFacture(tiersId, 5); // 5 000
      const payRes = await pay(id, {
        montant: total,
        methode_paiement: 'virement',
        skip_acompte_application: true,
      });
      const paiementId = payRes.body.direct_paiement_id;

      const before = await getFacture(id);
      expect(parseFloat(before.montant_paye)).toBe(total);

      const del = await request(app).delete(`/api/paiements/${paiementId}`).set(auth());
      expect(del.status).toBe(200);

      const after = await getFacture(id);
      expect(parseFloat(after.montant_paye)).toBe(0);
      expect(after.statut).toBe('en_attente');
    });

    it('rejects deleting an acompte_application payment (409)', async () => {
      const tiersId = await newTiers();
      const { id } = await newFacture(tiersId, 5); // 5 000
      await newAcompte(tiersId, 2000);
      const payRes = await pay(id, { montant: 5000, methode_paiement: 'virement' });
      expect(payRes.status).toBe(201);
      expect(payRes.body.applications).toHaveLength(1);

      const res = await request(app)
        .delete(`/api/paiements/${payRes.body.applications[0].paiement_id}`)
        .set(auth());
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/acompte/);
    });

    it('returns 404 for unknown paiement', async () => {
      const res = await request(app).delete('/api/paiements/999999999').set(auth());
      expect(res.status).toBe(404);
    });
  });
});
