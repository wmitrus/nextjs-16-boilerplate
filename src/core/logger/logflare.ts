import pino, { type Logger, type LoggerOptions } from 'pino';

import { env } from '@/core/env';

import { createLogflareWriteStream } from './utils';

let logflareLogger: Logger | null = null;

export function getLogflareLogger(): Logger {
  if (logflareLogger) {
    return logflareLogger;
  }

  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: {
      env: process.env.VERCEL_ENV || env.NODE_ENV,
      revision: process.env.VERCEL_GITHUB_COMMIT_SHA,
    },
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

  const stream = createLogflareWriteStream();
  logflareLogger = stream ? pino(options, stream) : pino(options);

  return logflareLogger;
}
