import pino, { type Logger, type LoggerOptions } from 'pino';

import { env } from '@/core/env';

import { createLogflareBrowserTransport } from './browser-utils';

const options: LoggerOptions = {
  level: env.NEXT_PUBLIC_LOG_LEVEL || 'info',
  browser: {
    asObject: true,
    transmit: env.NEXT_PUBLIC_LOGFLARE_INTEGRATION_ENABLED
      ? createLogflareBrowserTransport().transmit
      : undefined,
  },
  base: {
    env: process.env.VERCEL_ENV || process.env.NODE_ENV,
    revision: process.env.VERCEL_GITHUB_COMMIT_SHA,
  },
};

export const browserLogger: Logger = pino(options);
