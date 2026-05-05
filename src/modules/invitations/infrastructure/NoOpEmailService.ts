import { createHash } from 'node:crypto';

import { resolveServerLogger } from '@/core/logger/di';

import type {
  EmailService,
  SendInvitationEmailInput,
  SendPasswordResetEmailInput,
  SendVerificationEmailInput,
  SendWaitlistConfirmationEmailInput,
  SendWaitlistRejectionEmailInput,
} from '../domain/EmailService';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'email',
  module: 'noop-email-service',
});

let hasWarnedAboutNoOp = false;

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return '[invalid-email]';
  }
  return `${localPart.slice(0, 1)}***@${domain}`;
}

function summarizeLink(url: string): {
  path: string;
  tokenHash: string;
  tokenLength?: number;
} {
  const parsed = new URL(url);
  const token =
    parsed.searchParams.get('token') ??
    parsed.pathname.split('/').filter(Boolean).at(-1);

  return {
    path: parsed.pathname,
    tokenHash: createHash('sha256').update(url).digest('hex').slice(0, 12),
    ...(token ? { tokenLength: token.length } : {}),
  };
}

/**
 * No-op email service for development and environments without email config.
 * Logs email details to stdout instead of sending.
 *
 * Replace with ResendEmailService or NodemailerEmailService via EMAIL_PROVIDER.
 */
export class NoOpEmailService implements EmailService {
  constructor() {
    if (!hasWarnedAboutNoOp) {
      logger.warn(
        {
          event: 'email:noop_provider_active',
          nodeEnv: process.env.NODE_ENV,
        },
        'NoOpEmailService is active — outbound email delivery is disabled',
      );
      hasWarnedAboutNoOp = true;
    }
  }

  async sendInvitationEmail(input: SendInvitationEmailInput): Promise<void> {
    logger.debug(
      {
        event: 'email:invitation:noop',
        emailPreview: maskEmail(input.to),
        organization: input.organizationName,
        inviteLink: summarizeLink(input.inviteUrl),
        expiresAt: input.expiresAt.toISOString(),
      },
      'Invitation email suppressed by NoOpEmailService',
    );
  }

  async sendVerificationEmail(
    input: SendVerificationEmailInput,
  ): Promise<void> {
    logger.debug(
      {
        event: 'email:verification:noop',
        emailPreview: maskEmail(input.to),
        verifyLink: summarizeLink(input.verifyUrl),
      },
      'Verification email suppressed by NoOpEmailService',
    );
  }

  async sendPasswordResetEmail(
    input: SendPasswordResetEmailInput,
  ): Promise<void> {
    logger.debug(
      {
        event: 'email:password_reset:noop',
        emailPreview: maskEmail(input.to),
        resetLink: summarizeLink(input.resetUrl),
      },
      'Password reset email suppressed by NoOpEmailService',
    );
  }

  async sendWaitlistConfirmationEmail(
    input: SendWaitlistConfirmationEmailInput,
  ): Promise<void> {
    logger.debug(
      {
        event: 'email:waitlist_confirmation:noop',
        emailPreview: maskEmail(input.to),
        hasName: Boolean(input.name),
      },
      'Waitlist confirmation email suppressed by NoOpEmailService',
    );
  }

  async sendWaitlistRejectionEmail(
    input: SendWaitlistRejectionEmailInput,
  ): Promise<void> {
    logger.debug(
      {
        event: 'email:waitlist_rejection:noop',
        emailPreview: maskEmail(input.to),
        hasName: Boolean(input.name),
      },
      'Waitlist rejection email suppressed by NoOpEmailService',
    );
  }
}
