import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import { comptabiliteService } from './ComptabiliteService';
import { TestDB } from '../test/helpers';

/**
 * Trésorerie prévisionnelle — échéancier hebdomadaire (VB-TRE-00).
 *
 * Les échéances arrivent de PostgreSQL en `Date` JS (colonnes DATE), et la
 * ventilation les comparait à des chaînes 'YYYY-MM-DD' : `Date >= string`
 * vaut toujours false, chaque semaine sommait 0 — graphique vide alors que les
 * totaux affichaient des millions. Les semaines doivent maintenant sommer
 * exactement aux totaux.
 */
describe('ComptabiliteService.getTresoreriePrevisionnelle — échéancier', () => {
  const suffix = `${Date.now() % 1000000}`;
  let clientId: number;
  let fournisseurId: number;
  let factureId: number;
  let commandeId: number;

  beforeAll(async () => {
    clientId = await TestDB.createTestClient({ nom: `Client trésorerie ${suffix}` });
    const { rows: [f] } = await pool.query(
      `INSERT INTO tiers (raison_sociale, est_client, est_fournisseur) VALUES ($1, false, true) RETURNING id`,
      [`Fournisseur trésorerie ${suffix}`]
    );
    fournisseurId = f.id;

    const { rows: [fac] } = await pool.query(
      `INSERT INTO factures (numero_facture, tiers_id, sous_total, total, remaining_due, montant_paye, statut, date_echeance)
       VALUES ($1, $2, 12345, 12345, 12345, 0, 'en_attente', CURRENT_DATE + 3) RETURNING id`,
      [`TRESO-${suffix}`, clientId]
    );
    factureId = fac.id;

    const { rows: [cmd] } = await pool.query(
      `INSERT INTO commandes_fournisseur (numero_commande, tiers_id, sous_total, statut, date_livraison_prevue)
       VALUES ($1, $2, 7000, 'validee', CURRENT_DATE + 10) RETURNING id`,
      [`CMD-TRESO-${suffix}`, fournisseurId]
    );
    commandeId = cmd.id;
  });

  afterAll(async () => {
    await TestDB.deleteInvoicesByIds([factureId]);
    await pool.query('DELETE FROM commandes_fournisseur WHERE id = $1', [commandeId]);
    await pool.query('DELETE FROM compte_client_lignes WHERE tiers_id = $1', [clientId]);
    await pool.query('DELETE FROM tiers WHERE id = ANY($1::int[])', [[clientId, fournisseurId]]);
    await pool.end();
  });

  const sum = (rows: Record<string, unknown>[], key: string) => rows.reduce((s, r) => s + Number(r[key]), 0);

  it('ventile chaque échéance dans sa semaine : les semaines somment aux totaux', async () => {
    const data = await comptabiliteService.getTresoreriePrevisionnelle(90);

    expect(data.echeancier).toHaveLength(13);
    expect(data.total_encaissements).toBeGreaterThanOrEqual(12345);
    expect(data.total_decaissements).toBeGreaterThanOrEqual(7000);
    expect(sum(data.echeancier, 'encaissements')).toBeCloseTo(data.total_encaissements, 2);
    expect(sum(data.echeancier, 'decaissements')).toBeCloseTo(data.total_decaissements, 2);

    // J+3 tombe dans la 1re semaine, J+10 dans la 2e.
    expect(data.echeancier[0].encaissements).toBeGreaterThanOrEqual(12345);
    expect(data.echeancier[1].decaissements).toBeGreaterThanOrEqual(7000);
  });

  it('expose les bornes de chaque semaine en dates ISO', async () => {
    const data = await comptabiliteService.getTresoreriePrevisionnelle(14);
    const { rows: [{ today }] } = await pool.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today`);

    expect(data.echeancier).toHaveLength(2);
    expect(data.echeancier[0].date_debut).toBe(today);
    expect(data.echeancier[0].date_fin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.echeancier[1].date_fin).toBe(
      (await pool.query(`SELECT to_char(CURRENT_DATE + 13, 'YYYY-MM-DD') AS d`)).rows[0].d
    );
  });
});
