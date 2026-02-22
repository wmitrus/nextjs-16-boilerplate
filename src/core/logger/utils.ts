import fs from 'fs';
import path from 'path';

import type { DestinationStream } from 'pino';
import { destination } from 'pino';
import { createWriteStream } from 'pino-logflare';
import type { PrettyStream } from 'pino-pretty';
import pretty from 'pino-pretty';

import { env } from '@/core/env';

/**
 * Ensures that the log directory exists.
 */
export function ensureLogDirectory(logDir: string): boolean {
  const logDirectory = path.join(process.cwd(), logDir);
  if (!fs.existsSync(logDirectory)) {
    try {
      fs.mkdirSync(logDirectory, { recursive: true });
    } catch (err) {
      console.error('Error setting up log directory:', err);
      return false;
    }
  }
  return true;
}

/**
 * Creates a console stream with pretty printing for development.
 */
export function createConsoleStream(): PrettyStream {
  return pretty({
    colorize: true,
    translateTime: 'yyyy-mm-dd HH:MM:ss',
    ignore: 'pid,hostname',
  });
}

/**
 * Creates a file stream using pino.destination.
 */
export function createFileStream(
  logFile: string,
  logDir: string,
): DestinationStream | null {
  if (!ensureLogDirectory(logDir)) {
    return null;
  }

  const stream = destination({ dest: logFile, mkdir: true });

  stream.on('error', (err: Error) => {
    console.error('File stream error:', err);
  });

  return stream;
}

/**
 * Creates a Logflare write stream for external logging.
 * Returns null if credentials are missing or stream creation fails.
 * Disables Logflare in preview/production to avoid connection issues.
 */
export function createLogflareWriteStream(): DestinationStream | null {
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const isProduction = process.env.VERCEL_ENV === 'production';

  if (
    !env.LOGFLARE_API_KEY ||
    (!env.LOGFLARE_SOURCE_TOKEN && !env.LOGFLARE_SOURCE_NAME)
  ) {
    console.warn(
      'Logflare stream disabled: LOGFLARE_API_KEY and LOGFLARE_SOURCE_TOKEN or LOGFLARE_SOURCE_NAME are required',
    );
    return null;
  }

  if (isPreview || isProduction) {
    console.info(
      'Logflare stream disabled in',
      isPreview ? 'preview' : 'production',
      'environment',
    );
    return null;
  }

  try {
    const stream = createWriteStream({
      apiKey: env.LOGFLARE_API_KEY,
      sourceToken: env.LOGFLARE_SOURCE_TOKEN,
      sourceName: env.LOGFLARE_SOURCE_NAME,
    });

    stream.on('error', (err: Error) => {
      console.error('Logflare stream error (non-fatal):', err?.message || err);
    });

    stream.on('close', () => {
      console.debug('Logflare stream closed');
    });

    return stream;
  } catch (err) {
    console.error(
      'Failed to initialize Logflare stream:',
      err instanceof Error ? err.message : 'Unknown error',
    );
    return null;
  }
}
