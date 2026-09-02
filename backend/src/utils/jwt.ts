import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AccessPayload {
  userId: string;
  email: string;
  role: string;
}

export interface RefreshPayload {
  userId: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshPayload;
}
