import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool from '../db/connection';

/**
 * Middleware d'idempotency générique.
 * Lit l'en-tête Idempotency-Key, vérifie si la clé existe déjà,
 * et retourne la réponse mise en cache si c'est le cas.
 *
 * Usage: router.post('/', idempotency(), handler);
 */
export function idempotency() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.headers['idempotency-key'] as string;
    if (!key) {
      next();
      return;
    }

    // Scope the key per user so two users can't collide on the same Idempotency-Key.
    const userId = (req as any).user?.id ?? 'anon';
    const keyHash = crypto.createHash('sha256').update(`${userId}:${key}`).digest('hex');

    try {
      // Vérifier si la clé existe déjà
      const { rows } = await pool.query(
        `SELECT response_status, response_body FROM idempotency_keys
         WHERE key_hash = $1 AND expired_at > NOW()`,
        [keyHash]
      );

      if (rows.length > 0) {
        const cached = rows[0];
        res.status(cached.response_status).json(cached.response_body);
        return;
      }

      // Intercepter la réponse pour la mettre en cache
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        // Only cache successful responses — caching a transient 4xx/5xx would
        // wrongly replay the failure on a legitimate retry.
        if (res.statusCode >= 200 && res.statusCode < 300) {
          pool.query(
            `INSERT INTO idempotency_keys (key_hash, route, response_status, response_body)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (key_hash) DO NOTHING`,
            [keyHash, req.originalUrl, res.statusCode, JSON.stringify(body)]
          ).catch(() => {});
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error('Idempotency middleware error:', error);
      next();
    }
  };
}
