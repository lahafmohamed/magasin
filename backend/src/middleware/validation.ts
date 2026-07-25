import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type RequestValueReader = (req: Request) => unknown;
type ParsedValueWriter = (req: Request, parsed: unknown) => void;

const validateRequest = (
  schema: ZodSchema,
  readValue: RequestValueReader,
  writeValue: ParsedValueWriter,
  invalidMessage: string,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      writeValue(req, schema.parse(readValue(req)));
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: invalidMessage,
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Erreur de validation',
      });
    }
  };
};

/**
 * Middleware factory to validate request body against a Zod schema
 */
export const validateBody = (schema: ZodSchema) => validateRequest(
  schema,
  (req) => req.body,
  (req, parsed) => { req.body = parsed; },
  'Données invalides',
);

/**
 * Middleware factory to validate request query against a Zod schema
 */
export const validateQuery = (schema: ZodSchema) => validateRequest(
  schema,
  (req) => req.query,
  (req, parsed) => { Object.assign(req.query, parsed); },
  'Paramètres de requête invalides',
);
