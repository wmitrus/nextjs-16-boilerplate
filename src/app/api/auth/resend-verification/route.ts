import { createHash, randomBytes } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';
import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getFieldErrors } from '@/shared/lib/api/field-errors';
import {
  createServerErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
} from '@/shared/lib/api/response-service';
import { getIP } from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';

import {
  emailVerificationTokensTable,
  userCredentialsTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';

const resendSchema = z.object({
  email: z.email('Invalid email address'),
});

const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const RESEND_PATH = '/api/auth/resend-verification';

const SAFE_RESPONSE = {
  message:
    'If verification delivery is enabled and the account exists, a new verification step has been created.',
};

function generateVerificationToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

export async function POST(request: Request): Promise<Response> {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    return createServerErrorResponse(
      'Not available for the current auth provider',
      404,
      'PROVIDER_UNAVAILABLE',
    );
  }

  const ip = await getIP(new Headers(request.headers));
  const rateLimitResult = await checkRateLimit(`resend-verification:${ip}`, {
    path: RESEND_PATH,
  });

  if (!rateLimitResult.success) {
    return createServerErrorResponse(
      'Too many requests. Please wait before trying again.',
      429,
      'RATE_LIMITED',
    );
  }

  const logger = resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'authjs-resend-verification',
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createServerErrorResponse(
      'Invalid request body',
      400,
      'INVALID_BODY',
    );
  }

  const parsed = resendSchema.safeParse(body);
  if (!parsed.success) {
    return createValidationErrorResponse(getFieldErrors(parsed.error), 422);
  }

  const { email } = parsed.data;

  try {
    const db = getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);

    const [credRecord] = await db
      .select({
        userId: userCredentialsTable.userId,
        emailVerified: userCredentialsTable.emailVerified,
      })
      .from(userCredentialsTable)
      .where(eq(userCredentialsTable.email, email))
      .limit(1);

    if (!credRecord || credRecord.emailVerified) {
      return createSuccessResponse(SAFE_RESPONSE);
    }

    const { rawToken, tokenHash } = generateVerificationToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS);

    await db.transaction(async (tx) => {
      await tx
        .delete(emailVerificationTokensTable)
        .where(
          and(
            eq(emailVerificationTokensTable.userId, credRecord.userId),
            isNull(emailVerificationTokensTable.usedAt),
          ),
        );

      await tx.insert(emailVerificationTokensTable).values({
        userId: credRecord.userId,
        tokenHash,
        expiresAt,
      });
    });

    const verifyUrl = `${env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/verify-email?token=${rawToken}`;
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
      await emailService.sendVerificationEmail({ to: email, verifyUrl });
    } catch (emailErr) {
      const emailError =
        emailErr instanceof Error ? emailErr : new Error(String(emailErr));
      logger.error(
        {
          event: 'auth:resend_email_send_error',
          errorMessage: emailError.message,
          errorName: emailError.name,
        },
        'Failed to send verification email on resend',
      );
    }

    logger.debug(
      { event: 'auth:verification_token_resent', userId: credRecord.userId },
      'Verification token regenerated',
    );

    if (
      env.NODE_ENV !== 'production' &&
      env.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV === true
    ) {
      const devVerifyUrl = `${env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/verify-email?token=${rawToken}`;
      logger.warn(
        { event: 'auth:verification_token_dev_exposed', devVerifyUrl },
        '[DEV ONLY] Verification token exposed on resend — never enable AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV in production',
      );
      return createSuccessResponse({
        ...SAFE_RESPONSE,
        devToken: rawToken,
        devVerifyUrl,
      });
    }

    return createSuccessResponse(SAFE_RESPONSE);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        event: 'auth:resend_verification_error',
        errorMessage: error.message,
        errorName: error.name,
      },
      'Resend verification error',
    );
    return createSuccessResponse(SAFE_RESPONSE);
  }
}
