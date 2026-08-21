import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as getIp from '@/shared/lib/network/get-ip';
import * as rateLimitHelper from '@/shared/lib/rate-limit/rate-limit-helper';

const createEdgeRequestContainerMock = vi.hoisted(() => vi.fn());
const getAppContainerMock = vi.hoisted(() => vi.fn());
const registerMock = vi.fn();

vi.unmock('@/core/runtime/edge');

vi.mock('@/core/runtime/edge', () => ({
  createEdgeRequestContainer: createEdgeRequestContainerMock,
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

vi.mock('@/core/env', async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };

  return {
    ...actual,
    env: {
      ...actual.env,
      AUTH_PROVIDER: 'clerk',
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
      // T3-Env's proxy hides server-only keys from `{...actual.env}`
      // enumeration in this jsdom test environment (it treats jsdom's
      // `window` as a client context) — server vars must be listed
      // explicitly here, same as INTERNAL_API_KEY etc above, or they
      // silently come out `undefined` rather than their schema default.
      CSP_SCRIPT_MODE: 'nonce-dynamic',
      DEMO_SHOWCASE_ENABLED: false,
    },
  };
});

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
      resolve: vi.fn().mockResolvedValue({
        organizationId: 't1',
        tenantId: 't1',
        userId: 'u1',
      }),
    };
    const userRepository = {
      findById: vi.fn().mockResolvedValue(null),
      updateOnboardingStatus: vi.fn(),
      updateProfile: vi.fn(),
    };

    createEdgeRequestContainerMock.mockReturnValue({
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

    expect(createEdgeRequestContainerMock).toHaveBeenCalled();
    expect(getAppContainerMock).not.toHaveBeenCalled();
    expect(registerMock).toHaveBeenCalledTimes(3);
    for (const call of registerMock.mock.calls) {
      expect(call[2]).toEqual({ override: true });
    }
  });

  it('forwards both x-nonce and a matching Content-Security-Policy on the request (not just x-nonce)', async () => {
    // Regression test: Next.js auto-nonces its own framework-generated
    // inline scripts (RSC hydration payload pushes, etc.) by reading the
    // incoming REQUEST's Content-Security-Policy header for a `nonce-`
    // source — a custom x-nonce header alone does not reach that
    // mechanism. See SEC-30 in docs/ai/general/SECURITY_CODING_PATTERNS.md.
    // Uses a public route ("/") so the request reaches terminalHandler
    // directly — this test's identity resolves to null, and a protected
    // route like /dashboard would redirect to sign-in before ever
    // reaching it.
    const request = new NextRequest(new URL('http://localhost/'));

    const response = await proxy(request, {} as unknown as NextFetchEvent);
    expect(response).toBeTruthy();

    const overridden = response!.headers.get('x-middleware-override-headers');
    expect(overridden).toContain('x-nonce');
    expect(overridden).toContain('content-security-policy');

    const forwardedNonce = response!.headers.get(
      'x-middleware-request-x-nonce',
    );
    const forwardedCsp = response!.headers.get(
      'x-middleware-request-content-security-policy',
    );
    expect(forwardedNonce).toBeTruthy();
    expect(forwardedCsp).toBeTruthy();
    // The same nonce value must appear in both — Next's auto-nonce
    // detection and our own <Script>/<ClerkProvider> nonce props must
    // agree, or only one half of the page's scripts would be trusted.
    expect(forwardedCsp).toContain(`'nonce-${forwardedNonce}'`);
    expect(forwardedCsp).toContain("'strict-dynamic'");
  });
});
