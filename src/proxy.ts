import { withSecurity } from '@/security/middleware/with-security';

/**
 * Proxy to enforce layered security on all routes.
 * In Next.js 16, proxy.ts replaces middleware.ts for Node.js runtime use cases.
 */
export default withSecurity();

/**
 * Configure the middleware to match all routes except static files and internals.
 */
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
