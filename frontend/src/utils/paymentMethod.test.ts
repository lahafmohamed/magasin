import { describe, expect, it } from 'vitest';
import {
  formatPaymentMethod,
  paymentMethodPhrase,
  PAYMENT_METHODS,
  PAYMENT_METHOD_OPTIONS,
  paymentMethodHue,
} from './paymentMethod';

describe('formatPaymentMethod', () => {
  it('translates known payment codes', () => {
    expect(formatPaymentMethod('espece')).toBe('Espèces');
    expect(formatPaymentMethod('orange_money')).toBe('Orange Money');
    expect(formatPaymentMethod('acompte')).toBe('Acompte');
  });

  it('formats an unknown code without exposing snake_case', () => {
    expect(formatPaymentMethod('paiement_externe')).toBe('Paiement externe');
  });

  it('handles an absent payment method (« mode de paiement » : masculin)', () => {
    expect(formatPaymentMethod(null)).toBe('Non renseigné');
  });
});

describe('PAYMENT_METHOD_OPTIONS', () => {
  it('lists the eight selectable modes, in canonical order, with their labels', () => {
    expect(PAYMENT_METHOD_OPTIONS.map((o) => o.value)).toEqual([...PAYMENT_METHODS]);
    expect(PAYMENT_METHOD_OPTIONS[0]).toEqual({ value: 'espece', label: 'Espèces' });
    expect(PAYMENT_METHOD_OPTIONS.some((o) => (o.value as string) === 'acompte')).toBe(false);
  });

  it('gives every mode a categorical hue', () => {
    for (const m of PAYMENT_METHODS) expect(paymentMethodHue(m)).toBeGreaterThan(0);
    expect(paymentMethodHue(null)).toBeUndefined();
  });

  it('phrases a mode like the server toasts do (« en espèces », « par virement »)', () => {
    expect(paymentMethodPhrase('espece')).toBe('en espèces');
    expect(paymentMethodPhrase('virement')).toBe('par virement');
    expect(paymentMethodPhrase('orange_money')).toBe('par Orange Money');
    expect(paymentMethodPhrase('inconnu')).toBe('par un autre mode de paiement');
    for (const m of PAYMENT_METHODS) expect(paymentMethodPhrase(m)).toMatch(/^(en|par) /);
  });
});
