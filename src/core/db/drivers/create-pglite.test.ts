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

import { clearPgliteRuntimeCache, createPglite } from './create-pglite';

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

  it('clearPgliteRuntimeCache remains callable', () => {
    expect(() => clearPgliteRuntimeCache()).not.toThrow();
  });
});
