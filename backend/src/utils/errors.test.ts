import { describe, it, expect } from 'vitest';
import { businessError, businessStatusOf } from './errors';

describe('utils/errors', () => {
  describe('businessError', () => {
    it('creates an Error carrying the HTTP status and message', () => {
      const err = businessError(409, 'Caisse fermée');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Caisse fermée');
      expect(err.statusCode).toBe(409);
      expect(err.code).toBeUndefined();
    });

    it('carries an optional machine code', () => {
      const err = businessError(422, 'Période clôturée', 'PERIOD_CLOSED');
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('PERIOD_CLOSED');
    });
  });

  describe('businessStatusOf', () => {
    it('returns the status for a 4xx business error', () => {
      expect(businessStatusOf(businessError(400, 'x'))).toBe(400);
      expect(businessStatusOf(businessError(404, 'x'))).toBe(404);
      expect(businessStatusOf(businessError(409, 'x'))).toBe(409);
      expect(businessStatusOf(businessError(422, 'x'))).toBe(422);
    });

    it('honors a PeriodService-style plain object with statusCode 422', () => {
      // PeriodService.checkPeriodIsOpen throws a plain Error with .statusCode = 422
      const periodErr: any = new Error('Période comptable 06/2026 est clôturée.');
      periodErr.statusCode = 422;
      expect(businessStatusOf(periodErr)).toBe(422);
    });

    it('returns null for a 5xx status (never leak as business error)', () => {
      expect(businessStatusOf(businessError(500 as number, 'boom'))).toBeNull();
      const e: any = new Error('x');
      e.statusCode = 503;
      expect(businessStatusOf(e)).toBeNull();
    });

    it('returns null for an error with no statusCode (raw/DB error)', () => {
      expect(businessStatusOf(new Error('duplicate key value violates unique constraint'))).toBeNull();
    });

    it('returns null for non-error inputs', () => {
      expect(businessStatusOf(null)).toBeNull();
      expect(businessStatusOf(undefined)).toBeNull();
      expect(businessStatusOf('string error')).toBeNull();
      expect(businessStatusOf({ statusCode: 'not-a-number' })).toBeNull();
    });
  });
});
