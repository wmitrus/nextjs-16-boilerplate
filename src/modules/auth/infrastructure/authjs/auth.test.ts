import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';

const mockCompare = vi.fn();
const mockResolve = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockIsTurnstileConfigured = vi.fn();
const mockVerifyTurnstileToken = vi.fn();

vi.mock('bcryptjs', () => ({
  compare: mockCompare,
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({
    resolve: mockResolve,
  }),
}));

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
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
}));

vi.mock('next-auth/next', () => ({
  default: vi.fn((options) => options),
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((config) => config),
}));

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
    mockResolve.mockReturnValue({ select: mockSelect });
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
      mockCompare.mockResolvedValueOnce(false);
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
      mockCompare.mockResolvedValueOnce(true);
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
      mockCompare.mockResolvedValueOnce(true);
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
      mockCompare.mockResolvedValueOnce(true);
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
        mockCompare.mockResolvedValue(false);
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

        mockCompare.mockResolvedValueOnce(false);
        mockLimit.mockResolvedValueOnce([
          { userId: 'uid-1', hashedPassword: '$hashed', emailVerified: true },
        ]);
        await authorize({ email, password: 'wrong' });

        mockCompare.mockResolvedValueOnce(true);
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
        mockCompare.mockResolvedValueOnce(false);
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
