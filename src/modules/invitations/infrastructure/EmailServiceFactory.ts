import type { EmailService } from '../domain/EmailService';

import { NoOpEmailService } from './NoOpEmailService';
import { ResendEmailService } from './resend/ResendEmailService';
import { NodemailerEmailService } from './smtp/NodemailerEmailService';

export interface EmailServiceFactoryOptions {
  provider: 'none' | 'resend' | 'smtp';
  resendApiKey?: string;
  resendFromEmail?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFromEmail?: string;
}

export function createEmailService(
  opts: EmailServiceFactoryOptions,
): EmailService {
  switch (opts.provider) {
    case 'resend': {
      if (!opts.resendApiKey) {
        throw new Error(
          '[email] EMAIL_PROVIDER=resend requires RESEND_API_KEY to be set.',
        );
      }
      if (!opts.resendFromEmail) {
        throw new Error(
          '[email] EMAIL_PROVIDER=resend requires RESEND_FROM_EMAIL to be set.',
        );
      }
      return new ResendEmailService({
        apiKey: opts.resendApiKey,
        fromEmail: opts.resendFromEmail,
      });
    }

    case 'smtp': {
      if (!opts.smtpHost) {
        throw new Error(
          '[email] EMAIL_PROVIDER=smtp requires SMTP_HOST to be set.',
        );
      }
      if (!opts.smtpUser) {
        throw new Error(
          '[email] EMAIL_PROVIDER=smtp requires SMTP_USER to be set.',
        );
      }
      if (!opts.smtpPass) {
        throw new Error(
          '[email] EMAIL_PROVIDER=smtp requires SMTP_PASS to be set.',
        );
      }
      if (!opts.smtpFromEmail) {
        throw new Error(
          '[email] EMAIL_PROVIDER=smtp requires SMTP_FROM_EMAIL to be set.',
        );
      }
      return new NodemailerEmailService({
        host: opts.smtpHost,
        port: opts.smtpPort ?? 587,
        secure: opts.smtpSecure ?? false,
        user: opts.smtpUser,
        pass: opts.smtpPass,
        fromEmail: opts.smtpFromEmail,
      });
    }

    default:
      return new NoOpEmailService();
  }
}
