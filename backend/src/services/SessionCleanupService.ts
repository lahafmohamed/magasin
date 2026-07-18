import pool from '../db/connection';
import { logger } from '../utils/logger';

/**
 * Prune stale rows from user_sessions so the table doesn't grow unbounded.
 * Safe because authenticate() fails closed: a token whose row is gone is
 * rejected, and expired/long-revoked rows are already unusable.
 *
 *  - expired more than 1 day ago (buffer past expiry), or
 *  - revoked/inactive more than 7 days ago (kept briefly for audit).
 */
export async function purgeStaleSessions(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM user_sessions
     WHERE expires_at < (CURRENT_TIMESTAMP - INTERVAL '1 day')
        OR (is_active = false AND revoked_at IS NOT NULL
            AND revoked_at < (CURRENT_TIMESTAMP - INTERVAL '7 days'))`
  );
  return rowCount || 0;
}

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

/**
 * Start the periodic session-cleanup timer. Returns the timer so callers can
 * clear it on shutdown. unref()'d so it never keeps the process alive.
 */
export function startSessionCleanup(): NodeJS.Timeout {
  const run = () => {
    purgeStaleSessions()
      .then((n) => {
        if (n > 0) logger.info({ purged: n }, 'Sessions expirées/révoquées purgées');
      })
      .catch((err) => logger.error({ err }, 'Échec de la purge des sessions'));
  };

  run(); // once at boot
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}
