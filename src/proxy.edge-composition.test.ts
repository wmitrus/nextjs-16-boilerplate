import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as getIp from '@/shared/lib/network/get-ip';
import * as rateLimitHelper from '@/shared/lib/rate-limit/rate-limit-helper';

const getEdgeContainerMock = vi.hoisted(() => vi.fn());
const getAppContainerMock = vi.hoisted(() => vi.fn());
const registerMock = vi.fn();

vi.unmock('@/core/runtime/edge');

vi.mock('@/core/runtime/edge', () => ({
  getEdgeContainer: getEdgeContainerMock,
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: getAppContainerMock,
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: vi.fn(
    (handler) => (req: NextRequest, evt: NextFetchEvent) => {
      const auth = Object.assign(
        async () => ({
          userId: null,
          orgId: null,
          sessionClaims: null,
        }),
        {
          protect: vi.fn(),
        },
      );

      return handler(auth, req, evt);
    },
  ),
  createRouteMatcher: vi.fn((patterns: string[]) => {
    return vi.fn((req: NextRequest) => {
      const pathname = req.nextUrl.pathname;

      return patterns.some((pattern) => {
        const base = pattern.replace('(.*)', '');

        if (base === '/') {
          return pathname === '/';
        }

        return pathname === base || pathname.startsWith(base);
      });
    });
  }),
}));

vi.mock('@/core/env', () => ({
  env: {
    NODE_ENV: 'test',
    VERCEL_ENV: 'test',
    INTERNAL_API_KEY: 'test-key',
    E2E_ENABLED: false,
    SECURITY_ALLOWED_OUTBOUND_HOSTS: '',
    NEXT_PUBLIC_CSP_SCRIPT_EXTRA: '',
    NEXT_PUBLIC_CSP_CONNECT_EXTRA: '',
    NEXT_PUBLIC_CSP_FRAME_EXTRA: '',
    NEXT_PUBLIC_CSP_IMG_EXTRA: '',
    NEXT_PUBLIC_CSP_STYLE_EXTRA: '',
    NEXT_PUBLIC_CSP_FONT_EXTRA: '',
  },
}));

vi.mock('@/core/logger/edge', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    })),
  },
  getEdgeLogger: vi.fn(() => ({
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    })),
  })),
}));

vi.mock('@/shared/lib/rate-limit/rate-limit-helper', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@/shared/lib/network/get-ip', () => ({
  getIP: vi.fn(),
}));

import proxy from '@/proxy';

describe('Proxy edge composition root', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const identityProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue(null),
    };
    const tenantResolver = {
      resolve: vi.fn().mockResolvedValue({ tenantId: 't1', userId: 'u1' }),
    };
    const userRepository = {
      findById: vi.fn().mockResolvedValue(null),
      updateOnboardingStatus: vi.fn(),
      updateProfile: vi.fn(),
    };

    getEdgeContainerMock.mockReturnValue({
      register: registerMock,
      resolve: vi.fn((key: unknown) => {
        const symbolString = String(key);
        if (symbolString.includes('IdentityProvider')) return identityProvider;
        if (symbolString.includes('TenantResolver')) return tenantResolver;
        if (symbolString.includes('UserRepository')) return userRepository;
        return undefined;
      }),
    });

    vi.mocked(getIp.getIP).mockResolvedValue('127.0.0.1');
    vi.mocked(rateLimitHelper.checkRateLimit).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: new Date(Date.now() + 60_000),
    });
  });

  it('uses edge container and never touches node app container in middleware', async () => {
    const request = new NextRequest(new URL('http://localhost/dashboard'));

    await proxy(request, {} as unknown as NextFetchEvent);

    expect(getEdgeContainerMock).toHaveBeenCalled();
    expect(getAppContainerMock).not.toHaveBeenCalled();
    expect(registerMock).toHaveBeenCalledTimes(3);
    for (const call of registerMock.mock.calls) {
      expect(call[2]).toEqual({ override: true });
    }
  });
});
