import { describe, it, expect } from 'vitest';
import { isStrongPassword, parseDurationMs } from './security';

describe('isStrongPassword', () => {
  it('accepts ≥8 chars with a letter and a digit', () => {
    expect(isStrongPassword('abc12345')).toBe(true);
    expect(isStrongPassword('Password1')).toBe(true);
  });

  it('rejects too short, letter-only, digit-only, and non-strings', () => {
    expect(isStrongPassword('ab12')).toBe(false);       // < 8
    expect(isStrongPassword('abcdefgh')).toBe(false);   // no digit
    expect(isStrongPassword('12345678')).toBe(false);   // no letter
    expect(isStrongPassword(undefined)).toBe(false);
    expect(isStrongPassword(12345678)).toBe(false);
  });
});

describe('parseDurationMs', () => {
  it('parses jsonwebtoken-style suffixes', () => {
    expect(parseDurationMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDurationMs('24h')).toBe(24 * 60 * 60 * 1000);
    expect(parseDurationMs('30m')).toBe(30 * 60 * 1000);
    expect(parseDurationMs('45s')).toBe(45 * 1000);
    expect(parseDurationMs('500ms')).toBe(500);
  });

  it('treats a bare number as seconds (jsonwebtoken semantics)', () => {
    expect(parseDurationMs('3600')).toBe(3600 * 1000);
  });

  it('falls back to 7d for empty/garbage', () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(parseDurationMs('')).toBe(sevenDays);
    expect(parseDurationMs('nonsense')).toBe(sevenDays);
  });
});
