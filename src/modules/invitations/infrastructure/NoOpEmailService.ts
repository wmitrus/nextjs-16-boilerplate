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
 * Logs email details to stdout instead of sending.
 *
 * Replace with ResendEmailService or NodemailerEmailService via EMAIL_PROVIDER.
 */
export class NoOpEmailService implements EmailService {
  async sendInvitationEmail(input: SendInvitationEmailInput): Promise<void> {
    console.info('[NoOpEmailService] Invitation email (not sent):', {
      to: input.to,
      organization: input.organizationName,
      inviteUrl: input.inviteUrl,
      expiresAt: input.expiresAt.toISOString(),
    });
  }

  async sendVerificationEmail(
    input: SendVerificationEmailInput,
  ): Promise<void> {
    console.info('[NoOpEmailService] Verification email (not sent):', {
      to: input.to,
      verifyUrl: input.verifyUrl,
    });
  }

  async sendPasswordResetEmail(
    input: SendPasswordResetEmailInput,
  ): Promise<void> {
    console.info('[NoOpEmailService] Password reset email (not sent):', {
      to: input.to,
      resetUrl: input.resetUrl,
    });
  }

  async sendWaitlistConfirmationEmail(
    input: SendWaitlistConfirmationEmailInput,
  ): Promise<void> {
    console.info('[NoOpEmailService] Waitlist confirmation email (not sent):', {
      to: input.to,
      name: input.name,
    });
  }

  async sendWaitlistRejectionEmail(
    input: SendWaitlistRejectionEmailInput,
  ): Promise<void> {
    console.info('[NoOpEmailService] Waitlist rejection email (not sent):', {
      to: input.to,
      name: input.name,
    });
  }
}
