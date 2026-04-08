import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (
      process.env.NEW_RELIC_ENABLED === 'true' &&
      process.env.NEW_RELIC_LICENSE_KEY
    ) {
      const nodeOptions = process.env.NODE_OPTIONS ?? '';
      const preloadsNewRelic = /(^|\s)(-r|--require)\s+newrelic(\s|$)/u.test(
        nodeOptions,
      );

      if (process.env.NODE_ENV === 'production' && !preloadsNewRelic) {
        console.warn(
          '[New Relic] NODE_OPTIONS is missing "--require newrelic". Next.js production runtimes should preload the agent for reliable transaction and browser timing instrumentation.',
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
