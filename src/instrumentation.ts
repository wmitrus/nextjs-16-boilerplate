import * as Sentry from '@sentry/nextjs';

import { bootstrap } from '@/core/container';

export async function register() {
  bootstrap();

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
