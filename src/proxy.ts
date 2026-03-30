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

import { RequestScopedIdentityProvider } from '@/modules/auth/infrastructure/RequestScopedIdentityProvider';
import { RequestScopedTenantResolver } from '@/modules/auth/infrastructure/RequestScopedTenantResolver';
import type { EdgeSecurityDependencies } from '@/security/core/security-dependencies';
import type { RouteContext } from '@/security/middleware/route-classification';
import { withAuth } from '@/security/middleware/with-auth';
import { withInternalApiGuard } from '@/security/middleware/with-internal-api-guard';
import { withRateLimit } from '@/security/middleware/with-rate-limit';
import { withSecurity } from '@/security/middleware/with-security';

type ProxyHandler = (
  req: NextRequest,
  ctx: RouteContext,
) => Promise<NextResponse>;

type ProxyMiddleware = (next: ProxyHandler) => ProxyHandler;

const terminalHandler: ProxyHandler = async () => NextResponse.next();

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
        tenantExternalId: orgId ?? undefined,
        email:
          typeof sessionClaims?.email === 'string'
            ? sessionClaims.email
            : undefined,
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
      withInternalApiGuard,
      withRateLimit,
      (next: ProxyHandler) =>
        withAuth(next, {
          dependencies: securityDependencies,
          enforceResourceAuthorization: false,
        }),
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
 * - AUTH_PROVIDER=authjs|supabase:
 *   runs the same security middleware chain with provider-specific edge auth module
 *   wiring (no Clerk wrapper).
 *
 * Shared execution order:
 * 1. withSecurity (Classification, Correlation, Security Headers)
 * 2. withInternalApiGuard (Internal API Key Validation)
 * 3. withRateLimit (API Throttling)
 * 4. withAuth (Session presence gate only in Edge mode)
 * 5. terminalHandler (NextResponse.next())
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
