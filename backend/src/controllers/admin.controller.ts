import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';

export const updateUserSchema = z.object({
  role: z.enum(['WORKER', 'ADMIN']).optional(),
  active: z.boolean().optional(),
});

export const adminController = {
  async getUsers(_req: AuthRequest, res: Response) {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        avatarUrl: true,
        stripeId: true,
        active: true,
        createdAt: true,
        _count: { select: { tasks: true, submissions: true, payouts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ ok: true, data: { users } });
  },

  async updateUser(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const body = req.body as z.infer<typeof updateUserSchema>;

    if (id === req.user!.userId) throw new AppError('Cannot modify your own admin account here.', 400);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppError('User not found.', 404);

    const updated = await prisma.user.update({
      where: { id },
      data: body,
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    return res.json({ ok: true, data: { user: updated } });
  },

  async getAnalytics(_req: AuthRequest, res: Response) {
    const [
      totalTasks,
      tasksByStatus,
      totalPaid,
      totalUsers,
      topWorkers,
      tasksByCategory,
    ] = await Promise.all([
      prisma.task.count(),
      prisma.task.groupBy({ by: ['status'], _count: true }),
      prisma.payout.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
      prisma.user.count({ where: { role: 'WORKER', active: true } }),
      prisma.payout.groupBy({
        by: ['userId'],
        where: { status: 'PAID' },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      prisma.task.groupBy({ by: ['category'], _count: true, orderBy: { _count: { category: 'desc' } } }),
    ]);

    // Enrich top workers with names
    const workerIds = topWorkers.map(w => w.userId);
    const workerNames = await prisma.user.findMany({
      where: { id: { in: workerIds } },
      select: { id: true, name: true, email: true },
    });
    const nameMap = Object.fromEntries(workerNames.map(w => [w.id, w]));
    const enrichedWorkers = topWorkers.map(w => ({
      ...nameMap[w.userId],
      totalEarned: w._sum.amount ?? 0,
    }));

    return res.json({
      ok: true,
      data: {
        totalTasks,
        tasksByStatus: Object.fromEntries(tasksByStatus.map(s => [s.status, s._count])),
        totalPaidOut: totalPaid._sum.amount ?? 0,
        totalWorkers: totalUsers,
        topWorkers: enrichedWorkers,
        tasksByCategory: tasksByCategory.map(c => ({ category: c.category, count: c._count })),
      },
    });
  },

  async getAllSubmissions(req: AuthRequest, res: Response) {
    const { taskId } = req.query as { taskId?: string };
    const where = taskId ? { taskId } : {};
    const submissions = await prisma.submission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true, payout: true } },
      },
    });
    return res.json({ ok: true, data: { submissions } });
  },

  async getAllPayouts(_req: AuthRequest, res: Response) {
    const payouts = await prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true, stripeId: true } } },
    });
    return res.json({ ok: true, data: { payouts } });
  },
};
