import { logger } from './logger';

/**
 * Business errors carry an HTTP status so controllers can surface the
 * (French, user-facing) message without leaking internal errors: any error
 * WITHOUT a statusCode must be answered with a generic 500.
 */
export interface BusinessError extends Error {
  statusCode: number;
  code?: string;
}

export function businessError(statusCode: number, message: string, code?: string): BusinessError {
  const err = new Error(message) as BusinessError;
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

/** HTTP status carried by the error, or null when it is not a business error. */
export function businessStatusOf(error: unknown): number | null {
  const status = (error as { statusCode?: unknown })?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}

interface ErrorResponder {
  status(code: number): { json(body: unknown): unknown };
}

/**
 * Send an error to the client without leaking internals. A business error
 * (one carrying a 4xx `statusCode`) surfaces its French, user-facing message;
 * any other error — including raw `pg` errors whose text exposes table names,
 * constraint identifiers and SQL — is logged server-side and answered with a
 * generic 500, never echoed back.
 */
export function respondWithError(
  res: ErrorResponder,
  error: unknown,
  logContext: string,
  fallbackMessage = 'Erreur interne du serveur'
): void {
  const status = businessStatusOf(error);
  if (status) {
    res.status(status).json({ success: false, error: (error as Error).message });
    return;
  }
  logger.error({ err: error }, logContext);
  res.status(500).json({ success: false, error: fallbackMessage });
}
