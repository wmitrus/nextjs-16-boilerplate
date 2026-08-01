import path from 'path';

import type { DestinationStream, StreamEntry } from 'pino';

import { env } from '@/core/env';

import {
  createBetterStackStream,
  createConsoleStream,
  createFileStream,
  createLogflareWriteStream,
  createStdoutStream,
} from './utils';

/**
 * Builds an array of log destinations based on environment configuration.
 * This approach avoids nested if/else blocks and provides a declarative way
 * to manage multiple transports.
 */
export function getLogStreams(): StreamEntry[] {
  const isServer = typeof window === 'undefined';
  if (!isServer) return [];

  const isDev = env.NODE_ENV === 'development';
  const isTest = env.NODE_ENV === 'test';

  const logDir = env.LOG_DIR || 'logs';
  const logFile = path.join(process.cwd(), logDir, 'server.log');

  const shouldLogToFile =
    (isDev && env.LOG_TO_FILE_DEV) ||
    (!isDev && !isTest && env.LOG_TO_FILE_PROD);

  const externalStreams: (DestinationStream | null | undefined)[] = [
    env.LOGFLARE_SERVER_ENABLED ? createLogflareWriteStream() : undefined,
    env.BETTERSTACK_ENABLED ? createBetterStackStream() : undefined,
  ];

  const shouldMirrorToStdout =
    !isDev && !isTest && externalStreams.some(Boolean);

  const streams: (DestinationStream | null | undefined)[] = [
    // 1. Console stream (Pretty in dev/test, default JSON in prod if no other streams)
    isDev || isTest ? createConsoleStream() : undefined,

    // 2. Keep platform logs visible even when an external transport is enabled.
    shouldMirrorToStdout ? createStdoutStream() : undefined,

    // 3. File stream (if enabled)
    shouldLogToFile ? createFileStream(logFile, logDir) : undefined,

    // 4. External streams (if enabled)
    ...externalStreams,
  ];

  // Filter out any null or undefined streams
  return streams
    .filter((s): s is DestinationStream => !!s)
    .map((stream) => ({
      level: 'trace' as const,
      stream,
    }));
}
