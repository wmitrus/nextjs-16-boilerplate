import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

vi.mock('@/core/env', () => ({
  env: {
    NEXTAUTH_SECRET: 'test-secret',
    NODE_ENV: 'test',
  },
}));

import { AuthJsEdgeIdentitySource } from './AuthJsEdgeIdentitySource';

const mockGetToken = vi.mocked(getToken);

function createMockRequest(): NextRequest {
  return {
    cookies: { get: vi.fn() },
    headers: new Headers(),
  } as unknown as NextRequest;
}

describe('AuthJsEdgeIdentitySource', () => {
  it('returns empty object when no token exists', async () => {
    mockGetToken.mockResolvedValueOnce(null);
    const source = new AuthJsEdgeIdentitySource(createMockRequest());

    const result = await source.get();

    expect(result).toEqual({});
  });

  it('returns identity data from a valid JWT token', async () => {
    mockGetToken.mockResolvedValueOnce({
      id: 'user@example.com',
      email: 'user@example.com',
      emailVerified: false,
      sub: 'user@example.com',
      iat: 0,
      exp: 9999999999,
      jti: 'test-jti',
    });
    const source = new AuthJsEdgeIdentitySource(createMockRequest());

    const result = await source.get();

    expect(result).toEqual({
      userId: 'user@example.com',
      email: 'user@example.com',
      emailVerified: false,
    });
  });

  it('returns emailVerified: true when token has verified flag', async () => {
    mockGetToken.mockResolvedValueOnce({
      id: 'verified@example.com',
      email: 'verified@example.com',
      emailVerified: true,
      sub: 'verified@example.com',
      iat: 0,
      exp: 9999999999,
      jti: 'test-jti',
    });
    const source = new AuthJsEdgeIdentitySource(createMockRequest());

    const result = await source.get();

    expect(result.emailVerified).toBe(true);
  });

  it('returns empty object on token read error (does not throw)', async () => {
    mockGetToken.mockRejectedValueOnce(new Error('Token error'));
    const source = new AuthJsEdgeIdentitySource(createMockRequest());

    const result = await source.get();

    expect(result).toEqual({});
  });

  it('falls back to token.sub when token.id is missing', async () => {
    mockGetToken.mockResolvedValueOnce({
      email: 'fallback@example.com',
      emailVerified: false,
      sub: 'fallback@example.com',
      iat: 0,
      exp: 9999999999,
      jti: 'test-jti',
    });
    const source = new AuthJsEdgeIdentitySource(createMockRequest());

    const result = await source.get();

    expect(result.userId).toBe('fallback@example.com');
  });
});
