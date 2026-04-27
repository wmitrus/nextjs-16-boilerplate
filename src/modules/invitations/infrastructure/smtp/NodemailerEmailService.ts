import nodemailer from 'nodemailer';

import {
  escapeHtml,
  formatEmailDate,
  sanitizeEmailHeaderValue,
  validateUrlForEmail,
} from '@/shared/lib/security/email-safety';

import type {
  EmailService,
  SendInvitationEmailInput,
  SendPasswordResetEmailInput,
  SendVerificationEmailInput,
  SendWaitlistConfirmationEmailInput,
  SendWaitlistRejectionEmailInput,
} from '../../domain/EmailService';

export interface NodemailerEmailServiceConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly pass: string;
  readonly fromEmail: string;
}

export class NodemailerEmailService implements EmailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly fromEmail: string;

  constructor(config: NodemailerEmailServiceConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
    this.fromEmail = config.fromEmail;
  }

  async sendInvitationEmail(input: SendInvitationEmailInput): Promise<void> {
    const invitedBy = input.invitedByName ?? 'Someone';
    const safeOrganizationName = sanitizeEmailHeaderValue(
      input.organizationName,
    );
    await this.transporter.sendMail({
      from: this.fromEmail,
      to: input.to,
      subject: `You've been invited to join ${safeOrganizationName}`,
      html: buildInvitationHtml({
        organizationName: safeOrganizationName,
        invitedByName: invitedBy,
        inviteUrl: input.inviteUrl,
        expiresAt: input.expiresAt,
      }),
    });
  }

  async sendVerificationEmail(
    input: SendVerificationEmailInput,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromEmail,
      to: input.to,
      subject: 'Verify your email address',
      html: buildVerificationHtml({ verifyUrl: input.verifyUrl }),
    });
  }

  async sendPasswordResetEmail(
    input: SendPasswordResetEmailInput,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromEmail,
      to: input.to,
      subject: 'Reset your password',
      html: buildPasswordResetHtml({ resetUrl: input.resetUrl }),
    });
  }

  async sendWaitlistConfirmationEmail(
    input: SendWaitlistConfirmationEmailInput,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromEmail,
      to: input.to,
      subject: "You're on the waitlist!",
      html: buildWaitlistConfirmationHtml({ name: input.name }),
    });
  }

  async sendWaitlistRejectionEmail(
    input: SendWaitlistRejectionEmailInput,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromEmail,
      to: input.to,
      subject: 'Update on your waitlist application',
      html: buildWaitlistRejectionHtml({ name: input.name }),
    });
  }
}

function buildVerificationHtml({ verifyUrl }: { verifyUrl: string }): string {
  const safeVerifyUrl = validateUrlForEmail(verifyUrl);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Verify your email</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Verify your email address</h2>
  <p>Click the button below to verify your email and activate your account.</p>
  <p>
    <a href="${safeVerifyUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
      Verify Email
    </a>
  </p>
  <p style="color:#6b7280;font-size:14px">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
  <p style="color:#6b7280;font-size:12px">If the button does not work, copy this URL into your browser:<br>${safeVerifyUrl}</p>
</body>
</html>`;
}

function buildPasswordResetHtml({ resetUrl }: { resetUrl: string }): string {
  const safeResetUrl = validateUrlForEmail(resetUrl);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Reset your password</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Reset your password</h2>
  <p>We received a request to reset your password. Click the button below to choose a new password.</p>
  <p>
    <a href="${safeResetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
      Reset Password
    </a>
  </p>
  <p style="color:#6b7280;font-size:14px">This link expires in 15 minutes. If you did not request a password reset, you can ignore this email.</p>
  <p style="color:#6b7280;font-size:12px">If the button does not work, copy this URL into your browser:<br>${safeResetUrl}</p>
</body>
</html>`;
}

function buildWaitlistConfirmationHtml({
  name,
}: {
  name: string | null;
}): string {
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
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
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
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
  const safeOrganizationName = escapeHtml(organizationName);
  const safeInvitedByName = escapeHtml(invitedByName);
  const safeInviteUrl = validateUrlForEmail(inviteUrl);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invitation to ${safeOrganizationName}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>You've been invited to join ${safeOrganizationName}</h2>
  <p>${safeInvitedByName} has invited you to join <strong>${safeOrganizationName}</strong>.</p>
  <p>
    <a href="${safeInviteUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
      Accept Invitation
    </a>
  </p>
  <p style="color:#6b7280;font-size:14px">This invitation expires on ${formatEmailDate(expiresAt)}.</p>
  <p style="color:#6b7280;font-size:12px">If the button does not work, copy this URL into your browser:<br>${safeInviteUrl}</p>
</body>
</html>`;
}
