import { NextFunction, Request, Response } from 'express';

export const deprecateRoute = (successorPath: string) => (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', `<${successorPath}>; rel="successor-version"`);
  next();
};
