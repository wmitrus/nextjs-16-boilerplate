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

export const PUBLIC_ROUTE_PREFIXES = [
  '/',
  '/waitlist',
  '/env-summary',
  '/security-showcase',
  '/sentry-example-page',
  '/monitoring',
  '/feature-flags-demo',
  '/api/security-test/ssrf',
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
