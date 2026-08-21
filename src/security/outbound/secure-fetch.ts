import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';

import { Agent } from 'undici';

import { env } from '@/core/env';
import { logger as baseLogger } from '@/core/logger/server';

const logger = baseLogger.child({
  type: 'Security',
  category: 'ssrf',
  module: 'secure-fetch',
});

// Bounded redirect-follow count. Every hop is re-validated through the same
// allowlist + private-address pipeline as the original URL — this is not a
// convenience limit, it's what makes following redirects at all safe.
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Returns true if `hostname` is an IPv4 dotted-quad or an IPv6 literal (as
 * returned by `URL.hostname`, which is unbracketed — `new URL('http://[::1]/')
 * .hostname === '::1'`). Used to skip DNS resolution for literal IPs, which
 * are validated directly instead.
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
 * Returns true if `hostname` is on the outbound allowlist — either the
 * env-configured `SECURITY_ALLOWED_OUTBOUND_HOSTS` list or a core host this
 * app always needs (Clerk, GitHub). Pure allowlist membership check; does
 * not consider whether the hostname (or what it resolves to) is private.
 */
function isHostAllowlisted(hostname: string): boolean {
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

  return (
    allowedHosts.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    ) ||
    coreAllowed.some(
      (core) => hostname === core || hostname.endsWith(`.${core}`),
    )
  );
}

interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

function toPinnedFamily(record: LookupAddress): 4 | 6 {
  return record.family === 6 ? 6 : 4;
}

/**
 * Validates `hostname` (allowlist + not private/reserved) and, for a
 * resolvable name, resolves it to a single address to pin the actual
 * connection to.
 *
 * This is the real DNS-rebinding/TOCTOU defense. A hostname is only as safe
 * as the address a socket actually connects to — checking a resolved
 * address here and then handing the *hostname* back to a generic fetch()
 * leaves a window where a second, independent DNS query (performed deep
 * inside the HTTP client at connect time) can return a different, private
 * address than the one just validated. Returning the validated address
 * itself, for the caller to pin the connection to via a custom resolver,
 * closes that window entirely — there is no second query to race.
 *
 * Fails closed: a resolution error is treated as unsafe rather than
 * silently allowed through.
 */
async function resolveAndValidateHost(
  hostname: string,
  urlForLogging: string,
): Promise<PinnedAddress> {
  if (!isHostAllowlisted(hostname)) {
    logger.error(
      { hostname, url: urlForLogging },
      'SSRF Attempt Blocked: Outbound request to untrusted host',
    );
    throw new Error(`SSRF Protection: Host ${hostname} is not allowed`);
  }

  if (isIpLiteral(hostname)) {
    if (isPrivateOrReservedAddress(hostname)) {
      logger.error(
        { hostname, url: urlForLogging },
        'SSRF Attempt Blocked: Outbound request to private/reserved literal address',
      );
      throw new Error(`SSRF Protection: Host ${hostname} is not allowed`);
    }
    return { address: hostname, family: hostname.includes(':') ? 6 : 4 };
  }

  let records: LookupAddress[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    logger.error(
      { hostname, url: urlForLogging, errorMessage: (error as Error).message },
      'SSRF Protection: DNS resolution failed, failing closed',
    );
    throw new Error(
      `SSRF Protection: Host ${hostname} resolves to a disallowed address`,
    );
  }

  const unsafeRecord = records.find((record) =>
    isPrivateOrReservedAddress(record.address),
  );
  if (unsafeRecord || records.length === 0) {
    logger.error(
      { hostname, url: urlForLogging },
      'SSRF Attempt Blocked: Host resolves to a private or reserved address',
    );
    throw new Error(
      `SSRF Protection: Host ${hostname} resolves to a disallowed address`,
    );
  }

  const [chosen] = records;
  return { address: chosen.address, family: toPinnedFamily(chosen) };
}

/**
 * Builds a `dns.lookup`-compatible resolver that always returns `pinned`,
 * regardless of what hostname is asked. Handed to a per-request undici
 * `Agent` as `connect.lookup` — the socket's own connect-time DNS step is
 * short-circuited to the exact address `resolveAndValidateHost` already
 * validated, so nothing about the actual TCP/TLS connection is re-resolved
 * from scratch. The original hostname is untouched everywhere else (URL,
 * Host header, TLS SNI), so certificate validation and virtual hosting keep
 * working normally — only the address lookup is pinned.
 */
