import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessPayload } from '../utils/jwt';
import { AppError } from '../utils/errors';

export interface AuthRequest extends Request {
  user?: AccessPayload;
}

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required.', 401));
  }
  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError('Invalid or expired token.', 401));
  }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    req.user = verifyAccessToken(header.slice(7));
  } catch {
    // ignore — request proceeds as unauthenticated
  }
  next();
}
