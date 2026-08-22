export const AUTH_ROUTE_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/auth/signin',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/verify-email-pending',
] as const;

// Demo/showcase routes — gated by DEMO_SHOWCASE_ENABLED (+ optional
// DEMO_SHOWCASE_ALLOWED_EMAIL) via withDemoGuard in src/proxy.ts, not by
// public/private status. Deliberately excluded from PUBLIC_ROUTE_PREFIXES:
// when the flag is on, they still require sign-in like any other private
// route. See SEC-29 in docs/ai/general/SECURITY_CODING_PATTERNS.md.
export const DEMO_ROUTE_PREFIXES = [
  '/env-summary',
  '/security-showcase',
  '/sentry-example-page',
  '/feature-flags-demo',
  '/api/security-test/ssrf',
] as const;

// `/monitoring` is Sentry's tunnelRoute (next.config.ts) — real production
// error-reporting infrastructure, not a demo page. It must stay public
// unconditionally; gating it would silently break Sentry in production.
export const PUBLIC_ROUTE_PREFIXES = [
  '/',
  '/waitlist',
  '/monitoring',
  '/api/logs',
  '/auth/invite',
  '/api/auth',
  '/_betterstack',
] as const;

function normalizeRoutePath(path: string): string {
  const queryIndex = path.indexOf('?');
  const hashIndex = path.indexOf('#');
  const cutIndex = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((min, index) => Math.min(min, index), path.length);

  return path.slice(0, cutIndex) || '/';
}

export function matchesRoutePrefix(path: string, prefix: string): boolean {
  const normalizedPath = normalizeRoutePath(path);

  if (prefix === '/') {
    return normalizedPath === '/';
  }

  return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
}

export function matchesAnyRoutePrefix(
  path: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some((prefix) => matchesRoutePrefix(path, prefix));
}

export function toRouteMatcherPatterns(prefixes: readonly string[]): string[] {
  return prefixes.map((prefix) => (prefix === '/' ? '/' : `${prefix}(.*)`));
}
