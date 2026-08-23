import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INFRASTRUCTURE } from '@/core/contracts';

import type * as GetIpModule from '@/shared/lib/network/get-ip';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  joinWaitlist: vi.fn(),
  addToWaitlist: vi.fn(),
  db: {},
  registry: new Map<symbol, unknown>(),
  container: {
    resolve: vi.fn((token: symbol) => mocks.registry.get(token)),
  },
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return { ...actual, connection: mocks.connection };
});

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => mocks.container,
}));

vi.mock('@/core/env', () => ({
  env: {
    REGISTRATION_MODE: 'invite-only',
    AUTH_PROVIDER: 'authjs',
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'test',
    RESEND_FROM_EMAIL: 'noreply@test.dev',
  },
}));

vi.mock('@/shared/lib/network/get-ip', async (importOriginal) => {
  // Partial: `rateLimitKeyForClient` / `auditIpForClient` stay real, because
  // they encode the policy for an unidentifiable client (SEC-43) and a test
  // that stubs them stops testing that policy.
  const actual = await importOriginal<typeof GetIpModule>();
  return { ...actual, getClientIp: mocks.getClientIp };
});

vi.mock('@/shared/lib/rate-limit/rate-limit-helper', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock('@/modules/invitations/infrastructure/EmailServiceFactory', () => ({
  createEmailService: () => ({}),
}));

vi.mock(
  '@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository',
  () => ({
    // A class, not `vi.fn().mockImplementation(() => ({}))`: the factory is
    // evaluated on first import, which happens inside a test, i.e. after
    // `vi.resetAllMocks()` has already run -- so a mock implementation set
    // here survives only for tests that do not construct it first.
    DrizzleWaitlistRepository: class {},
  }),
);

vi.mock('@/modules/waitlist/infrastructure/DefaultWaitlistService', () => ({
  DefaultWaitlistService: class {
    joinWaitlist(...args: unknown[]) {
      return mocks.joinWaitlist(...args);
    }
  },
}));

vi.mock('@/modules/waitlist/infrastructure/clerk/ClerkWaitlistBridge', () => ({
  ClerkWaitlistBridge: class {
    addToWaitlist(...args: unknown[]) {
      return mocks.addToWaitlist(...args);
    }
  },
}));

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/waitlist', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getClientIp.mockResolvedValue({ kind: 'trusted', ip: '203.0.113.1' });
    mocks.checkRateLimit.mockResolvedValue({ success: true });
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    mocks.joinWaitlist.mockResolvedValue({
      id: 'entry-1',
      email: 'joiner@test.dev',
      status: 'pending',
    });
  });

  it('accepts an anonymous join request', async () => {
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ email: 'joiner@test.dev' }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    expect(mocks.joinWaitlist).toHaveBeenCalledWith({
      email: 'joiner@test.dev',
      name: undefined,
    });
  });

  it('drops a client-supplied organizationId instead of persisting it', async () => {
    // SEC-41. This endpoint is unauthenticated, so nothing in its body can be
    // scope authority. The field used to be parsed and written straight to
    // `waitlist_entries.organization_id`, which the approve path then read
    // back as the invitation target -- a visitor choosing which organization
    // they get invited into.
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({
        email: 'joiner@test.dev',
        organizationId: '15000000-0000-4000-8000-000000000002',
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(200);
    expect(mocks.joinWaitlist).toHaveBeenCalledWith({
      email: 'joiner@test.dev',
      name: undefined,
    });
    const [input] = mocks.joinWaitlist.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(input).not.toHaveProperty('organizationId');
  });

  it('rejects a malformed body before touching the service', async () => {
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ email: 'not-an-email' }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(400);
    expect(mocks.joinWaitlist).not.toHaveBeenCalled();
  });

  it('rejects when the request is rate limited', async () => {
    mocks.checkRateLimit.mockResolvedValue({ success: false });

    const { POST } = await import('./route');
    const res = await POST(makeRequest({ email: 'joiner@test.dev' }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(429);
    expect(mocks.joinWaitlist).not.toHaveBeenCalled();
  });
});
