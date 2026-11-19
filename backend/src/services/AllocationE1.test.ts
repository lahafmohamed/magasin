import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../server';
import pool from '../db/connection';
import { TestDB } from '../test/helpers';
import { createRoleFixtures, removeRoleFixtures, RoleFixture } from '../test/roleFixtures';
import { ClientAllocationService } from './ClientAllocationService';
import { paiementService } from './PaiementService';
import { factureService } from './FactureService';
import creditNoteService from './CreditNoteService';

/**
 * Décision E1 (2026-10-24) : un paiement règle la facture sur laquelle il a
 * été enregistré, pour tout client — « Client comptoir » compris.
 *
 * Avant : ClientAllocationService versait chaque paiement dans un pot commun
 * au client et le répartissait sur ses factures les plus anciennes. Payer la
 * seconde de deux factures laissait la seconde « Non payée » et réglait la
 * première ; au comptoir, le paiement d'un client de passage soldait la vente
 * d'un autre (gate G-01 / P-B1). Un avoir imputé sur une facture choisie
 * allait de même à la plus ancienne (G-03). Seul l'argent sans facture cible
 * (acomptes répartis automatiquement, reliquat d'avoir, compensation) reste
 * réparti de la plus ancienne à la plus récente.
 *
 * Ces scénarios échouent avec l'ancien moteur (FIFO sur tout le compte).
 */
/** Server sentences carry U+00A0 inside amounts (formatMontantFcfa). */
const plain = (text: string) => text.split(String.fromCharCode(0xa0)).join(' ');

