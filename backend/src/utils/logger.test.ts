import { describe, it, expect } from 'vitest';
import { redactUrl } from './logger';

describe('redactUrl', () => {
  it('redacts the SSE ?token= JWT', () => {
    const out = redactUrl('/api/notifications/stream?token=eyJhbGciOiJIUzI1NiJ9.abc.def');
    expect(out).not.toContain('eyJhbGci');
    expect(out).toContain('token=REDACTED');
  });

  it('leaves token-free URLs untouched', () => {
    expect(redactUrl('/api/factures?page=2&limit=20')).toBe('/api/factures?page=2&limit=20');
    expect(redactUrl('/api/health')).toBe('/api/health');
  });

  it('redacts password/secret and preserves other params', () => {
    const out = redactUrl('/x?a=1&password=hunter2&b=2');
    expect(out).toContain('a=1');
    expect(out).toContain('b=2');
    expect(out).toContain('password=REDACTED');
    expect(out).not.toContain('hunter2');
  });
});
