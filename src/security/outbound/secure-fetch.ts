import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';

import ipaddr from 'ipaddr.js';
import { Agent } from 'undici';

import { env } from '@/core/env';
import { logger as baseLogger } from '@/core/logger/server';

import { isSensitiveAuditField } from '@/security/actions/redact';

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
 * Strips a single matching `[`...`]` bracket pair, if present.
 *
 * `new URL(...).hostname` (and `.host`) serialize a literal IPv6 address
 * WITH brackets per the WHATWG URL spec — `new URL('http://[::1]/')
 * .hostname === '[::1]'`, not `'::1'`. This was previously assumed to be
 * unbracketed (a stale, incorrect doc comment claimed otherwise) and every
 * regex in the old private-address predicate silently never matched a
 * literal IPv6 hostname as a result — confirmed empirically, not assumed,
 * before fixing (see SEC-28 "Update" in
 * docs/ai/general/SECURITY_CODING_PATTERNS.md for the full incident). Every
 * IP-literal check in this file must normalize through this first.
 */
function stripBrackets(hostname: string): string {
  if (
    hostname.length > 1 &&
    hostname.startsWith('[') &&
    hostname.endsWith(']')
  ) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

/**
 * Returns true if `hostname` (after bracket-stripping) is a syntactically
 * valid IPv4 or IPv6 literal — using `ipaddr.js`'s own parser rather than a
 * hand-rolled regex, so this accepts every valid literal form (not just the
 * one dotted-quad/colon-shape pattern a regex happens to encode) and
 * correctly rejects a domain name. Used to skip DNS resolution for literal
 * IPs, which are validated directly instead.
 */
function isIpLiteral(hostname: string): boolean {
  return ipaddr.isValid(stripBrackets(hostname));
}

/**
 * Checks an IPv4 or IPv6 literal against every non-globally-routable range
 * — not an enumerated blocklist that can (and did) drift out of date, but a
 * default-deny classification: `ipaddr.js`'s `.range()` buckets a parsed
 * address into a named category (`unicast`, `private`, `loopback`,
 * `linkLocal`, `uniqueLocal`, `multicast`, `reserved`, `broadcast`,
 * `carrierGradeNat`, `6to4`, `rfc6052` (NAT64), etc.) and this function
 * blocks everything except the one "ordinary public address" bucket,
 * `unicast`. This also means NAT64 (64:ff9b::/96) and 6to4 (2002::/16)
 * addresses — both ways to smuggle a private IPv4 target inside a
 * "globally routable-looking" IPv6 literal — are rejected outright rather
 * than needing their own unwrap-and-recheck step: neither range is ever
 * classified as `unicast` by `ipaddr.js`, and this app has no legitimate
 * reason to dial either transition mechanism directly.
 *
 * `ipaddr.js`'s `process()` also unwraps IPv4-mapped IPv6 addresses
 * (`::ffff:10.0.0.1`) to their underlying IPv4 form before classifying,
 * replacing the previous hand-rolled `::ffff:` regex.
 */
function isPrivateOrReservedAddress(hostname: string): boolean {
  const stripped = stripBrackets(hostname);

  if (!ipaddr.isValid(stripped)) {
    // Not actually an IP literal at all -- callers only reach this after
    // isIpLiteral() already confirmed it is, but fail closed rather than
    // silently treating an unparseable value as safe.
    return true;
  }

  return ipaddr.process(stripped).range() !== 'unicast';
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

/**
 * Returns `origin + pathname` only — no search params, no hash, no
 * userinfo. See `resolveAndValidateHost()`'s call site for why (SEC-22 /
 * A.8.3): a full URL can carry a token/secret/session value in its query
 * string, and this must never reach a log call.
 */
function redactUrlForLogging(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

function toPinnedFamily(record: LookupAddress): 4 | 6 {
  return record.family === 6 ? 6 : 4;
}

/**
 * Races `promise` against `signal` firing, rejecting the moment the signal
 * aborts rather than waiting for `promise` to settle on its own.
 *
 * This exists specifically because `dns.promises.lookup()` has no
 * `AbortSignal` support at all -- confirmed empirically before relying on
 * this (SEC-32 / A.8 follow-up): passing a `signal` option to it is
 * silently ignored, and an already-aborted signal doesn't stop it either.
 * `promise` itself keeps running to completion in the background (its
 * result is simply never awaited by the caller past the deadline) — this
 * doesn't cancel the underlying c-ares DNS resolution, since Node gives no
 * way to do that, but it does stop `secureFetch()`'s caller from being
 * left waiting on it past `SECURITY_OUTBOUND_FETCH_TIMEOUT_MS`, which is
 * the actual guarantee this function exists to make good on.
 */
function raceWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new Error('Aborted'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error as Error);
      },
    );
  });
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
/**
 * DNS-resolution branch of `resolveAndValidateHost()`, split out to keep
 * each function's line count readable — this is the "not a literal IP"
 * path: resolve via `node:dns/promises`, then apply the same
 * private/reserved-address classification to every returned record.
 *
 * `overallSignal` is the same one call-`secureFetch()`-wide budget that
 * guards `fetchHop()`'s `fetch()` call — threaded in here too so DNS
 * resolution, which happens *before* any `fetch()` call and previously had
 * no deadline of its own, is covered by the same
 * `SECURITY_OUTBOUND_FETCH_TIMEOUT_MS` guarantee instead of being able to
 * hang indefinitely (SEC-32 / A.8 follow-up — see `raceWithSignal()`'s doc
 * comment for why this can't just pass `signal` to `lookup()` directly).
 */
