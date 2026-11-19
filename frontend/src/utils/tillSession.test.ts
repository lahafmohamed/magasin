import { describe, expect, it } from 'vitest';
import { previousDayTill } from './tillSession';

/** Espaces insécables normalisés. */
const plain = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');

describe('previousDayTill (P-M2)', () => {
  const now = new Date(2026, 9, 24, 8, 5); // 24 oct. 2026, 08:05, heure locale

  it('ignores a till opened today', () => {
    expect(previousDayTill(new Date(2026, 9, 24, 7, 30), now)).toBeNull();
  });

  it('ignores a missing or invalid opening date', () => {
    expect(previousDayTill(null, now)).toBeNull();
    expect(previousDayTill('pas une date', now)).toBeNull();
  });

  it('names yesterday’s till and the time cash payments will be blocked', () => {
    const t = previousDayTill(new Date(2026, 9, 23, 13, 8), now);
    expect(t).not.toBeNull();
    expect(t!.yesterday).toBe(true);
    expect(plain(t!.title)).toBe('Caisse ouverte hier (23 oct. à 13:08) et non clôturée');
    expect(t!.closeLabel).toBe('Clôturer la caisse d’hier');
    expect(t!.blockedAtLabel).toBe('À partir de 13:08');
  });

  it('dates an older till instead of calling it yesterday’s', () => {
    const t = previousDayTill(new Date(2026, 9, 22, 23, 50), new Date(2026, 9, 24, 0, 10));
    expect(t!.yesterday).toBe(false);
    expect(plain(t!.title)).toBe('Caisse ouverte le 22 oct. à 23:50 et non clôturée');
    expect(plain(t!.closeLabel)).toBe('Clôturer la caisse du 22 oct.');
  });
});
