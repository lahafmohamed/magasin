/**
 * Password complexity policy — single source of truth.
 * ≥8 chars with at least one letter and one digit.
 */
export function isStrongPassword(pw: unknown): pw is string {
  return typeof pw === 'string' && pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

export const PASSWORD_POLICY_MESSAGE =
  'Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.';

/**
 * Parse a jsonwebtoken-style duration ('7d', '24h', '60m', '3600s', or a bare
 * number of seconds) into milliseconds. Used to keep the DB session TTL and the
 * auth cookie maxAge derived from the SAME JWT_EXPIRATION as the JWT itself, so
 * a non-default JWT_EXPIRATION can never desync the three.
 */
export function parseDurationMs(value: string): number {
  const DEFAULT = 7 * 24 * 60 * 60 * 1000; // 7d
  if (!value) return DEFAULT;
  const trimmed = value.trim();
  const m = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(trimmed);
  if (!m) return DEFAULT;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case 'ms': return n;
    case 's': return n * 1000;
    case 'm': return n * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'd': return n * 24 * 60 * 60 * 1000;
    default: return n * 1000; // bare number = seconds (jsonwebtoken semantics)
  }
}

/** Session/cookie lifetime in ms, derived from JWT_EXPIRATION. */
export function getSessionMaxAgeMs(): number {
  return parseDurationMs(process.env.JWT_EXPIRATION || '7d');
}

/** Absolute session/cookie expiry from now. */
export function getSessionExpiryDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + getSessionMaxAgeMs());
}
