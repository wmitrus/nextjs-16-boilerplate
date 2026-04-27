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

import {
  authUserIdentitiesTable,
  emailVerificationTokensTable,
  userCredentialsTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

const signUpSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
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

export async function POST(request: Request): Promise<Response> {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    return Response.json(
      { error: 'Not available for the current auth provider' },
      { status: 404 },
    );
  }

  if (env.REGISTRATION_MODE !== 'open') {
    return Response.json(
      { error: 'Registration is currently closed.' },
      { status: 403 },
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
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Validation failed',
        details: parsed.error.issues.map((i) => i.message),
      },
      { status: 422 },
    );
  }

  const { email, password } = parsed.data;

  const devAutoVerify =
    env.NODE_ENV !== 'production' && env.AUTH_DEV_AUTO_VERIFY === true;

  try {
    const db = getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);

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
      return Response.json(
        { error: 'An account with this email already exists.' },
        { status: 409 },
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
        emailVerified: devAutoVerify,
      });

      await tx.insert(authUserIdentitiesTable).values({
        provider: 'authjs',
        externalUserId: email,
        userId,
      });

      if (!devAutoVerify) {
        const { rawToken, tokenHash } = generateVerificationToken();
        rawVerificationToken = rawToken;
        const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS);

        await tx.insert(emailVerificationTokensTable).values({
          userId,
          tokenHash,
          expiresAt,
        });
      }
    });

    logger.debug(
      {
        event: 'auth:signup_success',
        provider: 'authjs',
        autoVerified: devAutoVerify,
      },
      'AuthJS credentials sign-up successful',
    );

    if (devAutoVerify) {
      return Response.json(
        { success: true, message: 'Account created. You can now sign in.' },
        { status: 201 },
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
      return Response.json(
        {
          success: true,
          message:
            'Account created. Email verification is required before sign-in.',
          devToken: rawVerificationToken,
          devVerifyUrl,
        },
        { status: 201 },
      );
    }

    return Response.json(
      {
        success: true,
        message:
          'Account created. Email verification is required before sign-in.',
      },
      { status: 201 },
    );
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return Response.json(
        { error: 'An account with this email already exists.' },
        { status: 409 },
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

    return Response.json(
      { error: 'Failed to create account.' },
      { status: 500 },
    );
  }
}
