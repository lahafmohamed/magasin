import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pool from '../db/connection';
import { demandeService } from './DemandeService';
import { createRoleFixtures, removeRoleFixtures, RoleFixture, SupportedTestRole } from '../test/roleFixtures';

/** Run one migration file the way migrate.mjs does (one transaction). */
async function runMigration(file: string): Promise<void> {
  const sql = readFileSync(path.resolve(__dirname, '../db', file), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Exécuter une demande de réapprovisionnement :
 *  - K-M2 : écrit l'historique du stock (sortie au dépôt, entrée au magasin)
 *    comme un transfert manuel — il n'en écrivait aucun, « Historique du
 *    stock » sautait le flux dépôt → magasin. La migration 107 rétablit ces
 *    lignes pour les transferts déjà exécutés, sans toucher au stock ;
 *  - G-STOCK-02 : chaque étape de l'historique de la demande est attribuée à
 *    la personne qui l'a faite (migration 108). Le trigger écrivait
 *    COALESCE(decided_by, executed_by, closed_by) : exécution, livraison et
 *    clôture revenaient au décideur, l'envoi n'avait pas d'auteur.
 *
 * La migration 108 (fonction du trigger) est appliquée en début de suite :
 * idempotente, elle garde le test significatif tant que `ci-baseline.sql`
 * n'a pas été régénéré.
 */
describe('Demandes — historique du stock (K-M2) et auteur de chaque étape (G-STOCK-02)', () => {
  const suffix = `${Date.now() % 1000000}-${Math.floor(Math.random() * 1000)}`;
  let fixtures: RoleFixture[] = [];
  const userId = (role: SupportedTestRole) => fixtures.find((f) => f.role === role)!.id;
  let magasinId: number;
  let depotId: number;
  let produitId: number;
  let demandeId: number;
  let demandeNumero: string;
  let transfertId: number;
  let numeroTransfer: string;

  beforeAll(async () => {
    await runMigration('108_historique_demandes_acteur.sql');
    fixtures = await createRoleFixtures();

    const { rows: locs } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1, $2, 'magasin', true), ($3, $4, 'depot', true)
       RETURNING id, location_type`,
      [`TKM-${suffix}`.slice(0, 20), `Magasin K-M2 ${suffix}`, `TKD-${suffix}`.slice(0, 20), `Dépôt K-M2 ${suffix}`]
    );
    magasinId = locs.find((l: any) => l.location_type === 'magasin').id;
    depotId = locs.find((l: any) => l.location_type === 'depot').id;

    const { rows: [p] } = await pool.query(
      `INSERT INTO produits (reference, nom, prix_achat, prix_vente, stock, stock_min)
       VALUES ($1, $2, 500, 1000, 0, 0) RETURNING id`,
      [`TEST-REF-KM2-${suffix}`, `Produit K-M2 ${suffix}`]
    );
    produitId = p.id;
    await pool.query(
      `INSERT INTO stock_par_location (produit_id, location_id, quantite, cmp)
       VALUES ($1, $2, 10, 500), ($1, $3, 1, 500)`,
      [produitId, depotId, magasinId]
    );
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM stock_transfer_lignes WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE demande_id = $1)', [demandeId]);
      await pool.query('UPDATE demandes_reapprovisionnement SET transfert_id = NULL WHERE id = $1', [demandeId]);
      await pool.query('DELETE FROM stock_transfers WHERE demande_id = $1', [demandeId]);
      await pool.query('DELETE FROM demandes_reapprovisionnement WHERE id = $1', [demandeId]);
      await pool.query('DELETE FROM mouvements_stock WHERE produit_id = $1', [produitId]);
      await pool.query('DELETE FROM stock_par_location WHERE produit_id = $1', [produitId]);
      await pool.query('DELETE FROM produits WHERE id = $1', [produitId]);
      await pool.query('DELETE FROM stock_locations WHERE id = ANY($1::int[])', [[magasinId, depotId]]);
      await removeRoleFixtures(fixtures);
    } catch {
      // cleanup must never fail the suite
    } finally {
      await pool.end();
    }
  });

  it('chaque étape revient à son auteur, de la création à la clôture', async () => {
    const created = await demandeService.create({
      magasin_id: magasinId,
      depot_id: depotId,
      lignes: [{ produit_id: produitId, quantite_demandee: 3 }],
      created_by_user_id: userId('admin'),
    });
    demandeId = created.id;
    demandeNumero = created.numero;

    await demandeService.send(demandeId, userId('magasin_staff'));
    await demandeService.decide(demandeId, { decision: 'approuvee', user_id: userId('manager') });
    const exec = await demandeService.execute(demandeId, userId('depot_staff'));
    transfertId = exec.transfert_id;
    numeroTransfer = exec.numero_transfer;
    await demandeService.close(demandeId, userId('caissier'));

    const { rows } = await pool.query(
      `SELECT from_statut, to_statut, user_id FROM demandes_reapprovisionnement_history
       WHERE demande_id = $1 ORDER BY id`,
      [demandeId]
    );
    expect(rows).toEqual([
      { from_statut: null, to_statut: 'brouillon', user_id: userId('admin') },
      { from_statut: 'brouillon', to_statut: 'envoyee', user_id: userId('magasin_staff') },
      { from_statut: 'envoyee', to_statut: 'approuvee', user_id: userId('manager') },
      { from_statut: 'approuvee', to_statut: 'en_cours', user_id: userId('depot_staff') },
      { from_statut: 'en_cours', to_statut: 'livree', user_id: userId('depot_staff') },
      { from_statut: 'livree', to_statut: 'cloturee', user_id: userId('caissier') },
    ]);

    // Same-instant steps (en_cours, livree) come back in a stable order.
    const detail = await demandeService.getById(demandeId);
    expect(detail.historique.map((h: any) => h.to_statut)).toEqual([
      'cloturee', 'livree', 'en_cours', 'approuvee', 'envoyee', 'brouillon',
    ]);
  });

  it('l’exécution écrit la sortie au dépôt et l’entrée au magasin dans l’historique du stock', async () => {
    const { rows } = await pool.query(
      `SELECT location_id, type_mouvement, quantite, stock_avant, stock_apres, raison, reference_liee, transfer_id
       FROM mouvements_stock WHERE produit_id = $1 ORDER BY id`,
      [produitId]
    );
    const raison = `Transfert ${numeroTransfer} — demande ${demandeNumero}`;
    expect(rows).toEqual([
      { location_id: depotId, type_mouvement: 'transfert', quantite: -3, stock_avant: 10, stock_apres: 7, raison, reference_liee: numeroTransfer, transfer_id: transfertId },
      { location_id: magasinId, type_mouvement: 'transfert', quantite: 3, stock_avant: 1, stock_apres: 4, raison, reference_liee: numeroTransfer, transfer_id: transfertId },
    ]);
  });

  it('migration 107 : rétablit l’historique d’un transfert exécuté avant le correctif, une seule fois, sans toucher au stock', async () => {
    // What the old execution left: stock moved, no history line.
    await pool.query('DELETE FROM mouvements_stock WHERE produit_id = $1', [produitId]);

    await runMigration('107_historique_transferts_demandes.sql');
    await runMigration('107_historique_transferts_demandes.sql');

    const { rows } = await pool.query(
      `SELECT location_id, quantite, stock_avant, stock_apres, raison, reference_liee, transfer_id
       FROM mouvements_stock WHERE produit_id = $1 ORDER BY id`,
      [produitId]
    );
    const raison = `Transfert ${numeroTransfer} — demande ${demandeNumero} (historique rétabli)`;
    expect(rows).toEqual([
      { location_id: depotId, quantite: -3, stock_avant: 10, stock_apres: 7, raison, reference_liee: numeroTransfer, transfer_id: transfertId },
      { location_id: magasinId, quantite: 3, stock_avant: 1, stock_apres: 4, raison, reference_liee: numeroTransfer, transfer_id: transfertId },
    ]);

    const { rows: stock } = await pool.query(
      'SELECT location_id, quantite FROM stock_par_location WHERE produit_id = $1 ORDER BY location_id',
      [produitId]
    );
    expect(stock.map((s: any) => [s.location_id, s.quantite])).toEqual(
      [[depotId, 7], [magasinId, 4]].sort((x, y) => x[0] - y[0])
    );
  });
});
