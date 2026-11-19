import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import creditNoteService from './CreditNoteService';
import { TestDB } from '../test/helpers';

/**
 * Imputer un avoir sur une facture (bouton de AvoirDetail) échouait toujours :
 * l'acompte intermédiaire était inséré sans `montant_restant`, colonne NOT NULL
 * sans défaut depuis la migration 048 — la requête partait en 500 avant que le
 * moteur FIFO ne puisse répartir le crédit.
 */
describe('CreditNoteService.applyToFacture', () => {
  let tiersId: number;
  let factureId: number;
  let avoirId: number;
  const suffix = `${Date.now() % 1000000}`;

  beforeAll(async () => {
    tiersId = await TestDB.createTestClient({ nom: `Avoir Imputation ${suffix}` });
    const { rows: [facture] } = await pool.query(
      `INSERT INTO factures (numero_facture, tiers_id, sous_total, total, remaining_due, statut)
       VALUES ($1, $2, 50000, 50000, 50000, 'en_attente') RETURNING id`,
      [`TEST-FAC-AV-${suffix}`, tiersId]
    );
    factureId = facture.id;
    const { rows: [avoir] } = await pool.query(
      `INSERT INTO factures_avoir (numero_avoir, tiers_id, date_avoir, statut, sous_total, tva, total, avoir_type)
       VALUES ($1, $2, CURRENT_DATE, 'valide', 20000, 0, 20000, 'remise_commerciale') RETURNING id`,
      [`AVT-IMP-${suffix}`, tiersId]
    );
    avoirId = avoir.id;
  });

  afterAll(async () => {
    await pool.query('UPDATE factures_avoir SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [avoirId]);
    await pool.query('UPDATE factures SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [factureId]);
    await pool.query('UPDATE tiers SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [tiersId]);
  });

  it('marks the credit note used and lowers the invoice balance by its amount', async () => {
    await creditNoteService.applyToFacture(avoirId, factureId);

    const { rows: [avoir] } = await pool.query(
      'SELECT statut, facture_appliquee_id FROM factures_avoir WHERE id = $1',
      [avoirId]
    );
    expect(avoir.statut).toBe('utilise');
    expect(avoir.facture_appliquee_id).toBe(factureId);

    const { rows: [facture] } = await pool.query(
      'SELECT remaining_due, statut FROM factures WHERE id = $1',
      [factureId]
    );
    expect(Number(facture.remaining_due)).toBe(30000);
    expect(facture.statut).toBe('partielle');
  });
});
