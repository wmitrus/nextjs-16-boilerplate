import { describe, expect, it, vi } from 'vitest';

import type { DrizzleDb } from '@/core/db';

import { DrizzleRoleRepository } from './DrizzleRoleRepository';

function createMockDb(result: unknown[] = []) {
  const chain: Record<string, unknown> = {};

  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve);

  ['from', 'where', 'limit', 'innerJoin', 'orderBy'].forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });

  return { select: vi.fn().mockReturnValue(chain) } as unknown as DrizzleDb;
}

describe('DrizzleRoleRepository', () => {
  it('returns empty array when no membership exists', async () => {
    const db = createMockDb([]);
    const repo = new DrizzleRoleRepository(db);

    const result = await repo.getRoles('u1', 't1');

    expect(result).toEqual([]);
  });

  it('returns role names for existing membership', async () => {
    const db = createMockDb([{ name: 'admin' }, { name: 'editor' }]);
    const repo = new DrizzleRoleRepository(db);

    const result = await repo.getRoles('u1', 't1');

    expect(result).toEqual(['admin', 'editor']);
  });
});
