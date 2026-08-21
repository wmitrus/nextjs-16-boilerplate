import { describe, expect, it } from 'vitest';

import { redactAuditInput } from './redact';

describe('redactAuditInput', () => {
  it('redacts sensitive fields at the top level and nested', () => {
    expect(
      redactAuditInput({
        displayName: 'Ada',
        _replayToken: 'ts|nonce',
        password: 'super-secret',
        nested: { apiKey: 'abc123' },
      }),
    ).toEqual({
      displayName: 'Ada',
      _replayToken: '[REDACTED]',
      password: '[REDACTED]',
      nested: { apiKey: '[REDACTED]' },
    });
  });

  it('redacts sensitive keys inside URLSearchParams', () => {
    const params = new URLSearchParams([
      ['name', 'Ada'],
      ['token', 'secret-token'],
    ]);

    expect(redactAuditInput(params)).toEqual({
      name: 'Ada',
      token: '[REDACTED]',
    });
  });

  it('redacts sensitive fields inside array elements', () => {
    expect(redactAuditInput([{ password: 'secret' }, { name: 'Ada' }])).toEqual(
      [{ password: '[REDACTED]' }, { name: 'Ada' }],
    );
  });

  it('converts non-object, non-array values to a string', () => {
    const result = redactAuditInput({ fn: () => 'result' }) as {
      fn: unknown;
    };
    expect(typeof result.fn).toBe('string');
  });

  it('marks circular references instead of recursing forever', () => {
    const circular: Record<string, unknown> = { name: 'Ada' };
    circular['self'] = circular;

    expect(redactAuditInput(circular)).toEqual({
      name: 'Ada',
      self: '[Circular]',
    });
  });

  it('passes through primitives, null, and undefined unchanged', () => {
    expect(redactAuditInput('hello')).toBe('hello');
    expect(redactAuditInput(42)).toBe(42);
    expect(redactAuditInput(true)).toBe(true);
    expect(redactAuditInput(null)).toBeNull();
    expect(redactAuditInput(undefined)).toBeUndefined();
  });

  it('serializes Date values to ISO strings', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    expect(redactAuditInput(date)).toBe('2026-01-01T00:00:00.000Z');
  });
});
