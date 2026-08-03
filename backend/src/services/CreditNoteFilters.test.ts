import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import creditNoteService from './CreditNoteService';

/**
 * Deux défauts vivaient dans `CreditNoteService.getAll`, masqués parce que la
 * page Avoirs ne se servait d'aucun des deux : elle rapatriait toutes les pages
 * et filtrait/triait côté client.
 *
 *  1. La requête de comptage filtrait sur `t.raison_sociale` alors que son FROM
 *     ne contenait que `factures_avoir` — toute recherche partait en 42P01.
 *  2. `ORDER BY fa.${sortColumn}` avec `client_nom` dans l'allow-list, alors que
 *     `client_nom` est un alias de projection sur `t.raison_sociale` : trier par
 *     client échouait aussi (42703).
 *
 * Les deux chemins sont maintenant exercés, plus le filtre `avoir_type` et la
 * cohérence données/total ajoutés pour la pagination serveur.
 */
describe('CreditNoteService.getAll — filtres, tri et cohérence du total', () => {
  let tiersAlpha: number;
  let tiersBeta: number;
  const createdAvoirIds: number[] = [];
  const suffix = `${Date.now() % 1000000}`;

  async function seed(opts: {
    tiersId: number;
    statut: string;
    total: number;
    avoirType: string;
    daysAgo: number;
  }): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO factures_avoir
         (numero_avoir, tiers_id, date_avoir, statut, sous_total, tva, total, avoir_type)
       VALUES ($1, $2, (CURRENT_DATE - ($3 || ' days')::interval)::date, $4, $5, 0, $5, $6)
       RETURNING id`,
      [
        `AVT-${suffix}-${createdAvoirIds.length}`.slice(0, 50),
        opts.tiersId,
        String(opts.daysAgo),
        opts.statut,
        opts.total,
        opts.avoirType,
      ]

    );
    createdAvoirIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    const { rows: tiers } = await pool.query(
      `INSERT INTO tiers (code, raison_sociale, est_client)
       VALUES ($1, $2, true), ($3, $4, true)
       RETURNING id`,
      [
        `TAV-A-${suffix}`.slice(0, 20), `Alpha Avoir ${suffix}`,
        `TAV-B-${suffix}`.slice(0, 20), `Beta Avoir ${suffix}`,
      ]
    );
    tiersAlpha = tiers[0].id;
    tiersBeta = tiers[1].id;

    await seed({ tiersId: tiersAlpha, statut: 'valide', total: 30000, avoirType: 'retour', daysAgo: 1 });
    await seed({ tiersId: tiersAlpha, statut: 'brouillon', total: 10000, avoirType: 'erreur', daysAgo: 2 });
    await seed({ tiersId: tiersAlpha, statut: 'valide', total: 20000, avoirType: 'retour', daysAgo: 3 });
    await seed({ tiersId: tiersBeta, statut: 'utilise', total: 50000, avoirType: 'remise_commerciale', daysAgo: 1 });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM factures_avoir WHERE id = ANY($1::int[])', [createdAvoirIds]);
    await pool.query('DELETE FROM tiers WHERE id = ANY($1::int[])', [[tiersAlpha, tiersBeta]]);
    await pool.end();
  });

  it('recherche par raison sociale sans casser la requête de comptage', async () => {
    // Avant le correctif : « missing FROM-clause entry for table "t" ».
    const res = await creditNoteService.getAll(`Alpha Avoir ${suffix}`);
    expect(res.data).toHaveLength(3);
    expect(res.pagination.total).toBe(3);
  });

  it('recherche par numéro d’avoir', async () => {
    const res = await creditNoteService.getAll(`AVT-${suffix}-0`);
    expect(res.data).toHaveLength(1);
    expect(res.pagination.total).toBe(1);
  });

  it('trie par client sans erreur de colonne', async () => {
    // Avant le correctif : « column fa.client_nom does not exist ».
    const res = await creditNoteService.getAll(
      `Avoir ${suffix}`, undefined, undefined, 1, 20, 'client_nom', 'ASC'
    );
    expect(res.data).toHaveLength(4);
    const noms = res.data.map((a: any) => a.client_nom);
    expect(noms[0]).toBe(`Alpha Avoir ${suffix}`);
    expect(noms[noms.length - 1]).toBe(`Beta Avoir ${suffix}`);
  });

  it('trie par montant dans les deux sens', async () => {
    const asc = await creditNoteService.getAll(
      `Avoir ${suffix}`, undefined, undefined, 1, 20, 'total', 'ASC'
    );
    expect(asc.data.map((a: any) => Number(a.total))).toEqual([10000, 20000, 30000, 50000]);

    const desc = await creditNoteService.getAll(
      `Avoir ${suffix}`, undefined, undefined, 1, 20, 'total', 'DESC'
    );
    expect(desc.data.map((a: any) => Number(a.total))).toEqual([50000, 30000, 20000, 10000]);
  });

  it('retombe sur le tri par défaut pour une clé hors allow-list', async () => {
    const res = await creditNoteService.getAll(
      `Avoir ${suffix}`, undefined, undefined, 1, 20, 'total; DROP TABLE factures_avoir', 'ASC'
    );
    expect(res.data).toHaveLength(4);
  });

  it('filtre par statut, données et total accordés', async () => {
    const res = await creditNoteService.getAll(`Avoir ${suffix}`, 'valide');
    expect(res.data).toHaveLength(2);
    expect(res.pagination.total).toBe(2);
    expect(res.data.every((a: any) => a.statut === 'valide')).toBe(true);
  });

  it('filtre par type d’avoir', async () => {
    const res = await creditNoteService.getAll(
      `Avoir ${suffix}`, undefined, undefined, 1, 20, 'date_avoir', 'DESC', 'retour'
    );
    expect(res.data).toHaveLength(2);
    expect(res.pagination.total).toBe(2);
    expect(res.data.every((a: any) => a.avoir_type === 'retour')).toBe(true);
  });

  it('combine recherche, statut et type', async () => {
    const res = await creditNoteService.getAll(
      `Alpha Avoir ${suffix}`, 'valide', undefined, 1, 20, 'date_avoir', 'DESC', 'retour'
    );
    expect(res.data).toHaveLength(2);
    expect(res.pagination.total).toBe(2);
  });

  it('garde le total complet quand la page est tronquée', async () => {
    const res = await creditNoteService.getAll(
      `Avoir ${suffix}`, undefined, undefined, 1, 2
    );
    expect(res.data).toHaveLength(2);
    expect(res.pagination.total).toBe(4);
    expect(res.pagination.totalPages).toBe(2);
  });

  it('agrège les totaux par statut pour un tiers donné', async () => {
    const stats = await creditNoteService.getStats(tiersAlpha);
    expect(stats.valideCount).toBe(2);
    expect(stats.valideTotal).toBe(50000);
    expect(stats.brouillonCount).toBe(1);
    expect(stats.brouillonTotal).toBe(10000);
    expect(stats.moisCount).toBeGreaterThanOrEqual(0);
  });
});
