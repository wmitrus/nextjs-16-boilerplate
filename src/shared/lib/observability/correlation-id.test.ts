import { describe, expect, it, beforeEach } from 'vitest';

import {
  CORRELATION_ID_MAX_LENGTH,
  generateRequestId,
  recordCorrelationRejection,
  resetCorrelationRejectionCounterForTests,
  resolveCorrelationId,
} from './correlation-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveCorrelationId (SEC-46)', () => {
  it('keeps a syntactically safe caller id and marks it external', () => {
    // Deliberately not all UUIDs: a correlation id is interoperability
    // metadata, and an ingress that uses another format must still chain
    // through.
    for (const value of [
      '018f3c2a-0e3a-7a1b-9e2a-3c5f6b7d8e9f',
      '01HZY3K5Q9R2M7V8B4N6T1C0XJ',
      '4bf92f3577b34da6a3ce929d0e0e4736',
      'edge-1:app-2.req-3',
      'a',
      'A'.repeat(CORRELATION_ID_MAX_LENGTH),
    ]) {
      expect(resolveCorrelationId(value)).toEqual({
        correlationId: value,
        source: 'external',
      });
    }
  });

  it('generates its own id when no header was sent, without calling it a rejection', () => {
    for (const absent of [null, undefined]) {
      const result = resolveCorrelationId(absent);
      expect(result.correlationId).toMatch(UUID_RE);
      expect(result.source).toBe('generated');
      expect(result.rejection).toBeUndefined();
    }
  });

  it('replaces an unsafe value rather than truncating it', () => {
    const oversized = 'a'.repeat(CORRELATION_ID_MAX_LENGTH + 1);
    const result = resolveCorrelationId(oversized);

    expect(result.source).toBe('generated');
    expect(result.rejection).toBe('too_long');
    expect(result.correlationId).toMatch(UUID_RE);
    // The refused value must not survive in any form. Truncating would keep a
    // caller-chosen prefix and present it downstream as if validated.
    expect(result.correlationId).not.toContain('aaa');
    expect(oversized.startsWith(result.correlationId)).toBe(false);
  });

  it('refuses the characters that turn one log line into two', () => {
    const newline = String.fromCharCode(10);
    const carriageReturn = String.fromCharCode(13);
    const nul = String.fromCharCode(0);

    const unsafe = [
      `injected${newline}level=fatal msg=owned`,
      `injected${carriageReturn}${newline}Set-Cookie: a=b`,
      `injected${nul}tail`,
      'has a space',
      '<script>alert(1)</script>',
      'drop;table',
      '',
    ];

    for (const value of unsafe) {
      const result = resolveCorrelationId(value);
      expect(result.source).toBe('generated');
      expect(result.correlationId).toMatch(UUID_RE);
    }

    expect(resolveCorrelationId('').rejection).toBe('empty');
    expect(resolveCorrelationId('has a space').rejection).toBe(
      'invalid_charset',
    );
  });

  it('reports the length of a refused value but never its content', () => {
    const result = resolveCorrelationId('bad value with spaces');

    expect(result.rejectedLength).toBe('bad value with spaces'.length);
    expect(JSON.stringify(result)).not.toContain('bad value');
  });
});

describe('generateRequestId (SEC-46)', () => {
  it('mints a fresh id every call and takes no input', () => {
    // Arity zero is the point: there is no parameter through which a caller
    // supplied value could ever reach the request id.
    expect(generateRequestId.length).toBe(0);

    const first = generateRequestId();
    const second = generateRequestId();

    expect(first).toMatch(UUID_RE);
    expect(first).not.toBe(second);
  });
});

describe('recordCorrelationRejection (SEC-46)', () => {
  beforeEach(() => {
    resetCorrelationRejectionCounterForTests();
  });

  it('reports the first rejection, then samples', () => {
    // An unconditional warn per rejection would hand any caller a
    // log-flooding primitive through a header they fully control.
    expect(recordCorrelationRejection()).toEqual({ report: true, total: 1 });

    for (let i = 2; i < 100; i += 1) {
      expect(recordCorrelationRejection().report).toBe(false);
    }

    expect(recordCorrelationRejection()).toEqual({ report: true, total: 100 });
  });
});
