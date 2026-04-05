import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (
      process.env.NEW_RELIC_ENABLED === 'true' &&
      process.env.NEW_RELIC_LICENSE_KEY
    ) {
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