describe('E1 — un paiement règle la facture sur laquelle il est enregistré', () => {
  const suffix = `${Date.now() % 1000000}-${Math.floor(Math.random() * 1000)}`;
  const createdTiers: number[] = [];
  const createdFactures: number[] = [];
  let comptoirId: number;
  let seq = 0;

  async function newClient(label: string): Promise<number> {
    const id = await TestDB.createTestClient({ nom: `E1 ${label} ${suffix}` });
    createdTiers.push(id);
    return id;
  }

  /** Invoice issued `joursAvant` days ago (older first), nothing paid. */
  async function newFacture(tiersId: number, total: number, joursAvant: number): Promise<number> {
    seq += 1;
    const { rows: [f] } = await pool.query(
      `INSERT INTO factures (numero_facture, tiers_id, sous_total, total, remaining_due, statut, date_facture)
       VALUES ($1, $2, $3, $3, $3, 'en_attente', LOCALTIMESTAMP - make_interval(days => $4))
       RETURNING id`,
      [`TEST-FAC-E1-${suffix}-${seq}`, tiersId, total, joursAvant]
    );
    createdFactures.push(f.id);
    return f.id;
  }

  async function facture(id: number) {
    const { rows: [f] } = await pool.query(
      'SELECT montant_paye, remaining_due, statut FROM factures WHERE id = $1',
      [id]
    );
    return { paye: Number(f.montant_paye), reste: Number(f.remaining_due), statut: f.statut as string };
  }

  async function solde(tiersId: number): Promise<number> {
    const { rows: [t] } = await pool.query('SELECT solde_client_actuel FROM tiers WHERE id = $1', [tiersId]);
    return Number(t.solde_client_actuel);
  }

  async function newAvoir(tiersId: number, total: number): Promise<number> {
    seq += 1;
    const { rows: [a] } = await pool.query(
      `INSERT INTO factures_avoir (numero_avoir, tiers_id, date_avoir, statut, sous_total, tva, total, avoir_type)
       VALUES ($1, $2, CURRENT_DATE, 'valide', $3, 0, $3, 'erreur') RETURNING id`,
      [`AVT-E1-${suffix}-${seq}`, tiersId, total]
    );
    return a.id;
  }

  beforeAll(async () => {
    const { rows } = await pool.query(`SELECT id FROM tiers WHERE code = 'PASS' AND deleted_at IS NULL`);
    comptoirId = rows[0].id;
  });

  afterAll(async () => {
    try {
      await pool.query(
        `UPDATE factures_avoir SET facture_appliquee_id = NULL, deleted_at = CURRENT_TIMESTAMP
         WHERE tiers_id = ANY($1::int[])`,
        [createdTiers]
      );
      await pool.query(
        `DELETE FROM acompte_applications WHERE acompte_id IN (SELECT id FROM acomptes_clients WHERE tiers_id = ANY($1::int[]))`,
        [createdTiers]
      );
      await TestDB.deleteInvoicesByIds(createdFactures);
      await pool.query('DELETE FROM acomptes_clients WHERE tiers_id = ANY($1::int[])', [createdTiers]);
      await pool.query('DELETE FROM compte_client_lignes WHERE tiers_id = ANY($1::int[])', [createdTiers]);
      await pool.query('UPDATE tiers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])', [createdTiers]);
      // The walk-in account keeps its other invoices: re-derive its balance
      // with the safe engine (no deposit spent).
      if (comptoirId) {
        await ClientAllocationService.reallocateClient(comptoirId, { apply: true, acceptEcart: true });
      }
    } catch {
      // cleanup must never fail the suite
    } finally {
      await pool.end();
    }
  });

  it('client nommé : payer la seconde facture la solde, la première reste due', async () => {
    const tiersId = await newClient('nommé');
    const a = await newFacture(tiersId, 40000, 2);
    const b = await newFacture(tiersId, 32000, 1);

    const result = await paiementService.create({
      factureId: b, montant: 32000, methode_paiement: 'virement', userId: null,
    });

    expect(result.statut_facture).toBe('payee');
    expect(result.reste_du).toBe(0);
    expect(plain(result.message)).toBe('Paiement de 32 000 FCFA enregistré par virement. Facture soldée.');
    expect(await facture(b)).toEqual({ paye: 32000, reste: 0, statut: 'payee' });
    expect(await facture(a)).toEqual({ paye: 0, reste: 40000, statut: 'en_attente' });
    expect(await solde(tiersId)).toBe(40000);
  });

  it('« Client comptoir » : le paiement d’une vente ne règle pas la vente impayée d’un autre client', async () => {
    const venteImpayee = await newFacture(comptoirId, 15000, 2);
    const vente = await newFacture(comptoirId, 9000, 1);

    const result = await paiementService.create({
      factureId: vente, montant: 9000, methode_paiement: 'orange_money', userId: null,
    });

    expect(result.statut_facture).toBe('payee');
    expect(await facture(vente)).toEqual({ paye: 9000, reste: 0, statut: 'payee' });
    expect(await facture(venteImpayee)).toEqual({ paye: 0, reste: 15000, statut: 'en_attente' });

    // Paying the unpaid sale later settles it, and only it.
    await paiementService.create({ factureId: venteImpayee, montant: 5000, methode_paiement: 'virement', userId: null });
    expect(await facture(venteImpayee)).toEqual({ paye: 5000, reste: 10000, statut: 'partielle' });
    expect(await facture(vente)).toEqual({ paye: 9000, reste: 0, statut: 'payee' });
  });

  it('un paiement partiel reste sur sa facture quand une nouvelle facture relance le calcul', async () => {
    const tiersId = await newClient('partiel');
    const a = await newFacture(tiersId, 20000, 3);
    const b = await newFacture(tiersId, 20000, 2);
    await paiementService.create({ factureId: b, montant: 8000, methode_paiement: 'virement', userId: null });

    await newFacture(tiersId, 5000, 1);
    await ClientAllocationService.recomputeClientAllocations(tiersId);

    expect(await facture(a)).toEqual({ paye: 0, reste: 20000, statut: 'en_attente' });
    expect(await facture(b)).toEqual({ paye: 8000, reste: 12000, statut: 'partielle' });
  });

  it('un acompte réparti automatiquement va toujours à la facture la plus ancienne', async () => {
    const tiersId = await newClient('acompte');
    const a = await newFacture(tiersId, 10000, 3);
    const b = await newFacture(tiersId, 10000, 2);
    await pool.query(
      `INSERT INTO acomptes_clients (tiers_id, montant, montant_restant, methode_paiement)
       VALUES ($1, 15000, 15000, 'virement')`,
      [tiersId]
    );

    // Same call as invoice creation / BL conversion (acomptes pooled).
    await ClientAllocationService.recomputeClientAllocations(tiersId);

    expect(await facture(a)).toEqual({ paye: 10000, reste: 0, statut: 'payee' });
    expect(await facture(b)).toEqual({ paye: 5000, reste: 5000, statut: 'partielle' });
  });

  it('un avoir imputé sur une facture choisie réduit cette facture, même si une plus ancienne est due', async () => {
    const tiersId = await newClient('avoir');
    const a = await newFacture(tiersId, 40000, 2);
    const b = await newFacture(tiersId, 30000, 1);
    const avoirId = await newAvoir(tiersId, 10000);

    const result = await creditNoteService.applyToFacture(avoirId, b);

    expect(result.montant_impute).toBe(10000);
    expect(result.credit_client).toBe(0);
    expect(result.reste_du).toBe(20000);
    expect(plain(result.message)).toMatch(/^Avoir AVT-E1-.* imputé sur la facture TEST-FAC-E1-.* : 10 000 FCFA\. Reste dû : 20 000 FCFA\.$/);
    expect(await facture(b)).toEqual({ paye: 10000, reste: 20000, statut: 'partielle' });
    expect(await facture(a)).toEqual({ paye: 0, reste: 40000, statut: 'en_attente' });
  });

  it('la part d’un avoir que la facture choisie ne peut pas prendre devient un crédit réparti du plus ancien au plus récent', async () => {
    const tiersId = await newClient('avoir-reliquat');
    const a = await newFacture(tiersId, 40000, 2);
    const b = await newFacture(tiersId, 5000, 1);
    const avoirId = await newAvoir(tiersId, 8000);

    const result = await creditNoteService.applyToFacture(avoirId, b);

    expect(result.montant_impute).toBe(5000);
    expect(result.credit_client).toBe(3000);
    expect(result.statut_facture).toBe('payee');
    expect(plain(result.message)).toContain('Les 3 000 FCFA restants passent au crédit du client.');
    expect(await facture(b)).toEqual({ paye: 5000, reste: 0, statut: 'payee' });
    expect(await facture(a)).toEqual({ paye: 3000, reste: 37000, statut: 'partielle' });
  });

  /**
   * E1-R1 (gate personas, round 2) : après la réimputation E1 des données
   * existantes, une facture pouvait lister plus de paiements que son total —
   * l'excédent réglant une facture plus ancienne — sans qu'aucune des deux
   * pages ne le dise (FAC-2026-00113 / FAC-2026-00079 sur la base de revue).
   */
  describe('E1-R1 — un paiement au-delà de sa facture est expliqué sur les deux factures', () => {
    /** A payment row as legacy data left it (recorded without the E1 cap), `minutesAvant` ago. */
    async function paiementHerite(factureId: number, montant: number, methode: string, minutesAvant: number): Promise<number> {
      const { rows: [p] } = await pool.query(
        `INSERT INTO paiements (facture_id, montant, methode_paiement, source, date_paiement)
         VALUES ($1, $2, $3, 'direct', LOCALTIMESTAMP - make_interval(mins => $4)) RETURNING id`,
        [factureId, montant, methode, minutesAvant]
      );
      return p.id;
    }

    interface PageFacture {
      paiements: Array<{ montant: string | number }>;
      excedent_reporte: Array<{ montant: number }>;
      recu_par_report: Array<{ montant: number }>;
      excedent_non_affecte: number | string;
    }

    /** Listed − carried away − on no invoice + received: must equal the paid amount on every page. */
    function solde(f: PageFacture): number {
      const listed = f.paiements.reduce((s, p) => s + Number(p.montant), 0);
      const out = f.excedent_reporte.reduce((s, r) => s + r.montant, 0);
      const inn = f.recu_par_report.reduce((s, r) => s + r.montant, 0);
      return listed - out - Number(f.excedent_non_affecte) + inn;
    }

    it('la facture payée au-delà de son total dit où va l’excédent, la plus ancienne dit d’où il vient', async () => {
      const tiersId = await newClient('report');
      const ancienne = await newFacture(tiersId, 76000, 9);
      const recente = await newFacture(tiersId, 267000, 1);
      await paiementHerite(ancienne, 26600, 'orange_money', 8 * 24 * 60);
      await paiementHerite(recente, 267000, 'cheque', 120);
      const surplus = await paiementHerite(recente, 49400, 'virement', 60);

      await ClientAllocationService.recomputeClientAllocations(tiersId);
      expect(await facture(recente)).toEqual({ paye: 267000, reste: 0, statut: 'payee' });
      expect(await facture(ancienne)).toEqual({ paye: 76000, reste: 0, statut: 'payee' });

      const pageRecente = await factureService.getById(recente);
      const pageAncienne = await factureService.getById(ancienne);
      expect(pageRecente.excedent_reporte).toEqual([
        expect.objectContaining({ facture_id: ancienne, montant: 49400, paiement_id: surplus, methode_paiement: 'virement' }),
      ]);
      expect(pageRecente.excedent_reporte[0].numero_facture).toMatch(/^TEST-FAC-E1-/);
      expect(pageRecente.recu_par_report).toEqual([]);
      expect(pageAncienne.recu_par_report).toEqual([
        expect.objectContaining({ facture_id: recente, montant: 49400, paiement_id: surplus, methode_paiement: 'virement' }),
      ]);
      expect(pageAncienne.excedent_reporte).toEqual([]);
      expect(solde(pageRecente)).toBe(267000);
      expect(solde(pageAncienne)).toBe(76000);

      // The recompute report lists the overflow, so the administrator can re-record a mis-filed payment.
      const run = await ClientAllocationService.reallocateAllClients({ tiersId, apply: false });
      expect(run.paiements_reportes).toBe(1);
      expect(run.details).toHaveLength(1);
      expect(run.details[0].statut).toBe('inchange');
      expect(run.details[0].paiements_reportes).toEqual([
        expect.objectContaining({
          paiement_id: surplus, facture_source_id: recente, facture_cible_id: ancienne, montant: 49400, source_annulee: false,
        }),
      ]);
      expect(plain(ClientAllocationService.describeReports(run.details[0].paiements_reportes)))
        .toMatch(/^49 400 FCFA payés sur TEST-FAC-E1-.*, déjà soldée, règlent TEST-FAC-E1-.*\.$/);
    });

    it('les paiements d’une facture annulée vont à la facture ouverte la plus ancienne, et la page le dit', async () => {
      const tiersId = await newClient('report-annulee');
      const ouverte = await newFacture(tiersId, 10000, 3);
      const annulee = await newFacture(tiersId, 5000, 2);
      await paiementHerite(annulee, 5000, 'virement', 60);
      await pool.query(`UPDATE factures SET statut = 'annulee' WHERE id = $1`, [annulee]);

      await ClientAllocationService.recomputeClientAllocations(tiersId);
      expect(await facture(ouverte)).toEqual({ paye: 5000, reste: 5000, statut: 'partielle' });

      const pageAnnulee = await factureService.getById(annulee);
      const pageOuverte = await factureService.getById(ouverte);
      expect(pageAnnulee.excedent_reporte).toEqual([expect.objectContaining({ facture_id: ouverte, montant: 5000 })]);
      expect(pageOuverte.recu_par_report).toEqual([expect.objectContaining({ facture_id: annulee, montant: 5000 })]);
      expect(solde(pageOuverte)).toBe(5000);
    });

    it('signale l’excédent qu’aucune facture ne pouvait recevoir', async () => {
      const tiersId = await newClient('report-aucune');
      const seule = await newFacture(tiersId, 10000, 2);
      await paiementHerite(seule, 10000, 'cheque', 90);
      await paiementHerite(seule, 2000, 'virement', 60);

      await ClientAllocationService.recomputeClientAllocations(tiersId);
      const page = await factureService.getById(seule);
      expect(page.excedent_reporte).toEqual([]);
      expect(Number(page.excedent_non_affecte)).toBe(2000);
      expect(solde(page)).toBe(10000);
    });

    it('ne dit rien quand les soldes enregistrés ne viennent pas du calcul actuel', async () => {
      const tiersId = await newClient('report-incertain');
      const ancienne = await newFacture(tiersId, 10000, 3);
      const recente = await newFacture(tiersId, 5000, 1);
      await paiementHerite(recente, 8000, 'virement', 60);
      // Balances left by another rule: nothing proves where the 3 000 FCFA went.
      await pool.query(`UPDATE factures SET montant_paye = 5000, remaining_due = 0, statut = 'payee' WHERE id = $1`, [recente]);
      await pool.query(`UPDATE factures SET montant_paye = 1000, remaining_due = 9000, statut = 'partielle' WHERE id = $1`, [ancienne]);

      const page = await factureService.getById(recente);
      expect(page.excedent_reporte).toEqual([]);
      expect(page.recu_par_report).toEqual([]);
      expect(Number(page.excedent_non_affecte)).toBe(0);
    });

    it('ne rejoue pas le compte quand les paiements listés font le montant payé', async () => {
      const tiersId = await newClient('report-simple');
      const f = await newFacture(tiersId, 10000, 1);
      await paiementService.create({ factureId: f, montant: 4000, methode_paiement: 'virement', userId: null });
      const spy = vi.spyOn(ClientAllocationService, 'loadClientCarries');
      try {
        const page = await factureService.getById(f);
        expect(page.excedent_reporte).toEqual([]);
        expect(page.recu_par_report).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('réimputation des données existantes (une fois, après le déploiement)', () => {
    /** The state the FIFO engine left: B's payment sits on the older A. */
    async function etatFifoHerite(): Promise<{ tiersId: number; a: number; b: number }> {
      const tiersId = await newClient('héritage');
      const a = await newFacture(tiersId, 40000, 2);
      const b = await newFacture(tiersId, 32000, 1);
      await pool.query(
        `INSERT INTO paiements (facture_id, montant, methode_paiement, source) VALUES ($1, 32000, 'virement', 'direct')`,
        [b]
      );
      await pool.query(`UPDATE factures SET montant_paye = 32000, remaining_due = 8000, statut = 'partielle' WHERE id = $1`, [a]);
      await pool.query(`UPDATE factures SET montant_paye = 0, remaining_due = 32000, statut = 'en_attente' WHERE id = $1`, [b]);
      return { tiersId, a, b };
    }

    it('simule sans rien écrire, puis applique en gardant le total du compte, et une seconde passe ne change rien', async () => {
      const { tiersId, a, b } = await etatFifoHerite();

      const simulation = await ClientAllocationService.reallocateAllClients({ tiersId, apply: false });
      expect(simulation.mode).toBe('simulation');
      expect(simulation.clients_modifies).toBe(1);
      expect(simulation.factures_modifiees).toBe(2);
      const [detail] = simulation.details;
      expect(detail).toMatchObject({ tiers_id: tiersId, statut: 'modifie', applique: false, total_paye_avant: 32000, total_paye_apres: 32000 });
      expect(await facture(a)).toEqual({ paye: 32000, reste: 8000, statut: 'partielle' });

      const application = await ClientAllocationService.reallocateAllClients({ tiersId, apply: true, userId: null });
      expect(application.details[0]).toMatchObject({ statut: 'modifie', applique: true });
      expect(await facture(a)).toEqual({ paye: 0, reste: 40000, statut: 'en_attente' });
      expect(await facture(b)).toEqual({ paye: 32000, reste: 0, statut: 'payee' });
      expect(await solde(tiersId)).toBe(40000);

      const { rows: audit } = await pool.query(
        `SELECT old_values, new_values FROM audit_log
         WHERE action = 'reimputation_paiements' AND table_name = 'tiers' AND record_id = $1`,
        [tiersId]
      );
      expect(audit).toHaveLength(1);
      expect(audit[0].old_values.total_paye).toBe(32000);
      expect(audit[0].new_values.total_paye).toBe(32000);

      const encore = await ClientAllocationService.reallocateAllClients({ tiersId, apply: true });
      expect(encore.clients_modifies).toBe(0);
      expect(encore.details).toEqual([]);
    });

    it('laisse intact un client dont le total payé changerait, sauf accord explicite', async () => {
      const tiersId = await newClient('écart');
      const f = await newFacture(tiersId, 10000, 1);
      // Money counted on the invoice with nothing behind it (no payment, no acompte).
      await pool.query(`UPDATE factures SET montant_paye = 5000, remaining_due = 5000, statut = 'partielle' WHERE id = $1`, [f]);

      const refuse = await ClientAllocationService.reallocateAllClients({ tiersId, apply: true });
      expect(refuse.clients_ecart).toBe(1);
      expect(refuse.details[0]).toMatchObject({ statut: 'ecart', applique: false, total_paye_avant: 5000, total_paye_apres: 0 });
      expect(await facture(f)).toEqual({ paye: 5000, reste: 5000, statut: 'partielle' });

      const accepte = await ClientAllocationService.reallocateAllClients({ tiersId, apply: true, acceptEcart: true });
      expect(accepte.details[0]).toMatchObject({ statut: 'ecart', applique: true });
      expect(await facture(f)).toEqual({ paye: 0, reste: 10000, statut: 'en_attente' });
    });

    it('signale sans y toucher un acompte d’avant 2026-07-18 compté sur une facture sans ligne de paiement', async () => {
      const tiersId = await newClient('acompte-hérité');
      const f = await newFacture(tiersId, 10000, 2);
      const { rows: [ac] } = await pool.query(
        `INSERT INTO acomptes_clients (tiers_id, montant, montant_restant, methode_paiement)
         VALUES ($1, 4000, 4000, 'virement') RETURNING id`,
        [tiersId]
      );
      // The pre-fix recompute counted the deposit on the invoice and left the acompte untouched.
      await pool.query(`UPDATE factures SET montant_paye = 4000, remaining_due = 6000, statut = 'partielle' WHERE id = $1`, [f]);

      const run = await ClientAllocationService.reallocateAllClients({ tiersId, apply: true });
      expect(run.details[0]).toMatchObject({
        statut: 'ecart', applique: false,
        total_paye_avant: 4000, total_paye_apres: 4000,
        acomptes_disponibles_avant: 4000, acomptes_disponibles_apres: 0,
      });
      const { rows: [still] } = await pool.query('SELECT montant_restant FROM acomptes_clients WHERE id = $1', [ac.id]);
      expect(Number(still.montant_restant)).toBe(4000);
      expect(await facture(f)).toEqual({ paye: 4000, reste: 6000, statut: 'partielle' });
    });

    it('POST /api/tiers/recompute-allocations : simulation par défaut, réservé à l’administrateur', async () => {
      const fixtures: RoleFixture[] = await createRoleFixtures();
      try {
        const token = async (role: string) => {
          const f = fixtures.find((x) => x.role === role)!;
          const login = await request(app).post('/api/auth/login').send({ username: f.username, password: f.password });
          return login.body.data.token as string;
        };
        const { tiersId, a } = await etatFifoHerite();
        const admin = await token('admin');

        const sim = await request(app)
          .post('/api/tiers/recompute-allocations')
          .set('Authorization', `Bearer ${admin}`)
          .send({ tiers_id: tiersId });
        expect(sim.status).toBe(200);
        expect(sim.body.data.mode).toBe('simulation');
        expect(sim.body.message).toBe('Simulation : 1 client(s) et 2 facture(s) changeraient. Rien n’a été modifié.');
        expect(await facture(a)).toEqual({ paye: 32000, reste: 8000, statut: 'partielle' });

        const app1 = await request(app)
          .post('/api/tiers/recompute-allocations')
          .set('Authorization', `Bearer ${admin}`)
          .send({ tiers_id: tiersId, appliquer: true });
        expect(app1.status).toBe(200);
        expect(app1.body.data.mode).toBe('application');
        expect(await facture(a)).toEqual({ paye: 0, reste: 40000, statut: 'en_attente' });

        const invalide = await request(app)
          .post('/api/tiers/recompute-allocations')
          .set('Authorization', `Bearer ${admin}`)
          .send({ appliquer: 'oui' });
        expect(invalide.status).toBe(400);

        const manager = await token('manager');
        const refus = await request(app)
          .post('/api/tiers/recompute-allocations')
          .set('Authorization', `Bearer ${manager}`)
          .send({});
        expect(refus.status).toBe(403);
      } finally {
        await removeRoleFixtures(fixtures);
      }
    });
  });
});
