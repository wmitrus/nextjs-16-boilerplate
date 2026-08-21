import { lookup } from 'node:dns/promises';

import { env } from '@/core/env';
import { logger as baseLogger } from '@/core/logger/server';

const logger = baseLogger.child({
  type: 'Security',
  category: 'ssrf',
  module: 'secure-fetch',
});

/**
 * Returns true if `hostname` is an IPv4 dotted-quad or an IPv6 literal (as
 * returned by `URL.hostname`, which is unbracketed — `new URL('http://[::1]/')
 * .hostname === '::1'`). Used to skip DNS resolution for literal IPs, which
 * the caller has already checked directly.
 */
function isIpLiteral(hostname: string): boolean {
  // False-positive scanner finding: quantifiers are bounded ({1,3}, fixed
  // {3} repetition, no nested unbounded groups), so this is linear-time, not
  // exponential-backtracking. See SEC-28 in
  // docs/ai/general/SECURITY_CODING_PATTERNS.md.
  // eslint-disable-next-line security/detect-unsafe-regex
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

/**
 * Checks an IPv4 or IPv6 literal against the private/reserved/link-local
 * ranges that must never be reachable via an outbound fetch: RFC1918 (IPv4
 * private), IPv4 link-local (169.254.0.0/16), 0.0.0.0/8, IPv6 loopback
 * (::1), IPv6 link-local (fe80::/10), IPv6 unique-local (fc00::/7), and
 * IPv4-mapped IPv6 addresses carrying any of the above (::ffff:10.0.0.1).
 */
function isPrivateOrReservedAddress(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  // Same bounded-quantifier false-positive reasoning as isIpLiteral (SEC-28).
  // eslint-disable-next-line security/detect-unsafe-regex
  const ipv4MappedMatch = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  const ipv4Candidate = ipv4MappedMatch ? ipv4MappedMatch[1] : normalized;

  const isPrivateIPv4 =
    /^(?:10|127|0|169\.254|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\./.test(
      ipv4Candidate,
    );

  const isPrivateIPv6 =
    normalized === '::1' ||
    normalized === '::' ||
    /^fe[89ab][0-9a-f]:/.test(normalized) || // link-local fe80::/10
    /^f[cd][0-9a-f]{2}:/.test(normalized); // unique-local fc00::/7

  return isPrivateIPv4 || isPrivateIPv6 || normalized === 'localhost';
}

/**
 * Resolves `hostname` and checks whether ANY resolved address is
 * private/reserved — the DNS-rebinding defense. An allowlisted hostname is
 * only as safe as the address it actually resolves to at fetch time; without
 * this, an attacker-controlled DNS record for an otherwise-allowed-looking
 * name could point at an internal address. Fails closed: a resolution error
 * is treated as unsafe rather than silently allowed through.
 */
async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  if (isIpLiteral(hostname)) {
    // Already checked directly by the caller — nothing to resolve.
    return false;
  }

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.some((record) => isPrivateOrReservedAddress(record.address));
  } catch (error) {
    logger.error(
      { hostname, errorMessage: (error as Error).message },
      'SSRF Protection: DNS resolution failed, failing closed',
    );
    return true;
  }
}

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

  // Detect development/preview Clerk instance — mirrors the CSP guard in with-headers.ts
  const isDevClerkKey =
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') === true ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_development_') ===
      true;
  const isPreview = env.VERCEL_ENV === 'preview';
  const isDev = env.NODE_ENV === 'development';

  // Auto-allow Clerk domains required for core functionality.
  // clerk.accounts.dev is only included for dev/preview environments or when
  // a development Clerk key is detected — it is never reachable from a
  // production Clerk application.
  const coreAllowed = [
    'clerk.com',
    'api.clerk.com',
    'clerk.services',
    'clerk-telemetry.com',
    ...(isDev || isPreview || isDevClerkKey ? ['clerk.accounts.dev'] : []),
    'api.github.com',
  ];

  const isAllowed =
    allowedHosts.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    ) ||
    coreAllowed.some(
      (core) => hostname === core || hostname.endsWith(`.${core}`),
    );

  // 2. Block internal/private/reserved literal addresses.
  const isPrivate = isPrivateOrReservedAddress(hostname);

  if (!isAllowed || isPrivate) {
    logger.error(
      { hostname, url: targetUrl.toString() },
      'SSRF Attempt Blocked: Outbound request to untrusted or private host',
    );
    throw new Error(`SSRF Protection: Host ${hostname} is not allowed`);
  }

  // 3. Resolve-then-check: an allowlisted hostname must still resolve to a
  //    public address at fetch time (DNS-rebinding defense).
  if (await resolvesToPrivateAddress(hostname)) {
    logger.error(
      { hostname, url: targetUrl.toString() },
      'SSRF Attempt Blocked: Host resolves to a private or reserved address',
    );
    throw new Error(
      `SSRF Protection: Host ${hostname} resolves to a disallowed address`,
    );
  }

  return fetch(targetUrl, init);
}
