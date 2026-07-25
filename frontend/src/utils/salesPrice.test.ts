import { describe, expect, it } from 'vitest';
import { getValidSalePrice } from './salesPrice';

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
