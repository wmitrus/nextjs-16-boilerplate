import pino, { type Logger, type LoggerOptions } from 'pino';

import { env } from '@/core/env';

import { createLogflareBrowserTransport } from './browser-utils';

let cachedBrowserLogger: Logger | null = null;

export function getBrowserLogger(): Logger {
  if (cachedBrowserLogger) {
    return cachedBrowserLogger;
  }

  const options: LoggerOptions = {
    level: env.NEXT_PUBLIC_LOG_LEVEL || 'info',
    browser: {
      asObject: true,
      transmit: env.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED
        ? createLogflareBrowserTransport().transmit
        : undefined,
    },
    base: {
      env: process.env.VERCEL_ENV || process.env.NODE_ENV,
      revision: process.env.VERCEL_GITHUB_COMMIT_SHA,
    },
  };

  cachedBrowserLogger = pino(options);
  return cachedBrowserLogger;
}
