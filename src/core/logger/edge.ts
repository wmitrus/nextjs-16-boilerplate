import pino, { type Logger, type LoggerOptions } from 'pino';

import { env } from '@/core/env';

import { createLogflareEdgeTransport } from './edge-utils';

let cachedEdgeLogger: Logger | null = null;

export function getEdgeLogger(): Logger {
  if (cachedEdgeLogger) {
    return cachedEdgeLogger;
  }

  const isServer = typeof window === 'undefined';

  const options: LoggerOptions = {
    level: isServer ? env.LOG_LEVEL : env.NEXT_PUBLIC_LOG_LEVEL || 'info',
    browser: {
      asObject: true,
      transmit:
        isServer && env.LOGFLARE_EDGE_ENABLED && env.NEXT_PUBLIC_APP_URL
          ? createLogflareEdgeTransport().transmit
          : undefined,
    },
    base: {
      env:
        process.env.VERCEL_ENV ||
        (isServer ? env.NODE_ENV : process.env.NODE_ENV),
      revision: process.env.VERCEL_GITHUB_COMMIT_SHA,
    },
  };

  cachedEdgeLogger = pino(options);
  return cachedEdgeLogger;
}

export const logger = getEdgeLogger();

export default logger;
