import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number = 400,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ ok: false, error: err.message });
  }
  console.error('[UnhandledError]', err);
  return res.status(500).json({ ok: false, error: 'Internal server error.' });
}
