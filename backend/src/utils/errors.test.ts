import { describe, it, expect } from 'vitest';
import { businessError, businessStatusOf, respondWithError } from './errors';

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

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

  describe('respondWithError', () => {
    it('surfaces the message of a 4xx business error verbatim', () => {
      const res = mockRes();
      respondWithError(res, businessError(409, 'Le matricule EMP-1 existe déjà'), 'ctx');
      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ success: false, error: 'Le matricule EMP-1 existe déjà' });
    });

    it('never leaks a raw pg/internal error to the client', () => {
      const res = mockRes();
      // A pg unique-violation error carries no statusCode and its text names the
      // constraint — it must NOT reach the client.
      const pgError: any = new Error(
        'duplicate key value violates unique constraint "utilisateurs_username_key"'
      );
      pgError.code = '23505';
      pgError.table = 'utilisateurs';

      respondWithError(res, pgError, 'ctx');

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Erreur interne du serveur' });
      expect(JSON.stringify(res.body)).not.toContain('utilisateurs_username_key');
      expect(JSON.stringify(res.body)).not.toContain('constraint');
    });

    it('honors a custom fallback message for internal errors', () => {
      const res = mockRes();
      respondWithError(res, new Error('boom'), 'ctx', 'Erreur lors de la création de l\'avoir');
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Erreur lors de la création de l\'avoir' });
    });

    it('treats a 5xx statusCode as internal (generic message, not surfaced)', () => {
      const res = mockRes();
      const err: any = new Error('upstream exploded at 10.0.0.5');
      err.statusCode = 503;
      respondWithError(res, err, 'ctx');
      expect(res.statusCode).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
    });
  });
});
