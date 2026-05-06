export interface SendInvitationEmailInput {
  readonly to: string;
  readonly organizationName: string;
  readonly invitedByName: string | null;
  readonly inviteUrl: string;
  readonly expiresAt: Date;
}

export interface SendVerificationEmailInput {
  readonly to: string;
  readonly verifyUrl: string;
}

export interface SendPasswordResetEmailInput {
  readonly to: string;
  readonly resetUrl: string;
}

export interface SendWaitlistConfirmationEmailInput {
  readonly to: string;
  readonly name: string | null;
}

export interface SendWaitlistRejectionEmailInput {
  readonly to: string;
  readonly name: string | null;
}

/**
 * Provider-agnostic email delivery abstraction.
 *
 * Implementations:
 * - NoOpEmailService: dev stub (logs to console, no real send)
 * - ResendEmailService: Resend API (EMAIL_PROVIDER=resend)
 * - NodemailerEmailService: SMTP transport (EMAIL_PROVIDER=smtp)
 *
 * When AUTH_PROVIDER=clerk, invitation emails are sent via Clerk's API
 * (ClerkInvitationBridge), so EmailService is not called for invitation delivery.
 */
export interface EmailService {
  sendInvitationEmail(input: SendInvitationEmailInput): Promise<void>;
  sendVerificationEmail(input: SendVerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void>;
  sendWaitlistConfirmationEmail(
    input: SendWaitlistConfirmationEmailInput,
  ): Promise<void>;
  sendWaitlistRejectionEmail(
    input: SendWaitlistRejectionEmailInput,
  ): Promise<void>;
}
