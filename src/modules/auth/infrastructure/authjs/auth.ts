import { eq } from 'drizzle-orm';
import type { AuthOptions, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  isTurnstileConfigured,
  verifyTurnstileToken,
} from '@/shared/lib/captcha/turnstile';
import {
  getLoginAbuseState,
  normalizeLoginAccountKey,
  recordFailedLoginAttempt,
  recordSuccessfulLogin,
} from '@/shared/lib/rate-limit/login-abuse-control';

import { hashPassword, verifyPassword } from '../credentials/password-hasher';
import { userCredentialsTable } from '../drizzle/schema';

import { authConfig } from './auth.config';

import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

function getLogger() {
  return resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'authjs',
  });
}

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  // Present only once the account-bucket abuse control (see
  // login-abuse-control.ts) requires it. Verified server-side in
  // authorize() -- never trusted just because it's present.
  cfTurnstileToken: z.string().optional(),
});

function getDb(): DrizzleDb {
  return getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const authOptions: AuthOptions = {
  ...authConfig,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password, cfTurnstileToken } = parsed.data;
        const accountKey = normalizeLoginAccountKey(email);
        // E2E fixtures reuse a small number of stable accounts across many
        // parallel/sequential specs -- exempting them here (mirrors the
        // existing E2E rate-limit bypass convention) avoids one spec's
        // deliberate wrong-password test locking out every other spec that
        // needs the same account. See SEC-34.
        //
        // E2E_LOGIN_ABUSE_CONTROL_ENABLED forces this back on: it's the one
        // override e2e/authjs-login-abuse-control.spec.ts sets for its own
        // scenario run, since that spec's entire purpose is to exercise
        // this control against a real (disposable, per-test) account.
        const abuseControlActive =
          !env.E2E_ENABLED || env.E2E_LOGIN_ABUSE_CONTROL_ENABLED;

        if (abuseControlActive) {
          const abuseState = await getLoginAbuseState(accountKey);

          if (abuseState.lockedUntil) {
            getLogger().warn(
              {
                event: 'auth:login_account_locked',
                failedAttempts: abuseState.failedAttempts,
                lockedUntil: abuseState.lockedUntil.toISOString(),
              },
              'AuthJS credentials sign-in blocked: account temporarily locked',
            );
            throw new Error('AccountTemporarilyLocked');
          }

          if (abuseState.requiresCaptcha && isTurnstileConfigured()) {
            const captchaValid = await verifyTurnstileToken(cfTurnstileToken);
            if (!captchaValid) {
              getLogger().warn(
                {
                  event: 'auth:login_captcha_required',
                  failedAttempts: abuseState.failedAttempts,
                },
                'AuthJS credentials sign-in blocked: CAPTCHA required or invalid',
              );
              throw new Error('CaptchaRequired');
            }
          }

          if (abuseState.progressiveDelayMs > 0) {
            await delay(abuseState.progressiveDelayMs);
          }
        }

        async function recordFailure(): Promise<void> {
          if (abuseControlActive) {
            await recordFailedLoginAttempt(accountKey);
          }
        }

        try {
          const db = getDb();

          const [credRecord] = await db
            .select({
              userId: userCredentialsTable.userId,
              hashedPassword: userCredentialsTable.hashedPassword,
              emailVerified: userCredentialsTable.emailVerified,
            })
            .from(userCredentialsTable)
            .where(eq(userCredentialsTable.email, email))
            .limit(1);

          if (!credRecord) {
            const [userExists] = await db
              .select({ id: usersTable.id })
              .from(usersTable)
              .where(eq(usersTable.email, email))
              .limit(1);

            if (userExists) {
              await recordFailure();
              throw new Error('NoCredentials');
            }

            await recordFailure();
            return null;
          }

          const verification = await verifyPassword(
            password,
            credRecord.hashedPassword,
          );
          if (!verification.valid) {
            await recordFailure();
            return null;
          }

          if (verification.legacyBcryptTruncated) {
            // SEC-47. This candidate authenticated correctly, but it is
            // >=72 UTF-8 bytes -- bcrypt silently ignores anything past
            // that, so this stored hash may also accept other candidates
            // sharing only the first 72 bytes. Rehashing this one
            // candidate into Argon2id would (in effect) narrow the
            // account's real password down to this truncated-length
            // sibling under a stronger algorithm. Leave it on bcrypt; only
            // a real reset (which always hashes the full password) can
            // safely migrate this account.
            getLogger().warn(
              { event: 'auth:legacy_bcrypt_truncated_skip_rehash' },
              'Legacy bcrypt credential exceeds the 72-byte input limit -- skipping automatic rehash; migrate via password reset',
            );
          } else if (verification.rehash) {
            // Best-effort upgrade -- never let a rehash failure fail a
            // login that was otherwise valid. The account simply stays on
            // its current hash and this is retried on the next successful
            // sign-in.
            try {
              const upgradedHash = await hashPassword(password);
              await db
                .update(userCredentialsTable)
                .set({ hashedPassword: upgradedHash, updatedAt: new Date() })
                .where(eq(userCredentialsTable.userId, credRecord.userId));

              getLogger().debug(
                {
                  event: 'auth:password_rehashed',
                  reason: verification.rehash,
                },
                'Credential hash upgraded on successful sign-in',
              );
            } catch (rehashErr) {
              const rehashError =
                rehashErr instanceof Error
                  ? rehashErr
                  : new Error(String(rehashErr));
              getLogger().warn(
                {
                  event: 'auth:password_rehash_failed',
                  errorMessage: rehashError.message,
                  errorName: rehashError.name,
                },
                'Failed to persist an upgraded credential hash after sign-in',
              );
            }
          }

          const [user] = await db
            .select({ id: usersTable.id, email: usersTable.email })
            .from(usersTable)
            .where(eq(usersTable.id, credRecord.userId))
            .limit(1);

          if (!user) {
            await recordFailure();
            return null;
          }

          if (!credRecord.emailVerified) {
            // A correct password for an unverified account is not evidence
            // of an attack -- don't count it as a failure, and don't reset
            // the counter either (neutral).
            throw new Error('EmailNotVerified');
          }

          if (abuseControlActive) {
            await recordSuccessfulLogin(accountKey);
          }

          getLogger().debug(
            {
              event: 'auth:credentials_sign_in',
              provider: 'authjs',
              emailVerified: credRecord.emailVerified,
            },
            'AuthJS credentials sign-in successful',
          );

          return {
            id: user.email,
            email: user.email,
            emailVerified: credRecord.emailVerified,
          };
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));

          if (
            error.message === 'NoCredentials' ||
            error.message === 'EmailNotVerified'
          ) {
            throw error;
          }

          getLogger().error(
            {
              event: 'auth:credentials_sign_in_error',
              errorMessage: error.message,
              errorName: error.name,
            },
            'AuthJS credentials sign-in error',
          );
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      const typedUser = user as
        | { id?: string; emailVerified?: boolean }
        | undefined;
      if (typedUser) {
        token.id = typedUser.id;
        token.emailVerified = typedUser.emailVerified ?? false;
      }
      return token;
    },
    session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) ?? '';
        session.user.emailVerified =
          (token.emailVerified as boolean | undefined) ?? false;
        // `iat` is stamped by NextAuth itself, so it is trustworthy in a way
        // a claim we set here would not be. Surfacing it is what makes a
        // stateless 30-day JWT revocable at all -- see SEC-36.
        session.user.sessionIssuedAt =
          typeof token.iat === 'number' ? token.iat : undefined;
      }
      return session;
    },
  },
  secret:
    env.NEXTAUTH_SECRET ??
    (env.NODE_ENV === 'development'
      ? 'dev-secret-change-in-production'
      : undefined),
};
