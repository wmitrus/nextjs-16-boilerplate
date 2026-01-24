import fs from 'fs';
import path from 'path';

import type { DestinationStream } from 'pino';
import { destination } from 'pino';
import { logflarePinoVercel, createWriteStream } from 'pino-logflare';
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
 */
export function createLogflareWriteStream(): DestinationStream {
  if (!env.LOGFLARE_API_KEY || !env.LOGFLARE_SOURCE_TOKEN) {
    throw new Error(
      'LOGFLARE_API_KEY and LOGFLARE_SOURCE_TOKEN must be set to use Logflare write stream',
    );
  }

  const stream = createWriteStream({
    apiKey: env.LOGFLARE_API_KEY,
    sourceToken: env.LOGFLARE_SOURCE_TOKEN,
  });

  stream.on('error', (err: Error) => {
    console.error('Logflare stream error:', err);
  });

  return stream;
}

/**
 * Creates a Logflare browser transport.
 */
export function createLogflareBrowserTransport() {
  if (!env.LOGFLARE_API_KEY || !env.LOGFLARE_SOURCE_TOKEN) {
    throw new Error(
      'LOGFLARE_API_KEY and LOGFLARE_SOURCE_TOKEN must be set to use Logflare browser transport',
    );
  }

  const { send } = logflarePinoVercel({
    apiKey: env.LOGFLARE_API_KEY,
    sourceToken: env.LOGFLARE_SOURCE_TOKEN,
  });

  return {
    transmit: {
      level: env.LOG_LEVEL, // Use global log level for transmit
      send: send,
    },
  };
}
