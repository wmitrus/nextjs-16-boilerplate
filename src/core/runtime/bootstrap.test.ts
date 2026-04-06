import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Module } from '@/core/container';
import type { DbRuntime } from '@/core/db/types';

vi.mock('server-only', () => ({}));

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

vi.mock(
  '@/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository',
  () => ({
    DrizzleMembershipRepository: vi.fn(),
  }),
);

vi.mock('@/modules/feature-flags/factory', () => ({
  createFeatureFlagService: vi.fn().mockReturnValue({
    isEnabled: vi.fn().mockResolvedValue(false),
  }),
}));

vi.mock(
  '@/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService',
  () => ({
    DrizzleProvisioningService: vi.fn(),
  }),
);

vi.mock('@/core/observability/new-relic', () => ({
  withContainerCreationSpan: vi.fn(<T>(fn: () => T) => fn()),
  recordContainerCreated: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    cache: vi.fn(<T>(fn: () => T): (() => T) => {
      let called = false;
      let cached: T;
      return (): T => {
        if (!called) {
          cached = fn();
          called = true;
        }
        return cached;
      };
    }),
  };
});

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

  it('returns the same Container instance on repeated calls within one React cache scope', async () => {
    const runtime: DbRuntime = {
      db: { kind: 'shared-db' } as never,
      close: vi.fn().mockResolvedValue(undefined),
    };
    createDbMock.mockReturnValue(runtime);

    const { getAppContainer } = await import('./bootstrap');

    const first = getAppContainer();
    const second = getAppContainer();

    expect(first).toBe(second);
    expect(createDbMock).toHaveBeenCalledTimes(1);
  });

  it('returns a fresh Container after module reset (simulating a new request)', async () => {
    const runtime: DbRuntime = {
      db: { kind: 'shared-db' } as never,
      close: vi.fn().mockResolvedValue(undefined),
    };
    createDbMock.mockReturnValue(runtime);

    const { getAppContainer: getFirst } = await import('./bootstrap');
    const containerA = getFirst();

    vi.resetModules();

    const { getAppContainer: getSecond } = await import('./bootstrap');
    const containerB = getSecond();

    expect(containerA).not.toBe(containerB);
  });

  it('createChild() resolves through to the shared cached parent container', async () => {
    const runtime: DbRuntime = {
      db: { kind: 'shared-db' } as never,
      close: vi.fn().mockResolvedValue(undefined),
    };
    createDbMock.mockReturnValue(runtime);

    const { getAppContainer } = await import('./bootstrap');

    const parent = getAppContainer();
    const child = parent.createChild();

    const KEY = Symbol('TestChildKey');
    parent.register(KEY, { payload: 'from-parent' });

    expect(child.resolve(KEY)).toEqual({ payload: 'from-parent' });
  });
});
