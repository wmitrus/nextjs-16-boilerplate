import pino, { type Logger, type LoggerOptions } from 'pino';

import { env } from '@/core/env';

import { createLogflareEdgeTransport } from './edge-utils';

let cachedEdgeLogger: Logger | null = null;

export function getEdgeLogger(): Logger {
  if (cachedEdgeLogger) {
    return cachedEdgeLogger;
  }

  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    browser: {
      asObject: true,
      transmit:
        env.LOGFLARE_EDGE_ENABLED && env.NEXT_PUBLIC_APP_URL
          ? createLogflareEdgeTransport().transmit
          : undefined,
    },
    base: {
      env: process.env.VERCEL_ENV || env.NODE_ENV,
      revision: process.env.VERCEL_GITHUB_COMMIT_SHA,
    },
  };

  cachedEdgeLogger = pino(options);
  return cachedEdgeLogger;
}
