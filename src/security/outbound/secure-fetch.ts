import { env } from '@/core/env';
import { logger } from '@/core/logger/server';

/**
 * Secure fetch wrapper that prevents SSRF attacks.
 */
export async function secureFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const targetUrl = typeof url === 'string' ? new URL(url) : url;
  const hostname = targetUrl.hostname;

  // 1. Check Allowlist from Environment
  const allowedHosts = env.SECURITY_ALLOWED_OUTBOUND_HOSTS.split(',').map((h) =>
    h.trim(),
  );

  // Auto-allow Clerk domains in any environment to ensure core functionality
  const coreAllowed = [
    'clerk.com',
    'api.clerk.com',
    'clerk.services',
    'clerk-telemetry.com',
    'clerk.accounts.dev',
    'api.github.com',
  ];

  const isAllowed =
    allowedHosts.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    ) ||
    coreAllowed.some(
      (core) => hostname === core || hostname.endsWith(`.${core}`),
    );

  // 2. Block internal/private IPs (RFC1918)
  const isPrivate =
    /^(?:10|127|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\./.test(hostname) ||
    hostname === 'localhost';

  if (!isAllowed || isPrivate) {
    logger.error(
      { hostname, url: targetUrl.toString() },
      'SSRF Attempt Blocked: Outbound request to untrusted or private host',
    );
    throw new Error(`SSRF Protection: Host ${hostname} is not allowed`);
  }

  return fetch(targetUrl, init);
}
