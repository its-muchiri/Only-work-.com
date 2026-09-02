import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import { storageService } from '../services/storage.service';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerified: true,
  avatarUrl: true,
  stripeId: true,
  createdAt: true,
  active: true,
};

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const usersController = {
  async getMe(req: AuthRequest, res: Response) {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: USER_SELECT,
    });
    if (!user) throw new AppError('User not found.', 404);
    return res.json({ ok: true, data: { user } });
  },

  async updateMe(req: AuthRequest, res: Response) {
    const { name, email } = req.body as z.infer<typeof updateProfileSchema>;
    const userId = req.user!.userId;

    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email, id: { not: userId } },
      });
      if (existing) throw new AppError('Email already in use.', 409);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { ...(name && { name }), ...(email && { email, emailVerified: false }) },
      select: USER_SELECT,
    });
    return res.json({ ok: true, data: { user } });
  },

  async uploadAvatar(req: AuthRequest, res: Response) {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) throw new AppError('No file uploaded.', 400);

    const avatarUrl = await storageService.uploadFile(file, 'avatars');
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatarUrl },
      select: USER_SELECT,
    });
    return res.json({ ok: true, data: { user } });
  },

  async changePassword(req: AuthRequest, res: Response) {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
    const dbUser = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!dbUser) throw new AppError('User not found.', 404);

    const match = await bcrypt.compare(currentPassword, dbUser.password);
    if (!match) throw new AppError('Current password is incorrect.', 401);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: dbUser.id }, data: { password: hashed } });
    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({ where: { userId: dbUser.id } });
    return res.json({ ok: true, data: { message: 'Password updated. Please log in again.' } });
  },

  async getMyStats(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const [completed, earnings, pendingPayout, activeCount] = await Promise.all([
      prisma.task.count({ where: { assignedTo: userId, status: 'COMPLETED' } }),
      prisma.payout.aggregate({ where: { userId, status: 'PAID' }, _sum: { amount: true } }),
      prisma.payout.aggregate({ where: { userId, status: { in: ['PENDING', 'PROCESSING'] } }, _sum: { amount: true } }),
      prisma.task.count({ where: { assignedTo: userId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED'] } } }),
    ]);
    return res.json({
      ok: true,
      data: {
        tasksCompleted: completed,
        totalEarned: earnings._sum.amount ?? 0,
        pendingPayout: pendingPayout._sum.amount ?? 0,
        activeTasks: activeCount,
      },
    });
  },

  async getMySubmissions(req: AuthRequest, res: Response) {
    const submissions = await prisma.submission.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { task: { select: { id: true, title: true, payout: true } } },
    });
    return res.json({ ok: true, data: { submissions } });
  },

  async getMyNotifications(req: AuthRequest, res: Response) {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return res.json({ ok: true, data: { notifications } });
  },

  async markNotificationRead(req: AuthRequest, res: Response) {
    const { id } = req.params;
    await prisma.notification.updateMany({
      where: { id, userId: req.user!.userId },
      data: { read: true },
    });
    return res.json({ ok: true });
  },

  async markAllNotificationsRead(req: AuthRequest, res: Response) {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, read: false },
      data: { read: true },
    });
    return res.json({ ok: true });
  },

  async getMonthlyEarnings(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const payouts = await prisma.payout.findMany({
      where: { userId, status: 'PAID', createdAt: { gte: sixMonthsAgo } },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by year-month
    const monthly: Record<string, number> = {};
    payouts.forEach(p => {
      const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, '0')}`;
      monthly[key] = (monthly[key] ?? 0) + p.amount;
    });

    return res.json({ ok: true, data: { monthly } });
  },
};
