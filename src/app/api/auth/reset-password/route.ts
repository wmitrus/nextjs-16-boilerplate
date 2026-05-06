import { createHash } from 'node:crypto';

import { hash } from 'bcryptjs';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  authUserIdentitiesTable,
  passwordResetTokensTable,
  userCredentialsTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const BCRYPT_COST = 12;
const INVALID_TOKEN_ERROR =
  'This password reset link is invalid or has expired. Please request a new one.';

export async function POST(request: Request): Promise<Response> {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    return Response.json(
      { error: 'Not available for the current auth provider' },
      { status: 404 },
    );
  }

  const logger = resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'authjs-reset-password',
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Validation failed',
        details: parsed.error.issues.map((i) => i.message),
      },
      { status: 422 },
    );
  }

  const { token, password } = parsed.data;
  const tokenHash = createHash('sha256').update(token).digest('hex');

  try {
    const db = getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);

    const [tokenRecord] = await db
      .select({
        id: passwordResetTokensTable.id,
        userId: passwordResetTokensTable.userId,
        expiresAt: passwordResetTokensTable.expiresAt,
      })
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          gt(passwordResetTokensTable.expiresAt, new Date()),
          isNull(passwordResetTokensTable.usedAt),
        ),
      )
      .limit(1);

    if (!tokenRecord) {
      return Response.json({ error: INVALID_TOKEN_ERROR }, { status: 410 });
    }

    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, tokenRecord.userId))
      .limit(1);

    if (!user) {
      return Response.json({ error: INVALID_TOKEN_ERROR }, { status: 410 });
    }

    const hashedPassword = await hash(password, BCRYPT_COST);
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(eq(passwordResetTokensTable.id, tokenRecord.id));

      const [existingCredentials] = await tx
        .select({ userId: userCredentialsTable.userId })
        .from(userCredentialsTable)
        .where(eq(userCredentialsTable.userId, user.id))
        .limit(1);

      if (existingCredentials) {
        await tx
          .update(userCredentialsTable)
          .set({ hashedPassword, updatedAt: now })
          .where(eq(userCredentialsTable.userId, user.id));
      } else {
        await tx.insert(userCredentialsTable).values({
          userId: user.id,
          email: user.email,
          hashedPassword,
          emailVerified: true,
        });

        const [identityExists] = await tx
          .select({ provider: authUserIdentitiesTable.provider })
          .from(authUserIdentitiesTable)
          .where(
            and(
              eq(authUserIdentitiesTable.userId, user.id),
              eq(authUserIdentitiesTable.provider, 'authjs'),
            ),
          )
          .limit(1);

        if (!identityExists) {
          await tx.insert(authUserIdentitiesTable).values({
            provider: 'authjs',
            externalUserId: user.email,
            userId: user.id,
          });
        }
      }
    });

    logger.debug(
      { event: 'auth:password_reset_success', userId: user.id },
      'Password reset successful',
    );

    return Response.json({ success: true }, { status: 200 });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        event: 'auth:password_reset_error',
        errorMessage: error.message,
        errorName: error.name,
      },
      'Password reset error',
    );

    return Response.json(
      { error: 'Failed to reset password.' },
      { status: 500 },
    );
  }
}
