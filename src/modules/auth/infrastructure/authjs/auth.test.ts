import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';

const mockVerifyPassword = vi.fn();
const mockHashPassword = vi.fn();
const mockResolve = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockUpdateReturning = vi.fn();
const mockIsTurnstileConfigured = vi.fn();
const mockVerifyTurnstileToken = vi.fn();

/** A successful `verifyPassword()` result with no rehash pending. */
function validVerification(
  overrides: Partial<{
    rehash: 'legacy-bcrypt' | 'argon2-params-outdated' | null;
    legacyBcryptTruncated: boolean;
  }> = {},
) {
  return {
    valid: true,
    rehash: null,
    legacyBcryptTruncated: false,
    ...overrides,
  };
}

const INVALID_VERIFICATION = {
  valid: false,
  rehash: null,
  legacyBcryptTruncated: false,
};

vi.mock('../credentials/password-hasher', () => ({
  verifyPassword: mockVerifyPassword,
  hashPassword: mockHashPassword,
}));

/**
 * The MFA adapter is stubbed rather than driven through the mocked db chain:
 * its own behaviour (seed decryption, replay marker, recovery-code consume)
 * is covered against a real database in
 * `DrizzleAuthJsMfaService.db.test.ts`. What matters here is only how
 * `authorize()` reacts to its two answers -- see SEC-48.
 *
 * `class {}` rather than `vi.fn().mockImplementation(() => ({}))`: the
 * factory runs after `vi.resetAllMocks()`, so a mock-returned object leaves
 * `new X()` throwing (a trap this repository has hit before).
 */
const mockMfaGetStatus = vi.fn();
const mockMfaVerifyChallenge = vi.fn();

vi.mock('../mfa/DrizzleAuthJsMfaService', () => ({
  DrizzleAuthJsMfaService: class {
    getStatus = mockMfaGetStatus;
    verifyChallenge = mockMfaVerifyChallenge;
  },
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({
    resolve: mockResolve,
  }),
}));

const mockLoggerDebug = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: () => ({
    child: () => ({
      debug: mockLoggerDebug,
      error: vi.fn(),
      warn: mockLoggerWarn,
    }),
  }),
}));

vi.mock('@/core/contracts', () => ({
  INFRASTRUCTURE: { DB: Symbol('Database') },
}));

vi.mock('./auth.config', () => ({
  authConfig: {
    session: { strategy: 'jwt' },
    pages: { signIn: '/auth/signin' },
    callbacks: {},
    providers: [],
  },
}));

vi.mock('@/modules/auth/infrastructure/drizzle/schema', () => ({
  userCredentialsTable: {
    email: 'email',
    userId: 'userId',
    hashedPassword: 'hashedPassword',
    emailVerified: 'emailVerified',
  },
}));

vi.mock('@/modules/user/infrastructure/drizzle/schema', () => ({
  usersTable: { id: 'id', email: 'email' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ a, b })),
  and: vi.fn((...conditions) => ({ and: conditions })),
}));

vi.mock('next-auth/next', () => ({
  default: vi.fn((options) => options),
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((config) => config),
}));

/**
 * Account-bucket abuse control (SEC-34) keeps its real behaviour -- the tests
 * in this file drive its thresholds directly -- with one exception: the
 * SEC-48 tests need to assert *whether* a failed attempt was counted, so
 * `recordFailedLoginAttempt` is wrapped in a spy that still calls through.
 */
const mockRecordFailedLoginAttempt = vi.fn();
const realAbuseControl = vi.hoisted(() => ({
  recordFailedLoginAttempt: undefined as
    | ((accountKey: string) => Promise<void>)
    | undefined,
}));

vi.mock(
  '@/shared/lib/rate-limit/login-abuse-control',
  async (importOriginal) => {
    const actual = (await importOriginal()) as {
      recordFailedLoginAttempt: (accountKey: string) => Promise<void>;
    };
    realAbuseControl.recordFailedLoginAttempt = actual.recordFailedLoginAttempt;
    return {
      ...actual,
      recordFailedLoginAttempt: (accountKey: string) =>
        mockRecordFailedLoginAttempt(accountKey),
    };
  },
);

