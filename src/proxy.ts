import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { Container } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type {
  IdentityProvider,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import { env } from '@/core/env';
import { createEdgeRequestContainer } from '@/core/runtime/edge';

import { AuthJsEdgeIdentitySource } from '@/modules/auth/infrastructure/authjs/AuthJsEdgeIdentitySource';
import { RequestScopedIdentityProvider } from '@/modules/auth/infrastructure/RequestScopedIdentityProvider';
import { RequestScopedTenantResolver } from '@/modules/auth/infrastructure/RequestScopedTenantResolver';
import { extractClerkEmailClaim } from '@/modules/auth/lib/clerk-session-claims';
import type { EdgeSecurityDependencies } from '@/security/core/security-dependencies';
import type { RouteContext } from '@/security/middleware/route-classification';
import { withAuth } from '@/security/middleware/with-auth';
import {
  withDemoAllowlistGuard,
  withDemoGuard,
} from '@/security/middleware/with-demo-guard';
import { buildContentSecurityPolicy } from '@/security/middleware/with-headers';
import { withInternalApiGuard } from '@/security/middleware/with-internal-api-guard';
import { withRateLimit } from '@/security/middleware/with-rate-limit';
import { withRegistrationMode } from '@/security/middleware/with-registration-mode';
import { withSecurity } from '@/security/middleware/with-security';

type ProxyHandler = (
  req: NextRequest,
  ctx: RouteContext,
) => Promise<NextResponse>;

type ProxyMiddleware = (next: ProxyHandler) => ProxyHandler;

/**
 * The only "continue to render the app" exit point in the pipeline —
 * everything else either short-circuits (guard rejection, redirect) or
 * calls through to this. When a CSP nonce was generated for this request
 * (RouteContext.nonce, set only when CSP_SCRIPT_MODE is 'nonce-dynamic'),
 * two REQUEST headers are carried forward so the RSC render can read them via
 * headers() — a middleware-set response header never reaches the app's
 * server components, only the request headers Next.js forwards do:
 *
 * - `x-nonce`: read by getCspNonce() for our own <Script>/<ClerkProvider>
 *   nonce props.
 * - `Content-Security-Policy`: Next.js's own framework-generated inline
 *   scripts (RSC hydration payload pushes, etc.) are auto-nonced by Next
 *   reading THIS exact header on the incoming request — x-nonce alone
 *   only covers scripts we explicitly pass a nonce prop to. Without this,
 *   Next's own bootstrap scripts have no nonce and strict-dynamic (no
 *   unsafe-inline fallback) blocks them, breaking hydration entirely.
 *
 * Built once here via buildContentSecurityPolicy() and reused verbatim by
 * with-headers.ts for the response header, so request and response always
 * carry the identical value for the same nonce.
 */
const terminalHandler: ProxyHandler = async (req, ctx) => {
  if (!ctx.nonce) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', ctx.nonce);
  requestHeaders.set(
    'Content-Security-Policy',
    buildContentSecurityPolicy(ctx.nonce),
  );
  return NextResponse.next({ request: { headers: requestHeaders } });
};

function createAuthResultGetter<TAuthResult>(auth: () => Promise<TAuthResult>) {
  let cachedAuthResult: Promise<TAuthResult> | undefined;

  return () => {
    if (!cachedAuthResult) {
      cachedAuthResult = auth();
    }
    return cachedAuthResult;
  };
}

function createRequestIdentitySource(
  getAuthResult: () => Promise<{
    userId?: string | null;
    orgId?: string | null;
    sessionClaims?: Record<string, unknown> | null;
  }>,
): RequestIdentitySource {
  return {
    get: async () => {
      const { userId, orgId, sessionClaims } = await getAuthResult();

      return {
        userId: userId ?? undefined,
        orgExternalId: orgId ?? undefined,
        // Matches ClerkRequestIdentitySource's claim contract (email, then
        // primaryEmail fallback) — a mismatch here would mean
        // DEMO_SHOWCASE_ALLOWED_EMAIL silently never matches for a
        // deployment that uses the primaryEmail custom claim.
        email: extractClerkEmailClaim(sessionClaims),
      };
    },
  };
}

function createRequestContainer(identitySource: RequestIdentitySource) {
  const requestContainer = createEdgeRequestContainer({
    auth: {
      authProvider: env.AUTH_PROVIDER,
    },
  });

  requestContainer.register(AUTH.IDENTITY_SOURCE, identitySource, {
    override: true,
  });
  requestContainer.register(
    AUTH.IDENTITY_PROVIDER,
    new RequestScopedIdentityProvider(identitySource),
    { override: true },
  );
  requestContainer.register(
    AUTH.TENANT_RESOLVER,
    new RequestScopedTenantResolver(identitySource),
    { override: true },
  );

  return requestContainer;
}

function resolveSecurityDependencies(
  requestContainer: Container,
): EdgeSecurityDependencies {
  return {
    identityProvider: requestContainer.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    ),
    tenantResolver: requestContainer.resolve<TenantResolver>(
      AUTH.TENANT_RESOLVER,
    ),
  };
}

