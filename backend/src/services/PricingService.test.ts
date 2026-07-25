import { describe, expect, it } from 'vitest';
import {
  assertPositiveSalePrices,
  calculateTotals,
} from './PricingService';

describe('sales price policy', () => {
  it('calcule normalement des lignes à prix positif', () => {
    expect(
      calculateTotals([
        { quantite: 2, prix_unitaire: 1500 },
        { quantite: 1, prix_unitaire: 2000 },
      ])
    ).toMatchObject({
      sousTotal: 5000,
      total: 5000,
    });
  });

  it.each([0, -1, Number.NaN])(
    'refuse un prix de vente nul ou invalide: %s',
    (prix_unitaire) => {
      expect(() =>
        assertPositiveSalePrices([{ prix_unitaire }])
      ).toThrow(/supérieur à zéro/);
    }
  );

  it('indique la ligne fautive et expose un code métier', () => {
    try {
      assertPositiveSalePrices([
        { prix_unitaire: 1500 },
        { prix_unitaire: '0' },
      ]);
      throw new Error('La règle de prix aurait dû refuser la ligne');
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 422,
        code: 'ZERO_SALE_PRICE',
      });
      expect((error as Error).message).toContain('Ligne 2');
    }
  });
});
