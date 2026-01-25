import pino, { type Logger, type LoggerOptions } from 'pino';

import { env } from '@/core/env';

import { getLogStreams } from './streams';

let cachedServerLogger: Logger | null = null;

export function getServerLogger(): Logger {
  if (cachedServerLogger) {
    return cachedServerLogger;
  }

  const isServer = typeof window === 'undefined';

  const options: LoggerOptions = {
    level: isServer ? env.LOG_LEVEL : 'info',
    base: {
      env:
        process.env.VERCEL_ENV ||
        (isServer ? env.NODE_ENV : process.env.NODE_ENV),
      revision: process.env.VERCEL_GITHUB_COMMIT_SHA,
    },
    // Redact sensitive information
    redact: {
      paths: [
        'password',
        '*.password',
        'secret',
        '*.secret',
        'cookie',
        '*.cookie',
        'authorization',
        '*.authorization',
      ],
      remove: true,
    },
  };

  const streams = getLogStreams();

  // If no specific streams are defined (e.g. production default),
  // Pino will default to stdout JSON which is exactly what we want.
  cachedServerLogger =
    streams.length > 0
      ? pino(options, pino.multistream(streams))
      : pino(options);

  return cachedServerLogger;
}

export function getLogger(): Logger {
  return getServerLogger();
}

export const logger = getServerLogger();

export default logger;
