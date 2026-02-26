import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { createContainer } from '@/core/container';
import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { RoleRepository } from '@/core/contracts/repositories';
import type { TenantContext } from '@/core/contracts/tenancy';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';

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
 * Security pipeline stays provider-agnostic, while Clerk integration remains
 * at the framework boundary so auth() can be detected by Clerk runtime.
 */

export default clerkMiddleware(async (auth, request) => {
  const requestContainer = createContainer();
  const securityDependencies: SecurityDependencies = {
    identityProvider: requestContainer.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    ),
    tenantResolver: requestContainer.resolve<TenantResolver>(
      AUTH.TENANT_RESOLVER,
    ),
    roleRepository: requestContainer.resolve<RoleRepository>(
      AUTHORIZATION.ROLE_REPOSITORY,
    ),
    authorizationService: requestContainer.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    ),
  };
  const userRepository = requestContainer.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );

  let cachedAuthResult: Promise<Awaited<ReturnType<typeof auth>>> | undefined;
  const getAuthResult = () => {
    if (!cachedAuthResult) {
      cachedAuthResult = auth();
    }

    return cachedAuthResult;
  };

  const resolveIdentity = async () => {
    const { userId, sessionClaims } = await getAuthResult();

    if (!userId) {
      return null;
    }

    return {
      id: userId,
      email:
        typeof sessionClaims?.email === 'string'
          ? sessionClaims.email
          : undefined,
    };
  };

  const resolveTenant = async (identity: {
    id: string;
  }): Promise<TenantContext> => {
    const { orgId } = await getAuthResult();

    return {
      tenantId: orgId ?? 'default',
      userId: identity.id,
    };
  };

  const appSecurityPipeline = composeMiddlewares(
    [
      withInternalApiGuard,
      withRateLimit,
      (next: ProxyHandler) =>
        withAuth(next, {
          resolveIdentity,
          resolveTenant,
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
