import { Resend } from 'resend';
import logger from './logger.util';

function getFrontendBaseUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:4200')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
}

function getBackendBaseUrl(): string {
  return (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`)
    .trim()
    .replace(/\/+$/, '');
}

export async function sendConfirmationEmail(email: string, token: string) {
  const confirmUrl = `${getBackendBaseUrl()}/api/auth/confirm-email/${token}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <h1 style="font-size:22px;margin-bottom:12px">Confirm your EASEContent account</h1>
      <p style="line-height:1.6">Welcome to <strong>EASEContent</strong>. Confirm your email address to activate your workspace.</p>
      <p style="margin:24px 0">
        <a href="${confirmUrl}" style="background:#4f46e5;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">
          Confirm Email
        </a>
      </p>
      <p style="font-size:12px;color:#64748b">Or open this link: ${confirmUrl}</p>
    </div>
  `;

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is required to send confirmation emails in production.');
    }
    logger.warn('RESEND_API_KEY not configured; skipping confirmation email delivery in non-production.', {
      email,
      confirmUrl,
    });
    return { skipped: true };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'EASEContent <onboarding@resend.dev>',
    to: email,
    subject: 'Confirm your EASEContent email',
    html,
  });

  if (result.error) {
    throw new Error(`Confirmation email could not be sent: ${result.error.message}`);
  }
  return result;
}

export async function sendForgotPasswordEmail(email: string, token: string) {
  const resetUrl = `${getFrontendBaseUrl()}/#/auth/reset-password?token=${encodeURIComponent(token)}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <h1 style="font-size:22px;margin-bottom:12px">Reset your EASEContent password</h1>
      <p style="line-height:1.6">We received a request to reset your EASEContent password.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#4f46e5;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">
          Reset Password
        </a>
      </p>
      <p style="font-size:12px;color:#64748b">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is required to send password reset emails in production.');
    }
    logger.warn('RESEND_API_KEY not configured; skipping password reset email delivery in non-production.', {
      email,
      resetUrl,
    });
    return { skipped: true };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'EASEContent <onboarding@resend.dev>',
    to: email,
    subject: 'Reset your EASEContent password',
    html,
  });

  if (result.error) {
    throw new Error(`Password reset email could not be sent: ${result.error.message}`);
  }
  return result;
}
