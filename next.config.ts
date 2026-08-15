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

const nextConfig: NextConfig = {
  cacheComponents: true,
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
