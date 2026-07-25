import { afterAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import { ClientAllocationService } from './ClientAllocationService';

/**
 * Régression : recomputeClientAllocations dépensait le solde des acomptes
 * directement dans factures.montant_paye, sans ligne de paiement, sans ligne
 * d'application et sans décrémenter montant_restant. Conséquences :
 *   - la facture ne correspondait plus à SUM(paiements), donc le trigger 043
 *     (trg_after_payment_insert) annulait silencieusement la part financée par
 *     l'acompte au prochain événement de paiement ;
 *   - l'acompte continuait d'afficher la somme déjà consommée comme disponible ;
 *   - une consommation partielle était étiquetée 'utilise'.
 *
 * Chaque test s'exécute dans une transaction intégralement annulée (ROLLBACK).
 */
describe('ClientAllocationService — affectation FIFO des acomptes', () => {
  afterAll(async () => {
    await pool.end();
  });

  /** Client + un acompte disponible + une facture, dans la transaction fournie. */
  async function fixture(
    client: any,
    opts: { acompte: number; facture: number }
  ): Promise<{ tiersId: number; acompteId: number; factureId: number }> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const { rows: [tiers] } = await client.query(
      `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`TA-${suffix}`.slice(0, 20), `TEST ALLOC ${suffix}`]
    );

    const { rows: [acompte] } = await client.query(
      `INSERT INTO acomptes_clients (tiers_id, montant, montant_restant, methode_paiement)
       VALUES ($1, $2, $2, 'virement') RETURNING id`,
      [tiers.id, opts.acompte]
    );

    const { rows: [facture] } = await client.query(
      `INSERT INTO factures (numero_facture, tiers_id, sous_total, total, remaining_due)
       VALUES ($1, $2, $3, $3, $3) RETURNING id`,
      [`FA-${suffix}`, tiers.id, opts.facture]
    );

    return { tiersId: tiers.id, acompteId: acompte.id, factureId: facture.id };
  }

  async function readState(client: any, ids: { acompteId: number; factureId: number }) {
    const { rows: [acompte] } = await client.query(
      'SELECT montant_restant, statut FROM acomptes_clients WHERE id = $1',
      [ids.acompteId]
    );
    const { rows: [facture] } = await client.query(
      'SELECT montant_paye, remaining_due, statut FROM factures WHERE id = $1',
      [ids.factureId]
    );
    const { rows: [apps] } = await client.query(
      'SELECT COUNT(*)::int AS n, COALESCE(SUM(montant), 0) AS total FROM acompte_applications WHERE acompte_id = $1',
      [ids.acompteId]
    );
    const { rows: [pays] } = await client.query(
      'SELECT COUNT(*)::int AS n, COALESCE(SUM(montant), 0) AS total FROM paiements WHERE facture_id = $1',
      [ids.factureId]
    );
    return {
      acompteRestant: Number(acompte.montant_restant),
      acompteStatut: acompte.statut,
      facturePaye: Number(facture.montant_paye),
      factureStatut: facture.statut,
      applications: apps.n,
      applicationsTotal: Number(apps.total),
      paiements: pays.n,
      paiementsTotal: Number(pays.total),
    };
  }

  it('matérialise la part consommée en paiement + application et laisse le trigger étiqueter le solde', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ids = await fixture(client, { acompte: 100000, facture: 60000 });

      await ClientAllocationService.recomputeClientAllocations(ids.tiersId, { transaction: client });

      const state = await readState(client, ids);

      // La facture est soldée par l'acompte...
      expect(state.facturePaye).toBe(60000);
      expect(state.factureStatut).toBe('payee');

      // ...via de vraies écritures, pas un montant_paye orphelin.
      expect(state.applications).toBe(1);
      expect(state.applicationsTotal).toBe(60000);
      expect(state.paiements).toBe(1);

      // L'invariant que le bug cassait : montant_paye == SUM(paiements).
      expect(state.facturePaye).toBe(state.paiementsTotal);

      // Le solde restant est décrémenté et l'étiquette reflète une consommation
      // partielle (l'ancien code écrivait 'utilise' en laissant restant à 100000).
      expect(state.acompteRestant).toBe(40000);
      expect(state.acompteStatut).toBe('partiellement_utilise');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('marque utilise et restant 0 quand la facture absorbe tout l\'acompte', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ids = await fixture(client, { acompte: 50000, facture: 80000 });

      await ClientAllocationService.recomputeClientAllocations(ids.tiersId, { transaction: client });

      const state = await readState(client, ids);
      expect(state.facturePaye).toBe(50000);
      expect(state.factureStatut).toBe('partielle');
      expect(state.facturePaye).toBe(state.paiementsTotal);
      expect(state.acompteRestant).toBe(0);
      expect(state.acompteStatut).toBe('utilise');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('est idempotent : un second passage ne recrée pas d\'application', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ids = await fixture(client, { acompte: 100000, facture: 60000 });

      await ClientAllocationService.recomputeClientAllocations(ids.tiersId, { transaction: client });
      const first = await readState(client, ids);

      await ClientAllocationService.recomputeClientAllocations(ids.tiersId, { transaction: client });
      const second = await readState(client, ids);

      expect(second).toEqual(first);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('survit à un événement de paiement ultérieur (trigger 043)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ids = await fixture(client, { acompte: 100000, facture: 60000 });

      await ClientAllocationService.recomputeClientAllocations(ids.tiersId, { transaction: client });

      // Le trigger 043 réécrit montant_paye = SUM(paiements) pour cette facture.
      // Avant le correctif la part financée par l'acompte n'existait pas comme
      // paiement : la facture repassait de 'payee' à 'en_attente'.
      await client.query(
        `INSERT INTO paiements (facture_id, montant, methode_paiement, source)
         VALUES ($1, 1, 'virement', 'direct')`,
        [ids.factureId]
      );

      const { rows: [facture] } = await client.query(
        'SELECT montant_paye FROM factures WHERE id = $1',
        [ids.factureId]
      );
      expect(Number(facture.montant_paye)).toBe(60001);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('laisse le surplus disponible quand aucune facture ne l\'absorbe', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ids = await fixture(client, { acompte: 100000, facture: 60000 });

      const result = await ClientAllocationService.recomputeClientAllocations(
        ids.tiersId,
        { transaction: client }
      );

      expect(result.totalPool).toBe(100000);
      expect(result.totalAllocated).toBe(60000);
      expect(result.surplus).toBe(40000);

      // Le surplus reste réellement dépensable côté acompte.
      const state = await readState(client, ids);
      expect(state.acompteRestant).toBe(40000);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
