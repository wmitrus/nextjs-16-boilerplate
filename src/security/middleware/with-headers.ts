import type { NextRequest, NextResponse } from 'next/server';

import { env } from '@/core/env';

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
 * when CSP_SCRIPT_STRICT_MODE is on). When present, script-src uses
 * `'nonce-<value>' 'strict-dynamic'` instead of `'unsafe-inline'
 * 'unsafe-eval'`. Absent nonce (strict mode off, or a caller that built its
 * own NextResponse without going through the proxy pipeline) falls back to
 * the legacy CSP unconditionally — there's no nonce to reference.
 */
export function buildContentSecurityPolicy(nonce?: string): string {
  const isPreview = env.VERCEL_ENV === 'preview';
  const isDev = env.NODE_ENV === 'development';

  // Detect if using development/test Clerk keys
  const isClerkDevKey =
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') === true ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_development_') ===
      true;

  // Helper to parse extra allowlists from env
  const parseExtra = (val: string) => {
    if (!val) {
      return '';
    }

    return val
      .split(/[\s,]+/)
      .map((token) => token.trim().replace(/^['"]+|['"]+$/g, ''))
      .filter(Boolean)
      .join(' ');
  };

  const clerkDomains = [
    'https://clerk.com',
    'https://*.clerk.com',
    'https://*.clerk.services',
  ];

  if (isPreview || isDev || isClerkDevKey) {
    clerkDomains.push('https://*.clerk.accounts.dev');
    clerkDomains.push('wss://*.clerk.accounts.dev');
  }

  const cloudflareDomains = ['https://challenges.cloudflare.com'];

  const vercelInsightsScriptDomains = ['https://va.vercel-scripts.com'];
  const vercelInsightsConnectDomains = ['https://vitals.vercel-insights.com'];

  const sentryScriptDomains = [
    'https://sentry.io',
    'https://*.sentry.io',
    'https://de.sentry.io',
  ];

  const newRelicScriptDomain = 'https://js-agent.newrelic.com';

  // Shared host allowlist for both CSP modes. In strict mode this is a
  // fallback for CSP2-only browsers that don't understand 'strict-dynamic'
  // (which browsers that DO support it will ignore in favor of the nonce).
  const scriptSrcAllowlist = [
    ...clerkDomains,
    ...cloudflareDomains,
    ...sentryScriptDomains,
    newRelicScriptDomain,
    ...(isPreview || isDev ? vercelInsightsScriptDomains : []),
    isPreview ? 'https://vercel.live' : '',
    parseExtra(env.NEXT_PUBLIC_CSP_SCRIPT_EXTRA),
  ].filter(Boolean);

  // 'unsafe-eval' is only ever needed for dev-mode HMR (Turbopack/webpack
  // eval-based source maps) — never in production or preview, in either
  // CSP mode.
  const unsafeEvalIfDev = isDev ? "'unsafe-eval'" : '';

  // A nonce is only meaningful together with CSP_SCRIPT_STRICT_MODE — see
  // this function's doc comment for why a missing nonce always falls back
  // to the legacy CSP rather than emitting a nonce directive with nothing
  // to reference.
  const isStrictCsp = env.CSP_SCRIPT_STRICT_MODE && Boolean(nonce);

  const scriptSrc = (
    isStrictCsp
      ? [
          "'self'",
          `'nonce-${nonce}'`,
          "'strict-dynamic'",
          ...scriptSrcAllowlist,
          unsafeEvalIfDev,
        ]
      : ["'self'", "'unsafe-inline'", unsafeEvalIfDev, ...scriptSrcAllowlist]
  )
    .filter(Boolean)
    .join(' ');

  const sentryDomains = [
    'https://sentry.io',
    'https://*.sentry.io',
    'https://de.sentry.io',
    'https://*.ingest.sentry.io',
    'https://*.ingest.de.sentry.io',
  ];

  const newRelicBeaconDomains = [
    'https://bam.nr-data.net',
    'https://bam.eu01.nr-data.net',
  ];

  const betterStackDomains = env.BETTERSTACK_ENABLED
    ? ['https://in.logs.betterstack.com']
    : [];

  const connectSrc = [
    "'self'",
    ...clerkDomains,
    ...cloudflareDomains,
    ...(isPreview || isDev ? vercelInsightsConnectDomains : []),
    'https://clerk-telemetry.com',
    ...sentryDomains,
    ...newRelicBeaconDomains,
    ...betterStackDomains,
    isPreview ? 'https://vercel.live wss://vercel.live wss://*.pusher.com' : '',
    parseExtra(env.NEXT_PUBLIC_CSP_CONNECT_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');

  const frameSrc = [
    "'self'",
    ...clerkDomains,
    ...cloudflareDomains,
    isPreview ? 'https://vercel.live' : '',
    parseExtra(env.NEXT_PUBLIC_CSP_FRAME_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');

  const imgSrc = [
    "'self'",
    'data:',
    'https://img.clerk.com',
    ...clerkDomains,
    parseExtra(env.NEXT_PUBLIC_CSP_IMG_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');

  const styleSrc = [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
    parseExtra(env.NEXT_PUBLIC_CSP_STYLE_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');

  const fontSrc = [
    "'self'",
    'https://fonts.gstatic.com',
    parseExtra(env.NEXT_PUBLIC_CSP_FONT_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `script-src-elem ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `img-src ${imgSrc}`,
    `font-src ${fontSrc}`,
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
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
