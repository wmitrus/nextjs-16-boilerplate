/** @vitest-environment node */
import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

import {
  mockChildLogger,
  mockLogger,
  resetAllInfrastructureMocks,
} from '@/testing';
import { mockEnv } from '@/testing/infrastructure/env';

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('$hashed'),
}));

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: vi.fn(() => mockLogger),
}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({
    resolve: () => ({
      select: mockSelect,
      update: mockUpdate,
      insert: mockInsert,
      transaction: mockTransaction,
    }),
  }),
}));

vi.mock('@/core/contracts', () => ({
  INFRASTRUCTURE: { DB: Symbol('DB') },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  gt: vi.fn((a: unknown, b: unknown) => ({ gt: [a, b] })),
  isNull: vi.fn((a: unknown) => ({ isNull: a })),
  sql: Object.assign(
    (strings: TemplateStringsArray) => ({ sql: strings.join('') }),
    {},
  ),
}));

vi.mock('@/modules/auth/infrastructure/drizzle/schema', () => ({
  passwordResetTokensTable: {
    id: 'id',
    userId: 'userId',
    tokenHash: 'tokenHash',
    expiresAt: 'expiresAt',
    usedAt: 'usedAt',
  },
  userCredentialsTable: { userId: 'userId', email: 'email' },
  authUserIdentitiesTable: {
    provider: 'provider',
    externalUserId: 'externalUserId',
    userId: 'userId',
  },
}));

vi.mock('@/modules/user/infrastructure/drizzle/schema', () => ({
  usersTable: { id: 'id', email: 'email' },
}));

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

/** Pre-check SELECT: a matching, still-claimable candidate row. */
function mockPreCheckFinds(found: boolean) {
  mockSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(found ? [{ userId: 'user-1' }] : []),
      }),
    }),
  });
}

/**
 * The transaction body is where the authoritative atomic claim lives, so
 * these tests drive it directly: `claimReturns` is what the claiming
 * `UPDATE ... RETURNING` yields -- a row when this request won the race, an
 * empty array when a concurrent request already took the token.
 */
function mockTransactionWithClaim(claimReturns: unknown[]) {
  const rollback = vi.fn(() => {
    throw new Error('rollback');
  });

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      update: vi.fn(() => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve(claimReturns),
          }),
        }),
      })),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([{ id: 'user-1', email: 'u@example.com' }]),
          }),
        }),
      })),
      insert: vi.fn(() => ({ values: () => Promise.resolve() })),
      rollback,
    };
    return fn(tx);
  });

  return { rollback };
}

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockInsert.mockReset();
    mockTransaction.mockReset();
    mockEnv.AUTH_PROVIDER = 'authjs';
  });

  it('returns 404 when the auth provider is not authjs', async () => {
    mockEnv.AUTH_PROVIDER = 'clerk';

    const response = await POST(
      makeRequest({ token: 't', password: 'password123' }),
    );

    expect(response.status).toBe(404);
  });

  it('returns 410 when no claimable token matches the pre-check', async () => {
    mockPreCheckFinds(false);

    const response = await POST(
      makeRequest({ token: 'nope', password: 'password123' }),
    );

    expect(response.status).toBe(410);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('resets the password when the atomic claim succeeds', async () => {
    mockPreCheckFinds(true);
    mockTransactionWithClaim([{ userId: 'user-1' }]);

    const response = await POST(
      makeRequest({ token: 'good', password: 'password123' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  // The core of SEC-35: the pre-check passing is NOT permission to proceed.
  // A concurrent request may have claimed the token in the window the bcrypt
  // hash holds open, and the claiming UPDATE returning no row is the only
  // thing that catches it.
  it('returns 410 when the atomic claim finds the token already taken', async () => {
    mockPreCheckFinds(true);
    mockTransactionWithClaim([]);

    const response = await POST(
      makeRequest({ token: 'contested', password: 'password123' }),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining('invalid or has expired'),
    });
  });

  it('reports a lost race identically to an invalid token', async () => {
    mockPreCheckFinds(false);
    const invalid = await POST(
      makeRequest({ token: 'bad', password: 'password123' }),
    );
    const invalidBody = await invalid.json();

    mockPreCheckFinds(true);
    mockTransactionWithClaim([]);
    const contested = await POST(
      makeRequest({ token: 'contested', password: 'password123' }),
    );
    const contestedBody = await contested.json();

    expect(contested.status).toBe(invalid.status);
    expect(contestedBody).toEqual(invalidBody);
  });

  it('logs the lost claim so a contested reset is visible in production', async () => {
    mockPreCheckFinds(true);
    mockTransactionWithClaim([]);

    await POST(makeRequest({ token: 'contested', password: 'password123' }));

    expect(mockChildLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth:password_reset_token_claim_lost',
      }),
      expect.any(String),
    );
  });

  it('rejects a password shorter than the minimum', async () => {
    const response = await POST(makeRequest({ token: 't', password: 'short' }));

    expect(response.status).toBe(422);
  });
});