async function resolveViaDns(
  normalizedHostname: string,
  redactedUrl: string,
  overallSignal: AbortSignal,
): Promise<PinnedAddress> {
  let records: LookupAddress[];
  try {
    records = await raceWithSignal(
      lookup(normalizedHostname, { all: true, verbatim: true }),
      overallSignal,
    );
  } catch (error) {
    if (overallSignal.aborted) {
      logger.error(
        { hostname: normalizedHostname, url: redactedUrl },
        'SSRF Protection: DNS resolution exceeded the overall request deadline, failing closed',
      );
      throw new Error(
        `SSRF Protection: DNS resolution for ${normalizedHostname} timed out`,
      );
    }
    logger.error(
      {
        hostname: normalizedHostname,
        url: redactedUrl,
        errorMessage: (error as Error).message,
      },
      'SSRF Protection: DNS resolution failed, failing closed',
    );
    throw new Error(
      `SSRF Protection: Host ${normalizedHostname} resolves to a disallowed address`,
    );
  }

  const unsafeRecord = records.find((record) =>
    isPrivateOrReservedAddress(record.address),
  );
  if (unsafeRecord || records.length === 0) {
    logger.error(
      { hostname: normalizedHostname, url: redactedUrl },
      'SSRF Attempt Blocked: Host resolves to a private or reserved address',
    );
    throw new Error(
      `SSRF Protection: Host ${normalizedHostname} resolves to a disallowed address`,
    );
  }

  const [chosen] = records;
  return { address: chosen.address, family: toPinnedFamily(chosen) };
}

/**
 * Refuses any hop that is not HTTPS.
 *
 * Checked FIRST, before the allowlist and before any DNS work, because it is
 * the one rule that holds regardless of who the host is: an allowlisted,
 * public, correctly-pinned host reached over `http://` still puts every
 * `Authorization` header, API key and request body on the wire in clear.
 *
 * Because `resolveAndValidateHost` runs for every hop, this also closes the
 * downgrade a redirect could otherwise perform -- `https://trusted` answering
 * `307 -> http://trusted` is rejected on the next iteration rather than
 * followed in cleartext.
 *
 * The dev escape hatch is deliberately inert in production. Making it a
 * config value that production simply ignores (and says so) means a stray
 * `SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP=true` in a deployed environment
 * cannot quietly downgrade live traffic -- the failure mode of a flag that
 * production honours is exactly the accident this must not permit.
 *
 * See SEC-39 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 */
function assertHttpsProtocol(url: URL, redactedUrl: string): void {
  if (url.protocol === 'https:') {
    return;
  }

  const isProduction = env.NODE_ENV === 'production';

  if (env.SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP && !isProduction) {
    logger.warn(
      { url: redactedUrl, protocol: url.protocol },
      'Outbound plaintext request allowed by SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP (never honoured in production)',
    );
    return;
  }

  logger.error(
    {
      url: redactedUrl,
      protocol: url.protocol,
      insecureFlagSetButIgnored:
        isProduction && env.SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP,
    },
    'Outbound request blocked: secureFetch is HTTPS-only',
  );

  throw new Error(
    `SSRF Protection: Outbound requests must use https, received ${url.protocol}`,
  );
}

