/** @vitest-environment node */
import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';
import '@/shared/lib/network/get-ip.mock';
import '@/shared/lib/rate-limit/rate-limit-helper.mock';

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

import {
  mockGetIP,
  mockLogger,
  mockChildLogger,
  mockCheckRateLimit,
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

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: vi.fn(() => mockLogger),
}));

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({
    resolve: () => ({
      select: mockSelect,
      transaction: mockTransaction,
    }),
  }),
}));

vi.mock('@/core/contracts', () => ({
  INFRASTRUCTURE: { DB: Symbol('DB') },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
  and: vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((a: unknown) => ({ isNull: a })),
}));

vi.mock('@/modules/auth/infrastructure/drizzle/schema', () => ({
  emailVerificationTokensTable: {
    userId: 'userId',
    tokenHash: 'tokenHash',
    expiresAt: 'expiresAt',
    usedAt: 'usedAt',
  },
  userCredentialsTable: {
    email: 'email',
    userId: 'userId',
    emailVerified: 'emailVerified',
  },
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/resend-verification', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockGetIP.mockResolvedValue('1.2.3.4');
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          delete: () => ({ where: () => Promise.resolve() }),
          insert: () => ({ values: () => Promise.resolve() }),
        };
        return fn(tx);
      },
    );
    mockEnv.AUTH_PROVIDER = 'authjs';
    mockEnv.NODE_ENV = 'test';
    mockEnv.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV = false;
  });

  it('returns 404 when AUTH_PROVIDER is not authjs', async () => {
    mockEnv.AUTH_PROVIDER = 'clerk';
    const req = makeRequest({ email: 'user@example.com' });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ success: false });
    const req = makeRequest({ email: 'user@example.com' });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('returns 422 for invalid email', async () => {
    const req = makeRequest({ email: 'not-an-email' });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('returns safe 200 when user not found', async () => {
    mockLimit.mockResolvedValue([]);
    const req = makeRequest({ email: 'unknown@example.com' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('verification');
  });

  it('returns safe 200 when user is already verified', async () => {
    mockLimit.mockResolvedValue([{ userId: 'uid-1', emailVerified: true }]);
    const req = makeRequest({ email: 'verified@example.com' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 and safe message after successful token resend', async () => {
    mockLimit.mockResolvedValue([{ userId: 'uid-1', emailVerified: false }]);
    const req = makeRequest({ email: 'unverified@example.com' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('verification');
    expect(mockChildLogger.debug).toHaveBeenCalled();
  });

  it('exposes dev token when AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=true in dev', async () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV = true;
    mockLimit.mockResolvedValue([{ userId: 'uid-1', emailVerified: false }]);
    const req = makeRequest({ email: 'unverified@example.com' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { devToken?: string };
    expect(body.devToken).toBeDefined();
  });
});
