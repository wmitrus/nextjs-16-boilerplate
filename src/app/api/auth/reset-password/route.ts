import { createHash } from 'node:crypto';

import { and, eq, gt, isNull, sql } from 'drizzle-orm';
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
  getClientIp,
  rateLimitKeyForClient,
} from '@/shared/lib/network/get-ip';

import { hashPassword } from '@/modules/auth/infrastructure/credentials/password-hasher';
import { passwordSchema } from '@/modules/auth/infrastructure/credentials/password-policy';
import {
  authUserIdentitiesTable,
  passwordResetTokensTable,
  userCredentialsTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';
import { checkStrictRateLimit } from '@/security/api/strict-rate-limit';

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
});

/**
 * The transaction's own type. Taken from `DrizzleDb['transaction']` rather
 * than imported from Drizzle's internals so it cannot drift from whatever the
 * configured driver actually hands the callback.
 */
type ResetTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/**
 * Writes the new password, creating the credentials row and the AuthJS
 * identity when this is the user's first one.
 *
 * Takes the caller's `tx`, so it runs inside the same transaction as the token
 * claim above -- the atomicity, the race handling and the transaction boundary
 * all stay where they were (SEC-35/SEC-36). This is an extraction along the
 * seam that was already in the handler: claiming the token and persisting the
 * credentials are two separate steps that happen to share a transaction.
 */
async function persistResetCredentials(
  tx: ResetTransaction,
  user: { id: string; email: string },
  hashedPassword: string,
  now: Date,
): Promise<void> {
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
    return;
  }

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

const RESET_PASSWORD_PATH = '/api/auth/reset-password';
const INVALID_TOKEN_ERROR =
  'This password reset link is invalid or has expired. Please request a new one.';

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
    module: 'authjs-reset-password',
  });

  // SEC-42. This endpoint had no rate limit of its own -- only the generic
  // per-IP window in the Edge proxy, which degrades to a per-instance counter
  // whenever Upstash is unreachable. It redeems a reset token and then does
  // Argon2id work, so it is both a token-guessing oracle and an expensive one.
  // Strict mode: a durable secondary, then fail closed.
  const client = await getClientIp(new Headers(request.headers));
  const rateLimitResult = await checkStrictRateLimit(
    rateLimitKeyForClient('reset-password', client),
    {
      path: RESET_PASSWORD_PATH,
    },
  );

  if (!rateLimitResult.success) {
    return createServerErrorResponse(
      'Too many requests. Please wait before trying again.',
      429,
      'RATE_LIMITED',
    );
  }

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

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return createValidationErrorResponse(getFieldErrors(parsed.error), 422);
  }

  const { token, password } = parsed.data;
  const tokenHash = createHash('sha256').update(token).digest('hex');

  try {
    const db = getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);

    // Cheap pre-check ONLY -- this is a DoS guard, not the security check.
    // It lets an obviously invalid/expired/already-used token short-circuit
    // before the deliberately expensive Argon2id hash below, so an attacker
    // cannot burn CPU by spraying junk tokens. It deliberately decides
    // nothing: the authoritative single-use decision is the atomic claim
    // inside the transaction further down. Never add logic here that the
    // claim does not re-verify.
    const [candidateToken] = await db
      .select({ userId: passwordResetTokensTable.userId })
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          gt(passwordResetTokensTable.expiresAt, new Date()),
          isNull(passwordResetTokensTable.usedAt),
        ),
      )
      .limit(1);

    if (!candidateToken) {
      return createServerErrorResponse(
        INVALID_TOKEN_ERROR,
        410,
        'INVALID_TOKEN',
      );
    }

    const hashedPassword = await hashPassword(password);
    const now = new Date();

    const outcome = await db.transaction(async (tx) => {
      // Atomically CLAIM the token: the same statement that marks it used
      // also re-verifies it was unused and unexpired, and tells us via
      // RETURNING whether this request is the one that won. Two concurrent
      // requests carrying the same token therefore cannot both proceed --
      // exactly one UPDATE matches a row, the other returns nothing.
      //
      // Splitting this into "SELECT unused -> hash -> UPDATE used" is the
      // bug this replaces (SEC-35): the password hash sits between the
      // check and the act, holding the race window open for hundreds of
      // milliseconds.
      // `NOW()` is the database clock, not this process's, so the expiry
      // comparison is evaluated where the row is locked.
      const [claimedToken] = await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokensTable.tokenHash, tokenHash),
            gt(passwordResetTokensTable.expiresAt, sql`NOW()`),
            isNull(passwordResetTokensTable.usedAt),
          ),
        )
        .returning();

      if (!claimedToken) {
        return { claimed: false as const };
      }

      const [user] = await tx
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, claimedToken.userId))
        .limit(1);

      if (!user) {
        // Roll the claim back rather than burning the token on our own
        // data inconsistency -- the holder did nothing wrong.
        tx.rollback();
        return { claimed: false as const };
      }

      await persistResetCredentials(tx, user, hashedPassword, now);

      // Revoke every session minted before this moment. A password reset is
      // the canonical account-takeover recovery step, so it must not leave
      // an attacker's 30-day JWT working -- and because sessions here are
      // stateless there is nothing to delete, only a marker to raise that
      // the access evaluators compare against each token's `iat`. Same
      // transaction as the token claim and the password write: either the
      // reset happened in full or it did not happen. See SEC-36.
      await tx
        .update(usersTable)
        .set({ sessionsValidFrom: now })
        .where(eq(usersTable.id, user.id));

      return { claimed: true as const, userId: user.id };
    });

    if (!outcome.claimed) {
      // Lost the race (or the row vanished): the token belongs to whichever
      // request claimed it. Respond identically to an invalid token -- the
      // caller must not be able to tell a race from a bad token.
      logger.warn(
        { event: 'auth:password_reset_token_claim_lost' },
        'Password reset token was already claimed by a concurrent request',
      );
      return createServerErrorResponse(
        INVALID_TOKEN_ERROR,
        410,
        'INVALID_TOKEN',
      );
    }

    logger.debug(
      { event: 'auth:password_reset_success', userId: outcome.userId },
      'Password reset successful',
    );

    return createSuccessResponse({ success: true });
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

    return createServerErrorResponse('Failed to reset password.', 500);
  }
}
