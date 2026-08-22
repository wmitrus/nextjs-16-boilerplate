import os from 'node:os';

import { withBetterStackNextConfig } from '@logtail/next';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const buildWorkerCpuLimit = Math.min(
  16,
  Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 1),
);

// Prebuilt Vercel deployments need a build-stable custom ID. Keep it separate
// from Next.js' reserved runtime NEXT_DEPLOYMENT_ID contract.
const deploymentId = process.env.VERCEL_PREBUILT_DEPLOYMENT_ID;

// cacheComponents (Partial Prerendering) is incompatible with nonce-based
// CSP: Next's own framework/chunk-loader <script> tags live in a static
// shell built once, before any request exists, with no per-request nonce
// ever available -- regardless of Suspense boundaries placed around
// app-level nonce-consuming components (that only carves out small dynamic
// holes; the framework's own scripts aren't part of this app's component
// tree at all). Confirmed empirically, not just by reading Next's docs: a
// CSP_SCRIPT_MODE=nonce-dynamic build still shipped every chunk-loader
// script with nonce=null while cacheComponents stayed on. See SEC-30/
// SEC-31 in docs/ai/general/SECURITY_CODING_PATTERNS.md.
//
// A deployment that opts into CSP_SCRIPT_MODE=nonce-dynamic is
// deliberately trading away cacheComponents/PPR for the ENTIRE build in
// exchange for a real, zero-unsafe-inline CSP -- decided here, at build
// time (process.env, not the validated T3-Env schema -- next.config.ts
// loads before the app runtime does), because PPR's static/dynamic split
// for a route is baked in once at build, not re-decided per request.
const isNonceDynamicMode = process.env.CSP_SCRIPT_MODE === 'nonce-dynamic';

const nextConfig: NextConfig = {
  cacheComponents: !isNonceDynamicMode,
  // Textually inlines process.env.NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE into
  // both server and client bundles at build time (Next's `env` config key,
  // distinct from just prefixing NEXT_PUBLIC_ -- that alone only exposes a
  // var already present at build time, this actually sets one). Compared
  // at runtime against the (potentially different, if redeployed with a
  // changed env without a rebuild) live CSP_SCRIPT_MODE in
  // with-headers.ts, as a build/runtime invariant (A.8.4) -- see
  // src/core/env.ts's doc comment on NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE.
  env: {
    NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE: isNonceDynamicMode
      ? 'nonce-dynamic'
      : 'cache-compatible',
  },
  deploymentId,
  reactCompiler: true,
  serverExternalPackages: [
    '@electric-sql/pglite',
    '@logtail/pino',
    'newrelic',
    'pino',
    'pino-logflare',
    'pino-pretty',
  ],
  experimental: {
    cpus: buildWorkerCpuLimit,
    turbopackFileSystemCacheForDev: true,
  },
  logging: {
    browserToTerminal: 'warn',
  },
};

const isBetterStackEnabled =
  process.env.BETTERSTACK_ENABLED === 'true' &&
  Boolean(process.env.BETTER_STACK_SOURCE_TOKEN);

const configWithBetterStack = isBetterStackEnabled
  ? withBetterStackNextConfig(nextConfig)
  : nextConfig;

export default withSentryConfig(configWithBetterStack, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'ozi',

  project: 'nextjs-16-boilerplate',

  // Pass the auth token for source map upload
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute:
    process.env.NODE_ENV === 'production' ? '/monitoring' : undefined,

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
