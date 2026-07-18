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
