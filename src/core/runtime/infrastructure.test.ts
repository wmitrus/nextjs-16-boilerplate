import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbRuntime } from '@/core/db/types';

const createDbMock = vi.hoisted(() => vi.fn());

vi.mock('@/core/db/create-db', () => ({
  createDb: createDbMock,
}));

describe('runtime infrastructure process scope', () => {
  beforeEach(() => {
    createDbMock.mockReset();
  });

  afterEach(async () => {
    const { closeInfrastructure } = await import('./infrastructure');
    await closeInfrastructure();
  });

  it('creates db runtime once and reuses it across requests', async () => {
    const runtime: DbRuntime = {
      db: { kind: 'db' } as never,
      close: vi.fn().mockResolvedValue(undefined),
    };
    createDbMock.mockReturnValue(runtime);

    const { getInfrastructure } = await import('./infrastructure');

    const config = {
      db: {
        provider: 'drizzle' as const,
        driver: 'postgres' as const,
        url: 'postgres://localhost:5432/app',
      },
    };

    const first = getInfrastructure(config);
    const second = getInfrastructure(config);

    expect(first).toBe(second);
    expect(first.dbRuntime).toBe(runtime);
    expect(createDbMock).toHaveBeenCalledTimes(1);
  });

  it('closes and resets cached infrastructure', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const firstRuntime: DbRuntime = {
      db: { kind: 'first' } as never,
      close,
    };
    const secondRuntime: DbRuntime = {
      db: { kind: 'second' } as never,
      close: vi.fn().mockResolvedValue(undefined),
    };

    createDbMock
      .mockReturnValueOnce(firstRuntime)
      .mockReturnValueOnce(secondRuntime);

    const { closeInfrastructure, getInfrastructure } =
      await import('./infrastructure');

    const config = {
      db: {
        provider: 'drizzle' as const,
        driver: 'pglite' as const,
        url: 'file:./data/pglite',
      },
    };

    const first = getInfrastructure(config);
    await closeInfrastructure();
    const second = getInfrastructure(config);

    expect(close).toHaveBeenCalledTimes(1);
    expect(first.dbRuntime).toBe(firstRuntime);
    expect(second.dbRuntime).toBe(secondRuntime);
    expect(createDbMock).toHaveBeenCalledTimes(2);
  });
});
