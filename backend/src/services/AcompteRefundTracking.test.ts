import { afterAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';

/**
 * Régression migration 095 : les triggers de synchronisation des acomptes
 * doivent soustraire montant_rembourse. Avant 095, tout événement
 * d'application recalculait montant_restant = montant - Σ(applications) et
 * « ressuscitait » la part remboursée.
 *
 * Chaque test s'exécute dans une transaction unique intégralement annulée
 * (ROLLBACK) — aucune donnée ne survit dans la base.
 */
describe('095 refund tracking (triggers acomptes)', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('fournisseur : un remboursement partiel survit aux applications ultérieures', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

      const { rows: [tiers] } = await client.query(
        `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
         VALUES ($1, $2, false, true) RETURNING id`,
        [`TF-${suffix}`.slice(0, 20), `TEST REMB F ${suffix}`]
      );

      const { rows: [acompte] } = await client.query(
        `INSERT INTO acomptes_fournisseur (tiers_id, montant, montant_restant, methode_paiement)
         VALUES ($1, 1000, 1000, 'virement') RETURNING id`,
        [tiers.id]
      );

      // Remboursement partiel de 400 (même écriture que AcompteService.refundFournisseur)
      await client.query(
        `UPDATE acomptes_fournisseur
         SET montant_restant = 600, montant_rembourse = 400 WHERE id = $1`,
        [acompte.id]
      );

      const { rows: [facture] } = await client.query(
        `INSERT INTO factures_fournisseur
           (tiers_id, numero_facture_fournisseur, numero_facture_interne, date_facture, sous_total, total)
         VALUES ($1, $2, $3, CURRENT_DATE, 300, 300) RETURNING id`,
        [tiers.id, `FF-${suffix}`, `FFI-${suffix}`]
      );

      // L'application déclenche sync_acompte_fournisseur_state
      await client.query(
        `INSERT INTO acompte_applications_fournisseur (acompte_id, facture_id, montant)
         VALUES ($1, $2, 300)`,
        [acompte.id, facture.id]
      );

      const { rows: [after] } = await client.query(
        `SELECT montant_restant, statut FROM acomptes_fournisseur WHERE id = $1`,
        [acompte.id]
      );
      // 1000 - 300 appliqué - 400 remboursé = 300 (le bug pré-095 donnait 700)
      expect(Number(after.montant_restant)).toBe(300);
      expect(after.statut).toBe('partiellement_utilise');

      // Plafond : le disponible est montant - remboursé = 600 ; 300 + 301 doit être rejeté
      await client.query('SAVEPOINT sp');
      await expect(
        client.query(
          `INSERT INTO acompte_applications_fournisseur (acompte_id, facture_id, montant)
           VALUES ($1, $2, 301)`,
          [acompte.id, facture.id]
        )
      ).rejects.toThrow();
      await client.query('ROLLBACK TO SAVEPOINT sp');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('client : même garantie sur acomptes_clients', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

      const { rows: [tiers] } = await client.query(
        `INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur)
         VALUES ($1, $2, true, false) RETURNING id`,
        [`TC-${suffix}`.slice(0, 20), `TEST REMB C ${suffix}`]
      );

      const { rows: [acompte] } = await client.query(
        `INSERT INTO acomptes_clients (tiers_id, montant, montant_restant, methode_paiement)
         VALUES ($1, 1000, 1000, 'virement') RETURNING id`,
        [tiers.id]
      );

      await client.query(
        `UPDATE acomptes_clients
         SET montant_restant = 600, montant_rembourse = 400 WHERE id = $1`,
        [acompte.id]
      );

      const { rows: [facture] } = await client.query(
        `INSERT INTO factures (numero_facture, tiers_id, sous_total, total, remaining_due)
         VALUES ($1, $2, 300, 300, 300) RETURNING id`,
        [`FC-${suffix}`, tiers.id]
      );

      await client.query(
        `INSERT INTO acompte_applications (acompte_id, facture_id, montant)
         VALUES ($1, $2, 300)`,
        [acompte.id, facture.id]
      );

      const { rows: [after] } = await client.query(
        `SELECT montant_restant, statut FROM acomptes_clients WHERE id = $1`,
        [acompte.id]
      );
      expect(Number(after.montant_restant)).toBe(300);
      expect(after.statut).toBe('partiellement_utilise');

      await client.query('SAVEPOINT sp');
      await expect(
        client.query(
          `INSERT INTO acompte_applications (acompte_id, facture_id, montant)
           VALUES ($1, $2, 301)`,
          [acompte.id, facture.id]
        )
      ).rejects.toThrow();
      await client.query('ROLLBACK TO SAVEPOINT sp');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
