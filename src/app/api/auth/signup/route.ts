import { createHash, randomBytes } from 'node:crypto';

import { hash } from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
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

import {
  authUserIdentitiesTable,
  emailVerificationTokensTable,
  userCredentialsTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import {
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
} from '@/modules/invitations/domain/errors';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { NoOpEmailService } from '@/modules/invitations/infrastructure/NoOpEmailService';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

const signUpSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  invitationToken: z.string().optional(),
});

const BCRYPT_COST = 12;
const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

function isUniqueConstraintViolation(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.includes('unique constraint') ||
      ('code' in err && (err as { code?: string }).code === '23505')
    );
  }
  return false;
}

function generateVerificationToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

function resolveInvitationService(db: DrizzleDb) {
  return new DefaultInvitationService(
    new DrizzleInvitationRepository(db),
    new NoOpEmailService(),
    { appUrl: env.NEXT_PUBLIC_APP_URL ?? '' },
  );
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

  const logger = resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'authjs-signup',
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

  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    return createValidationErrorResponse(getFieldErrors(parsed.error), 422);
  }

  const { email: bodyEmail, password, invitationToken } = parsed.data;

  if (env.REGISTRATION_MODE !== 'open' && !invitationToken) {
    return createServerErrorResponse(
      'Registration is currently closed.',
      403,
      'REGISTRATION_CLOSED',
    );
  }

  const devAutoVerify =
    env.NODE_ENV !== 'production' && env.AUTH_DEV_AUTO_VERIFY === true;
  const emailVerifiedByInvitation = Boolean(invitationToken);
  const emailVerified = devAutoVerify || emailVerifiedByInvitation;

  try {
    const db = getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);

    let email = bodyEmail;

    if (invitationToken) {
      const invitationService = resolveInvitationService(db);
      let invitation: Awaited<
        ReturnType<typeof invitationService.validateToken>
      >;
      try {
        invitation = await invitationService.validateToken(invitationToken);
      } catch (invErr) {
        const invError =
          invErr instanceof Error ? invErr : new Error(String(invErr));
        logger.warn(
          {
            event: 'auth:signup_invalid_invitation_token',
            errorMessage: invError.message,
            errorName: invError.name,
          },
          'Signup rejected — invitation token invalid or expired',
        );
        return createServerErrorResponse(
          'This invitation link is invalid or has expired.',
          410,
          'INVITATION_INVALID',
        );
      }

      if (bodyEmail !== invitation.email) {
        logger.warn(
          {
            event: 'auth:signup_mismatched_invitation_email',
            providedEmail: bodyEmail,
            invitationEmail: invitation.email,
          },
          'Signup rejected — provided email does not match invitation email',
        );
        return createServerErrorResponse(
          'Invitation email does not match provided email.',
          400,
          'INVITATION_EMAIL_MISMATCH',
        );
      }

      email = invitation.email;
    }

    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        or(eq(usersTable.email, email), eq(userCredentialsTable.email, email)),
      )
      .leftJoin(
        userCredentialsTable,
        eq(usersTable.id, userCredentialsTable.userId),
      )
      .limit(1);

    if (existing) {
      return createServerErrorResponse(
        'An account with this email already exists.',
        409,
        'EMAIL_TAKEN',
      );
    }

    const hashedPassword = await hash(password, BCRYPT_COST);
    const userId = crypto.randomUUID();

    let rawVerificationToken: string | null = null;

    await db.transaction(async (tx) => {
      await tx.insert(usersTable).values({
        id: userId,
        email,
        onboardingComplete: false,
      });

      await tx.insert(userCredentialsTable).values({
        userId,
        email,
        hashedPassword,
        emailVerified,
      });

      await tx.insert(authUserIdentitiesTable).values({
        provider: 'authjs',
        externalUserId: email,
        userId,
      });

      if (!emailVerified) {
        const { rawToken, tokenHash } = generateVerificationToken();
        rawVerificationToken = rawToken;
        const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS);

        await tx.insert(emailVerificationTokensTable).values({
          userId,
          tokenHash,
          expiresAt,
        });
      } else if (invitationToken) {
        const invitationService = resolveInvitationService(tx as DrizzleDb);
        await invitationService.acceptInvitation({ token: invitationToken });
      }
    });

    if (!emailVerified && rawVerificationToken !== null) {
      const verifyUrl = `${env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/verify-email?token=${rawVerificationToken}`;
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
            event: 'auth:signup_email_send_error',
            errorMessage: emailError.message,
            errorName: emailError.name,
          },
          'Failed to send verification email after signup',
        );
      }
    }

    logger.debug(
      {
        event: 'auth:signup_success',
        provider: 'authjs',
        autoVerified: devAutoVerify,
        viaInvitation: emailVerifiedByInvitation,
        emailVerified,
      },
      'AuthJS credentials sign-up successful',
    );

    if (emailVerified) {
      // `autoVerified` is the field clients branch on. The message stays for
      // display only -- the sign-up client used to compare it verbatim, which
      // silently breaks the moment the wording changes.
      return createSuccessResponse(
        {
          success: true,
          autoVerified: true,
          message: 'Account created. You can now sign in.',
        },
        201,
      );
    }

    if (
      env.NODE_ENV !== 'production' &&
      env.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV === true &&
      rawVerificationToken !== null
    ) {
      const devVerifyUrl = `${env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/verify-email?token=${rawVerificationToken}`;
      logger.warn(
        { event: 'auth:verification_token_dev_exposed', devVerifyUrl },
        '[DEV ONLY] Verification token exposed — never enable AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV in production',
      );
      return createSuccessResponse(
        {
          success: true,
          autoVerified: false,
          message:
            'Account created. Email verification is required before sign-in.',
          devToken: rawVerificationToken,
          devVerifyUrl,
        },
        201,
      );
    }

    return createSuccessResponse(
      {
        success: true,
        autoVerified: false,
        message:
          'Account created. Email verification is required before sign-in.',
      },
      201,
    );
  } catch (err) {
    if (
      err instanceof InvitationNotFoundError ||
      err instanceof InvitationExpiredError ||
      err instanceof InvitationAlreadyUsedError ||
      err instanceof InvitationRevokedError
    ) {
      return createServerErrorResponse(
        'This invitation link is invalid or has expired.',
        410,
        'INVITATION_INVALID',
      );
    }

    if (isUniqueConstraintViolation(err)) {
      return createServerErrorResponse(
        'An account with this email already exists.',
        409,
        'EMAIL_TAKEN',
      );
    }

    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        event: 'auth:signup_error',
        errorMessage: error.message,
        errorName: error.name,
      },
      'AuthJS sign-up error',
    );

    return createServerErrorResponse('Failed to create account.', 500);
  }
}
