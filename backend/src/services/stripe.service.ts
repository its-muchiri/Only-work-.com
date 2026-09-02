import Stripe from 'stripe';
import { config } from '../config';
import { AppError } from '../utils/errors';

const stripe = config.STRIPE_SECRET_KEY
  ? new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' as any })
  : null;

function requireStripe(): Stripe {
  if (!stripe) throw new AppError('Stripe is not configured on this server.', 503);
  return stripe;
}

export const stripeService = {
  async createConnectAccount(email: string) {
    const s = requireStripe();
    return s.accounts.create({
      type: 'express',
      email,
      capabilities: { transfers: { requested: true } },
    });
  },

  async createAccountLink(accountId: string, refreshUrl: string, returnUrl: string) {
    const s = requireStripe();
    return s.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
  },

  async createTransfer(amountUsd: number, destinationAccountId: string) {
    const s = requireStripe();
    return s.transfers.create({
      amount: Math.round(amountUsd * 100), // cents
      currency: 'usd',
      destination: destinationAccountId,
    });
  },

  async constructWebhookEvent(payload: Buffer, signature: string) {
    const s = requireStripe();
    if (!config.STRIPE_WEBHOOK_SECRET) {
      throw new AppError('Stripe webhook secret not configured.', 503);
    }
    return s.webhooks.constructEvent(payload, signature, config.STRIPE_WEBHOOK_SECRET);
  },
};