function createSecurityPipeline(
  securityDependencies: EdgeSecurityDependencies,
) {
  const appSecurityPipeline = composeMiddlewares(
    [
      // Runs before auth: a disabled demo route 404s regardless of the
      // caller's auth state (see with-demo-guard.ts).
      withDemoGuard,
      withInternalApiGuard,
      withRateLimit,
      withRegistrationMode,
      (next: ProxyHandler) =>
        withAuth(next, {
          dependencies: securityDependencies,
          enforceResourceAuthorization: false,
        }),
      // Runs after auth: needs the resolved identity for the optional
      // DEMO_SHOWCASE_ALLOWED_EMAIL check.
      (next: ProxyHandler) =>
        withDemoAllowlistGuard(next, { dependencies: securityDependencies }),
    ],
    terminalHandler,
  );

  return withSecurity(appSecurityPipeline);
}

function composeMiddlewares(
  middlewares: ProxyMiddleware[],
  handler: ProxyHandler,
): ProxyHandler {
  return [...middlewares].reverse().reduce((next, middleware) => {
    return middleware(next);
  }, handler);
}

async function runSecurityPipeline(
  request: NextRequest,
  requestContainer: Container,
): Promise<NextResponse> {
  const securityDependencies = resolveSecurityDependencies(requestContainer);
  const securityPipeline = createSecurityPipeline(securityDependencies);

  try {
    return await securityPipeline(request);
  } catch (error) {
    console.error('[Proxy Error]', error);
    return NextResponse.json(
      {
        status: 'server_error',
        error: 'Internal Server Error',
        code: 'SERVER_ERROR',
      },
      { status: 500 },
    );
  }
}

async function nonClerkProxy(request: NextRequest): Promise<NextResponse> {
  if (env.AUTH_PROVIDER === 'authjs') {
    const identitySource = new AuthJsEdgeIdentitySource(request);
    const requestContainer = createRequestContainer(identitySource);
    return runSecurityPipeline(request, requestContainer);
  }

  const requestContainer = createEdgeRequestContainer({
    auth: {
      authProvider: env.AUTH_PROVIDER,
    },
  });

  return runSecurityPipeline(request, requestContainer);
}

/**
 * Proxy composition layer.
 *
 * - AUTH_PROVIDER=clerk:
 *   clerkMiddleware() wraps the pipeline and a request-scoped identity source
 *   is injected from Clerk auth() output.
 *
 * - AUTH_PROVIDER=authjs|supabase|neon:
 *   runs the same security middleware chain with provider-specific edge auth module
 *   wiring (no Clerk wrapper).
 *
 * Shared execution order:
 * 1. withSecurity (Classification, Correlation, Security Headers)
 * 2. withDemoGuard (404s a disabled demo/showcase route pre-auth)
 * 3. withInternalApiGuard (Internal API Key Validation)
 * 4. withRateLimit (API Throttling)
 * 5. withRegistrationMode
 * 6. withAuth (Session presence gate only in Edge mode)
 * 7. withDemoAllowlistGuard (optional DEMO_SHOWCASE_ALLOWED_EMAIL check)
 * 8. terminalHandler (NextResponse.next())
 */
const proxyHandler =
  env.AUTH_PROVIDER === 'clerk'
    ? clerkMiddleware(async (auth, request) => {
        const getAuthResult = createAuthResultGetter(auth);
        const requestIdentitySource =
          createRequestIdentitySource(getAuthResult);
        const requestContainer = createRequestContainer(requestIdentitySource);
        return runSecurityPipeline(request, requestContainer);
      })
    : nonClerkProxy;

export default proxyHandler;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
