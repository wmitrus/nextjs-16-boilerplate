import { describe, expect, it, vi } from 'vitest';

import type { DrizzleDb } from '@/core/db';

import { DrizzleMembershipRepository } from './DrizzleMembershipRepository';

function createMockDb(result: unknown[] = []) {
  const chain: Record<string, unknown> = {};

  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve);

  ['from', 'where', 'limit', 'innerJoin', 'orderBy'].forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });

  return { select: vi.fn().mockReturnValue(chain) } as unknown as DrizzleDb;
}

describe('DrizzleMembershipRepository', () => {
  it('returns true when membership row exists', async () => {
    const db = createMockDb([{ userId: 'u1', tenantId: 't1' }]);
    const repo = new DrizzleMembershipRepository(db);

    const result = await repo.isMember('u1', 't1');

    expect(result).toBe(true);
  });

  it('returns false when no membership row found', async () => {
    const db = createMockDb([]);
    const repo = new DrizzleMembershipRepository(db);

    const result = await repo.isMember('u1', 't1');

    expect(result).toBe(false);
  });
});
