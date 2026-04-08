import * as Sentry from '@sentry/nextjs';

import { nodeOptionsPreloadsNewRelic } from '@/core/observability/new-relic-node-options';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (
      process.env.NEW_RELIC_ENABLED === 'true' &&
      process.env.NEW_RELIC_LICENSE_KEY
    ) {
      if (
        process.env.NODE_ENV === 'production' &&
        !nodeOptionsPreloadsNewRelic(process.env.NODE_OPTIONS)
      ) {
        console.warn(
          '[New Relic] NODE_OPTIONS is missing a valid New Relic preload. Use "--require ./scripts/new-relic/preload.cjs" in hosted runtimes for reliable transaction and browser timing instrumentation.',
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('newrelic');
    }

    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
