import { describe, it, expect } from 'vitest';
import {
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatDateNumeric,
  formatDateShort,
  formatDateTime,
  formatDayMonth,
  formatFileSize,
  formatMonthShort,
  formatMonthYear,
  formatNumber,
  formatPercent,
  formatPercentChange,
  formatSignedCurrency,
  toNumber,
} from './format';

const NBSP = '\u00A0';

// Intl insère des espaces insécables (U+00A0 / U+202F) : `\s` les couvre.
describe('format helpers', () => {
  it('formats chart axis values compactly, in French', () => {
    expect(formatCompactNumber(1250000)).toMatch(/^1,3\sM$/);
    expect(formatCompactNumber(850000)).toMatch(/^850\sk$/);
    expect(formatCompactNumber(0)).toBe('0');
  });

  it('formats signed percentage changes the French way', () => {
    expect(formatPercentChange(6.8)).toMatch(/^\+6,8\s%$/);
    expect(formatPercentChange(-12.34)).toMatch(/^[-−]12,3\s%$/);
    expect(formatPercentChange(0)).toMatch(/^0\s%$/);
  });

  it('formats plain percentages', () => {
    expect(formatPercent(107)).toMatch(/^107\s%$/);
    // « 23.36% » (toFixed) → « 23,4 % » avec une espace insécable.
    expect(formatPercent(23.36, 1)).toBe(`23,4${NBSP}%`);
  });

  it('formats short day/month and month labels in French', () => {
    expect(formatDayMonth(new Date(2026, 9, 5))).toBe('5 oct.');
    expect(formatMonthShort(8)).toBe('août');
    expect(formatMonthShort(9)).toBe('sept.');
  });
});

describe('formatCurrency — montants', () => {
  it('groupe avec U+00A0 et colle « FCFA » par une insécable', () => {
    // Plus d'espace fine U+202F (invisible en gras) ni d'espace sécable avant l'unité.
    expect(formatCurrency(43126500)).toBe(`43${NBSP}126${NBSP}500${NBSP}FCFA`);
    expect(formatCurrency('1850000.00')).toBe(`1${NBSP}850${NBSP}000${NBSP}FCFA`);
    expect(formatCurrency(43126500)).not.toMatch(/[\u202F\u0020]/);
  });

  it('arrondit à l’unité et signe les négatifs avec « − »', () => {
    expect(formatCurrency(1234.6)).toBe(`1${NBSP}235${NBSP}FCFA`);
    expect(formatCurrency(-440)).toBe(`−440${NBSP}FCFA`);
    expect(formatCurrency(-0.4)).toBe(`0${NBSP}FCFA`);
  });

  it('garde le repli historique à zéro pour une valeur absente', () => {
    expect(formatCurrency(null)).toBe(`0${NBSP}FCFA`);
    expect(formatCurrency('abc')).toBe(`0${NBSP}FCFA`);
  });

  it('n’affiche jamais « XOF »', () => {
    expect(formatCurrency(500, 'XOF')).toBe(`500${NBSP}FCFA`);
    expect(formatCurrency(500, 'xof')).toBe(`500${NBSP}FCFA`);
  });

  it('signe les variations, jamais le zéro', () => {
    expect(formatSignedCurrency(1500)).toBe(`+1${NBSP}500${NBSP}FCFA`);
    expect(formatSignedCurrency(-1500)).toBe(`−1${NBSP}500${NBSP}FCFA`);
    expect(formatSignedCurrency(0)).toBe(`0${NBSP}FCFA`);
  });

  it('formate nombres et tailles de fichier', () => {
    expect(formatNumber(1234567)).toBe(`1${NBSP}234${NBSP}567`);
    expect(formatNumber('2.5', 1)).toBe('2,5');
    expect(formatFileSize(1536000)).toBe(`1,5${NBSP}Mo`);
    expect(formatFileSize(512)).toBe(`512${NBSP}o`);
  });

  it('distingue absent et zéro', () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber('0')).toBe(0);
    expect(toNumber('12.5')).toBe(12.5);
  });
});

describe('dates — un seul format « 22 oct. 2026 »', () => {
  it('formatDate et formatDateShort donnent le format court à mois abrégé', () => {
    expect(formatDate('2026-10-22')).toBe('22 oct. 2026');
    expect(formatDateShort('2026-08-10')).toBe('10 août 2026');
    expect(formatDate(new Date(2026, 6, 3))).toBe('3 juil. 2026');
  });

  it('lit une date seule en heure locale (pas de décalage à la veille)', () => {
    const d = formatDate('2026-01-01');
    expect(d).toBe('1 janv. 2026');
  });

  it('renvoie « — » pour une date absente ou invalide', () => {
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('pas une date')).toBe('—');
    expect(formatDateTime(null)).toBe('—');
  });

  it('formatDateTime sans les secondes', () => {
    expect(formatDateTime(new Date(2026, 9, 23, 13, 8, 6))).toBe('23 oct. 2026 à 13:08');
  });

  it('formatDateNumeric reste réservé à l’impression', () => {
    expect(formatDateNumeric('2026-10-22')).toBe('22/10/2026');
  });

  it('formatMonthYear écrit la période de paie en toutes lettres', () => {
    expect(formatMonthYear('2026-09')).toBe('septembre 2026');
    expect(formatMonthYear(undefined)).toBe('—');
  });
});
