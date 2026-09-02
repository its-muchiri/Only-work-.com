import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { AppError } from '../utils/errors';

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError('Authentication required.', 401));
  if (req.user.role !== 'ADMIN') return next(new AppError('Admin access required.', 403));
  next();
}
