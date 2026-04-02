import path from 'node:path';

import {
  assertPathWithinBase,
  isSchemaNotFoundError,
  parseArg,
  resolveDriver,
} from './utils';

describe('parseArg', () => {
  it('returns value for a matching --name=value arg', () => {
    const original = process.argv;
    process.argv = ['node', 'script.ts', '--from=static'];
    expect(parseArg('from')).toBe('static');
    process.argv = original;
  });

  it('returns undefined when arg is not present', () => {
    const original = process.argv;
    process.argv = ['node', 'script.ts'];
    expect(parseArg('from')).toBeUndefined();
    process.argv = original;
  });

  it('returns the value after the first = only', () => {
    const original = process.argv;
    process.argv = ['node', 'script.ts', '--url=postgres://user:p@host/db'];
    expect(parseArg('url')).toBe('postgres://user:p@host/db');
    process.argv = original;
  });
});

describe('resolveDriver', () => {
  it('returns "postgres" when DB_DRIVER=postgres', () => {
    process.env.DB_DRIVER = 'postgres';
    expect(resolveDriver()).toBe('postgres');
    delete process.env.DB_DRIVER;
  });

  it('returns "pglite" when DB_DRIVER=pglite', () => {
    process.env.DB_DRIVER = 'pglite';
    expect(resolveDriver()).toBe('pglite');
    delete process.env.DB_DRIVER;
  });

  it('defaults to "pglite" in non-production when DB_DRIVER is unset', () => {
    delete process.env.DB_DRIVER;
    vi.stubEnv('NODE_ENV', 'development');
    expect(resolveDriver()).toBe('pglite');
    vi.unstubAllEnvs();
  });

  it('defaults to "postgres" in production when DB_DRIVER is unset', () => {
    delete process.env.DB_DRIVER;
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveDriver()).toBe('postgres');
    vi.unstubAllEnvs();
  });
});

describe('isSchemaNotFoundError', () => {
  it('returns true for postgres "relation does not exist" error', () => {
    const err = new Error('relation "feature_flags" does not exist');
    expect(isSchemaNotFoundError(err)).toBe(true);
  });

  it('returns false for unrelated DB errors', () => {
    const err = new Error('connection refused');
    expect(isSchemaNotFoundError(err)).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isSchemaNotFoundError('string error')).toBe(false);
    expect(isSchemaNotFoundError(null)).toBe(false);
    expect(isSchemaNotFoundError(42)).toBe(false);
  });
});

describe('assertPathWithinBase', () => {
  it('does not throw for a file path within the base directory', () => {
    const base = process.cwd();
    expect(() =>
      assertPathWithinBase(path.join(base, 'flags.json'), base),
    ).not.toThrow();
  });

  it('does not throw when resolved path equals the base directory exactly', () => {
    const base = process.cwd();
    expect(() => assertPathWithinBase(base, base)).not.toThrow();
  });

  it('throws for a path traversal using ".."', () => {
    const base = process.cwd();
    expect(() =>
      assertPathWithinBase(path.join(base, '..', 'outside.json'), base),
    ).toThrow(/Security: file path escapes/);
  });

  it('throws for an absolute path outside the base directory', () => {
    const base = process.cwd();
    expect(() => assertPathWithinBase('/etc/passwd', base)).toThrow(
      /Security: file path escapes/,
    );
  });

  it('throws for a deeply nested traversal', () => {
    const base = process.cwd();
    expect(() =>
      assertPathWithinBase(
        path.join(base, 'sub', '..', '..', '..', 'secret.txt'),
        base,
      ),
    ).toThrow(/Security: file path escapes/);
  });
});
