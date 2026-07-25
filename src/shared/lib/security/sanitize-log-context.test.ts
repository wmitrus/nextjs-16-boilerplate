import { describe, expect, it } from 'vitest';

import { sanitizeLogContext } from './sanitize-log-context';

describe('sanitizeLogContext', () => {
  it('removes reserved top-level fields from untrusted context', () => {
    expect(
      sanitizeLogContext({
        type: 'API',
        category: 'auth',
        module: 'login',
        source: 'client',
        event: 'user_login',
      }),
    ).toEqual({ event: 'user_login' });
  });

  it('keeps reserved fields when context is trusted except source', () => {
    expect(
      sanitizeLogContext(
        {
          type: 'API',
          category: 'auth',
          module: 'login',
          source: 'client',
          event: 'user_login',
        },
        0,
        true,
      ),
    ).toEqual({
      type: 'API',
      category: 'auth',
      module: 'login',
      event: 'user_login',
    });
  });

  it('drops secret-looking keys at every depth', () => {
    expect(
      sanitizeLogContext({
        token: 'secret',
        nested: {
          password: 'secret',
          safe: 'value',
        },
      }),
    ).toEqual({ nested: { safe: 'value' } });
  });

  it('truncates long strings and filters arrays to scalar values', () => {
    const long = 'a'.repeat(2050);

    expect(
      sanitizeLogContext({
        message: long,
        values: [long, 1, true, null, { unsafe: true }, ['nested']],
      }),
    ).toEqual({
      message: `${'a'.repeat(2048)}[truncated]`,
      values: [`${'a'.repeat(2048)}[truncated]`, 1, true, null],
    });
  });

  it('limits nested object depth', () => {
    expect(
      sanitizeLogContext({
        one: {
          two: {
            three: {
              four: 'hidden',
            },
          },
        },
      }),
    ).toEqual({ one: { two: { three: {} } } });
  });
});
