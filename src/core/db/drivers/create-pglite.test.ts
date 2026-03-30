import { beforeEach, describe, expect, it, vi } from 'vitest';

const closeMock = vi.fn().mockResolvedValue(undefined);
const pgliteCtorMock = vi.hoisted(() =>
  vi.fn().mockImplementation(function MockPGlite() {
    return { close: closeMock };
  }),
);
const drizzleMock = vi.hoisted(() => vi.fn().mockReturnValue({ kind: 'db' }));

vi.mock('@electric-sql/pglite', () => ({
  PGlite: pgliteCtorMock,
}));

vi.mock('drizzle-orm/pglite', () => ({
  drizzle: drizzleMock,
}));

import {
  PGliteWasmAbortError,
  createPglite,
  resolvePglitePath,
} from './create-pglite';

describe('createPglite', () => {
  beforeEach(() => {
    pgliteCtorMock.mockClear();
    drizzleMock.mockClear();
    closeMock.mockClear();
  });

  it('creates a fresh runtime for the same path', async () => {
    const first = createPglite('file:./data/pglite');
    const second = createPglite('file:./data/pglite');

    expect(first).not.toBe(second);
    expect(pgliteCtorMock).toHaveBeenCalledTimes(2);

    await first.close?.();
    await second.close?.();

    expect(closeMock).toHaveBeenCalledTimes(2);
  });

  it('throws PGliteWasmAbortError when constructor throws RuntimeError with Aborted()', () => {
    const runtimeError = new Error('Aborted()');
    runtimeError.name = 'RuntimeError';
    Object.defineProperty(runtimeError, 'constructor', {
      value: { name: 'RuntimeError' },
    });
    pgliteCtorMock.mockImplementationOnce(function MockThrow() {
      throw runtimeError;
    });

    let caught: unknown;
    try {
      createPglite('./data/pglite');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PGliteWasmAbortError);
    expect((caught as PGliteWasmAbortError).message).toMatch(
      /pnpm db:reset:pglite/,
    );
  });

  it('throws PGliteWasmAbortError when constructor throws plain Error with Aborted() message', () => {
    pgliteCtorMock.mockImplementationOnce(function MockThrow() {
      throw new Error('Aborted(). Build with -sASSERTIONS for more info.');
    });

    let caught: unknown;
    try {
      createPglite('./data/pglite');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PGliteWasmAbortError);
  });

  it('re-throws non-WASM errors unchanged', () => {
    const originalError = new Error('disk full');
    pgliteCtorMock.mockImplementationOnce(function MockThrow() {
      throw originalError;
    });

    let caught: unknown;
    try {
      createPglite('./data/pglite');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(originalError);
    expect(caught).not.toBeInstanceOf(PGliteWasmAbortError);
  });

  it('PGliteWasmAbortError carries the resolved path', () => {
    pgliteCtorMock.mockImplementationOnce(function MockThrow() {
      throw new Error('Aborted()');
    });

    let caught: unknown;
    try {
      createPglite('file:./data/custom');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PGliteWasmAbortError);
    expect((caught as PGliteWasmAbortError).path).toBe('./data/custom');
  });
});

describe('resolvePglitePath', () => {
  it('returns default path for undefined input', () => {
    expect(resolvePglitePath(undefined)).toBe('./data/pglite');
  });

  it('returns default path for empty string', () => {
    expect(resolvePglitePath('')).toBe('./data/pglite');
  });

  it('strips file: prefix', () => {
    expect(resolvePglitePath('file:./data/pglite')).toBe('./data/pglite');
  });

  it('strips pglite:// prefix', () => {
    expect(resolvePglitePath('pglite://./data/custom')).toBe('./data/custom');
  });

  it('returns bare path unchanged', () => {
    expect(resolvePglitePath('./data/mydb')).toBe('./data/mydb');
  });

  it('falls back to default when file: prefix yields empty string', () => {
    expect(resolvePglitePath('file:')).toBe('./data/pglite');
  });
});