vi.mock('@/shared/lib/captcha/turnstile', () => ({
  isTurnstileConfigured: mockIsTurnstileConfigured,
  verifyTurnstileToken: mockVerifyTurnstileToken,
}));

describe('authOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnvMocks();
    // Default: CAPTCHA never configured, so the existing (pre-SEC-34) tests
    // below exercise credential logic with the abuse-control gates present
    // but inert (unconfigured captcha; thresholds high enough that a single
    // call never trips them).
    mockIsTurnstileConfigured.mockReturnValue(false);
    mockVerifyTurnstileToken.mockResolvedValue(false);

    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    mockUpdateReturning.mockResolvedValue([{ userId: 'uid-1' }]);
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });

    mockResolve.mockReturnValue({ select: mockSelect, update: mockUpdate });

    // Default: the account has no second factor, so the pre-SEC-48 tests
    // below exercise the password path unchanged.
    mockMfaGetStatus.mockResolvedValue({
      enrolled: false,
      enrollmentSurface: 'application',
      enrollmentUrl: '/account/security/mfa',
    });
    mockMfaVerifyChallenge.mockResolvedValue({ ok: true, factor: 'otp' });

    // Calls through by default: the SEC-34 tests below depend on the real
    // counter actually incrementing, and only the SEC-48 tests care that the
    // call happened at all.
    mockRecordFailedLoginAttempt.mockImplementation(
      async (accountKey: string) =>
        realAbuseControl.recordFailedLoginAttempt?.(accountKey),
    );

    // Default: no credential match, so most tests that don't care about
    // rehash never touch the rehash branch at all.
    mockVerifyPassword.mockResolvedValue(INVALID_VERIFICATION);
    mockHashPassword.mockResolvedValue(
      '$argon2id$v=19$m=19456,t=2,p=1$upgraded',
    );
  });

  it('resolves the module without errors', async () => {
    const mod = await import('./auth');
    expect(mod.authOptions).toBeDefined();
  });

  describe('authorize', () => {
    async function getAuthorize() {
      vi.resetModules();
      const mod = await import('./auth');
      const provider = mod.authOptions.providers?.[0];
      return (provider as { authorize: (...args: unknown[]) => unknown })
        .authorize;
    }

    it('returns null for invalid credentials schema', async () => {
      const authorize = await getAuthorize();
      const result = await authorize({ email: '', password: '' });
      expect(result).toBeNull();
    });

    it('returns null when credentials record not found', async () => {
      mockLimit.mockResolvedValue([]);
      const authorize = await getAuthorize();
      const result = await authorize({
        email: 'notfound@example.com',
        password: 'password123',
      });
      expect(result).toBeNull();
    });

    it('returns null when password does not match', async () => {
      mockLimit.mockResolvedValueOnce([
        {
          userId: 'uid-1',
          hashedPassword: '$hashed',
          emailVerified: false,
        },
      ]);
      mockVerifyPassword.mockResolvedValueOnce(INVALID_VERIFICATION);
      const authorize = await getAuthorize();
      const result = await authorize({
        email: 'user@example.com',
        password: 'wrongpass',
      });
      expect(result).toBeNull();
    });

    it('returns null when user record not found after credential match', async () => {
      mockLimit
        .mockResolvedValueOnce([
          {
            userId: 'uid-1',
            hashedPassword: '$hashed',
            emailVerified: false,
          },
        ])
        .mockResolvedValueOnce([]);
      mockVerifyPassword.mockResolvedValueOnce(validVerification());
      const authorize = await getAuthorize();
      const result = await authorize({
        email: 'user@example.com',
        password: 'correctpass',
      });
      expect(result).toBeNull();
    });

    it('returns user data on successful authentication', async () => {
      mockLimit
        .mockResolvedValueOnce([
          {
            userId: 'uid-1',
            hashedPassword: '$hashed',
            emailVerified: true,
          },
        ])
        .mockResolvedValueOnce([{ id: 'uid-1', email: 'user@example.com' }]);
      mockVerifyPassword.mockResolvedValueOnce(validVerification());
      const authorize = await getAuthorize();
      const result = await authorize({
        email: 'user@example.com',
        password: 'correctpass',
      });
      expect(result).toMatchObject({
        id: 'user@example.com',
        email: 'user@example.com',
        emailVerified: true,
      });
    });

    describe('second factor (SEC-48)', () => {
      function credentialMatch() {
        mockLimit
          .mockResolvedValueOnce([
            {
              userId: 'uid-1',
              hashedPassword: '$hashed',
              emailVerified: true,
            },
          ])
          .mockResolvedValueOnce([{ id: 'uid-1', email: 'user@example.com' }]);
        mockVerifyPassword.mockResolvedValueOnce(validVerification());
      }

      function enrolled() {
        mockMfaGetStatus.mockResolvedValue({
          enrolled: true,
          enrollmentSurface: 'application',
          enrollmentUrl: '/account/security/mfa',
        });
      }

      it('asks only whether the account has a factor, never who it is', async () => {
        // The credentials provider must not resolve roles or ABAC: identity
        // is established here, authorization long afterwards in the admin
        // gate. This asserts the shape of the only question asked.
        credentialMatch();
        const authorize = await getAuthorize();

        await authorize({ email: 'user@example.com', password: 'correctpass' });

        expect(mockMfaGetStatus).toHaveBeenCalledWith({ userId: 'uid-1' });
      });

      it('demands a code from an enrolled account instead of issuing a session', async () => {
        credentialMatch();
        enrolled();
        const authorize = await getAuthorize();

        await expect(
          authorize({ email: 'user@example.com', password: 'correctpass' }),
        ).rejects.toThrow('MfaRequired');
      });

      it('does not count a missing code as a failed attempt', async () => {
        // The password was correct. Counting this would let the second leg of
        // every MFA sign-in walk the owner towards their own lockout.
        credentialMatch();
        enrolled();
        const authorize = await getAuthorize();

        await expect(
          authorize({ email: 'user@example.com', password: 'correctpass' }),
        ).rejects.toThrow('MfaRequired');
        expect(mockRecordFailedLoginAttempt).not.toHaveBeenCalled();
      });

      it('issues a session when the code verifies', async () => {
        credentialMatch();
        enrolled();
        const authorize = await getAuthorize();

        const result = await authorize({
          email: 'user@example.com',
          password: 'correctpass',
          totpCode: '123456',
        });

        expect(result).toMatchObject({ email: 'user@example.com' });
        expect(mockMfaVerifyChallenge).toHaveBeenCalledWith(
          { userId: 'uid-1' },
          '123456',
        );
      });

      it('counts a wrong code as a failed attempt and refuses the session', async () => {
        credentialMatch();
        enrolled();
        mockMfaVerifyChallenge.mockResolvedValue({
          ok: false,
          reason: 'invalid_code',
        });
        const authorize = await getAuthorize();

        await expect(
          authorize({
            email: 'user@example.com',
            password: 'correctpass',
            totpCode: '000000',
          }),
        ).rejects.toThrow('MfaInvalidCode');
        expect(mockRecordFailedLoginAttempt).toHaveBeenCalled();
      });

      it('refuses the session, without blaming the user, when MFA is unavailable', async () => {
        // Missing key material or an undecryptable seed is an operator
        // problem: no session, and no failure counted against the account.
        credentialMatch();
        enrolled();
        mockMfaVerifyChallenge.mockResolvedValue({
          ok: false,
          reason: 'unavailable',
        });
        const authorize = await getAuthorize();

        await expect(
          authorize({
            email: 'user@example.com',
            password: 'correctpass',
            totpCode: '123456',
          }),
        ).rejects.toThrow('MfaUnavailable');
        expect(mockRecordFailedLoginAttempt).not.toHaveBeenCalled();
      });

      it('never asks an un-enrolled account for a code', async () => {
        credentialMatch();
        const authorize = await getAuthorize();

        const result = await authorize({
          email: 'user@example.com',
          password: 'correctpass',
        });

        expect(result).toMatchObject({ email: 'user@example.com' });
        expect(mockMfaVerifyChallenge).not.toHaveBeenCalled();
      });

      it('rejects a code that could not be a TOTP or recovery code', async () => {
        // No credential fixtures queued on purpose: the schema rejects the
        // whole submission before any lookup happens, which is the point.
        enrolled();
        const authorize = await getAuthorize();

        // Too short to be either: refused by the schema before any
        // verification runs.
        const result = await authorize({
          email: 'user@example.com',
          password: 'correctpass',
          totpCode: '12',
        });

        expect(result).toBeNull();
        expect(mockMfaVerifyChallenge).not.toHaveBeenCalled();
      });
    });

    it('throws EmailNotVerified when email is not verified', async () => {
      mockLimit
        .mockResolvedValueOnce([
          {
            userId: 'uid-1',
            hashedPassword: '$hashed',
            emailVerified: false,
          },
        ])
        .mockResolvedValueOnce([{ id: 'uid-1', email: 'user@example.com' }]);
      mockVerifyPassword.mockResolvedValueOnce(validVerification());
      const authorize = await getAuthorize();
      await expect(
        authorize({ email: 'user@example.com', password: 'correctpass' }),
      ).rejects.toThrow('EmailNotVerified');
    });

    it('returns null and does not throw on DB error', async () => {
      mockSelect.mockImplementationOnce(() => {
        throw new Error('DB connection lost');
      });
      const authorize = await getAuthorize();
      const result = await authorize({
        email: 'user@example.com',
        password: 'somepass',
      });
      expect(result).toBeNull();
    });

    describe('login abuse control (SEC-34)', () => {
      function mockWrongPasswordLookup() {
        mockVerifyPassword.mockResolvedValue(INVALID_VERIFICATION);
        mockLimit.mockResolvedValue([
          {
            userId: 'uid-1',
            hashedPassword: '$hashed',
            emailVerified: true,
          },
        ]);
      }

      it('does not call Turnstile verification before the captcha threshold is reached', async () => {
        mockEnv.LOGIN_ABUSE_CAPTCHA_THRESHOLD = 3;
        mockWrongPasswordLookup();

        const authorize = await getAuthorize();
        const result = await authorize({
          email: 'abuse-under-threshold@example.com',
          password: 'wrong',
        });

        expect(result).toBeNull();
        expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
      });

      it('throws CaptchaRequired once the threshold is reached and no valid token is supplied', async () => {
        mockEnv.LOGIN_ABUSE_CAPTCHA_THRESHOLD = 2;
        mockIsTurnstileConfigured.mockReturnValue(true);
        mockVerifyTurnstileToken.mockResolvedValue(false);
        mockWrongPasswordLookup();

        const authorize = await getAuthorize();
        const email = 'abuse-captcha@example.com';

        await authorize({ email, password: 'wrong1' });
        await authorize({ email, password: 'wrong2' });

        mockSelect.mockClear();
        await expect(authorize({ email, password: 'wrong3' })).rejects.toThrow(
          'CaptchaRequired',
        );
        // Blocked before the credential-comparison work for this attempt.
        expect(mockSelect).not.toHaveBeenCalled();
      });

      it('proceeds past the captcha gate when a valid Turnstile token is supplied', async () => {
        mockEnv.LOGIN_ABUSE_CAPTCHA_THRESHOLD = 2;
        mockIsTurnstileConfigured.mockReturnValue(true);
        mockVerifyTurnstileToken.mockResolvedValue(false);
        mockWrongPasswordLookup();

        const authorize = await getAuthorize();
        const email = 'abuse-captcha-ok@example.com';

        await authorize({ email, password: 'wrong1' });
        await authorize({ email, password: 'wrong2' });

        mockVerifyTurnstileToken.mockResolvedValue(true);
        const result = await authorize({
          email,
          password: 'wrong3',
          cfTurnstileToken: 'valid-token',
        });

        // Still a wrong password -- the captcha gate let it through to the
        // real credential check, which correctly still fails.
        expect(result).toBeNull();
        expect(mockVerifyTurnstileToken).toHaveBeenCalledWith('valid-token');
      });

      it('skips the captcha gate entirely when Turnstile is not configured, regardless of failure count', async () => {
        mockEnv.LOGIN_ABUSE_CAPTCHA_THRESHOLD = 1;
        mockIsTurnstileConfigured.mockReturnValue(false);
        mockWrongPasswordLookup();

        const authorize = await getAuthorize();
        const email = 'abuse-no-turnstile@example.com';

        await authorize({ email, password: 'wrong1' });
        const result = await authorize({ email, password: 'wrong2' });

        expect(result).toBeNull();
        expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
      });

      it('throws AccountTemporarilyLocked once the lock threshold is reached, before touching the DB', async () => {
        mockEnv.LOGIN_ABUSE_LOCK_THRESHOLD = 2;
        mockWrongPasswordLookup();

        const authorize = await getAuthorize();
        const email = 'abuse-lock@example.com';

        await authorize({ email, password: 'wrong1' });
        await authorize({ email, password: 'wrong2' });

        mockSelect.mockClear();
        await expect(authorize({ email, password: 'wrong3' })).rejects.toThrow(
          'AccountTemporarilyLocked',
        );
        expect(mockSelect).not.toHaveBeenCalled();
      });

      it('bypasses all abuse control when E2E_ENABLED is true', async () => {
        mockEnv.E2E_ENABLED = true;
        mockEnv.LOGIN_ABUSE_LOCK_THRESHOLD = 1;
        mockWrongPasswordLookup();

        const authorize = await getAuthorize();
        const email = 'abuse-e2e@example.com';

        await authorize({ email, password: 'wrong1' });
        // Would already be locked after 1 failure if abuse control were
        // active for this account.
        const result = await authorize({ email, password: 'wrong2' });

        expect(result).toBeNull();
      });

      it('E2E_LOGIN_ABUSE_CONTROL_ENABLED forces abuse control back on despite E2E_ENABLED', async () => {
        mockEnv.E2E_ENABLED = true;
        mockEnv.E2E_LOGIN_ABUSE_CONTROL_ENABLED = true;
        mockEnv.LOGIN_ABUSE_LOCK_THRESHOLD = 1;
        mockWrongPasswordLookup();

        const authorize = await getAuthorize();
        const email = 'abuse-e2e-forced@example.com';

        await authorize({ email, password: 'wrong1' });
        // Threshold is 1, and the override is active -- this must lock.
        await expect(authorize({ email, password: 'wrong2' })).rejects.toThrow(
          'AccountTemporarilyLocked',
        );
      });

      it('resets the failure counter on a successful login', async () => {
        mockEnv.LOGIN_ABUSE_CAPTCHA_THRESHOLD = 1;
        const authorize = await getAuthorize();
        const email = 'abuse-reset@example.com';

        mockVerifyPassword.mockResolvedValueOnce(INVALID_VERIFICATION);
        mockLimit.mockResolvedValueOnce([
          { userId: 'uid-1', hashedPassword: '$hashed', emailVerified: true },
        ]);
        await authorize({ email, password: 'wrong' });

        mockVerifyPassword.mockResolvedValueOnce(validVerification());
        mockLimit
          .mockResolvedValueOnce([
            {
              userId: 'uid-1',
              hashedPassword: '$hashed',
              emailVerified: true,
            },
          ])
          .mockResolvedValueOnce([{ id: 'uid-1', email }]);
        const success = await authorize({ email, password: 'correct' });
        expect(success).toMatchObject({ email });

        // Next attempt starts fresh: the earlier failure must not still
        // count toward the (now reset) threshold.
        mockVerifyPassword.mockResolvedValueOnce(INVALID_VERIFICATION);
        mockLimit.mockResolvedValueOnce([
          { userId: 'uid-1', hashedPassword: '$hashed', emailVerified: true },
        ]);
        const result = await authorize({ email, password: 'wrong-again' });

        expect(result).toBeNull();
        expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
      });

      it('applies an increasing progressive delay once the delay threshold is reached', async () => {
        vi.useFakeTimers();
        mockEnv.LOGIN_ABUSE_DELAY_THRESHOLD = 1;
        mockWrongPasswordLookup();

        const authorize = await getAuthorize();
        const email = 'abuse-delay@example.com';

        // failedAttempts starts at 0 -- no delay for this first attempt.
        await authorize({ email, password: 'wrong1' });

        // Second attempt reads failedAttempts=1, meeting the threshold.
        const pending = authorize({ email, password: 'wrong2' });
        await vi.advanceTimersByTimeAsync(2_000);
        const result = await pending;

        expect(result).toBeNull();
        vi.useRealTimers();
      });
    });

    describe('rehash-on-login (SEC-47)', () => {
      function mockCredentialLookup() {
        mockLimit
          .mockResolvedValueOnce([
            {
              userId: 'uid-1',
              hashedPassword: '$stored-hash',
              emailVerified: true,
            },
          ])
          .mockResolvedValueOnce([{ id: 'uid-1', email: 'user@example.com' }]);
      }

      it('persists an upgraded hash when verifyPassword reports a legacy bcrypt credential', async () => {
        mockCredentialLookup();
        mockVerifyPassword.mockResolvedValueOnce(
          validVerification({ rehash: 'legacy-bcrypt' }),
        );
        mockHashPassword.mockResolvedValueOnce(
          '$argon2id$v=19$m=19456,t=2,p=1$upgraded',
        );

        const authorize = await getAuthorize();
        const result = await authorize({
          email: 'user@example.com',
          password: 'correct horse battery staple',
        });

        expect(result).toMatchObject({ email: 'user@example.com' });
        expect(mockHashPassword).toHaveBeenCalledWith(
          'correct horse battery staple',
        );
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything());
        expect(mockUpdateSet).toHaveBeenCalledWith(
          expect.objectContaining({
            hashedPassword: '$argon2id$v=19$m=19456,t=2,p=1$upgraded',
          }),
        );
        // Compare-and-set: the WHERE must pin the exact hash that was just
        // verified, not just the userId (see the concurrent-reset test
        // below for why).
        expect(mockUpdateWhere).toHaveBeenCalledWith(
          expect.objectContaining({
            and: expect.arrayContaining([
              { a: 'userId', b: 'uid-1' },
              { a: 'hashedPassword', b: '$stored-hash' },
            ]),
          }),
        );
      });

      it('skips persisting the rehash when the credential changed concurrently (e.g. a password reset)', async () => {
        mockCredentialLookup();
        mockVerifyPassword.mockResolvedValueOnce(
          validVerification({ rehash: 'legacy-bcrypt' }),
        );
        mockHashPassword.mockResolvedValueOnce(
          '$argon2id$v=19$m=19456,t=2,p=1$upgraded',
        );
        // The compare-and-set matched zero rows -- something else already
        // changed `hashedPassword` between the SELECT and this write.
        mockUpdateReturning.mockResolvedValueOnce([]);

        const authorize = await getAuthorize();
        const result = await authorize({
          email: 'user@example.com',
          password: 'correct horse battery staple',
        });

        // The login itself is still valid -- only the stale rehash write
        // is skipped.
        expect(result).toMatchObject({ email: 'user@example.com' });
        expect(mockLoggerDebug).toHaveBeenCalledWith(
          { event: 'auth:password_rehash_skipped_concurrent_change' },
          expect.any(String),
        );
      });

      it('does not persist a rehash when verifyPassword reports none is needed', async () => {
        mockCredentialLookup();
        mockVerifyPassword.mockResolvedValueOnce(validVerification());

        const authorize = await getAuthorize();
        const result = await authorize({
          email: 'user@example.com',
          password: 'correct horse battery staple',
        });

        expect(result).toMatchObject({ email: 'user@example.com' });
        expect(mockHashPassword).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it('skips the rehash, without failing sign-in, for a truncated legacy bcrypt candidate, and logs it distinctly', async () => {
        mockCredentialLookup();
        mockVerifyPassword.mockResolvedValueOnce(
          validVerification({ legacyBcryptTruncated: true }),
        );

        const authorize = await getAuthorize();
        const result = await authorize({
          email: 'user@example.com',
          password: 'a'.repeat(80),
        });

        expect(result).toMatchObject({ email: 'user@example.com' });
        expect(mockHashPassword).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
        // Not just "nothing happened" -- the truncated case must be
        // distinguishable in the logs from the ordinary "no rehash needed"
        // case (an already-current Argon2 hash) covered by the test above.
        expect(mockLoggerWarn).toHaveBeenCalledWith(
          { event: 'auth:legacy_bcrypt_truncated_skip_rehash' },
          expect.any(String),
        );
      });

      it('does not fail an otherwise-valid sign-in when persisting the rehash throws', async () => {
        mockCredentialLookup();
        mockVerifyPassword.mockResolvedValueOnce(
          validVerification({ rehash: 'legacy-bcrypt' }),
        );
        mockHashPassword.mockResolvedValueOnce(
          '$argon2id$v=19$m=19456,t=2,p=1$upgraded',
        );
        mockUpdateReturning.mockRejectedValueOnce(new Error('DB unavailable'));

        const authorize = await getAuthorize();
        const result = await authorize({
          email: 'user@example.com',
          password: 'correct horse battery staple',
        });

        expect(result).toMatchObject({ email: 'user@example.com' });
      });
    });
  });

  describe('callbacks', () => {
    it('jwt callback merges user fields into token', async () => {
      vi.resetModules();
      const mod = await import('./auth');
      const { jwt } = mod.authOptions.callbacks ?? {};
      if (!jwt) throw new Error('jwt callback not defined');
      const token = { sub: 'u1' };
      const user = { id: 'user@example.com', emailVerified: true };
      const result = await (
        jwt as (args: {
          token: unknown;
          user: unknown;
        }) => Record<string, unknown>
      )({ token, user });
      expect(result['id']).toBe('user@example.com');
      expect(result['emailVerified']).toBe(true);
    });

    it('jwt callback is a no-op when user is undefined', async () => {
      vi.resetModules();
      const mod = await import('./auth');
      const { jwt } = mod.authOptions.callbacks ?? {};
      if (!jwt) throw new Error('jwt callback not defined');
      const token = { sub: 'u1', existing: 'value' };
      const result = await (
        jwt as (args: {
          token: unknown;
          user: unknown;
        }) => Record<string, unknown>
      )({ token, user: undefined });
      expect(result).toEqual(token);
    });

    it('session callback maps token fields onto session user', async () => {
      vi.resetModules();
      const mod = await import('./auth');
      const { session } = mod.authOptions.callbacks ?? {};
      if (!session) throw new Error('session callback not defined');
      const sess = { user: {}, expires: '2099' };
      const token = { id: 'tok-id', emailVerified: true };
      const callSession = session as unknown as (
        ...args: unknown[]
      ) => Promise<Record<string, unknown>>;
      const result = await callSession({ session: sess, token });
      const resultUser = result['user'] as Record<string, unknown>;
      expect(resultUser['id']).toBe('tok-id');
      expect(resultUser['emailVerified']).toBe(true);
    });
  });

  describe('module-level exports safety (App Router regression guard)', () => {
    it('exports authOptions but NOT a module-level handler, GET, or POST', async () => {
      vi.resetModules();
      const mod = await import('./auth');
      expect(mod.authOptions).toBeDefined();
      const safetyCheck = mod as Record<string, unknown>;
      expect(safetyCheck['handler']).toBeUndefined();
      expect(safetyCheck['GET']).toBeUndefined();
      expect(safetyCheck['POST']).toBeUndefined();
    });
  });
});
