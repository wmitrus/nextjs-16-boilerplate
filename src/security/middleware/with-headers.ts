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
  res.headers.set('X-XSS-Protection', '1; mode=block');

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
  }

  const vercelInsightsScriptDomains = ['https://va.vercel-scripts.com'];
  const vercelInsightsConnectDomains = ['https://vitals.vercel-insights.com'];

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    ...clerkDomains,
    ...(isPreview || isDev ? vercelInsightsScriptDomains : []),
    isPreview ? 'https://vercel.live' : '',
    parseExtra(env.NEXT_PUBLIC_CSP_SCRIPT_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');

  const connectSrc = [
    "'self'",
    ...clerkDomains,
    ...(isPreview || isDev ? vercelInsightsConnectDomains : []),
    'https://clerk-telemetry.com',
    isPreview ? 'https://vercel.live wss://vercel.live wss://*.pusher.com' : '',
    parseExtra(env.NEXT_PUBLIC_CSP_CONNECT_EXTRA),
  ]
    .filter(Boolean)
    .join(' ');

  const frameSrc = [
    "'self'",
    ...clerkDomains,
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
    'upgrade-insecure-requests',
  ].join('; ');

  res.headers.set('Content-Security-Policy', csp);

  return res;
}
