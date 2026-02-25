import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { bootstrap } from '@/core/container';

import type { RouteContext } from '@/security/middleware/route-classification';
import { withAuth } from '@/security/middleware/with-auth';
import { withInternalApiGuard } from '@/security/middleware/with-internal-api-guard';
import { withRateLimit } from '@/security/middleware/with-rate-limit';
import { withSecurity } from '@/security/middleware/with-security';

// Initialize DI Container
bootstrap();

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
  const resolveIdentity = async () => {
    const { userId, sessionClaims } = await auth();

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

  const appSecurityPipeline = composeMiddlewares(
    [
      withInternalApiGuard,
      withRateLimit,
      (next: ProxyHandler) => withAuth(next, { resolveIdentity }),
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
