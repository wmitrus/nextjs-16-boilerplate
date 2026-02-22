import pino, { type Logger, type LoggerOptions } from 'pino';

import { env } from '@/core/env';

import { createLogflareBrowserTransport } from './browser-utils';

let cachedBrowserLogger: Logger | null = null;

export function getBrowserLogger(): Logger {
  if (cachedBrowserLogger) {
    return cachedBrowserLogger;
  }

  try {
    const options: LoggerOptions = {
      level: env.NEXT_PUBLIC_LOG_LEVEL || 'info',
      serializers: pino.stdSerializers,
      browser: {
        asObject: true,
        transmit: env.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED
          ? createLogflareBrowserTransport().transmit
          : undefined,
      } as Parameters<typeof pino>[0]['browser'],
      base: {
        env: process.env.VERCEL_ENV || process.env.NODE_ENV,
        revision: process.env.VERCEL_GITHUB_COMMIT_SHA,
      },
    };

    cachedBrowserLogger = pino(options);
  } catch (err) {
    console.error(
      'Failed to initialize browser logger:',
      err instanceof Error ? err.message : 'Unknown error',
    );
    cachedBrowserLogger = pino({
      level: env.NEXT_PUBLIC_LOG_LEVEL || 'info',
      serializers: pino.stdSerializers,
    });
  }

  return cachedBrowserLogger;
}
