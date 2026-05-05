import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';
import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getIP } from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';

import { passwordResetTokensTable } from '@/modules/auth/infrastructure/drizzle/schema';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

const forgotPasswordSchema = z.object({
  email: z.email('Invalid email address'),
});

const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const FORGOT_PASSWORD_PATH = '/api/auth/forgot-password';
const SAFE_RESPONSE = {
  message: 'If an account with this email exists, a reset link has been sent.',
};

function generateResetToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

export async function POST(request: Request): Promise<Response> {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    return Response.json(
      { error: 'Not available for the current auth provider' },
      { status: 404 },
    );
  }

  const ip = await getIP(new Headers(request.headers));
  const rateLimitResult = await checkRateLimit(`forgot-password:${ip}`, {
    path: FORGOT_PASSWORD_PATH,
  });

  if (!rateLimitResult.success) {
    return Response.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429 },
    );
  }

  const logger = resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'authjs-forgot-password',
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Validation failed',
        details: parsed.error.issues.map((i) => i.message),
      },
      { status: 422 },
    );
  }

  const { email } = parsed.data;

  try {
    const db = getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user) {
      return Response.json(SAFE_RESPONSE, { status: 200 });
    }

    const { rawToken, tokenHash } = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await db.transaction(async (tx) => {
      await tx
        .delete(passwordResetTokensTable)
        .where(
          and(
            eq(passwordResetTokensTable.userId, user.id),
            isNull(passwordResetTokensTable.usedAt),
            gt(passwordResetTokensTable.expiresAt, new Date()),
          ),
        );

      await tx.insert(passwordResetTokensTable).values({
        userId: user.id,
        tokenHash,
        expiresAt,
      });
    });

    logger.debug(
      { event: 'auth:reset_token_created', userId: user.id },
      'Password reset token generated',
    );

    if (
      env.NODE_ENV !== 'production' &&
      env.AUTH_EXPOSE_RESET_TOKEN_IN_DEV === true
    ) {
      const devResetUrl = `${env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/reset-password?token=${rawToken}`;
      logger.warn(
        { event: 'auth:reset_token_dev_exposed', devResetUrl },
        '[DEV ONLY] Password reset token exposed — never enable AUTH_EXPOSE_RESET_TOKEN_IN_DEV in production',
      );
      return Response.json(
        { ...SAFE_RESPONSE, devToken: rawToken, devResetUrl },
        { status: 200 },
      );
    }

    const resetUrl = `${env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/reset-password?token=${rawToken}`;
    const emailService = createEmailService({
      provider: env.EMAIL_PROVIDER,
      resendApiKey: env.RESEND_API_KEY,
      resendFromEmail: env.RESEND_FROM_EMAIL,
      smtpHost: env.SMTP_HOST,
      smtpPort: env.SMTP_PORT,
      smtpSecure: env.SMTP_SECURE,
      smtpUser: env.SMTP_USER,
      smtpPass: env.SMTP_PASS,
      smtpFromEmail: env.SMTP_FROM_EMAIL,
    });

    try {
      await emailService.sendPasswordResetEmail({ to: email, resetUrl });
    } catch (emailErr) {
      const emailError =
        emailErr instanceof Error ? emailErr : new Error(String(emailErr));
      logger.error(
        {
          event: 'auth:reset_email_send_error',
          errorMessage: emailError.message,
          errorName: emailError.name,
        },
        'Failed to send password reset email',
      );
    }

    return Response.json(SAFE_RESPONSE, { status: 200 });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const cause = error.cause instanceof Error ? error.cause : undefined;
    resolveServerLogger()
      .child({
        type: 'API',
        category: 'auth',
        module: 'authjs-forgot-password',
      })
      .error(
        {
          event: 'auth:reset_token_error',
          errorMessage: error.message,
          errorName: error.name,
          ...(cause && { causeMessage: cause.message, causeName: cause.name }),
        },
        'Password reset token generation error',
      );

    return Response.json(SAFE_RESPONSE, { status: 200 });
  }
}
