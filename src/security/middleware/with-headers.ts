import type { NextRequest, NextResponse } from 'next/server';

import { env } from '@/core/env';
import { resolveEdgeLogger } from '@/core/logger/di-edge';

let _logger:
  | ReturnType<ReturnType<typeof resolveEdgeLogger>['child']>
  | undefined;

function getLogger() {
  if (_logger) return _logger;
  _logger = resolveEdgeLogger().child({
    type: 'Security',
    category: 'csp',
    module: 'with-headers',
  });
  return _logger;
}

/**
 * Shared per-request/per-environment flags used to decide which CSP
 * directive values apply. Computed once and threaded through the small
 * `build*Src` helpers below instead of each helper re-deriving them.
 */
interface CspEnvironment {
  isPreview: boolean;
  isDev: boolean;
}

/**
 * Reconciles the runtime-read `CSP_SCRIPT_MODE` against what the build was
 * actually compiled for (`NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE`, inlined by
 * `next.config.ts` at build time — see its doc comment). Runtime env can
 * drift from build time on a redeploy that changes a platform env var
 * without triggering a rebuild — a live `'nonce-dynamic'` runtime value
 * against a build still compiled `cache-compatible` (`cacheComponents:
 * true` baked in) is exactly SEC-30's original incident, from a different
 * trigger: env drift between build and redeploy, not a missing
 * `next.config.ts` branch.
 *
 * When the build-time value is known and doesn't match, fail safe: use
 * the BUILD's value, since that's what the actually-served bundle can
 * support, and log loudly so the drift gets noticed and fixed (a
 * redeploy) rather than silently emitting a broken CSP on every request.
 * The build-time value is absent (`undefined`) outside an actual Next.js
 * build (tests, or a build predating this check) — the invariant simply
 * doesn't run in that case, `env.CSP_SCRIPT_MODE` is used as-is.
 */
function resolveEffectiveCspMode(): 'cache-compatible' | 'nonce-dynamic' {
  const buildMode = env.NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE;

  if (buildMode === undefined || buildMode === env.CSP_SCRIPT_MODE) {
    return env.CSP_SCRIPT_MODE;
  }

  getLogger().fatal(
    { runtimeMode: env.CSP_SCRIPT_MODE, buildMode },
    'CSP build/runtime invariant violated: runtime CSP_SCRIPT_MODE does not ' +
      'match what this build was compiled for. Using the build value ' +
      '(what the served bundle actually supports) -- redeploy to pick up ' +
      'the runtime env change for real.',
  );
  return buildMode;
}

// The only quoted CSP keyword sources this repo's own CSP-building code
// ever needs to accept from an *_EXTRA env var. Every other quoted token
// (`'unsafe-inline'`, `'unsafe-eval'`, `'nonce-...'`, `'sha256-...'`,
// `'strict-dynamic'`, etc.) is either already emitted by this file's own
// logic when actually needed, or actively dangerous to let an env var
// inject — see SEC-32 in docs/ai/general/SECURITY_CODING_PATTERNS.md.
const ALLOWED_CSP_KEYWORD_SOURCES = new Set(['self', 'none']);

// Keyword-shaped tokens rejected even when NOT quoted -- CSP keyword
// sources are only meaningful quoted, but this repo's baseline should
// never treat a bare `unsafe-inline`/`nonce-x`/`strict-dynamic` typo as
// "just an unusual hostname" (it would otherwise pass a plain hostname
// pattern, since these are all syntactically valid DNS labels).
const DANGEROUS_CSP_KEYWORD_PATTERN =
  /^(unsafe-|nonce-|sha256-|sha384-|sha512-)|^(strict-dynamic|wasm-unsafe-eval|unsafe-hashes|report-sample|inline-speculation-rules)$/i;

