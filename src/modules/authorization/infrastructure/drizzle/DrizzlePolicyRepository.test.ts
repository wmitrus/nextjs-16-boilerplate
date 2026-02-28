import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { DrizzleDb } from '@/core/db';

import { DrizzlePolicyRepository } from './DrizzlePolicyRepository';

function createMockDb(result: unknown[] = []) {
  const chain: Record<string, unknown> = {};

  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve);

  ['from', 'where', 'limit', 'innerJoin', 'orderBy'].forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });

  return { select: vi.fn().mockReturnValue(chain) } as unknown as DrizzleDb;
}

const baseContext: AuthorizationContext = {
  tenant: { tenantId: 't1' },
  subject: { id: 'u1' },
  resource: { type: 'doc' },
  action: 'doc:read',
};

describe('DrizzlePolicyRepository', () => {
  it('returns empty array when no policies exist', async () => {
    const db = createMockDb([]);
    const repo = new DrizzlePolicyRepository(db);

    const result = await repo.getPolicies(baseContext);

    expect(result).toEqual([]);
  });

  it('maps DB rows to Policy domain objects', async () => {
    const rows = [
      {
        id: 'p1',
        tenantId: 't1',
        roleId: null,
        effect: 'allow',
        resource: 'doc',
        actions: ['doc:read'],
        conditions: null,
        createdAt: new Date(),
      },
    ];
    const db = createMockDb(rows);
    const repo = new DrizzlePolicyRepository(db);

    const result = await repo.getPolicies(baseContext);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      effect: 'allow',
      resource: 'doc',
      actions: ['doc:read'],
    });
    expect(result[0].condition).toBeUndefined();
  });

  it('deserializes condition JSON into callable function', async () => {
    const rows = [
      {
        id: 'p2',
        tenantId: null,
        roleId: null,
        effect: 'allow',
        resource: 'doc',
        actions: ['doc:read'],
        conditions: { type: 'isOwner' },
        createdAt: new Date(),
      },
    ];
    const db = createMockDb(rows);
    const repo = new DrizzlePolicyRepository(db);

    const result = await repo.getPolicies(baseContext);

    expect(typeof result[0].condition).toBe('function');
  });

  it('global policy (tenantId null) is included in results', async () => {
    const rows = [
      {
        id: 'p3',
        tenantId: null,
        roleId: null,
        effect: 'deny',
        resource: '*',
        actions: ['*:*'],
        conditions: null,
        createdAt: new Date(),
      },
    ];
    const db = createMockDb(rows);
    const repo = new DrizzlePolicyRepository(db);

    const result = await repo.getPolicies(baseContext);

    expect(result[0].effect).toBe('deny');
  });
});
