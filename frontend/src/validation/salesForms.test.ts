import { describe, expect, it } from 'vitest';
import {
  describeDueDate,
  insufficientStockMessage,
  lineFieldLabel,
  parseDecimalInput,
  parseIntegerInput,
  paymentTermDays,
  plural,
  toDisplayNumber,
  toEditableNumber,
} from './salesForms';

const NBSP = ' ';

describe('saisie des nombres', () => {
  it.each([
    ['12', 12],
    [' 1 200 ', 1200],
    [`1${NBSP}200`, 1200],
  ])('entier « %s » → %s', (raw, expected) => {
    expect(parseIntegerInput(raw)).toBe(expected);
  });

  it.each(['', '1,5', '-2', 'abc', '12a'])('entier invalide « %s » → NaN', (raw) => {
    expect(parseIntegerInput(raw)).toBeNaN();
  });

  it.each([
    ['1250', 1250],
    ['1 250,50', 1250.5],
    ['1250.5', 1250.5],
    ['12,', 12],
    [',5', 0.5],
  ])('décimal « %s » → %s', (raw, expected) => {
    expect(parseDecimalInput(raw)).toBe(expected);
  });

  it.each(['', 'douze', '1,2,3', '-4'])('décimal invalide « %s » → NaN', (raw) => {
    expect(parseDecimalInput(raw)).toBeNaN();
  });

  it('texte éditable à la virgule, affichage groupé à la française', () => {
    expect(toEditableNumber(1062.5)).toBe('1062,5');
    expect(toEditableNumber(Number.NaN)).toBe('');
    expect(toDisplayNumber(1250000)).toBe(`1${NBSP}250${NBSP}000`);
    expect(toDisplayNumber(null)).toBe('');
  });
});

describe('textes', () => {
  it('pluriel français : singulier à 0 et à 1', () => {
    expect(plural(0, 'ligne', 'lignes')).toBe('0 ligne');
    expect(plural(1, 'ligne', 'lignes')).toBe('1 ligne');
    expect(plural(3, 'ligne', 'lignes')).toBe('3 lignes');
  });

  it('stock insuffisant', () => {
    expect(insufficientStockMessage(1)).toBe('Stock insuffisant : 1 disponible dans cet emplacement.');
    expect(insufficientStockMessage(13)).toBe('Stock insuffisant : 13 disponibles dans cet emplacement.');
    expect(insufficientStockMessage(-2)).toBe('Stock insuffisant : 0 disponible dans cet emplacement.');
  });

  it('nom accessible d’un champ de ligne', () => {
    expect(lineFieldLabel('Quantité', 'HP ProBook 450 G10')).toBe('Quantité — HP ProBook 450 G10');
    expect(lineFieldLabel('Description', '', 1)).toBe('Description — ligne 2');
  });
});

describe('échéance annoncée', () => {
  const today = new Date(2026, 9, 23);

  it('délai de paiement en jours', () => {
    expect(paymentTermDays('net_30')).toBe(30);
    expect(paymentTermDays('NET_60')).toBe(60);
    expect(paymentTermDays(null)).toBe(0);
    expect(paymentTermDays('inconnu')).toBe(0);
  });

  it('immédiat → « À réception » ; sinon date et nombre de jours', () => {
    expect(describeDueDate('immediat', today)).toBe('À réception');
    expect(describeDueDate('net_30', today)).toBe('22 nov. 2026 (30 jours)');
  });
});
