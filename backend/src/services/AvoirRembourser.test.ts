import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';
import { TestDB } from '../test/helpers';
import { createRoleFixtures, removeRoleFixtures, RoleFixture, SupportedTestRole } from '../test/roleFixtures';

/** Server sentences carry U+00A0 inside amounts (formatMontantFcfa). */
const plain = (text: string) => text.split(String.fromCharCode(0xa0)).join(' ');

/**
 * E3 (2026-10-24) — « Rembourser l’avoir » : un client qui a payé, rapporté un
 * produit et veut son argent n'avait aucun chemin dans l'application (gate
 * G-02). POST /api/avoirs/:id/rembourser rembourse un avoir validé et non
 * utilisé : les espèces sortent de la caisse ouverte du magasin de l'avoir,
 * l'avoir passe « utilisé », le remboursement est écrit au relevé du client,
 * au journal d'audit et (CAISSE_GL_POSTING) au grand livre — comme le
 * remboursement d'un acompte.
 *
 * P-M4 : les mouvements de caisse disent à qui est l'argent et quel document
 * il règle (numéro, nom), y compris les anciennes lignes « #id ».
 */
describe('Avoirs — rembourser (E3) et libellés de caisse (P-M4)', () => {
  const suffix = `${Date.now() % 1000000}-${Math.floor(Math.random() * 1000)}`;
  let fixtures: RoleFixture[] = [];
  const tokens = new Map<SupportedTestRole | 'root', string>();
  const as = (role: SupportedTestRole | 'root') => ({ Authorization: `Bearer ${tokens.get(role)}` });

  let locationId: number;
  let magasinId: number;
  let magasinNom: string;
  let autreLocationId: number;
  let sessionId: number;
  let tiersId: number;
  let tiersNom: string;
  const factureIds: number[] = [];
  let seq = 0;

  async function newAvoir(total: number, opts: { statut?: string; locationId?: number | null } = {}) {
    seq += 1;
    const numero = `AVT-E3-${suffix}-${seq}`;
    const { rows: [a] } = await pool.query(
      `INSERT INTO factures_avoir (numero_avoir, tiers_id, date_avoir, statut, sous_total, tva, total, avoir_type, location_id)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, 0, $4, 'retour', $5) RETURNING id`,
      [numero, tiersId, opts.statut ?? 'valide', total, opts.locationId === undefined ? locationId : opts.locationId]
    );
    return { id: a.id as number, numero };
  }

  async function avoirStatut(id: number): Promise<string> {
    const { rows: [a] } = await pool.query('SELECT statut FROM factures_avoir WHERE id = $1', [id]);
    return a.statut;
  }

  const rembourser = (id: number, body: Record<string, unknown>, role: SupportedTestRole | 'root' = 'manager') =>
    request(app).post(`/api/avoirs/${id}/rembourser`).set(as(role)).send(body);

  beforeAll(async () => {
    fixtures = await createRoleFixtures();
    for (const f of fixtures) {
      const login = await request(app).post('/api/auth/login').send({ username: f.username, password: f.password });
      tokens.set(f.role, login.body.data.token);
    }
    const root = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    tokens.set('root', root.body.data.token);

    magasinNom = `Magasin E3 ${suffix}`;
    const { rows: locs } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1, $2, 'magasin', true), ($3, $4, 'magasin', true)
       RETURNING id, code`,
      [`TE3A-${suffix}`.slice(0, 20), magasinNom, `TE3B-${suffix}`.slice(0, 20), `Magasin E3 bis ${suffix}`]
    );
    locationId = locs[0].id;
    autreLocationId = locs[1].id;
    const { rows: mags } = await pool.query(
      `INSERT INTO magasins (location_id, code, nom, actif)
       VALUES ($1, $2, $3, true), ($4, $5, $6, true) RETURNING id`,
      [locationId, `ME3A-${suffix}`.slice(0, 20), magasinNom, autreLocationId, `ME3B-${suffix}`.slice(0, 20), `Magasin E3 bis ${suffix}`]
    );
    magasinId = mags[0].id;

    tiersNom = `E3 Client ${suffix}`;
    tiersId = await TestDB.createTestClient({ nom: tiersNom, prenom: 'Awa' });
  });

  afterAll(async () => {
    try {
      await TestDB.deleteInvoicesByIds(factureIds);
      await pool.query('UPDATE factures_avoir SET deleted_at = CURRENT_TIMESTAMP WHERE tiers_id = $1', [tiersId]);
      await pool.query('DELETE FROM acomptes_clients WHERE tiers_id = $1', [tiersId]);
      await pool.query('DELETE FROM compte_client_lignes WHERE tiers_id = $1', [tiersId]);
      await pool.query('UPDATE tiers SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [tiersId]);
      await removeRoleFixtures(fixtures);
    } catch {
      // cleanup must never fail the suite (till movements are append-only)
    } finally {
      await pool.end();
    }
  });

  it('refuse les espèces quand la caisse du magasin de l’avoir est fermée (409 CAISSE_FERMEE)', async () => {
    const avoir = await newAvoir(25000);
    const res = await rembourser(avoir.id, { methode_paiement: 'espece' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      code: 'CAISSE_FERMEE',
      error: `La caisse de ${magasinNom} est fermée : ouvrez-la avant de rembourser des espèces.`,
      magasin_id: magasinId,
      magasin_nom: magasinNom,
    });
    expect(await avoirStatut(avoir.id)).toBe('valide');
  });

  it('est réservé au gérant et à l’administrateur', async () => {
    const avoir = await newAvoir(1000);
    for (const role of ['caissier', 'magasin_staff', 'depot_staff'] as const) {
      const res = await rembourser(avoir.id, { methode_paiement: 'virement' }, role);
      expect(res.status, role).toBe(403);
    }
    const invalide = await rembourser(avoir.id, { methode_paiement: 'bitcoin' });
    expect(invalide.status).toBe(400);
    expect(await avoirStatut(avoir.id)).toBe('valide');
  });

  it('rembourse en espèces depuis la caisse ouverte : mouvement, avoir utilisé, relevé, audit et grand livre', async () => {
    const ouverture = await request(app)
      .post('/api/caisse/ouvrir')
      .set(as('root'))
      .send({ magasin_id: magasinId, fond_initial: 100000 });
    expect(ouverture.status).toBeLessThan(300);
    sessionId = (ouverture.body.data ?? ouverture.body).id;

    const avoir = await newAvoir(25000);
    const res = await rembourser(avoir.id, { methode_paiement: 'espece', reference: 'RET-42', notes: 'Écran défectueux' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      avoir_id: avoir.id,
      numero_avoir: avoir.numero,
      montant: 25000,
      methode_paiement: 'espece',
      session_caisse_id: sessionId,
    });
    expect(plain(res.body.message)).toBe(`Avoir ${avoir.numero} remboursé : 25 000 FCFA en espèces.`);
    const mouvementId = res.body.data.mouvement_caisse_id;
    expect(mouvementId).toEqual(expect.any(Number));

    const { rows: [mvt] } = await pool.query('SELECT * FROM mouvements_caisse WHERE id = $1', [mouvementId]);
    expect(mvt).toMatchObject({
      session_caisse_id: sessionId,
      type: 'decaissement',
      categorie: 'remboursement_client',
      methode_paiement: 'espece',
      reference_type: 'avoir',
      reference_id: avoir.id,
      libelle: `Remboursement avoir ${avoir.numero} — ${tiersNom} Awa`,
    });
    expect(Number(mvt.montant)).toBe(25000);

    const { rows: [fa] } = await pool.query('SELECT statut, facture_appliquee_id FROM factures_avoir WHERE id = $1', [avoir.id]);
    expect(fa).toEqual({ statut: 'utilise', facture_appliquee_id: null });

    const { rows: ledger } = await pool.query(
      `SELECT type_operation, montant_debit, montant_credit, notes FROM compte_client_lignes
       WHERE tiers_id = $1 AND document_numero = $2`,
      [tiersId, `REMB-${avoir.numero}`]
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type_operation).toBe('ajustement');
    expect(Number(ledger[0].montant_debit)).toBe(25000);
    expect(ledger[0].notes).toBe(`Remboursement de l’avoir ${avoir.numero} en espèces — réf. RET-42 — Écran défectueux`);

    const { rows: audit } = await pool.query(
      `SELECT new_values FROM audit_log WHERE action = 'rembourser' AND table_name = 'factures_avoir' AND record_id = $1`,
      [avoir.id]
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].new_values).toMatchObject({ methode_paiement: 'espece', montant: 25000, mouvement_caisse_id: mouvementId });

    if (process.env.CAISSE_GL_POSTING === 'true') {
      const { rows: gl } = await pool.query(
        `SELECT compte_numero, debit, credit FROM ecritures_comptables
         WHERE reference_type = 'caisse_mouvement' AND reference_id = $1 AND libelle LIKE $2
         ORDER BY compte_numero`,
        [avoir.id, `Remboursement avoir ${avoir.numero}%`]
      );
      expect(gl.map((l: any) => [l.compte_numero, Number(l.debit), Number(l.credit)])).toEqual([
        ['411', 25000, 0],
        ['53', 0, 25000],
      ]);
    }

    const detail = await request(app).get(`/api/avoirs/${avoir.id}`).set(as('manager'));
    expect(detail.status).toBe(200);
    expect(detail.body.data.remboursement).toMatchObject({
      montant: 25000,
      methode_paiement: 'espece',
      reference: 'RET-42',
      mouvement_caisse_id: mouvementId,
    });

    const encore = await rembourser(avoir.id, { methode_paiement: 'espece' });
    expect(encore.status).toBe(409);
    expect(encore.body.code).toBe('AVOIR_DEJA_UTILISE');
  });

  it('un autre mode de paiement passe par la caisse quand elle est ouverte, sinon sans mouvement', async () => {
    const avecCaisse = await newAvoir(7000);
    const ouverte = await rembourser(avecCaisse.id, { methode_paiement: 'orange_money' });
    expect(ouverte.status).toBe(201);
    expect(plain(ouverte.body.message)).toBe(`Avoir ${avecCaisse.numero} remboursé : 7 000 FCFA par Orange Money.`);
    const { rows: [mvt] } = await pool.query('SELECT methode_paiement, type FROM mouvements_caisse WHERE id = $1', [ouverte.body.data.mouvement_caisse_id]);
    expect(mvt).toEqual({ methode_paiement: 'orange_money', type: 'decaissement' });

    const sansCaisse = await newAvoir(3000, { locationId: autreLocationId });
    const fermee = await rembourser(sansCaisse.id, { methode_paiement: 'virement' }, 'root');
    expect(fermee.status).toBe(201);
    expect(fermee.body.data.mouvement_caisse_id).toBeNull();
    expect(await avoirStatut(sansCaisse.id)).toBe('utilise');
  });

  it('refuse un avoir non validé, et les espèces pour un avoir sans magasin', async () => {
    const brouillon = await newAvoir(2000, { statut: 'brouillon' });
    const res = await rembourser(brouillon.id, { methode_paiement: 'virement' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('AVOIR_NON_VALIDE');

    const sansMagasin = await newAvoir(2000, { locationId: null });
    const especes = await rembourser(sansMagasin.id, { methode_paiement: 'espece' });
    expect(especes.status).toBe(422);
    expect(especes.body.code).toBe('CAISSE_INTROUVABLE');

    const inconnu = await rembourser(999999999, { methode_paiement: 'virement' });
    expect(inconnu.status).toBe(404);
  });

  it('un avoir utilisé ne repasse plus « validé » par le changement de statut', async () => {
    const avoir = await newAvoir(1500);
    expect((await rembourser(avoir.id, { methode_paiement: 'virement' })).status).toBe(201);
    const res = await request(app).patch(`/api/avoirs/${avoir.id}/statut`).set(as('manager')).send({ statut: 'valide' });
    expect(res.status).toBe(409);
    expect(await avoirStatut(avoir.id)).toBe('utilise');
  });

  it('P-M4 : les mouvements portent le numéro et le nom, anciennes lignes comprises', async () => {
    seq += 1;
    const numero = `TEST-FAC-E3-${suffix}-${seq}`;
    const { rows: [f] } = await pool.query(
      `INSERT INTO factures (numero_facture, tiers_id, sous_total, total, remaining_due, statut, location_id)
       VALUES ($1, $2, 12000, 12000, 12000, 'en_attente', $3) RETURNING id`,
      [numero, tiersId, locationId]
    );
    factureIds.push(f.id);

    const pay = await request(app)
      .post(`/api/factures/${f.id}/paiements`)
      .set(as('root'))
      .send({ montant: 12000, methode_paiement: 'espece' });
    expect(pay.status).toBe(201);

    const acompte = await request(app)
      .post(`/api/tiers/${tiersId}/acomptes-client`)
      .set(as('root'))
      .send({ montant: 4000, methode_paiement: 'espece', magasin_id: magasinId });
    expect(acompte.status).toBe(201);

    // A row written before the fix: database ids in the label.
    const { rows: [ancien] } = await pool.query(
      `INSERT INTO mouvements_caisse (session_caisse_id, type, categorie, montant, methode_paiement, reference_type, reference_id, libelle)
       VALUES ($1, 'encaissement', 'paiement_client', 1, 'carte', 'paiement', $2, $3) RETURNING id`,
      [sessionId, pay.body.data.direct_paiement_id, `Paiement facture #${f.id}`]
    );

    const res = await request(app).get(`/api/caisse/${sessionId}/mouvements`).set(as('root'));
    expect(res.status).toBe(200);
    const rows = res.body.data as any[];
    const nom = `${tiersNom} Awa`;

    const paiement = rows.find((m) => m.id === pay.body.data.mouvement_caisse_id);
    expect(paiement).toMatchObject({ libelle: `Paiement ${numero} — ${nom}`, facture_id: f.id, numero_facture: numero, tiers_nom: nom, tiers_id: tiersId });

    const acompteMvt = rows.find((m) => m.id === acompte.body.data.mouvement_caisse_id);
    expect(acompteMvt).toMatchObject({ libelle: `Acompte — ${nom}`, tiers_nom: nom, facture_id: null });

    const vieux = rows.find((m) => m.id === ancien.id);
    expect(vieux).toMatchObject({ libelle: `Paiement facture #${f.id}`, facture_id: f.id, numero_facture: numero, tiers_nom: nom });

    const avoirMvt = rows.find((m) => m.reference_type === 'avoir');
    expect(avoirMvt).toMatchObject({ tiers_nom: nom, numero_avoir: expect.stringMatching(/^AVT-E3-/) });
  });
});
