import { afterAll, describe, expect, it } from 'vitest';
import pool from '../db/connection';
import { PAYMENT_METHODS, PAYMENT_METHODS_WITH_COMPENSATION, toPaiementMethod } from '../utils/paymentMethods';
import { createDepenseSchema, createPaiementSchema } from './schemas';

/**
 * Le mode de règlement était redéclaré dans huit schémas Zod, deux unions TS,
 * un tableau inline de contrôleur et quatre copies côté frontend — avec des
 * membres différents. Conséquence concrète : le formulaire de dépense
 * proposait « Mobile Money », Zod l'acceptait, et la contrainte
 * depenses_methode_paiement_check (4 membres) le refusait — erreur 500.
 *
 * Ces tests verrouillent l'alignement entre la liste canonique, les schémas et
 * les contraintes réelles de la base.
 */
describe('modes de règlement — liste canonique vs contraintes SQL', () => {
  afterAll(async () => {
    await pool.end();
  });

  /** Membres acceptés par un CHECK ... IN (...) tel que stocké par Postgres. */
  async function constraintMembers(constraintName: string): Promise<string[]> {
    const { rows } = await pool.query(
      'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1',
      [constraintName]
    );
    expect(rows.length, `contrainte ${constraintName} introuvable`).toBe(1);
    return [...rows[0].def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  }

  it.each([
    'paiements_methode_paiement_check',
    'mouvements_caisse_methode_paiement_check',
    'depenses_methode_paiement_check',
  ])('%s accepte exactement les 8 modes canoniques', async (constraint) => {
    expect(await constraintMembers(constraint)).toEqual([...PAYMENT_METHODS].sort());
  });

  it.each([
    'acomptes_clients_methode_paiement_check',
    'acomptes_fournisseur_methode_paiement_check',
    'paiements_fournisseur_methode_paiement_check',
  ])('%s accepte les 8 modes plus compensation', async (constraint) => {
    expect(await constraintMembers(constraint)).toEqual([...PAYMENT_METHODS_WITH_COMPENSATION].sort());
  });

  it('le schéma de dépense accepte tout mode accepté par la base', () => {
    for (const methode of PAYMENT_METHODS) {
      const parsed = createDepenseSchema.safeParse({
        magasin_id: 1,
        categorie_id: 1,
        montant: 1000,
        methode_paiement: methode,
        description: 'Test',
      });
      expect(parsed.success, `méthode refusée par Zod: ${methode}`).toBe(true);
    }
  });

  it('le schéma de paiement refuse un mode hors liste', () => {
    const parsed = createPaiementSchema.safeParse({
      facture_id: 1,
      montant: 1000,
      methode_paiement: 'bitcoin',
    });
    expect(parsed.success).toBe(false);
  });

  it('compensation n\'est pas un mode de paiement direct', () => {
    // acomptes_clients l'accepte (CompensationService), paiements non — d'où la
    // coercition appliquée quand un acompte issu d'une compensation est appliqué.
    expect(PAYMENT_METHODS).not.toContain('compensation');
    expect(toPaiementMethod('compensation')).toBe('virement');
  });

  it('toPaiementMethod laisse passer un mode valide', () => {
    for (const methode of PAYMENT_METHODS) {
      expect(toPaiementMethod(methode)).toBe(methode);
    }
    expect(toPaiementMethod(undefined)).toBe('virement');
  });
});
