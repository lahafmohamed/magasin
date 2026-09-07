import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/connection';
import { TestDB } from '../test/helpers';

/**
 * Commissions de vente — trigger `trg_commission_vente` (migration 100).
 *
 * Avant cette migration la table `commissions_ventes` était lue par la paie et
 * par la fiche employé mais jamais écrite : tous les bulletins portaient 0. Le
 * trigger est le seul chemin d'écriture, et il doit couvrir les cinq façons de
 * créer une facture — d'où le repli sur le créateur du BL puis du devis quand
 * `factures.cree_par` est absent (les fonctions PL/pgSQL de conversion et
 * BonLivraisonService ne le renseignent pas).
 */
let tiersId: number;
let userId: number;
let employeId: number;
const factureIds: number[] = [];
const suffix = Date.now().toString().slice(-8);

async function createFacture(cols: Record<string, unknown>): Promise<number> {
  const base: Record<string, unknown> = {
    numero_facture: `CMS-${suffix}-${factureIds.length}`,
    tiers_id: tiersId,
    sous_total: 100000,
    total: 100000,
    remaining_due: 100000,
    ...cols,
  };
  const names = Object.keys(base);
  const placeholders = names.map((_, i) => `$${i + 1}`);
  const { rows } = await pool.query(
    `INSERT INTO factures (${names.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(base)
  );
  factureIds.push(rows[0].id);
  return rows[0].id;
}

async function commissionFor(factureId: number) {
  const { rows } = await pool.query(
    'SELECT employe_id, montant_vente, taux_commission, montant_commission FROM commissions_ventes WHERE facture_id = $1',
    [factureId]
  );
  return rows;
}

describe('trg_commission_vente — enregistrement automatique des commissions', () => {
  beforeAll(async () => {
    tiersId = await TestDB.createTestClient({ nom: `Client commission ${suffix}` });

    const { rows: roleRows } = await pool.query('SELECT id FROM roles ORDER BY id LIMIT 1');
    const { rows: userRows } = await pool.query(
      `INSERT INTO utilisateurs (username, password_hash, role_id, actif)
       VALUES ($1, 'x', $2, true) RETURNING id`,
      [`vendeur-${suffix}`, roleRows[0].id]
    );
    userId = userRows[0].id;

    const { rows: empRows } = await pool.query(
      `INSERT INTO employes (utilisateur_id, matricule, nom_complet, date_embauche, commission_taux, actif)
       VALUES ($1, $2, 'Vendeur Test', CURRENT_DATE, 5, true) RETURNING id`,
      [userId, `EMP-${suffix}`]
    );
    employeId = empRows[0].id;
  });

  afterAll(async () => {
    if (factureIds.length > 0) {
      await pool.query('DELETE FROM commissions_ventes WHERE facture_id = ANY($1::int[])', [factureIds]);
      await pool.query('DELETE FROM ecritures_comptables WHERE reference_type = $1 AND reference_id = ANY($2::int[])', ['facture', factureIds]);
      await pool.query('DELETE FROM compte_client_lignes WHERE document_id = ANY($1::int[])', [factureIds]);
      await pool.query('DELETE FROM factures WHERE id = ANY($1::int[])', [factureIds]);
    }
    if (employeId) await pool.query('DELETE FROM employes WHERE id = $1', [employeId]);
    if (userId) await pool.query('DELETE FROM utilisateurs WHERE id = $1', [userId]);
    if (tiersId) await pool.query('DELETE FROM tiers WHERE id = $1', [tiersId]);
  });

  it('enregistre la commission au taux de l’employé quand la facture porte cree_par', async () => {
    const factureId = await createFacture({ cree_par: userId });

    const rows = await commissionFor(factureId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].employe_id)).toBe(employeId);
    expect(Number(rows[0].taux_commission)).toBe(5);
    // 5 % de 100 000 — le calcul qui alimentera le brut du bulletin.
    expect(Number(rows[0].montant_commission)).toBe(5000);
  });

  it('retombe sur le créateur du bon de livraison quand la facture n’a pas de cree_par', async () => {
    const { rows: blRows } = await pool.query(
      `INSERT INTO bons_livraison (numero_bl, tiers_id, sous_total, total, cree_par)
       VALUES ($1, $2, 100000, 100000, $3) RETURNING id`,
      [`BL-CMS-${suffix}`, tiersId, userId]
    );
    const blId = blRows[0].id;

    try {
      const factureId = await createFacture({ bl_id: blId });
      const rows = await commissionFor(factureId);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].montant_commission)).toBe(5000);
    } finally {
      await pool.query('UPDATE factures SET bl_id = NULL WHERE bl_id = $1', [blId]);
      await pool.query('DELETE FROM bons_livraison WHERE id = $1', [blId]);
    }
  });

  it('n’enregistre rien quand le vendeur n’a pas de taux de commission', async () => {
    await pool.query('UPDATE employes SET commission_taux = 0 WHERE id = $1', [employeId]);
    try {
      const factureId = await createFacture({ cree_par: userId });
      expect(await commissionFor(factureId)).toHaveLength(0);
    } finally {
      await pool.query('UPDATE employes SET commission_taux = 5 WHERE id = $1', [employeId]);
    }
  });

  it('n’enregistre rien quand aucun employé ne correspond à l’utilisateur', async () => {
    const factureId = await createFacture({ cree_par: null });
    expect(await commissionFor(factureId)).toHaveLength(0);
  });
});
