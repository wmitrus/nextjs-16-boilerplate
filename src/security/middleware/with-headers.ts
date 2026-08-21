import type { NextRequest, NextResponse } from 'next/server';

import { env } from '@/core/env';

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
 * Parses an extra-allowlist env var (space/comma separated, optionally
 * quoted tokens) into a CSP-ready, space-separated source list fragment.
 */
function parseExtra(val: string): string {
  if (!val) {
    return '';
  }

  return val
    .split(/[\s,]+/)
    .map((token) => token.trim().replace(/^['"]+|['"]+$/g, ''))
    .filter(Boolean)
    .join(' ');
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
 * @param nonce - When present together with `CSP_SCRIPT_STRICT_MODE`, uses
 * `'nonce-<value>' 'strict-dynamic'` instead of `'unsafe-inline'
 * 'unsafe-eval'`. See buildContentSecurityPolicy()'s doc comment for why a
 * missing nonce always falls back to the legacy directive.
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

  // A nonce is only meaningful together with CSP_SCRIPT_STRICT_MODE.
  const isStrictCsp = env.CSP_SCRIPT_STRICT_MODE && Boolean(nonce);

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
 * when CSP_SCRIPT_STRICT_MODE is on). Absent nonce (strict mode off, or a
 * caller that built its own NextResponse without going through the proxy
 * pipeline) falls back to the legacy CSP unconditionally — there's no
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
