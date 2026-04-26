import { Resend } from 'resend';

import type {
  EmailService,
  SendInvitationEmailInput,
  SendPasswordResetEmailInput,
  SendVerificationEmailInput,
  SendWaitlistConfirmationEmailInput,
  SendWaitlistRejectionEmailInput,
} from '../../domain/EmailService';

export interface ResendEmailServiceConfig {
  readonly apiKey: string;
  readonly fromEmail: string;
}

export class ResendEmailService implements EmailService {
  private readonly client: Resend;
  private readonly fromEmail: string;

  constructor(config: ResendEmailServiceConfig) {
    this.client = new Resend(config.apiKey);
    this.fromEmail = config.fromEmail;
  }

  async sendInvitationEmail(input: SendInvitationEmailInput): Promise<void> {
    const invitedBy = input.invitedByName ?? 'Someone';
    const { error } = await this.client.emails.send({
      from: this.fromEmail,
      to: input.to,
      subject: `You've been invited to join ${input.organizationName}`,
      html: buildInvitationHtml({
        organizationName: input.organizationName,
        invitedByName: invitedBy,
        inviteUrl: input.inviteUrl,
        expiresAt: input.expiresAt,
      }),
    });
    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }
  }

  async sendVerificationEmail(
    input: SendVerificationEmailInput,
  ): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.fromEmail,
      to: input.to,
      subject: 'Verify your email address',
      html: buildVerificationHtml({ verifyUrl: input.verifyUrl }),
    });
    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }
  }

  async sendPasswordResetEmail(
    input: SendPasswordResetEmailInput,
  ): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.fromEmail,
      to: input.to,
      subject: 'Reset your password',
      html: buildPasswordResetHtml({ resetUrl: input.resetUrl }),
    });
    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }
  }

  async sendWaitlistConfirmationEmail(
    input: SendWaitlistConfirmationEmailInput,
  ): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.fromEmail,
      to: input.to,
      subject: "You're on the waitlist!",
      html: buildWaitlistConfirmationHtml({ name: input.name }),
    });
    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }
  }

  async sendWaitlistRejectionEmail(
    input: SendWaitlistRejectionEmailInput,
  ): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.fromEmail,
      to: input.to,
      subject: 'Update on your waitlist application',
      html: buildWaitlistRejectionHtml({ name: input.name }),
    });
    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }
  }
}

function buildVerificationHtml({ verifyUrl }: { verifyUrl: string }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Verify your email</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Verify your email address</h2>
  <p>Click the button below to verify your email and activate your account.</p>
  <p>
    <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
      Verify Email
    </a>
  </p>
  <p style="color:#6b7280;font-size:14px">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
  <p style="color:#6b7280;font-size:12px">If the button does not work, copy this URL into your browser:<br>${verifyUrl}</p>
</body>
</html>`;
}

function buildPasswordResetHtml({ resetUrl }: { resetUrl: string }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Reset your password</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Reset your password</h2>
  <p>We received a request to reset your password. Click the button below to choose a new password.</p>
  <p>
    <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
      Reset Password
    </a>
  </p>
  <p style="color:#6b7280;font-size:14px">This link expires in 15 minutes. If you did not request a password reset, you can ignore this email.</p>
  <p style="color:#6b7280;font-size:12px">If the button does not work, copy this URL into your browser:<br>${resetUrl}</p>
</body>
</html>`;
}

function buildWaitlistConfirmationHtml({
  name,
}: {
  name: string | null;
}): string {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>You're on the waitlist!</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>You're on the list!</h2>
  <p>${greeting}</p>
  <p>Thanks for joining the waitlist. We'll review your application and reach out when a spot opens up.</p>
  <p style="color:#6b7280;font-size:14px">We'll notify you at this email address when you've been approved.</p>
</body>
</html>`;
}

function buildWaitlistRejectionHtml({ name }: { name: string | null }): string {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Waitlist update</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>An update on your application</h2>
  <p>${greeting}</p>
  <p>Thank you for your interest. Unfortunately we're unable to offer you access at this time.</p>
  <p style="color:#6b7280;font-size:14px">We appreciate your patience and understanding.</p>
</body>
</html>`;
}

function buildInvitationHtml({
  organizationName,
  invitedByName,
  inviteUrl,
  expiresAt,
}: {
  organizationName: string;
  invitedByName: string;
  inviteUrl: string;
  expiresAt: Date;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invitation to ${organizationName}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>You've been invited to join ${organizationName}</h2>
  <p>${invitedByName} has invited you to join <strong>${organizationName}</strong>.</p>
  <p>
    <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
      Accept Invitation
    </a>
  </p>
  <p style="color:#6b7280;font-size:14px">This invitation expires on ${expiresAt.toLocaleDateString()}.</p>
  <p style="color:#6b7280;font-size:12px">If the button does not work, copy this URL into your browser:<br>${inviteUrl}</p>
</body>
</html>`;
}
