import type { Level, LogEvent, Logger } from 'pino';

import type { AppLogger } from '@/core/contracts/logger';
import { env } from '@/core/env';

import { buildClientLogPayload } from './client-transport';
import { forwardEdgeLogEvent } from './edge-utils';

const LEVEL_VALUES: Record<Level, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const LOG_LEVEL_THRESHOLDS: Record<typeof env.LOG_LEVEL, number> = {
  trace: LEVEL_VALUES.trace,
  debug: LEVEL_VALUES.debug,
  info: LEVEL_VALUES.info,
  warn: LEVEL_VALUES.warn,
  error: LEVEL_VALUES.error,
  fatal: LEVEL_VALUES.fatal,
  silent: Number.POSITIVE_INFINITY,
};

const CONSOLE_METHOD_BY_LEVEL: Record<Level, keyof Console> = {
  trace: 'debug',
  debug: 'debug',
  info: 'log',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

class EdgeRuntimeLogger implements AppLogger {
  constructor(private readonly bindings: Record<string, unknown>[] = []) {}

  child(bindings: Record<string, unknown>): AppLogger {
    return new EdgeRuntimeLogger([...this.bindings, bindings]);
  }

  trace(...args: unknown[]): void {
    this.log('trace', args);
  }

  debug(...args: unknown[]): void {
    this.log('debug', args);
  }

  info(...args: unknown[]): void {
    this.log('info', args);
  }

  warn(...args: unknown[]): void {
    this.log('warn', args);
  }

  error(...args: unknown[]): void {
    this.log('error', args);
  }

  fatal(...args: unknown[]): void {
    this.log('fatal', args);
  }

  private log(level: Level, args: unknown[]): void {
    if (!isLevelEnabled(level)) {
      return;
    }

    const timestamp = Date.now();
    const logEvent = createLogEvent(level, args, this.bindings, timestamp);
    const payload = buildClientLogPayload({
      level,
      logEvent,
      source: 'edge',
      defaultMessage: 'edge log',
    });

    writeConsoleLog(level, payload, timestamp);
    forwardEdgeLogEvent(level, logEvent);
  }
}

let cachedEdgeLogger: AppLogger | null = null;

export function getEdgeLogger(): Logger {
  if (cachedEdgeLogger) {
    return cachedEdgeLogger as unknown as Logger;
  }

  cachedEdgeLogger = new EdgeRuntimeLogger();
  return cachedEdgeLogger as unknown as Logger;
}

function createLogEvent(
  level: Level,
  args: unknown[],
  bindings: Record<string, unknown>[],
  timestamp: number,
): LogEvent {
  return {
    messages: args,
    bindings,
    level: {
      label: level,
      value: LEVEL_VALUES[level],
    },
    ts: timestamp,
  } as LogEvent;
}

function isLevelEnabled(level: Level): boolean {
  return LEVEL_VALUES[level] >= LOG_LEVEL_THRESHOLDS[env.LOG_LEVEL];
}

function writeConsoleLog(
  level: Level,
  payload: ReturnType<typeof buildClientLogPayload>,
  timestamp: number,
): void {
  const record = {
    level: LEVEL_VALUES[level],
    time: timestamp,
    env:
      typeof process !== 'undefined'
        ? process.env.VERCEL_ENV || env.NODE_ENV
        : env.NODE_ENV,
    revision:
      typeof process !== 'undefined'
        ? process.env.VERCEL_GITHUB_COMMIT_SHA
        : undefined,
    ...payload.context,
    msg: payload.message,
  };

  const line = JSON.stringify(record);

  switch (CONSOLE_METHOD_BY_LEVEL[level]) {
    case 'debug':
      console.debug(line);
      return;
    case 'warn':
      console.warn(line);
      return;
    case 'error':
      console.error(line);
      return;
    default:
      console.log(line);
  }
}
