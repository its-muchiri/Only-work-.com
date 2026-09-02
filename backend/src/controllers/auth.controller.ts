import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AppError } from '../utils/errors';
import { emailService } from '../services/email.service';
import { config } from '../config';

const COOKIE = 'refreshToken';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerified: true,
  avatarUrl: true,
  stripeId: true,
  createdAt: true,
};

function setRefresh(res: Response, token: string) {
  res.cookie(COOKIE, token, COOKIE_OPTS);
}
function clearRefresh(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

export const signupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotSchema = z.object({
  email: z.string().email('Invalid email'),
});

export const resetSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const authController = {
  async signup(req: Request, res: Response) {
    const { name, email, password } = req.body as z.infer<typeof signupSchema>;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('An account with this email already exists.', 409);

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashed },
      select: USER_SELECT,
    });

    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
    const refreshTokenStr = signRefreshToken({ userId: user.id });
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenStr,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Send verification email (fire-and-forget)
    const verifyToken = crypto.randomBytes(32).toString('hex');
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: verifyToken,
        type: 'EMAIL_VERIFY',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    emailService.sendVerificationEmail(user.email, user.name, verifyToken).catch(console.error);

    setRefresh(res, refreshTokenStr);
    return res.status(201).json({ ok: true, data: { accessToken, user } });
  },

  async login(req: Request, res: Response) {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError('Invalid email or password.', 401);
    if (!user.active) throw new AppError('This account has been deactivated.', 403);

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new AppError('Invalid email or password.', 401);

    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
    const refreshTokenStr = signRefreshToken({ userId: user.id });
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenStr,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    setRefresh(res, refreshTokenStr);
    const { password: _, ...safeUser } = user;
    return res.json({ ok: true, data: { accessToken, user: safeUser } });
  },

  async refresh(req: Request, res: Response) {
    const token = req.cookies[COOKIE];
    if (!token) throw new AppError('No refresh token.', 401);

    let payload: { userId: string };
    try {
      payload = verifyRefreshToken(token);
    } catch {
      clearRefresh(res);
      throw new AppError('Invalid refresh token.', 401);
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.expiresAt < new Date()) {
      clearRefresh(res);
      throw new AppError('Refresh token expired. Please log in again.', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: USER_SELECT,
    });
    if (!user || !user.active) {
      clearRefresh(res);
      throw new AppError('User not found or deactivated.', 401);
    }

    // Rotate refresh token
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    const newRefresh = signRefreshToken({ userId: user.id });
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: newRefresh,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
    setRefresh(res, newRefresh);
    return res.json({ ok: true, data: { accessToken, user } });
  },

  async logout(req: Request, res: Response) {
    const token = req.cookies[COOKIE];
    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } }).catch(() => null);
    }
    clearRefresh(res);
    return res.json({ ok: true });
  },

  async verifyEmail(req: Request, res: Response) {
    const { token } = req.params;
    const record = await prisma.verificationToken.findUnique({ where: { token } });
    if (!record || record.type !== 'EMAIL_VERIFY' || record.expiresAt < new Date()) {
      throw new AppError('Invalid or expired verification link.', 400);
    }
    await prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } });
    await prisma.verificationToken.delete({ where: { id: record.id } });
    // Redirect to success page
    return res.redirect(`${config.FRONTEND_URL}/login.html?verified=1`);
  },

  async forgotPassword(req: Request, res: Response) {
    const { email } = req.body as z.infer<typeof forgotSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    const msg = 'If that email is registered, a reset link has been sent.';
    if (!user) return res.json({ ok: true, data: { message: msg } });

    await prisma.verificationToken.deleteMany({
      where: { userId: user.id, type: 'PASSWORD_RESET' },
    });
    const resetToken = crypto.randomBytes(32).toString('hex');
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: resetToken,
        type: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    emailService.sendPasswordResetEmail(user.email, user.name, resetToken).catch(console.error);
    return res.json({ ok: true, data: { message: msg } });
  },

  async resetPassword(req: Request, res: Response) {
    const { token } = req.params;
    const { password } = req.body as z.infer<typeof resetSchema>;

    const record = await prisma.verificationToken.findUnique({ where: { token } });
    if (!record || record.type !== 'PASSWORD_RESET' || record.expiresAt < new Date()) {
      throw new AppError('Invalid or expired reset link.', 400);
    }
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: record.userId }, data: { password: hashed } });
    await prisma.refreshToken.deleteMany({ where: { userId: record.userId } });
    await prisma.verificationToken.delete({ where: { id: record.id } });
    return res.json({ ok: true, data: { message: 'Password reset successfully. Please log in.' } });
  },

  async me(req: Request, res: Response) {
    const anyReq = req as any;
    if (!anyReq.user) throw new AppError('Authentication required.', 401);
    const user = await prisma.user.findUnique({
      where: { id: anyReq.user.userId },
      select: USER_SELECT,
    });
    if (!user) throw new AppError('User not found.', 404);
    return res.json({ ok: true, data: { user } });
  },
};
