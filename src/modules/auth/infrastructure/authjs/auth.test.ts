import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompare = vi.fn();
const mockResolve = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

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

describe('authOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
        id: 'uid-1',
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
  });

  describe('callbacks', () => {
    it('jwt callback merges user fields into token', async () => {
      vi.resetModules();
      const mod = await import('./auth');
      const { jwt } = mod.authOptions.callbacks ?? {};
      if (!jwt) throw new Error('jwt callback not defined');
      const token = { sub: 'u1' };
      const user = { id: 'uid-1', emailVerified: true };
      const result = await (
        jwt as (args: {
          token: unknown;
          user: unknown;
        }) => Record<string, unknown>
      )({ token, user });
      expect(result['id']).toBe('uid-1');
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