async function resolveAndValidateHost(
  hostname: string,
  urlForLogging: URL,
  overallSignal: AbortSignal,
): Promise<PinnedAddress> {
  // Normalize once, up front -- `currentUrl.hostname` brackets a literal
  // IPv6 address (see stripBrackets()'s doc comment), and every check
  // below (allowlist match, IP-literal detection, private-range
  // classification, the DNS lookup call, error messages) must agree on
  // the same unbracketed form or a bracketed literal silently bypasses
  // whichever check still expects brackets absent.
  const normalizedHostname = stripBrackets(hostname);
  // Redacted once, reused at every log call below -- a full URL can carry
  // a token/secret/session value in its query string; SEC-22 already
  // established "never log a full one-time URL or token" for other call
  // sites in this repo, this file just never had it applied (A.8.3).
  const redactedUrl = redactUrlForLogging(urlForLogging);

  assertHttpsProtocol(urlForLogging, redactedUrl);

  if (!isHostAllowlisted(normalizedHostname)) {
    logger.error(
      { hostname: normalizedHostname, url: redactedUrl },
      'SSRF Attempt Blocked: Outbound request to untrusted host',
    );
    throw new Error(
      `SSRF Protection: Host ${normalizedHostname} is not allowed`,
    );
  }

  if (!isIpLiteral(normalizedHostname)) {
    return resolveViaDns(normalizedHostname, redactedUrl, overallSignal);
  }

  if (isPrivateOrReservedAddress(normalizedHostname)) {
    logger.error(
      { hostname: normalizedHostname, url: redactedUrl },
      'SSRF Attempt Blocked: Outbound request to private/reserved literal address',
    );
    throw new Error(
      `SSRF Protection: Host ${normalizedHostname} is not allowed`,
    );
  }
  return {
    address: normalizedHostname,
    family: normalizedHostname.includes(':') ? 6 : 4,
  };
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

// Always stripped on a cross-origin redirect hop, mirroring what a
// spec-compliant browser fetch does automatically on Authorization (this
// repo's manual redirect replay is responsible for reproducing that itself
// — see this function's doc comment) plus Cookie/Proxy-Authorization, since
// secureFetch has no same-origin-scoped cookie jar to rely on instead.
const ALWAYS_STRIP_ON_CROSS_ORIGIN_REDIRECT = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
]);

/**
 * Strips credential-shaped request headers before a redirect hop crosses
 * origins.
 *
 * `secureFetch()` uses `redirect: 'manual'` and manually replays
 * `currentInit` on every hop (see `secureFetch()`'s own doc comment) —
 * unlike a spec-compliant browser fetch, which strips `Authorization` on a
 * cross-origin redirect automatically, nothing here did that stripping on
 * its own. Without it, a caller-supplied `Authorization` (or any other
 * credential-bearing header) was carried forward verbatim to every
 * redirect hop, including a hop that lands on a *different, but still
 * allowlisted*, origin — this repo, not the platform, owns reproducing
 * that spec behavior once redirects are handled manually.
 *
 * Strips the always-listed headers above plus anything matching
 * `isSensitiveAuditField()` (the same token/secret/password/credential/
 * session/api-key pattern list `src/security/actions/redact.ts` already
 * uses for audit-log redaction — reused here rather than duplicated) so a
 * caller's custom auth header (`X-Api-Token`, etc.) is caught too, not
 * just the three named ones.
 */
function stripSensitiveHeadersForCrossOriginRedirect(
  headers: HeadersInit | undefined,
): Headers {
  const result = new Headers(headers);
  for (const name of [...result.keys()]) {
    if (
      ALWAYS_STRIP_ON_CROSS_ORIGIN_REDIRECT.has(name.toLowerCase()) ||
      isSensitiveAuditField(name)
    ) {
      result.delete(name);
    }
  }
  return result;
}

/**
 * Reads a `Response` body via its stream reader, accumulating chunks and
 * throwing the moment the running byte count exceeds `maxBytes` — instead
 * of `response.arrayBuffer()`'s unconditional full-buffer read, which has
 * no size limit at all. A malicious or misbehaving upstream that a
 * validated host redirects to (or the validated host itself) could
 * otherwise exhaust memory by streaming an unbounded body; this caps that
 * regardless of what `Content-Length` claims (a claim the sender doesn't
 * have to honor).
 */
async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
): Promise<ArrayBuffer> {
  if (!response.body) {
    return new ArrayBuffer(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(
        `SSRF Protection: Response body exceeded the ${maxBytes}-byte limit`,
      );
    }
    chunks.push(value);
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

/**
 * Composes the per-call overall timeout signal with a caller-supplied one
 * (if given), so a caller can still cancel independently of secureFetch's
 * own budget.
 */
function buildOverallSignal(
  callerSignal: AbortSignal | null | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
}

/**
 * Performs one hop's actual `fetch()` call against an already-validated,
 * connection-pinned URL.
 *
 * A generic "user-controlled URL reaches an HTTP client" SAST rule will
 * always flag this call in any implementation of this pattern — it can't
 * see that `currentUrl` was just validated (allowlist + private-address +
 * DNS-rebinding check, via `resolveAndValidateHost`) immediately before
 * this function is called, on every iteration of the caller's loop, for
 * the original URL and for every redirect hop alike. This fetch() call,
 * right here, is the sanctioned exit point that validation exists to
 * gate. See SEC-28's "SAST Finding — Reviewed and Accepted" note in
 * docs/ai/general/SECURITY_CODING_PATTERNS.md before assuming this needs
 * a different shape.
 *
 * Translates an aborted request (the overall timeout, or a caller's own
 * signal firing) into a clearly-labeled SSRF Protection error instead of
 * letting a raw AbortError/DOMException escape.
 */
async function fetchHop(
  currentUrl: URL,
  currentInit: RequestInit | undefined,
  overallSignal: AbortSignal,
  agent: Agent,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(currentUrl, {
      ...currentInit,
      redirect: 'manual',
      signal: overallSignal,
      // undici-specific, not part of the standard RequestInit type —
      // Node's fetch recognizes it to route the request through a
      // caller-supplied dispatcher instead of the global one.
      dispatcher: agent,
    } as RequestInit & { dispatcher: Agent });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      throw new Error(
        `SSRF Protection: Request to ${redactUrlForLogging(currentUrl)} ` +
          `timed out after ${timeoutMs}ms`,
      );
    }
    throw error;
  }
}

