import type { LogEvent } from 'pino';
import { describe, expect, it } from 'vitest';

import { buildClientLogPayload } from './client-transport';

describe('client transport payload builder', () => {
  it('uses string message when available and merges context', () => {
    const logEvent = {
      messages: ['hello', { foo: 'bar' }],
      bindings: [{ requestId: 'req-1' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    const payload = buildClientLogPayload({
      level: 'info',
      logEvent,
      source: 'browser',
      defaultMessage: 'fallback',
    });

    expect(payload.message).toBe('hello');
    expect(payload.context.requestId).toBe('req-1');
    expect(payload.context.foo).toBe('bar');
    expect(payload.context.data).toEqual({ foo: 'bar' });
    expect(payload.source).toBe('browser');
  });

  it('stringifies object message when no text message exists', () => {
    const logEvent = {
      messages: [{ foo: 'bar' }],
      bindings: [{ traceId: 'trace-1' }],
      level: { label: 'warn', value: 40 },
      ts: 0,
    } as LogEvent;

    const payload = buildClientLogPayload({
      level: 'warn',
      logEvent,
      source: 'edge',
      defaultMessage: 'fallback',
    });

    expect(payload.message).toBe(JSON.stringify({ foo: 'bar' }));
    expect(payload.context.traceId).toBe('trace-1');
    expect(payload.context.data).toEqual({ foo: 'bar' });
    expect(payload.source).toBe('edge');
  });

  it('falls back to default message when no messages are present', () => {
    const logEvent = {
      messages: [],
      bindings: [],
      level: { label: 'debug', value: 20 },
      ts: 0,
    } as LogEvent;

    const payload = buildClientLogPayload({
      level: 'debug',
      logEvent,
      source: 'browser',
      defaultMessage: 'fallback',
    });

    expect(payload.message).toBe('fallback');
    expect(payload.context).toEqual({});
  });

  it('handles missing bindings', () => {
    const logEvent = {
      messages: ['hello'],
      bindings: undefined,
      level: { label: 'info', value: 30 },
      ts: 0,
    } as unknown as LogEvent;

    const payload = buildClientLogPayload({
      level: 'info',
      logEvent,
      source: 'browser',
      defaultMessage: 'fallback',
    });

    expect(payload.context).toEqual({});
  });

  it('handles bindings as a plain object', () => {
    const logEvent = {
      messages: ['hello'],
      bindings: { requestId: 'req-1' },
      level: { label: 'info', value: 30 },
      ts: 0,
    } as unknown as LogEvent;

    const payload = buildClientLogPayload({
      level: 'info',
      logEvent,
      source: 'browser',
      defaultMessage: 'fallback',
    });

    expect(payload.context.requestId).toBe('req-1');
  });
});
