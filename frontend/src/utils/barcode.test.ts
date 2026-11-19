import { describe, it, expect } from 'vitest';
import {
  barcodeSvg,
  code128Values,
  ean13CheckDigit,
  encodeBarcode,
  encodeCode128,
  encodeEan13,
  isPrintableBarcode,
  isValidEan13,
} from './barcode';

// Références produites par JsBarcode 3.11.6 (comparaison faite sur 11 codes au lot 3).
const REF_EAN13_5901234123457 =
  '10100010110100111011001100100110111101001110101010110011011011001000010101110010011101000100101';
const REF_C128B_TS_BL_M =
  '1101001000011011100010110111010001001101110010001011000100011011101001101110010111011000100111011001100011101011';
const REF_C128C_123456 = '11010011100101100111001000101100011100010110100011011101100011101011';

describe('EAN-13', () => {
  it('calcule la clé de contrôle, comme le serveur', () => {
    expect(ean13CheckDigit('590123412345')).toBe(7);
    expect(ean13CheckDigit('200000000001')).toBe(5);
    expect(isValidEan13('5901234123457')).toBe(true);
    expect(isValidEan13('5901234123458')).toBe(false);
    expect(isValidEan13('590123412345')).toBe(false);
  });

  it('encode 95 modules identiques à la référence', () => {
    const m = encodeEan13('5901234123457');
    expect(m).toHaveLength(95);
    expect(m).toBe(REF_EAN13_5901234123457);
  });
});

describe('Code 128', () => {
  it('encode en jeu B un code alphanumérique, identique à la référence', () => {
    expect(encodeCode128('TS-BL-M')).toBe(REF_C128B_TS_BL_M);
  });

  it('encode en jeu C un nombre pair de chiffres, identique à la référence', () => {
    expect(code128Values('123456')[0]).toBe(105);
    expect(encodeCode128('123456')).toBe(REF_C128C_123456);
  });

  it('pose la clé modulo 103 avant l’arrêt', () => {
    const v = code128Values('AB');
    // départ B (104) + A (33) × 1 + B (34) × 2 = 205 → 205 mod 103 = 102
    expect(v).toEqual([104, 33, 34, 102, 106]);
  });

  it('refuse un caractère hors ASCII imprimable', () => {
    expect(() => encodeCode128('Été')).toThrow(/impossible à encoder/);
    expect(isPrintableBarcode('Été')).toBe(false);
    expect(isPrintableBarcode('INF-LAP-001')).toBe(true);
    expect(isPrintableBarcode('')).toBe(false);
    expect(isPrintableBarcode(null)).toBe(false);
  });
});

describe('choix du format et SVG', () => {
  it('prend l’EAN-13 pour un code valide, le Code 128 sinon', () => {
    expect(encodeBarcode('2000000000015').format).toBe('EAN13');
    // 13 chiffres à clé fausse (codes de la base de démonstration) : Code 128, lisible quand même.
    expect(encodeBarcode('6001234500047').format).toBe('CODE128');
    expect(encodeBarcode('TS-BL-M').format).toBe('CODE128');
  });

  it('dessine les barres avec leurs marges de silence et échappe le libellé', () => {
    const svg = barcodeSvg('2000000000015');
    expect(svg).toContain('viewBox="0 0 117 1"');
    expect(svg).toContain('<rect x="11" y="0" width="1" height="1"/>');
    expect(barcodeSvg('A<B')).not.toContain('A<B');
  });
});
