import path from 'path';

import type { DestinationStream } from 'pino';

import { env } from '@/core/env';

import {
  createConsoleStream,
  createFileStream,
  createLogflareWriteStream,
} from './utils';

/**
 * Builds an array of log destinations based on environment configuration.
 * This approach avoids nested if/else blocks and provides a declarative way
 * to manage multiple transports.
 */
export function getLogStreams(): DestinationStream[] {
  const isServer = typeof window === 'undefined';
  if (!isServer) return [];

  const isDev = env.NODE_ENV === 'development';
  const isTest = env.NODE_ENV === 'test';

  const logFile = path.join(process.cwd(), env.LOG_DIR, 'server.log');

  const shouldLogToFile =
    (isDev && env.LOG_TO_FILE_DEV) ||
    (!isDev && !isTest && env.LOG_TO_FILE_PROD);

  const streams: (DestinationStream | null | undefined)[] = [
    // 1. Console stream (Pretty in dev/test, default JSON in prod if no other streams)
    isDev || isTest ? createConsoleStream() : undefined,

    // 2. File stream (if enabled)
    shouldLogToFile ? createFileStream(logFile, env.LOG_DIR) : undefined,

    // 3. External service stream (if enabled)
    env.LOGFLARE_SERVER_ENABLED ? createLogflareWriteStream() : undefined,
  ];

  // Filter out any null or undefined streams
  return streams.filter((s): s is DestinationStream => !!s);
}
