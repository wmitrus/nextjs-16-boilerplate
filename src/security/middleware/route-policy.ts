export const AUTH_ROUTE_PREFIXES = ['/sign-in', '/sign-up'] as const;

export const PUBLIC_ROUTE_PREFIXES = [
  '/',
  '/waitlist',
  '/security-showcase',
  '/sentry-example-page',
  '/monitoring',
  '/api/security-test/ssrf',
  '/api/logs',
] as const;

export function matchesRoutePrefix(path: string, prefix: string): boolean {
  if (prefix === '/') {
    return path === '/';
  }

  return path === prefix || path.startsWith(`${prefix}/`);
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
