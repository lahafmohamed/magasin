import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Query params whose values must never reach the logs (SSE ?token= fallback etc.).
const SENSITIVE_QUERY_PARAMS = ['token', 'password', 'secret'];

/** Redact sensitive query-string values so raw JWTs never land in access logs. */
export function redactUrl(url: string): string {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return url;
  const path = url.slice(0, qIndex);
  const params = new URLSearchParams(url.slice(qIndex + 1));
  let changed = false;
  for (const key of SENSITIVE_QUERY_PARAMS) {
    if (params.has(key)) {
      params.set(key, 'REDACTED');
      changed = true;
    }
  }
  if (!changed) return url;
  return `${path}?${params.toString()}`;
}

export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: redactUrl(req.originalUrl),
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    }, 'HTTP Request');
  });

  next();
};
