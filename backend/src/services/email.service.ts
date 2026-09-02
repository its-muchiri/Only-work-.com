import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const TEMPLATES_DIR = path.join(__dirname, '../templates');

function loadTemplate(name: string, vars: Record<string, string>): string {
  const tplPath = path.join(TEMPLATES_DIR, `${name}.html`);
  let html = fs.existsSync(tplPath) ? fs.readFileSync(tplPath, 'utf-8') : `<p>{{body}}</p>`;
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

const transporter = config.SENDGRID_API_KEY
  ? nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: config.SENDGRID_API_KEY },
    })
  : nodemailer.createTransport({ jsonTransport: true }); // dev fallback — logs to console

async function send(to: string, subject: string, html: string) {
  if (!config.SENDGRID_API_KEY) {
    console.log(`[Email DEV] To: ${to} | Subject: ${subject}`);
    return;
  }
  await transporter.sendMail({ from: config.FROM_EMAIL, to, subject, html });
}

export const emailService = {
  async sendVerificationEmail(to: string, name: string, token: string) {
    const link = `${config.FRONTEND_URL}/api/auth/verify-email/${token}`;
    const html = loadTemplate('verification', { name, link });
    await send(to, 'Verify your Onlywork email', html);
  },

  async sendPasswordResetEmail(to: string, name: string, token: string) {
    const link = `${config.FRONTEND_URL}/reset-password.html?token=${token}`;
    const html = loadTemplate('password-reset', { name, link });
    await send(to, 'Reset your Onlywork password', html);
  },

  async sendTaskClaimedEmail(adminEmail: string, workerName: string, taskTitle: string) {
    const html = `<p>Worker <strong>${workerName}</strong> claimed: <strong>${taskTitle}</strong>.</p>`;
    await send(adminEmail, `Task claimed: ${taskTitle}`, html);
  },

  async sendSubmissionReceivedEmail(adminEmail: string, workerName: string, taskTitle: string) {
    const html = `<p>Worker <strong>${workerName}</strong> submitted work for: <strong>${taskTitle}</strong>.</p>`;
    await send(adminEmail, `Submission received: ${taskTitle}`, html);
  },

  async sendSubmissionApprovedEmail(to: string, name: string, taskTitle: string, payout: number) {
    const html = loadTemplate('submission-approved', {
      name,
      taskTitle,
      payout: `$${payout.toFixed(2)}`,
    });
    await send(to, `Work approved: ${taskTitle}`, html);
  },

  async sendSubmissionRejectedEmail(to: string, name: string, taskTitle: string, feedback: string) {
    const html = loadTemplate('submission-rejected', { name, taskTitle, feedback });
    await send(to, `Revision requested: ${taskTitle}`, html);
  },

  async sendPayoutProcessedEmail(to: string, name: string, amount: number, stripeId: string) {
    const html = loadTemplate('payout-processed', {
      name,
      amount: `$${amount.toFixed(2)}`,
      stripeId,
    });
    await send(to, 'Your payout has been processed', html);
  },
};
