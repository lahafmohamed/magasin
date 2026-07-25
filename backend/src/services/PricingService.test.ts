import { describe, expect, it } from 'vitest';
import {
  assertPositiveSalePrices,
  calculateTotals,
  computeLineTotals,
  roundMoney,
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

describe('computeLineTotals — cohérence en-tête / lignes', () => {
  it('arrondit chaque ligne avant de sommer', () => {
    // 0.005 par ligne : sommer d'abord donne 0.015 → 0.02 à l'insertion, alors
    // que chaque ligne stockée vaut 0.01, soit 0.03. C'est l'écart que
    // l'ancienne accumulation en flottant brut laissait passer.
    const { totalLignes, sousTotal } = computeLineTotals([
      { quantite: 1, prix_unitaire: 0.005 },
      { quantite: 1, prix_unitaire: 0.005 },
      { quantite: 1, prix_unitaire: 0.005 },
    ]);

    expect(totalLignes).toEqual([0.01, 0.01, 0.01]);
    expect(sousTotal).toBe(0.03);
    expect(sousTotal).toBe(roundMoney(totalLignes.reduce((a, b) => a + b, 0)));
  });

  it('garantit sousTotal === somme des lignes stockées', () => {
    const lignes = [
      { quantite: 3, prix_unitaire: 33.333 },
      { quantite: 7, prix_unitaire: 1.005 },
      { quantite: 11, prix_unitaire: 0.101 },
    ];
    const { totalLignes, sousTotal } = computeLineTotals(lignes);

    expect(sousTotal).toBe(roundMoney(totalLignes.reduce((a, b) => a + b, 0)));
    for (const total of totalLignes) {
      expect(total).toBe(roundMoney(total));
    }
  });

  it('accepte une ligne à prix nul — légitime côté achat', () => {
    // calculateTotals refuse ce cas (règle de vente) ; une ligne fournisseur
    // gratuite (remplacement sous garantie) doit rester possible.
    expect(computeLineTotals([{ quantite: 2, prix_unitaire: 0 }])).toEqual({
      totalLignes: [0],
      sousTotal: 0,
    });
    expect(() => calculateTotals([{ quantite: 2, prix_unitaire: 0 }])).toThrow(/supérieur à zéro/);
  });

  it('applique les remises de ligne avant arrondi', () => {
    const { totalLignes, sousTotal } = computeLineTotals([
      { quantite: 2, prix_unitaire: 1000, remise_pct: 10 },
      { quantite: 1, prix_unitaire: 500, remise_montant: 750 },
    ]);

    expect(totalLignes).toEqual([1800, 0]); // remise supérieure au total → plancher à 0
    expect(sousTotal).toBe(1800);
  });

  it('calculateTotals expose les mêmes totaux de ligne', () => {
    const lignes = [
      { quantite: 3, prix_unitaire: 33.333 },
      { quantite: 2, prix_unitaire: 12.005 },
    ];
    expect(calculateTotals(lignes).totalLignes).toEqual(computeLineTotals(lignes).totalLignes);
  });
});
