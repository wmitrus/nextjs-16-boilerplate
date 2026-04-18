import type { Level, LogEvent, Logger } from 'pino';

import type { AppLogger } from '@/core/contracts/logger';
import { env } from '@/core/env';

import { buildClientLogPayload } from './client-transport';
import { forwardEdgeLogEvent } from './edge-utils';

function getLevelValue(level: Level): number {
  switch (level) {
    case 'trace':
      return 10;
    case 'debug':
      return 20;
    case 'info':
      return 30;
    case 'warn':
      return 40;
    case 'error':
      return 50;
    case 'fatal':
      return 60;
  }
}

function getLogLevelThreshold(level: typeof env.LOG_LEVEL): number {
  switch (level) {
    case 'trace':
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
    case 'fatal':
      return getLevelValue(level);
    case 'silent':
      return Number.POSITIVE_INFINITY;
  }
}

function getConsoleMethod(level: Level): 'debug' | 'log' | 'warn' | 'error' {
  switch (level) {
    case 'trace':
    case 'debug':
      return 'debug';
    case 'info':
      return 'log';
    case 'warn':
      return 'warn';
    case 'error':
    case 'fatal':
      return 'error';
  }
}

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
      value: getLevelValue(level),
    },
    ts: timestamp,
  } as LogEvent;
}

function isLevelEnabled(level: Level): boolean {
  return getLevelValue(level) >= getLogLevelThreshold(env.LOG_LEVEL);
}

function writeConsoleLog(
  level: Level,
  payload: ReturnType<typeof buildClientLogPayload>,
  timestamp: number,
): void {
  const record = {
    level: getLevelValue(level),
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

  switch (getConsoleMethod(level)) {
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
