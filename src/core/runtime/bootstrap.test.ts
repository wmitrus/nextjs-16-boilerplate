import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Module } from '@/core/container';
import type { DbRuntime } from '@/core/db/types';

const createDbMock = vi.hoisted(() => vi.fn());

vi.mock('@/core/db/create-db', () => ({
  createDb: createDbMock,
}));

vi.mock('@/modules/auth', () => ({
  createAuthModule: () =>
    ({
      register: () => undefined,
    }) as Module,
}));

vi.mock('@/modules/authorization', () => ({
  createAuthorizationModule: () =>
    ({
      register: () => undefined,
    }) as Module,
}));

describe('bootstrap request/process scopes', () => {
  beforeEach(() => {
    createDbMock.mockReset();
    vi.resetModules();
    vi.doUnmock('./bootstrap');
    vi.doUnmock('@/core/runtime/bootstrap');
  });

  afterEach(async () => {
    const { closeInfrastructure } = await import('./infrastructure');
    await closeInfrastructure();
  });

  it('builds request containers while creating db runtime only once per process', async () => {
    const runtime: DbRuntime = {
      db: { kind: 'shared-db' } as never,
      close: vi.fn().mockResolvedValue(undefined),
    };
    createDbMock.mockReturnValue(runtime);

    const { getAppContainer } = await import('./bootstrap');

    const first = getAppContainer();
    const second = getAppContainer();

    expect(first).not.toBe(second);
    expect(createDbMock).toHaveBeenCalledTimes(1);
  });
});