// scheme: or scheme://host[...] -- no whitespace, semicolon, quote,
// angle-bracket, or backtick anywhere (any of those could break out of
// the single-source-token context once embedded in the CSP header).
// False-positive scanner finding: the two quantified groups
// (`[a-z0-9+.-]*` and `[^\s;'"<>\`]+`) are disjoint, non-nested character
// classes with no shared characters to backtrack ambiguously over, so
// this is linear-time -- verified empirically (sub-millisecond) against
// 50,000-100,000 character adversarial inputs before suppressing, same
// discipline as SEC-28's regex false-positive notes in
// docs/ai/general/SECURITY_CODING_PATTERNS.md.
// eslint-disable-next-line security/detect-unsafe-regex
const CSP_SCHEME_SOURCE_PATTERN = /^[a-z][a-z0-9+.-]*:(\/\/[^\s;'"<>`]+)?$/i;

// A bare hostname or wildcard-hostname (`example.com`, `*.example.com`,
// `cdn.example.com:8443`) -- standard DNS label syntax, optional port.
// False-positive scanner finding: every quantifier is bounded ({0,61},
// matching a DNS label's real 63-octet limit) with no nested unbounded
// groups, so this is linear-time, not exponential-backtracking -- same
// reasoning as SEC-28's regex false-positive notes in
// docs/ai/general/SECURITY_CODING_PATTERNS.md.
const CSP_HOST_SOURCE_PATTERN =
  // eslint-disable-next-line security/detect-unsafe-regex
  /^\*?\.?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:[0-9]{1,5})?$/i;

/**
 * Validates one whitespace/comma-delimited token from an *_EXTRA env var
 * as a legitimate CSP source expression, rather than trusting it as
 * pre-formed CSP syntax. Returns the canonical output form (quoted for a
 * keyword source, as-is for a host/scheme source) or `null` if the token
 * isn't a valid source expression at all.
 *
 * Without this, a config value like
 * `"https://cdn.example.com; object-src *"` passed straight through
 * (the previous implementation) would silently inject a whole extra
 * `object-src *` directive into the header — and since CSP takes the
 * *first* occurrence of a duplicate directive, that injected value would
 * WIN over this file's own `object-src 'none'` baseline hardening
 * directive, completely defeating it. Confirmed empirically before
 * fixing (SEC-32), not assumed: this exact input was traced through the
 * old `parseExtra()` and the resulting header construction.
 *
 * Wrapping quotes are stripped unconditionally before classifying, not
 * just for keyword sources — a copy-pasted env value like
 * `"https://cdn.example.com"` (literal quote characters, e.g. from a
 * JSON config) is a plain host source once unquoted, same as if it had
 * never been quoted; CSP itself never quotes host/scheme sources, only
 * keyword sources.
 */
function classifyCspSourceToken(rawToken: string): string | null {
  const stripped = rawToken.replace(/^['"]+|['"]+$/g, '');
  if (!stripped || /[;\r\n<>`\s]/.test(stripped)) {
    return null;
  }

  const lower = stripped.toLowerCase();
  if (ALLOWED_CSP_KEYWORD_SOURCES.has(lower)) {
    return `'${lower}'`;
  }
  // Keyword-shaped tokens (unsafe-inline, nonce-x, strict-dynamic, ...)
  // are rejected here even though they'd otherwise pass CSP_HOST_SOURCE_PATTERN
  // as a syntactically-valid-looking single-label hostname -- this repo's
  // baseline must never treat one as "just an unusual host".
  if (DANGEROUS_CSP_KEYWORD_PATTERN.test(lower)) {
    return null;
  }
  if (
    CSP_SCHEME_SOURCE_PATTERN.test(stripped) ||
    CSP_HOST_SOURCE_PATTERN.test(stripped)
  ) {
    return stripped;
  }
  return null;
}

/**
 * Parses an extra-allowlist env var (space/comma separated, optionally
 * quoted tokens) into a CSP-ready, space-separated source list fragment
 * — validating every token as a legitimate CSP source expression first
 * (`classifyCspSourceToken`), not just splitting/trimming/quote-stripping
 * pre-formed CSP syntax. A rejected token is dropped and logged, not
 * silently swallowed, so a misconfiguration is visible rather than a
 * quiet no-op.
 */
function parseExtra(val: string): string {
  if (!val) {
    return '';
  }

  const rawTokens = val.split(/[\s,]+/).filter(Boolean);
  const validTokens: string[] = [];

  for (const rawToken of rawTokens) {
    const classified = classifyCspSourceToken(rawToken);
    if (classified) {
      validTokens.push(classified);
    } else {
      getLogger().warn(
        { rawToken },
        'CSP *_EXTRA config token rejected: not a valid CSP source expression',
      );
    }
  }

  return validTokens.join(' ');
}

/**
 * Clerk domains change shape based on environment: dev/test Clerk keys
 * (`pk_test_...` / `pk_development_...`) and preview/dev deployments talk
 * to `*.clerk.accounts.dev` in addition to the production Clerk domains.
 */
function buildClerkDomains(cspEnv: CspEnvironment): string[] {
  const isClerkDevKey =
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') === true ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_development_') ===
      true;

  const clerkDomains = [
    'https://clerk.com',
    'https://*.clerk.com',
    'https://*.clerk.services',
  ];

  if (cspEnv.isPreview || cspEnv.isDev || isClerkDevKey) {
    clerkDomains.push('https://*.clerk.accounts.dev');
    clerkDomains.push('wss://*.clerk.accounts.dev');
  }

  return clerkDomains;
}

const CLOUDFLARE_DOMAINS = ['https://challenges.cloudflare.com'];
const SENTRY_SCRIPT_DOMAINS = [
  'https://sentry.io',
  'https://*.sentry.io',
  'https://de.sentry.io',
];
const NEW_RELIC_SCRIPT_DOMAIN = 'https://js-agent.newrelic.com';
const VERCEL_INSIGHTS_SCRIPT_DOMAINS = ['https://va.vercel-scripts.com'];
const VERCEL_INSIGHTS_CONNECT_DOMAINS = ['https://vitals.vercel-insights.com'];
const SENTRY_INGEST_DOMAINS = [
  'https://sentry.io',
  'https://*.sentry.io',
  'https://de.sentry.io',
  'https://*.ingest.sentry.io',
  'https://*.ingest.de.sentry.io',
];
const NEW_RELIC_BEACON_DOMAINS = [
  'https://bam.nr-data.net',
  'https://bam.eu01.nr-data.net',
];

/**
 * `script-src` (and identically, `script-src-elem`).
 *
 * @param nonce - When present together with `CSP_SCRIPT_MODE ===
 * 'nonce-dynamic'`, uses `'nonce-<value>' 'strict-dynamic'` instead of
 * `'unsafe-inline' 'unsafe-eval'`. See buildContentSecurityPolicy()'s doc
 * comment for why a missing nonce always falls back to the legacy
 * directive.
 */
function buildScriptSrc(
  cspEnv: CspEnvironment,
  nonce: string | undefined,
  clerkDomains: string[],
): string {
  // Shared host allowlist for both CSP modes. In strict mode this is a
  // fallback for CSP2-only browsers that don't understand 'strict-dynamic'
  // (which browsers that DO support it will ignore in favor of the nonce).
  const allowlist = [
    ...clerkDomains,
    ...CLOUDFLARE_DOMAINS,
    ...SENTRY_SCRIPT_DOMAINS,
    NEW_RELIC_SCRIPT_DOMAIN,
    ...(cspEnv.isPreview || cspEnv.isDev ? VERCEL_INSIGHTS_SCRIPT_DOMAINS : []),
    cspEnv.isPreview ? 'https://vercel.live' : '',
    parseExtra(env.NEXT_PUBLIC_CSP_SCRIPT_EXTRA),
  ].filter(Boolean);

  // 'unsafe-eval' is only ever needed for dev-mode HMR (Turbopack/webpack
  // eval-based source maps) — never in production or preview, in either
  // CSP mode.
  const unsafeEvalIfDev = cspEnv.isDev ? "'unsafe-eval'" : '';

  // A nonce is only meaningful in 'nonce-dynamic' mode. Uses the
  // build/runtime-reconciled mode (A.8.4), not the raw runtime env value
  // directly -- see resolveEffectiveCspMode()'s doc comment.
  const isStrictCsp =
    resolveEffectiveCspMode() === 'nonce-dynamic' && Boolean(nonce);

  return (
    isStrictCsp
      ? [
          "'self'",
          `'nonce-${nonce}'`,
          "'strict-dynamic'",
          ...allowlist,
          unsafeEvalIfDev,
        ]
      : ["'self'", "'unsafe-inline'", unsafeEvalIfDev, ...allowlist]
  )
    .filter(Boolean)
    .join(' ');
}

function buildConnectSrc(
  cspEnv: CspEnvironment,
  clerkDomains: string[],
): string {
  const betterStackDomains = env.BETTERSTACK_ENABLED
    ? ['https://in.logs.betterstack.com']
    : [];

  return [
    "'self'",
    ...clerkDomains,
    ...CLOUDFLARE_DOMAINS,
    ...(cspEnv.isPreview || cspEnv.isDev
      ? VERCEL_INSIGHTS_CONNECT_DOMAINS
      : []),
    'https://clerk-telemetry.com',
    ...SENTRY_INGEST_DOMAINS,
    ...NEW_RELIC_BEACON_DOMAINS,
    ...betterStackDomains,
    cspEnv.isPreview
      ? 'https://vercel.live wss://vercel.live wss://*.pusher.com'
      : '',
    parseExtra(env.NEXT_PUBLIC_CSP_CONNECT_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');
}

function buildFrameSrc(cspEnv: CspEnvironment, clerkDomains: string[]): string {
  return [
    "'self'",
    ...clerkDomains,
    ...CLOUDFLARE_DOMAINS,
    cspEnv.isPreview ? 'https://vercel.live' : '',
    parseExtra(env.NEXT_PUBLIC_CSP_FRAME_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');
}

function buildImgSrc(clerkDomains: string[]): string {
  return [
    "'self'",
    'data:',
    'https://img.clerk.com',
    ...clerkDomains,
    parseExtra(env.NEXT_PUBLIC_CSP_IMG_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');
}

function buildStyleSrc(): string {
  return [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
    parseExtra(env.NEXT_PUBLIC_CSP_STYLE_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');
}

function buildFontSrc(): string {
  return [
    "'self'",
    'https://fonts.gstatic.com',
    parseExtra(env.NEXT_PUBLIC_CSP_FONT_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Builds the Content-Security-Policy header value.
 *
 * Exported (not just used internally by withHeaders) because it must be
 * set on BOTH the response and, when a nonce is present, the request —
 * see proxy.ts's terminalHandler. Next.js auto-applies a nonce to its own
 * internally-generated inline scripts (RSC hydration payload pushes, etc.)
 * by reading the incoming REQUEST's Content-Security-Policy header for a
 * `nonce-` source; it does not use an arbitrary custom header for this.
 * Forwarding only `x-nonce` (for our own <Script>/<ClerkProvider> nonce
 * props) without also forwarding this exact CSP string left Next's own
 * bootstrap scripts un-nonced — under strict-dynamic with no unsafe-inline
 * fallback, the browser blocks them and the page never hydrates.
 *
 * @param nonce - Per-request CSP nonce from RouteContext.nonce (set only
 * when CSP_SCRIPT_MODE is 'nonce-dynamic'). Absent nonce ('cache-compatible'
 * mode, or a caller that built its own NextResponse without going through
 * the proxy pipeline) falls back to the legacy CSP unconditionally — there's no
 * nonce to reference. See buildScriptSrc() for how it's applied.
 */
export function buildContentSecurityPolicy(nonce?: string): string {
  const cspEnv: CspEnvironment = {
    isPreview: env.VERCEL_ENV === 'preview',
    isDev: env.NODE_ENV === 'development',
  };
  const clerkDomains = buildClerkDomains(cspEnv);

  const scriptSrc = buildScriptSrc(cspEnv, nonce, clerkDomains);

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `script-src-elem ${scriptSrc}`,
    `style-src ${buildStyleSrc()}`,
    `img-src ${buildImgSrc(clerkDomains)}`,
    `font-src ${buildFontSrc()}`,
    `connect-src ${buildConnectSrc(cspEnv, clerkDomains)}`,
    `frame-src ${buildFrameSrc(cspEnv, clerkDomains)}`,
    "worker-src 'self' blob:",
    // Baseline hardening directives: block plugin content entirely, stop a
    // <base> tag from rebasing relative URLs off-origin, and stop forms from
    // submitting anywhere but this origin.
    "object-src 'none'",
    // script-src-attr overrides script-src specifically for inline
    // event-handler attributes (onclick=, onerror=, etc.) -- this repo
    // (React/Next) never emits those, so this is free additional hardening
    // on top of whatever script-src itself allows, independent of
    // CSP_SCRIPT_MODE: even in cache-compatible mode, where script-src
    // still needs 'unsafe-inline' for Next's own bootstrap scripts, an
    // inline event-handler attribute injected via some other vector (e.g.
    // a stored-XSS payload landing in unescaped HTML) stays blocked. See
    // SEC-32 in docs/ai/general/SECURITY_CODING_PATTERNS.md.
    "script-src-attr 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Modern superset of X-Frame-Options: DENY, kept alongside it for
    // older-browser defense in depth.
    "frame-ancestors 'none'",
    env.VERCEL_ENV === 'production' ? 'upgrade-insecure-requests' : '',
  ].join('; ');
}

/**
 * Hardens the response with security headers.
 * Implements CSP, HSTS, and other browser-level protections.
 *
 * @param nonce - Forwarded to buildContentSecurityPolicy() — see its doc
 * comment.
 */
export function withHeaders(
  req: NextRequest,
  res: NextResponse,
  nonce?: string,
): NextResponse {
  // 1. Basic Hardening
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  // X-XSS-Protection intentionally omitted: deprecated, removed from modern
  // browser engines, and superseded by the Content-Security-Policy below.

  // 1b. Cross-origin isolation headers.
  // COOP uses `same-origin-allow-popups`, not plain `same-origin` — Clerk's
  // hosted auth flows may rely on popup/opener communication, and the
  // `-allow-popups` variant keeps most of the isolation benefit without
  // risking breaking sign-in.
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  res.headers.set('Origin-Agent-Cluster', '?1');

  // 2. HSTS (Production only)
  if (env.NODE_ENV === 'production') {
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  // 3. Content Security Policy (Environment Aware)
  res.headers.set('Content-Security-Policy', buildContentSecurityPolicy(nonce));

  return res;
}