/**
 * Buffers a terminal (non-redirect) response into an independent
 * `Response` object, bounded to `maxBytes` — see
 * `readBoundedResponseBody()`'s doc comment. Independent of the
 * per-request pinned Agent, which the caller closes separately.
 */
async function buildFinalResponse(
  rawResponse: Response,
  maxBytes: number,
): Promise<Response> {
  const buffer = await readBoundedResponseBody(rawResponse, maxBytes);
  return new Response(buffer, {
    status: rawResponse.status,
    statusText: rawResponse.statusText,
    headers: rawResponse.headers,
  });
}

interface NextHop {
  url: URL;
  init: RequestInit | undefined;
}

/**
 * Computes the next hop's URL and request init after a redirect response:
 * `Location` header validation, the too-many-redirects bound, standard
 * method/body downgrade semantics (`requestInitForRedirect`), and
 * cross-origin credential stripping
 * (`stripSensitiveHeadersForCrossOriginRedirect`, A.8.2).
 */
function prepareNextHop(
  rawResponse: Response,
  currentUrl: URL,
  currentInit: RequestInit | undefined,
  originalUrl: string,
  hopsRemaining: number,
): NextHop {
  const location = rawResponse.headers.get('location');
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

  const nextUrl = new URL(location, currentUrl);
  let nextInit = requestInitForRedirect(currentInit, rawResponse.status);
  if (nextUrl.origin !== currentUrl.origin) {
    nextInit = {
      ...nextInit,
      headers: stripSensitiveHeadersForCrossOriginRedirect(nextInit?.headers),
    };
  }
  return { url: nextUrl, init: nextInit };
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
 *
 * Also bounded in two other ways (A.8.3): an overall wall-clock timeout
 * (`SECURITY_OUTBOUND_FETCH_TIMEOUT_MS`) spanning every hop combined — not
 * reset per hop, so a chain of redirects can't add up to an unbounded
 * total wait, and covering DNS resolution too (`raceWithSignal()`, SEC-32 /
 * A.8 follow-up), not just each hop's `fetch()` call — and a response-body
 * size cap (`SECURITY_OUTBOUND_FETCH_MAX_BYTES`), read via
 * `readBoundedResponseBody` rather than an unconditional full buffer.
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
  // One overall budget for the whole call, every hop included -- not reset
  // per hop, so a chain of redirects can't add up to an unbounded total
  // wait.
  const overallSignal = buildOverallSignal(
    init?.signal,
    env.SECURITY_OUTBOUND_FETCH_TIMEOUT_MS,
  );

  for (;;) {
    const pinned = await resolveAndValidateHost(
      currentUrl.hostname,
      currentUrl,
      overallSignal,
    );
    const agent = new Agent({ connect: { lookup: buildPinnedLookup(pinned) } });

    try {
      const rawResponse = await fetchHop(
        currentUrl,
        currentInit,
        overallSignal,
        agent,
        env.SECURITY_OUTBOUND_FETCH_TIMEOUT_MS,
      );

      if (!REDIRECT_STATUSES.has(rawResponse.status)) {
        return await buildFinalResponse(
          rawResponse,
          env.SECURITY_OUTBOUND_FETCH_MAX_BYTES,
        );
      }

      await rawResponse.body?.cancel().catch(() => undefined);
      const nextHop = prepareNextHop(
        rawResponse,
        currentUrl,
        currentInit,
        originalUrl,
        hopsRemaining,
      );
      hopsRemaining -= 1;
      currentInit = nextHop.init;
      currentUrl = nextHop.url;
      // Loop back around — the new currentUrl.hostname goes through the
      // exact same resolveAndValidateHost() pipeline on the next
      // iteration before anything is connected to.
    } finally {
      await agent.close();
    }
  }
}
