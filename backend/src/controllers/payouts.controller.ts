import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import { stripeService } from '../services/stripe.service';
import { emailService } from '../services/email.service';
import { emitToUser } from '../lib/socket';
import { config } from '../config';

export const processPayoutSchema = z.object({
  payoutId: z.string().min(1),
});

export const payoutsController = {
  async onboard(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found.', 404);

    let stripeAccountId = user.stripeId;
    if (!stripeAccountId) {
      const account = await stripeService.createConnectAccount(user.email);
      stripeAccountId = account.id;
      await prisma.user.update({ where: { id: userId }, data: { stripeId: stripeAccountId } });
    }

    const link = await stripeService.createAccountLink(
      stripeAccountId,
      `${config.FRONTEND_URL}/profile.html?stripe=refresh`,
      `${config.FRONTEND_URL}/profile.html?stripe=success`,
    );
    return res.json({ ok: true, data: { url: link.url } });
  },

  async onboardCallback(req: Request, res: Response) {
    // Stripe redirects here after onboarding; user data already saved via onboard()
    return res.redirect(`${config.FRONTEND_URL}/profile.html?stripe=success`);
  },

  async process(req: AuthRequest, res: Response) {
    const { payoutId } = req.body as z.infer<typeof processPayoutSchema>;

    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: { user: { select: { id: true, email: true, name: true, stripeId: true } } },
    });
    if (!payout) throw new AppError('Payout not found.', 404);
    if (payout.status !== 'PENDING') throw new AppError('Payout is not in PENDING state.', 409);
    if (!payout.user.stripeId) throw new AppError('Worker has not connected a Stripe account.', 400);

    await prisma.payout.update({ where: { id: payoutId }, data: { status: 'PROCESSING' } });

    try {
      const transfer = await stripeService.createTransfer(payout.amount, payout.user.stripeId);
      await prisma.payout.update({
        where: { id: payoutId },
        data: { status: 'PAID', stripePayoutId: transfer.id },
      });

      await prisma.notification.create({
        data: {
          userId: payout.userId,
          message: `Payout of $${payout.amount.toFixed(2)} has been processed!`,
          link: 'payout.html',
        },
      });

      emitToUser(payout.userId, 'payout_processed', { amount: payout.amount, stripeId: transfer.id });
      emailService
        .sendPayoutProcessedEmail(payout.user.email, payout.user.name, payout.amount, transfer.id)
        .catch(console.error);

      return res.json({ ok: true, data: { payout: { ...payout, status: 'PAID', stripePayoutId: transfer.id } } });
    } catch (err) {
      await prisma.payout.update({ where: { id: payoutId }, data: { status: 'FAILED' } });
      throw err;
    }
  },

  async getMyPayouts(req: AuthRequest, res: Response) {
    const payouts = await prisma.payout.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ ok: true, data: { payouts } });
  },

  async getAllPending(_req: AuthRequest, res: Response) {
    const payouts = await prisma.payout.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true, stripeId: true } } },
    });
    return res.json({ ok: true, data: { payouts } });
  },
};
