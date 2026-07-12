/** @vitest-environment node */
import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

import { mockLogger, resetAllInfrastructureMocks } from '@/testing';
import { mockEnv } from '@/testing/infrastructure/env';

const {
  cookieSetMock,
  getServerSessionMock,
  isMemberMock,
  resolveMock,
  dbSelectMock,
} = vi.hoisted(() => ({
  cookieSetMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  isMemberMock: vi.fn(),
  resolveMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: cookieSetMock,
  }),
}));

vi.mock('next-auth/next', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: vi.fn(() => mockLogger),
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({
    resolve: resolveMock,
  }),
}));

vi.mock('@/core/contracts', () => ({
  AUTHORIZATION: { MEMBERSHIP_REPOSITORY: Symbol('MembershipRepository') },
  INFRASTRUCTURE: { DB: Symbol('Db') },
}));

vi.mock('@/modules/auth/infrastructure/authjs/auth', () => ({
  authOptions: {},
}));

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/active-org', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/active-org', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    cookieSetMock.mockReset();
    getServerSessionMock.mockReset();
    isMemberMock.mockReset();
    resolveMock.mockReset();
    dbSelectMock.mockReset();
    mockEnv.AUTH_PROVIDER = 'authjs';
    mockEnv.NODE_ENV = 'test';

    resolveMock.mockImplementation((token: unknown) => {
      if (
        typeof token === 'symbol' &&
        token.description === 'MembershipRepository'
      ) {
        return { isMember: isMemberMock };
      }

      if (typeof token === 'symbol' && token.description === 'Db') {
        return {
          select: dbSelectMock,
        };
      }

      throw new Error(`Unexpected token: ${String(token)}`);
    });

    dbSelectMock.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ status: 'active' }]),
        }),
      }),
    });
  });

  it('returns 404 when AUTH_PROVIDER is not authjs', async () => {
    mockEnv.AUTH_PROVIDER = 'clerk';

    const response = await POST(
      makeRequest({ organizationId: '11111111-1111-4111-8111-111111111111' }),
    );

    expect(response.status).toBe(404);
  });

  it('returns 401 when there is no authenticated session', async () => {
    getServerSessionMock.mockResolvedValue(null);

    const response = await POST(
      makeRequest({ organizationId: '11111111-1111-4111-8111-111111111111' }),
    );

    expect(response.status).toBe(401);
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not a member of the selected organization', async () => {
    getServerSessionMock.mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111112' },
    });
    isMemberMock.mockResolvedValue(false);

    const response = await POST(
      makeRequest({ organizationId: '11111111-1111-4111-8111-111111111111' }),
    );

    expect(response.status).toBe(403);
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it('returns 409 when the selected organization is archived', async () => {
    getServerSessionMock.mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111112' },
    });
    isMemberMock.mockResolvedValue(true);
    dbSelectMock.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ status: 'archived' }]),
        }),
      }),
    });

    const response = await POST(
      makeRequest({ organizationId: '11111111-1111-4111-8111-111111111111' }),
    );

    expect(response.status).toBe(409);
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it('sets a secure cookie in production for authorized members', async () => {
    mockEnv.NODE_ENV = 'production';
    getServerSessionMock.mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111112' },
    });
    isMemberMock.mockResolvedValue(true);

    const response = await POST(
      makeRequest({ organizationId: '11111111-1111-4111-8111-111111111111' }),
    );

    expect(response.status).toBe(200);
    expect(cookieSetMock).toHaveBeenCalledWith(
      mockEnv.TENANT_CONTEXT_COOKIE,
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
      }),
    );
  });
});
