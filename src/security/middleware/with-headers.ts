import type { NextRequest, NextResponse } from 'next/server';

import { env } from '@/core/env';

/**
 * Hardens the response with security headers.
 * Implements CSP, HSTS, and other browser-level protections.
 */
export function withHeaders(req: NextRequest, res: NextResponse): NextResponse {
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
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    ...clerkDomains,
    ...cloudflareDomains,
    ...sentryScriptDomains,
    newRelicScriptDomain,
    ...(isPreview || isDev ? vercelInsightsScriptDomains : []),
    isPreview ? 'https://vercel.live' : '',
    parseExtra(env.NEXT_PUBLIC_CSP_SCRIPT_EXTRA),
  ]
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

  const csp = [
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

  res.headers.set('Content-Security-Policy', csp);

  return res;
}
