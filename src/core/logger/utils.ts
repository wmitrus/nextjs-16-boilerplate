import { createRequire } from 'node:module';
import path from 'path';

import type { DestinationStream } from 'pino';
import { destination } from 'pino';
import { createWriteStream } from 'pino-logflare';
import type { PrettyStream } from 'pino-pretty';
import pretty from 'pino-pretty';

import { env } from '@/core/env';

const cjsRequire = createRequire(import.meta.url);

function assertPathWithinBase(resolvedPath: string, baseDir: string) {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(resolvedPath);
  const expectedPrefix = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;

  if (
    normalizedPath !== normalizedBase &&
    !normalizedPath.startsWith(expectedPrefix)
  ) {
    throw new Error(
      `Log path escapes the allowed base directory: ${normalizedPath}`,
    );
  }
}

function resolvePathWithinBase(targetPath: string, baseDir: string): string {
  const resolvedPath = path.resolve(baseDir, targetPath);
  assertPathWithinBase(resolvedPath, baseDir);
  return resolvedPath;
}

/**
 * Ensures that the log directory exists.
 */
export function ensureLogDirectory(logDir: string): boolean {
  const baseDir = process.cwd();

  try {
    resolvePathWithinBase(logDir, baseDir);
  } catch (err) {
    console.error('Error setting up log directory:', err);
    return false;
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

  const safeLogFile = resolvePathWithinBase(logFile, process.cwd());
  const stream = destination({ dest: safeLogFile, sync: true, mkdir: true });

  stream.on('error', (err: Error) => {
    console.error('File stream error:', err);
  });

  return stream;
}

/**
 * Creates a Logflare write stream for external logging.
 * Returns null if credentials are missing or stream creation fails.
 * Enable/disable via LOGFLARE_SERVER_ENABLED env flag.
 */
export function createLogflareWriteStream(): DestinationStream | null {
  if (
    !env.LOGFLARE_API_KEY ||
    (!env.LOGFLARE_SOURCE_TOKEN && !env.LOGFLARE_SOURCE_NAME)
  ) {
    console.warn(
      'Logflare stream disabled: LOGFLARE_API_KEY and LOGFLARE_SOURCE_TOKEN or LOGFLARE_SOURCE_NAME are required',
    );
    return null;
  }

  try {
    const stream = createWriteStream({
      apiKey: env.LOGFLARE_API_KEY,
      ...(env.LOGFLARE_SOURCE_TOKEN
        ? { sourceToken: env.LOGFLARE_SOURCE_TOKEN }
        : { sourceName: env.LOGFLARE_SOURCE_NAME }),
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
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Creates a Better Stack write stream using the @logtail/pino transport via
 * pino.transport() worker thread. The worker thread is non-blocking and does
 * not affect request processing performance.
 *
 * Returns null when Better Stack is disabled or the source token is missing.
 * Enable/disable via BETTERSTACK_ENABLED env flag.
 */
export function createBetterStackStream(): DestinationStream | null {
  if (!env.BETTERSTACK_ENABLED || !env.BETTER_STACK_SOURCE_TOKEN) {
    console.warn(
      'Better Stack stream disabled: BETTERSTACK_ENABLED=true and BETTER_STACK_SOURCE_TOKEN are required',
    );
    return null;
  }

  try {
    const pino = cjsRequire('pino') as {
      transport: (opts: {
        target: string;
        options?: Record<string, unknown>;
      }) => DestinationStream;
    };

    const transportOptions: Record<string, unknown> = {
      sourceToken: env.BETTER_STACK_SOURCE_TOKEN,
    };

    if (env.BETTER_STACK_INGESTING_URL) {
      transportOptions.options = { endpoint: env.BETTER_STACK_INGESTING_URL };
    }

    const stream = pino.transport({
      target: '@logtail/pino',
      options: transportOptions,
    });

    return stream;
  } catch (err) {
    console.error(
      'Failed to initialize Better Stack stream:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
