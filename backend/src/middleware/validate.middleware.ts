import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/errors';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const msg = (result.error as ZodError).errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      return next(new AppError(msg, 400));
    }
    req[source] = result.data;
    next();
  };
}
