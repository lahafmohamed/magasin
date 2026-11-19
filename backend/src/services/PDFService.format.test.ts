import { describe, expect, it } from 'vitest';
import { companyName, formatDatePdf, formatMentionsLegalesPdf, formatMoisPdf, formatNombrePdf, formatPeriodePdf } from './PDFService';

/**
 * CPG2-04 : les PDF imprimaient « Période : 2026-10-01 au 2026-10-31 »,
 * « Période : ... au … » et « Période : 2026-10 » sur des documents remis au
 * client ou à l'employé.
 */
describe('dates imprimées', () => {
  const winAnsi = (texte: string) => [...texte].every((c) => c.charCodeAt(0) <= 255 || '’…'.includes(c));

  it('écrit les dates comme l’interface, avec « 1er » pour le premier du mois', () => {
    expect(formatDatePdf('2026-10-01')).toBe('1er oct. 2026');
    expect(formatDatePdf('2026-10-31')).toBe('31 oct. 2026');
    expect(formatDatePdf('')).toBe('');
  });

  it('écrit une période en toutes lettres, bornée d’un côté ou des deux', () => {
    expect(formatPeriodePdf('2026-10-01', '2026-10-31')).toBe('Période : du 1er oct. 2026 au 31 oct. 2026');
    expect(formatPeriodePdf(null, '2026-10-31')).toBe('Période : jusqu’au 31 oct. 2026');
    expect(formatPeriodePdf('2026-10-01', undefined)).toBe('Période : depuis le 1er oct. 2026');
    expect(formatPeriodePdf()).toBe('');
    expect(winAnsi(formatPeriodePdf('2026-02-01', '2026-12-31'))).toBe(true);
  });

  it('écrit le mois de paie en toutes lettres', () => {
    expect(formatMoisPdf('2026-10')).toBe('octobre 2026');
    expect(formatMoisPdf('2026-08')).toBe('août 2026');
    expect(formatMoisPdf('n/a')).toBe('n/a');
  });
});

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

/**
 * CPG-08 : l'en-tête des documents prenait « Hitek-CI » quand la raison
 * sociale n'était pas renseignée — la marque d'un client imprimée chez un
 * autre. Le nom vient des paramètres de l'entreprise, sinon rien.
 */
describe('companyName', () => {
  it('reprend la raison sociale des paramètres', () => {
    expect(companyName({ nom: '  Boutique Plateau  ' })).toBe('Boutique Plateau');
  });

  it('n’invente aucune marque quand elle manque', () => {
    expect(companyName({ nom: '' })).toBe('');
    expect(companyName({ nom: null })).toBe('');
    expect(companyName(undefined)).toBe('');
  });
});

/**
 * v1 : l'en-tête imprimait « NIF : x · RCCM : - · AI : - » dès que le NIF
 * était saisi — des tirets parasites sur les documents remis au client.
 * Seuls les champs renseignés s'impriment.
 */
describe('mentions légales de l’en-tête', () => {
  it('n’imprime que les champs renseignés', () => {
    expect(formatMentionsLegalesPdf({ nif: '1234567 A' })).toBe('NIF : 1234567 A');
    expect(formatMentionsLegalesPdf({ rc: 'CI-ABJ-2020-B-1234' })).toBe('RCCM : CI-ABJ-2020-B-1234');
    expect(formatMentionsLegalesPdf({ ai: '2024-001' })).toBe('AI : 2024-001');
  });

  it('joint les mentions par « · » quand elles existent', () => {
    expect(formatMentionsLegalesPdf({ nif: 'N1', rc: 'R1', ai: 'A1' })).toBe('NIF : N1 · RCCM : R1 · AI : A1');
    expect(formatMentionsLegalesPdf({ nif: 'N1', ai: 'A1' })).toBe('NIF : N1 · AI : A1');
  });

  it('ne rend rien quand aucun champ n’est rempli', () => {
    expect(formatMentionsLegalesPdf({})).toBe('');
    expect(formatMentionsLegalesPdf({ nif: '', rc: null, ai: '   ' })).toBe('');
    expect(formatMentionsLegalesPdf(undefined)).toBe('');
  });
});