function buildPinnedLookup(pinned: PinnedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [{ address: pinned.address, family: pinned.family }]);
    } else {
      callback(null, pinned.address, pinned.family);
    }
  };
}

/**
 * Adjusts the request init carried across a redirect hop per standard HTTP
 * redirect semantics: a 303 always downgrades to GET with no body; a
 * 301/302 downgrades a non-GET/HEAD request to GET (long-standing browser
 * behavior for those codes); 307/308 preserve method and body unchanged.
 */
function requestInitForRedirect(
  current: RequestInit | undefined,
  status: number,
): RequestInit | undefined {
  const method = current?.method?.toUpperCase() ?? 'GET';

  if (
    status === 303 ||
    ((status === 301 || status === 302) &&
      method !== 'GET' &&
      method !== 'HEAD')
  ) {
    return { ...current, method: 'GET', body: undefined };
  }

  return current;
}

/**
 * Secure fetch wrapper that prevents SSRF attacks.
 *
 * Every hostname the request ever actually touches — the original URL, and
 * every redirect hop it follows — goes through the same pipeline:
 * allowlist check, private/reserved-address check, and a connection pinned
 * to the exact address that check validated (see `resolveAndValidateHost`
 * and `buildPinnedLookup`). Redirects are followed manually
 * (`redirect: 'manual'`) up to `MAX_REDIRECTS` hops specifically so a
 * 30x response can never hand control to an address this function hasn't
 * itself validated.
 */
export async function secureFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const originalUrl = typeof url === 'string' ? url : url.toString();
  let currentUrl =
    typeof url === 'string' ? new URL(url) : new URL(url.toString());
  let currentInit = init;
  let hopsRemaining = MAX_REDIRECTS;

  for (;;) {
    const pinned = await resolveAndValidateHost(
      currentUrl.hostname,
      currentUrl.toString(),
    );
    const agent = new Agent({ connect: { lookup: buildPinnedLookup(pinned) } });

    try {
      // A generic "user-controlled URL reaches an HTTP client" SAST rule
      // will always flag this line in any implementation of this pattern —
      // it can't see that `currentUrl` was just validated (allowlist +
      // private-address + DNS-rebinding check) two lines up, on every
      // iteration of this loop, for the original URL and for every
      // redirect hop alike. This fetch() call, right here, is the
      // sanctioned exit point that validation exists to gate. See SEC-28's
      // "SAST Finding — Reviewed and Accepted" note in
      // docs/ai/general/SECURITY_CODING_PATTERNS.md before assuming this
      // needs a different shape.
      const rawResponse = await fetch(currentUrl, {
        ...currentInit,
        redirect: 'manual',
        // undici-specific, not part of the standard RequestInit type —
        // Node's fetch recognizes it to route the request through a
        // caller-supplied dispatcher instead of the global one.
        dispatcher: agent,
      } as RequestInit & { dispatcher: Agent });

      if (!REDIRECT_STATUSES.has(rawResponse.status)) {
        // Buffer fully so the returned Response is independent of this
        // per-request pinned Agent, which is closed in `finally` below.
        const buffer = await rawResponse.arrayBuffer();
        return new Response(buffer, {
          status: rawResponse.status,
          statusText: rawResponse.statusText,
          headers: rawResponse.headers,
        });
      }

      const location = rawResponse.headers.get('location');
      await rawResponse.body?.cancel().catch(() => undefined);

      if (!location) {
        throw new Error(
          `SSRF Protection: Redirect from ${currentUrl.toString()} had no Location header`,
        );
      }
      if (hopsRemaining <= 0) {
        throw new Error(
          `SSRF Protection: Too many redirects starting from ${originalUrl}`,
        );
      }

      hopsRemaining -= 1;
      currentInit = requestInitForRedirect(currentInit, rawResponse.status);
      currentUrl = new URL(location, currentUrl);
      // Loop back around — the new currentUrl.hostname goes through the
      // exact same resolveAndValidateHost() pipeline on the next
      // iteration before anything is connected to.
    } finally {
      await agent.close();
    }
  }
}
