import { resolveServerLogger } from '@/core/logger/di';

import { maskEmail } from '@/shared/lib/security/email-safety';

import type {
  EmailService,
  SendInvitationEmailInput,
  SendPasswordResetEmailInput,
  SendVerificationEmailInput,
  SendWaitlistConfirmationEmailInput,
  SendWaitlistRejectionEmailInput,
} from '../domain/EmailService';

/**
 * No-op email service for development and environments without email config.
 * Logs redacted metadata instead of sending.
 *
 * Replace with ResendEmailService or NodemailerEmailService via EMAIL_PROVIDER.
 */
export class NoOpEmailService implements EmailService {
  private readonly logger = resolveServerLogger().child({
    type: 'API',
    category: 'invitations',
    module: 'noop-email-service',
  });

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        { event: 'email:noop:production' },
        'NoOpEmailService instantiated in production — verify email provider selection',
      );
    }
  }

  async sendInvitationEmail(input: SendInvitationEmailInput): Promise<void> {
    this.logger.info(
      {
        event: 'email:noop:invitation',
        recipientPreview: maskEmail(input.to),
        organizationName: input.organizationName,
        expiresAt: input.expiresAt.toISOString(),
      },
      'Invitation email skipped by NoOpEmailService',
    );
  }

  async sendVerificationEmail(
    input: SendVerificationEmailInput,
  ): Promise<void> {
    this.logger.info(
      {
        event: 'email:noop:verification',
        recipientPreview: maskEmail(input.to),
      },
      'Verification email skipped by NoOpEmailService',
    );
  }

  async sendPasswordResetEmail(
    input: SendPasswordResetEmailInput,
  ): Promise<void> {
    this.logger.info(
      {
        event: 'email:noop:password_reset',
        recipientPreview: maskEmail(input.to),
      },
      'Password reset email skipped by NoOpEmailService',
    );
  }

  async sendWaitlistConfirmationEmail(
    input: SendWaitlistConfirmationEmailInput,
  ): Promise<void> {
    this.logger.info(
      {
        event: 'email:noop:waitlist_confirmation',
        recipientPreview: maskEmail(input.to),
      },
      'Waitlist confirmation email skipped by NoOpEmailService',
    );
  }

  async sendWaitlistRejectionEmail(
    input: SendWaitlistRejectionEmailInput,
  ): Promise<void> {
    this.logger.info(
      {
        event: 'email:noop:waitlist_rejection',
        recipientPreview: maskEmail(input.to),
      },
      'Waitlist rejection email skipped by NoOpEmailService',
    );
  }
}
