import { describe, expect, it } from 'vitest';
import {
  CASH_SESSION_MAX_AGE_HOURS,
  getCashSessionAgeHours,
  isCashSessionStale,
} from './CaisseMagasinService';

describe('cash session age policy', () => {
  const now = new Date('2026-07-23T12:00:00.000Z');

  it('autorise une session de moins de 24 heures', () => {
    const openedAt = new Date('2026-07-22T12:00:01.000Z');
    expect(getCashSessionAgeHours(openedAt, now)).toBeLessThan(
      CASH_SESSION_MAX_AGE_HOURS
    );
    expect(isCashSessionStale(openedAt, now)).toBe(false);
  });

  it('signale une session dès 24 heures', () => {
    const openedAt = new Date('2026-07-22T12:00:00.000Z');
    expect(getCashSessionAgeHours(openedAt, now)).toBe(24);
    expect(isCashSessionStale(openedAt, now)).toBe(true);
  });

  it('traite une date invalide comme une session à contrôler', () => {
    expect(isCashSessionStale('date-invalide', now)).toBe(true);
  });
});
