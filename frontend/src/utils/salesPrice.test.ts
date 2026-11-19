import { describe, expect, it } from 'vitest';
import { computeSalesTotals, getValidSalePrice, isBelowCost, netUnitPrice, saleDisabledReason } from './salesPrice';

describe('getValidSalePrice', () => {
  it.each([
    [1500, 1500],
    ['2500.50', 2500.5],
  ])('accepte un prix positif: %s', (input, expected) => {
    expect(getValidSalePrice(input)).toBe(expected);
  });

  it.each([0, '0', -1, '', null, undefined, 'prix inconnu'])(
    'refuse un prix absent, nul ou invalide: %s',
    (input) => {
      expect(getValidSalePrice(input)).toBeNull();
    }
  );
});

describe('saleDisabledReason', () => {
  it('donne la raison quand le prix catalogue manque', () => {
    expect(saleDisabledReason({ prix_vente: '0.00' })).toBe('Prix de vente non renseigné : corrigez la fiche produit.');
    expect(saleDisabledReason({ prix_vente: '595000.00' })).toBeNull();
  });
});

describe('netUnitPrice', () => {
  it('applique la remise et arrondit au centime', () => {
    expect(netUnitPrice(1250, 15)).toBe(1062.5);
    expect(netUnitPrice(1000, 33.33)).toBe(666.7);
    expect(netUnitPrice(1000)).toBe(1000);
  });

  it('borne la remise à 0–100 % et ignore une saisie en cours', () => {
    expect(netUnitPrice(1000, 150)).toBe(0);
    expect(netUnitPrice(1000, -10)).toBe(1000);
    expect(netUnitPrice(Number.NaN, 10)).toBe(0);
    expect(netUnitPrice(1000, Number.NaN)).toBe(1000);
  });
});

describe('computeSalesTotals', () => {
  it('total, remises, coût et marge comme le serveur (sans TVA)', () => {
    const totals = computeSalesTotals([
      { quantite: 2, prix_unitaire: 595000, prix_revient: 450000 },
      { quantite: 1, prix_unitaire: 215000, remise_pct: 10, prix_revient: 165000 },
    ]);
    expect(totals.gross).toBe(1405000);
    expect(totals.total).toBe(1383500);
    expect(totals.discount).toBe(21500);
    expect(totals.cost).toBe(1065000);
    expect(totals.margin).toBe(318500);
    expect(totals.marginPct).toBeCloseTo(23.02, 2);
    expect(totals.units).toBe(3);
    expect(totals.lines).toBe(2);
  });

  it('document vide : marge en pourcentage inconnue, jamais « 0 % »', () => {
    const totals = computeSalesTotals([]);
    expect(totals.total).toBe(0);
    expect(totals.marginPct).toBeNull();
  });

  it('une quantité en cours de saisie (NaN) compte pour 0', () => {
    expect(computeSalesTotals([{ quantite: Number.NaN, prix_unitaire: 1000 }]).total).toBe(0);
  });
});

describe('isBelowCost', () => {
  it('compare le prix net au prix de revient connu', () => {
    expect(isBelowCost({ quantite: 1, prix_unitaire: 400000, prix_revient: 450000 })).toBe(true);
    expect(isBelowCost({ quantite: 1, prix_unitaire: 500000, remise_pct: 20, prix_revient: 450000 })).toBe(true);
    expect(isBelowCost({ quantite: 1, prix_unitaire: 500000, prix_revient: 450000 })).toBe(false);
    expect(isBelowCost({ quantite: 1, prix_unitaire: 100, prix_revient: 0 })).toBe(false);
  });
});
