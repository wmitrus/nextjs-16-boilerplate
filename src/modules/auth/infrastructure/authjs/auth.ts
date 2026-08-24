import { and, eq } from 'drizzle-orm';
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
import { DrizzleAuthJsMfaService } from '../mfa/DrizzleAuthJsMfaService';

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
  /**
   * Second factor, present only on the second leg of an MFA sign-in
   * (SEC-48). The client learns it is needed from the `MfaRequired` error the
   * first attempt throws, then resubmits the same credentials with a code.
   *
   * Bounded: a TOTP code is six digits and a recovery code 23 characters.
   */
  totpCode: z.string().min(6).max(64).optional(),
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

        const { email, password, cfTurnstileToken, totpCode } = parsed.data;
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
              // Compare-and-set on the exact hash just verified, not just
              // the userId: a password reset can complete between the
              // SELECT above and this write. Without the hash in the WHERE,
              // an unconditional update here would overwrite the reset's
              // brand-new credential with an Argon2 hash of the *old*
              // password, silently reviving it.
              const rehashed = await db
                .update(userCredentialsTable)
                .set({ hashedPassword: upgradedHash, updatedAt: new Date() })
                .where(
                  and(
                    eq(userCredentialsTable.userId, credRecord.userId),
                    eq(
                      userCredentialsTable.hashedPassword,
                      credRecord.hashedPassword,
                    ),
                  ),
                )
                .returning();

              if (rehashed.length === 0) {
                getLogger().debug(
                  { event: 'auth:password_rehash_skipped_concurrent_change' },
                  'Credential changed concurrently (e.g. a password reset) -- skipped a now-stale rehash write',
                );
              } else {
                getLogger().debug(
                  {
                    event: 'auth:password_rehashed',
                    reason: verification.rehash,
                  },
                  'Credential hash upgraded on successful sign-in',
                );
              }
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

          // Second factor (SEC-48). Asked only of accounts that have one
          // enrolled, and asked *after* the password has already been proven
          // correct -- so an attacker cannot use this branch to discover
          // which accounts exist or which have MFA without first holding a
          // valid password.
          //
          // Deliberately the only question this module asks about the
          // account: "does it have a second factor?". Whether the account is
          // an administrator is an authorization question, resolved in the
          // admin gate long after a session exists. Reaching for ABAC here
          // would put role knowledge inside the credentials provider and
          // invert the order this codebase establishes identity in.
          const mfaService = new DrizzleAuthJsMfaService(db);
          const mfaStatus = await mfaService.getStatus({
            userId: credRecord.userId,
          });

          if (mfaStatus.enrolled) {
            if (!totpCode) {
              // Not a failed attempt: the password was right. Counting it
              // would let a correct-password-plus-missing-code sequence lock
              // out the legitimate owner.
              throw new Error('MfaRequired');
            }

            const mfaResult = await mfaService.verifyChallenge(
              { userId: credRecord.userId },
              totpCode,
            );

            if (!mfaResult.ok) {
              if (mfaResult.reason === 'unavailable') {
                // An operator problem (missing key material, undecryptable
                // seed). Never a sign-in, and never counted against the user.
                throw new Error('MfaUnavailable');
              }
              await recordFailure();
              throw new Error('MfaInvalidCode');
            }

            getLogger().debug(
              {
                event: 'auth:credentials_mfa_verified',
                provider: 'authjs',
                factor: mfaResult.factor,
              },
              'Second factor verified during AuthJS credentials sign-in',
            );
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
            error.message === 'EmailNotVerified' ||
            // SEC-48. These three are protocol answers for the sign-in
            // client, not internal failures: swallowing them into `null`
            // would show "invalid credentials" to a user whose password was
            // in fact correct and who simply has not typed their code yet.
            error.message === 'MfaRequired' ||
            error.message === 'MfaInvalidCode' ||
            error.message === 'MfaUnavailable'
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
        // Minted once, at sign-in, and carried unchanged through every
        // token rotation: this is the logical session reference step-up
        // proofs are bound to (SEC-48). `iat` cannot serve that purpose --
        // NextAuth re-stamps it whenever it re-issues the token, so it
        // answers "when was this session last refreshed", not "which
        // sign-in is this". A fresh sign-in gets a fresh `sid`, which is
        // what makes a proof die with its session.
        token.sid = crypto.randomUUID();
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
        session.user.logicalSessionId =
          typeof token.sid === 'string' ? token.sid : undefined;
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
