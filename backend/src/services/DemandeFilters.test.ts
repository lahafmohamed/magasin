import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import { demandeService } from './DemandeService';

/**
 * Le filtrage des demandes était écrit trois fois : la requête de données et
 * la requête de comptage du service (qui avaient déjà divergé sur les dates),
 * plus une troisième copie inline dans DemandeController qui ignorait les
 * dates purement et simplement.
 *
 * Conséquences : un filtre par période renvoyait une page correcte avec un
 * total faux (pagination trop longue, pages vides à la fin) côté service, et
 * aucun filtrage du tout via l'API. Un seul constructeur de clause WHERE rend
 * les deux requêtes cohérentes par construction.
 */
describe('DemandeService.getAll — filtres et cohérence du total', () => {
  let magasinA: number;
  let magasinB: number;
  let depotId: number;
  let userId: number;
  const createdDemandeIds: number[] = [];

  /** Insert a request directly, bypassing the workflow, at a chosen date/status. */
  async function seed(opts: {
    magasinId: number;
    statut: string;
    daysAgo: number;
    createdBy?: number | null;
  }): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO demandes_reapprovisionnement
         (numero, magasin_id, depot_id, statut, created_by_user_id, date_creation)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP - ($6 || ' days')::interval)
       RETURNING id`,
      [
        `DEM-TEST-${Date.now()}-${createdDemandeIds.length}`.slice(0, 50),
        opts.magasinId, depotId, opts.statut,
        opts.createdBy === undefined ? userId : opts.createdBy,
        String(opts.daysAgo),
      ]
    );
    createdDemandeIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    const suffix = `${Date.now() % 1000000}`;
    const { rows: locs } = await pool.query(
      `INSERT INTO stock_locations (code, nom, location_type, actif)
       VALUES ($1,$2,'magasin',true), ($3,$4,'magasin',true), ($5,$6,'depot',true)
       RETURNING id`,
      [`TDA-${suffix}`.slice(0, 20), `Test Dem A ${suffix}`,
        `TDB-${suffix}`.slice(0, 20), `Test Dem B ${suffix}`,
        `TDD-${suffix}`.slice(0, 20), `Test Dem D ${suffix}`]
    );
    magasinA = locs[0].id;
    magasinB = locs[1].id;
    depotId = locs[2].id;

    const { rows: [u] } = await pool.query(
      `INSERT INTO utilisateurs (username, password_hash, nom_complet, role_id, actif)
       VALUES ($1, 'x', 'Test Demande User', (SELECT id FROM roles LIMIT 1), true)
       RETURNING id`,
      [`tdem${suffix}`.slice(0, 30)]
    );
    userId = u.id;

    // 3 in store A (2 recent, 1 old), 2 in store B, mixed statuses.
    await seed({ magasinId: magasinA, statut: 'brouillon', daysAgo: 1 });
    await seed({ magasinId: magasinA, statut: 'envoyee', daysAgo: 2 });
    await seed({ magasinId: magasinA, statut: 'envoyee', daysAgo: 90 });
    await seed({ magasinId: magasinB, statut: 'envoyee', daysAgo: 1, createdBy: null });
    await seed({ magasinId: magasinB, statut: 'livree', daysAgo: 1, createdBy: null });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM demandes_reapprovisionnement WHERE id = ANY($1::int[])', [createdDemandeIds]);
    await pool.query('DELETE FROM utilisateurs WHERE id = $1', [userId]);
    await pool.query('DELETE FROM stock_locations WHERE id = ANY($1::int[])', [[magasinA, magasinB, depotId]]);
    await pool.end();
  });

  /** Scope every assertion to this test's own depot so other suites cannot interfere. */
  const scoped = (extra: Record<string, unknown> = {}) => ({ depot_id: depotId, limit: 100, ...extra });

  it('compte exactement les lignes renvoyées, sans filtre', async () => {
    const { data, total } = await demandeService.getAll(scoped());
    expect(data).toHaveLength(5);
    expect(total).toBe(5);
  });

  it('applique le filtre de date au total autant qu\'aux données', async () => {
    const from = new Date();
    from.setDate(from.getDate() - 30);

    const { data, total } = await demandeService.getAll(scoped({ date_from: from }));

    // 4 récentes sur 5 ; l'ancienne (90 jours) est exclue. Avant le correctif
    // le total valait 5 : la requête de comptage ignorait la date.
    expect(data).toHaveLength(4);
    expect(total).toBe(4);
  });

  it('applique date_to', async () => {
    const to = new Date();
    to.setDate(to.getDate() - 30);

    const { data, total } = await demandeService.getAll(scoped({ date_to: to }));
    expect(data).toHaveLength(1);
    expect(total).toBe(1);
  });

  it('filtre par statut unique', async () => {
    const { data, total } = await demandeService.getAll(scoped({ statut: 'envoyee' }));
    expect(data).toHaveLength(3);
    expect(total).toBe(3);
  });

  it('filtre par liste de statuts', async () => {
    const { data, total } = await demandeService.getAll(
      scoped({ statuts: ['envoyee', 'livree'] })
    );
    expect(data).toHaveLength(4);
    expect(total).toBe(4);
    expect(data.every((d: any) => ['envoyee', 'livree'].includes(d.statut))).toBe(true);
  });

  it('filtre par magasin unique et par liste de magasins', async () => {
    const single = await demandeService.getAll(scoped({ magasin_id: magasinA }));
    expect(single.data).toHaveLength(3);
    expect(single.total).toBe(3);

    const multi = await demandeService.getAll(scoped({ magasin_ids: [magasinA, magasinB] }));
    expect(multi.total).toBe(5);
  });

  it('combine « mes demandes OU mes magasins »', async () => {
    // L'utilisateur a créé les 3 du magasin A ; le magasin B lui est assigné.
    const { data, total } = await demandeService.getAll(
      scoped({ created_by_or_magasin_ids: { userId, magasinIds: [magasinB] } })
    );
    expect(data).toHaveLength(5);
    expect(total).toBe(5);

    // Sans le OU, seules ses créations remontent.
    const own = await demandeService.getAll(scoped({ created_by_user_id: userId }));
    expect(own.total).toBe(3);
  });

  it('garde total cohérent quand la page est plus petite que le jeu filtré', async () => {
    const { data, total } = await demandeService.getAll(
      scoped({ statut: 'envoyee', limit: 2, page: 1 })
    );
    expect(data).toHaveLength(2); // page tronquée
    expect(total).toBe(3);        // total complet
  });

  it('combine plusieurs filtres sans désaccorder le total', async () => {
    const from = new Date();
    from.setDate(from.getDate() - 30);

    const { data, total } = await demandeService.getAll(
      scoped({ statut: 'envoyee', magasin_id: magasinA, date_from: from })
    );
    expect(data).toHaveLength(1);
    expect(total).toBe(1);
  });
});
