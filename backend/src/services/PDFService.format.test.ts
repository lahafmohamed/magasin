import { describe, expect, it } from 'vitest';
import { formatNombrePdf } from './PDFService';

/**
 * Régression : `toLocaleString('fr-FR')` sépare les milliers avec une espace
 * fine insécable (U+202F) depuis les ICU récents. Les polices standard de
 * pdfkit sont encodées en WinAnsi, qui n'a pas ce glyphe — chaque séparateur
 * s'imprimait « / » (« 3 650 000 » → « 3 /650 /000 ») sur tous les PDF.
 */
describe('formatNombrePdf', () => {
  it('sépare les milliers avec une espace ordinaire, pas une espace fine', () => {
    expect(formatNombrePdf(3650000)).toBe('3 650 000');
  });

  it("n'émet que des caractères encodables en WinAnsi (< U+0100)", () => {
    for (const valeur of [1000, 3650000, 2920000, 999, 1234567890]) {
      const rendu = formatNombrePdf(valeur);
      const horsWinAnsi = [...rendu].filter((c) => c.charCodeAt(0) > 255);
      expect(horsWinAnsi).toEqual([]);
    }
  });

  it('ne laisse passer aucune espace Unicode exotique', () => {
    const rendu = formatNombrePdf(1234567);
    expect(rendu).not.toMatch(/[\u202F\u00A0\u2009]/);
    expect(rendu).toBe('1 234 567');
  });

  it('traite les valeurs vides ou invalides comme zéro', () => {
    expect(formatNombrePdf(null)).toBe('0');
    expect(formatNombrePdf(undefined)).toBe('0');
    expect(formatNombrePdf('')).toBe('0');
    expect(formatNombrePdf('pas-un-nombre')).toBe('0');
  });

  it('accepte les montants NUMERIC renvoyés en chaîne par pg', () => {
    expect(formatNombrePdf('2920000.00')).toBe('2 920 000');
  });
});
