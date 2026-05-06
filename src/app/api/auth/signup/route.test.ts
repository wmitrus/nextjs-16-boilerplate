/** @vitest-environment node */
import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';
import '@/shared/lib/network/get-ip.mock';

import { NextRequest } from 'next/server';
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

const mockTransaction = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockLeftJoin = vi.fn();

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
  or: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@/modules/auth/infrastructure/drizzle/schema', () => ({
  userCredentialsTable: { email: 'email', userId: 'userId' },
  authUserIdentitiesTable: {
    provider: 'provider',
    externalUserId: 'externalUserId',
    userId: 'userId',
  },
  emailVerificationTokensTable: {
    userId: 'userId',
    tokenHash: 'tokenHash',
    expiresAt: 'expiresAt',
  },
}));

vi.mock('@/modules/user/infrastructure/drizzle/schema', () => ({
  usersTable: { id: 'id', email: 'email' },
}));

vi.mock(
  '@/modules/invitations/infrastructure/DefaultInvitationService',
  () => ({
    DefaultInvitationService: vi.fn().mockImplementation(() => ({
      acceptInvitation: vi.fn().mockResolvedValue(undefined),
    })),
  }),
);

vi.mock(
  '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository',
  () => ({ DrizzleInvitationRepository: vi.fn() }),
);

vi.mock('@/modules/invitations/infrastructure/NoOpEmailService', () => ({
  NoOpEmailService: vi.fn(),
}));

vi.mock('@/modules/invitations/infrastructure/EmailServiceFactory', () => ({
  createEmailService: vi.fn().mockReturnValue({
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendWaitlistConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  }),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockLimit.mockResolvedValue([]);
    mockLeftJoin.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ limit: mockLimit, leftJoin: mockLeftJoin });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          insert: () => ({ values: () => Promise.resolve() }),
        };
        return fn(tx);
      },
    );
    mockEnv.AUTH_PROVIDER = 'authjs';
    mockEnv.REGISTRATION_MODE = 'open';
    mockEnv.NODE_ENV = 'test';
    mockEnv.AUTH_DEV_AUTO_VERIFY = false;
    mockEnv.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV = false;
  });

  it('returns 404 when AUTH_PROVIDER is not authjs', async () => {
    mockEnv.AUTH_PROVIDER = 'clerk';
    const req = makeRequest({
      email: 'user@example.com',
      password: 'Pass1234!',
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('returns 403 when REGISTRATION_MODE is not open', async () => {
    mockEnv.REGISTRATION_MODE = 'disabled';
    const req = makeRequest({
      email: 'user@example.com',
      password: 'Pass1234!',
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 422 for invalid email', async () => {
    const req = makeRequest({ email: 'not-email', password: 'Pass1234!' });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('returns 422 for password too short', async () => {
    const req = makeRequest({ email: 'user@example.com', password: 'short' });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('returns 409 when user already exists', async () => {
    mockLimit.mockResolvedValueOnce([{ id: 'existing-uid' }]);
    const req = makeRequest({
      email: 'existing@example.com',
      password: 'Pass1234!',
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it('returns 201 with verification-required message when not auto-verified', async () => {
    const req = makeRequest({
      email: 'new@example.com',
      password: 'Pass1234!',
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(true);
    expect(body.message).toContain('verification is required');
  });

  it('returns 201 with sign-in message when AUTH_DEV_AUTO_VERIFY is true', async () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.AUTH_DEV_AUTO_VERIFY = true;
    const req = makeRequest({
      email: 'new@example.com',
      password: 'Pass1234!',
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('You can now sign in');
  });

  it('exposes devToken when AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=true in dev', async () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV = true;
    const req = makeRequest({
      email: 'new@example.com',
      password: 'Pass1234!',
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      devToken?: string;
      devVerifyUrl?: string;
    };
    expect(body.devToken).toBeDefined();
    expect(body.devVerifyUrl).toBeDefined();
  });

  it('returns 400 for malformed request body', async () => {
    const req = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('logs success on account creation', async () => {
    const req = makeRequest({
      email: 'new@example.com',
      password: 'Pass1234!',
    });
    await POST(req);
    expect(mockChildLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth:signup_success' }),
      expect.any(String),
    );
  });
});
