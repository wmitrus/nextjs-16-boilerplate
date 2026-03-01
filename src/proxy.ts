import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type {
  IdentityProvider,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { RequestScopedIdentityProvider } from '@/modules/auth/infrastructure/RequestScopedIdentityProvider';
import { RequestScopedTenantResolver } from '@/modules/auth/infrastructure/RequestScopedTenantResolver';
import type { SecurityDependencies } from '@/security/core/security-dependencies';
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

function composeMiddlewares(
  middlewares: ProxyMiddleware[],
  handler: ProxyHandler,
): ProxyHandler {
  return [...middlewares].reverse().reduce((next, middleware) => {
    return middleware(next);
  }, handler);
}

/**
 * Proxy composition layer.
 *
 * clerkMiddleware() is the outermost wrapper so that Clerk's runtime context
 * is established before any downstream code runs.
 *
 * A request-scoped RequestIdentitySource is built from the `auth` callback
 * and injected into the child container — replacing the module-default ClerkRequestIdentitySource.
 * This ensures auth() is called at most once per request (via getAuthResult cache)
 * and that domain classes never call auth() directly.
 *
 * Execution order:
 * 1. clerkMiddleware (Clerk context setup, auth callback provided)
 * 2. withSecurity (Classification, Correlation, Security Headers)
 * 3. withInternalApiGuard (Internal API Key Validation)
 * 4. withRateLimit (API Throttling)
 * 5. withAuth (Identity, Onboarding, Authorization)
 * 6. terminalHandler (NextResponse.next())
 */
export default clerkMiddleware(async (auth, request) => {
  let cachedAuthResult: Promise<Awaited<ReturnType<typeof auth>>> | undefined;
  const getAuthResult = () => {
    if (!cachedAuthResult) {
      cachedAuthResult = auth();
    }
    return cachedAuthResult;
  };

  const requestIdentitySource: RequestIdentitySource = {
    get: async () => {
      const { userId, orgId, sessionClaims } = await getAuthResult();
      return {
        userId: userId ?? undefined,
        orgId: orgId ?? undefined,
        email:
          typeof sessionClaims?.email === 'string'
            ? sessionClaims.email
            : undefined,
      };
    },
  };

  const requestContainer = getAppContainer().createChild();

  requestContainer.register(AUTH.IDENTITY_SOURCE, requestIdentitySource);
  requestContainer.register(
    AUTH.IDENTITY_PROVIDER,
    new RequestScopedIdentityProvider(requestIdentitySource),
  );
  requestContainer.register(
    AUTH.TENANT_RESOLVER,
    new RequestScopedTenantResolver(requestIdentitySource),
  );

  const securityDependencies: SecurityDependencies = {
    identityProvider: requestContainer.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    ),
    tenantResolver: requestContainer.resolve<TenantResolver>(
      AUTH.TENANT_RESOLVER,
    ),
    authorizationService: requestContainer.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    ),
  };

  const userRepository = requestContainer.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );

  const appSecurityPipeline = composeMiddlewares(
    [
      withInternalApiGuard,
      withRateLimit,
      (next: ProxyHandler) =>
        withAuth(next, {
          dependencies: securityDependencies,
          userRepository,
        }),
    ],
    terminalHandler,
  );
  const securityPipeline = withSecurity(appSecurityPipeline);

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
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
