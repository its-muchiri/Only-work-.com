import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { emitToAll, emitToUser } from '../lib/socket';
import { AppError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import { storageService } from '../services/storage.service';
import { emailService } from '../services/email.service';

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  category: z.string().min(1).max(80),
  payout: z.coerce.number().positive(),
  deadline: z.string().refine(d => !isNaN(Date.parse(d)), 'Invalid date'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  category: z.string().min(1).max(80).optional(),
  payout: z.coerce.number().positive().optional(),
  deadline: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'CANCELLED']).optional(),
});

export const submitSchema = z.object({
  content: z.string().min(1, 'Submission content is required'),
});

export const reviewSchema = z.object({
  submissionId: z.string().min(1),
  status: z.enum(['APPROVED', 'REJECTED']),
  feedback: z.string().optional(),
});

const TASK_INCLUDE = {
  worker: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { submissions: true } },
};

export const tasksController = {
  async getAll(req: AuthRequest, res: Response) {
    const { category, priority, search, status, page = '1', limit = '10' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (!req.user) {
      where.status = 'OPEN';
    } else if (req.user.role !== 'ADMIN') {
      where.status = status || 'OPEN';
    } else if (status) {
      where.status = status;
    }

    if (category) where.category = { equals: category, mode: 'insensitive' };
    if (priority) where.priority = priority;

    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        include: TASK_INCLUDE,
      }),
      prisma.task.count({ where }),
    ]);

    return res.json({
      ok: true,
      data: {
        tasks,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      },
    });
  },

  async getOne(req: Request, res: Response) {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        ...TASK_INCLUDE,
        submissions: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
    });
    if (!task) throw new AppError('Task not found.', 404);
    return res.json({ ok: true, data: { task } });
  },

  async getMyTasks(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const tasks = await prisma.task.findMany({
      where: { assignedTo: userId, status: { notIn: ['CANCELLED'] } },
      orderBy: { updatedAt: 'desc' },
      include: TASK_INCLUDE,
    });
    return res.json({ ok: true, data: { tasks } });
  },

  async create(req: AuthRequest, res: Response) {
    const body = req.body as z.infer<typeof createTaskSchema>;
    const file = (req as Request & { file?: Express.Multer.File }).file;

    let attachmentUrl: string | undefined;
    if (file) attachmentUrl = await storageService.uploadFile(file, 'task-attachments');

    const task = await prisma.task.create({
      data: {
        title: body.title,
        description: body.description,
        category: body.category,
        payout: body.payout,
        deadline: new Date(body.deadline),
        priority: body.priority || 'MEDIUM',
        createdBy: req.user!.userId,
        attachmentUrl,
      },
      include: TASK_INCLUDE,
    });

    emitToAll('task_created', { task });
    return res.status(201).json({ ok: true, data: { task } });
  },

  async update(req: AuthRequest, res: Response) {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Task not found.', 404);

    const body = req.body as z.infer<typeof updateTaskSchema>;
    const data: Record<string, unknown> = { ...body };
    if (body.deadline) data.deadline = new Date(body.deadline);

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data,
      include: TASK_INCLUDE,
    });
    return res.json({ ok: true, data: { task } });
  },

  async cancel(req: AuthRequest, res: Response) {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Task not found.', 404);

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
      include: TASK_INCLUDE,
    });
    emitToAll('task_cancelled', { taskId: task.id });
    return res.json({ ok: true, data: { task } });
  },

  async claim(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw new AppError('Task not found.', 404);
    if (task.status !== 'OPEN') throw new AppError('This task is no longer available.', 409);

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: { status: 'ASSIGNED', assignedTo: userId },
      include: TASK_INCLUDE,
    });

    const [worker, admins] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { email: true } }),
    ]);

    await prisma.notification.create({
      data: {
        userId,
        message: `You claimed the task: "${task.title}"`,
        link: `task-detail.html?id=${task.id}`,
      },
    });

    emitToAll('task_claimed', { taskId: task.id, workerId: userId, workerName: worker?.name });
    admins.forEach(a =>
      emailService.sendTaskClaimedEmail(a.email, worker?.name ?? userId, task.title).catch(console.error),
    );

    return res.json({ ok: true, data: { task: updated } });
  },

  async submit(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const { content } = req.body as z.infer<typeof submitSchema>;
    const file = (req as Request & { file?: Express.Multer.File }).file;

    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw new AppError('Task not found.', 404);
    if (task.assignedTo !== userId) throw new AppError('This task is not assigned to you.', 403);
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(task.status)) {
      throw new AppError('Cannot submit work for this task in its current state.', 409);
    }

    let attachmentUrl: string | undefined;
    if (file) attachmentUrl = await storageService.uploadFile(file, 'submissions');

    const [submission] = await prisma.$transaction([
      prisma.submission.create({ data: { taskId: task.id, userId, content, attachmentUrl } }),
      prisma.task.update({ where: { id: task.id }, data: { status: 'SUBMITTED' } }),
    ]);

    const [worker, admins] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { email: true } }),
    ]);

    emitToAll('task_submitted', { taskId: task.id, submissionId: submission.id, workerId: userId });
    admins.forEach(a =>
      emailService.sendSubmissionReceivedEmail(a.email, worker?.name ?? userId, task.title).catch(console.error),
    );

    return res.status(201).json({ ok: true, data: { submission } });
  },

  async review(req: AuthRequest, res: Response) {
    const { submissionId, status, feedback } = req.body as z.infer<typeof reviewSchema>;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        task: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });
    if (!submission || submission.taskId !== req.params.id) {
      throw new AppError('Submission not found.', 404);
    }

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: { status, feedback: feedback ?? null },
    });

    if (status === 'APPROVED') {
      await prisma.task.update({ where: { id: submission.taskId }, data: { status: 'COMPLETED' } });
      await prisma.payout.create({
        data: { userId: submission.userId, amount: submission.task.payout, taskId: submission.taskId, status: 'PENDING' },
      });
      await prisma.notification.create({
        data: {
          userId: submission.userId,
          message: `Your work on "${submission.task.title}" was approved! $${submission.task.payout.toFixed(2)} payout pending.`,
          link: `task-detail.html?id=${submission.taskId}`,
        },
      });
      emitToUser(submission.userId, 'task_approved', { taskId: submission.taskId, payout: submission.task.payout });
      emailService
        .sendSubmissionApprovedEmail(submission.user.email, submission.user.name, submission.task.title, submission.task.payout)
        .catch(console.error);
    } else {
      await prisma.task.update({ where: { id: submission.taskId }, data: { status: 'IN_PROGRESS' } });
      await prisma.notification.create({
        data: {
          userId: submission.userId,
          message: `Revision requested on "${submission.task.title}". ${feedback ?? ''}`,
          link: `task-detail.html?id=${submission.taskId}`,
        },
      });
      emitToUser(submission.userId, 'task_rejected', { taskId: submission.taskId, feedback });
      emailService
        .sendSubmissionRejectedEmail(submission.user.email, submission.user.name, submission.task.title, feedback ?? '')
        .catch(console.error);
    }

    return res.json({ ok: true, data: { submission: updated } });
  },
};
