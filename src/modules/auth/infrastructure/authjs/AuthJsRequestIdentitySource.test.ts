import { getServerSession } from 'next-auth/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  authOptions: {},
}));

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
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

import { AuthJsRequestIdentitySource } from './AuthJsRequestIdentitySource';

const mockGetServerSession = vi.mocked(getServerSession);

describe('AuthJsRequestIdentitySource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty object when no session exists', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const source = new AuthJsRequestIdentitySource();

    const result = await source.get();

    expect(result).toEqual({});
  });

  it('returns identity data from a valid session', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: {
        id: 'user@example.com',
        email: 'user@example.com',
        emailVerified: false,
        name: null,
        image: null,
      },
      expires: '2099-01-01T00:00:00.000Z',
    });
    const source = new AuthJsRequestIdentitySource();

    const result = await source.get();

    expect(result).toEqual({
      userId: 'user@example.com',
      email: 'user@example.com',
      emailVerified: false,
    });
  });

  it('returns emailVerified: true when session marks email as verified', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: {
        id: 'verified@example.com',
        email: 'verified@example.com',
        emailVerified: true,
        name: null,
        image: null,
      },
      expires: '2099-01-01T00:00:00.000Z',
    });
    const source = new AuthJsRequestIdentitySource();

    const result = await source.get();

    expect(result.emailVerified).toBe(true);
  });

  it('caches the session result (calls getServerSession only once)', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'cached@example.com',
        email: 'cached@example.com',
        emailVerified: false,
        name: null,
        image: null,
      },
      expires: '2099-01-01T00:00:00.000Z',
    });
    const source = new AuthJsRequestIdentitySource();

    await source.get();
    await source.get();

    expect(mockGetServerSession).toHaveBeenCalledTimes(1);
  });

  it('returns empty object on session resolution error (does not throw)', async () => {
    mockGetServerSession.mockRejectedValueOnce(
      new Error('Session read failed'),
    );
    const source = new AuthJsRequestIdentitySource();

    const result = await source.get();

    expect(result).toEqual({});
  });

  it('returns empty object when session user has no id', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: {
        name: null,
        email: null,
        image: null,
        id: '',
        emailVerified: false,
      },
      expires: '2099-01-01T00:00:00.000Z',
    });
    const source = new AuthJsRequestIdentitySource();

    const result = await source.get();

    expect(result.userId).toBe('');
  });
});
