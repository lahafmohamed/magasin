import { describe, expect, it } from 'vitest';
import { formatPaymentMethod } from './paymentMethod';

describe('formatPaymentMethod', () => {
  it('translates known payment codes', () => {
    expect(formatPaymentMethod('espece')).toBe('Espèces');
    expect(formatPaymentMethod('orange_money')).toBe('Orange Money');
  });

  it('formats an unknown code without exposing snake_case', () => {
    expect(formatPaymentMethod('paiement_externe')).toBe('Paiement externe');
  });

  it('handles an absent payment method', () => {
    expect(formatPaymentMethod(null)).toBe('Non renseignée');
  });
});
