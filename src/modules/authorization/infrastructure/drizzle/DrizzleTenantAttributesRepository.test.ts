import { describe, expect, it, vi } from 'vitest';

import type { DrizzleDb } from '@/core/db';

import { DrizzleTenantAttributesRepository } from './DrizzleTenantAttributesRepository';

function createMockDb(result: unknown[] = []) {
  const chain: Record<string, unknown> = {};

  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve);

  ['from', 'where', 'limit', 'innerJoin', 'orderBy'].forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });

  return { select: vi.fn().mockReturnValue(chain) } as unknown as DrizzleDb;
}

describe('DrizzleTenantAttributesRepository', () => {
  it('returns default attributes when tenant not found', async () => {
    const db = createMockDb([]);
    const repo = new DrizzleTenantAttributesRepository(db);

    const result = await repo.getTenantAttributes('t1');

    expect(result).toEqual({
      plan: 'free',
      contractType: 'standard',
      features: [],
      userLimit: 5,
    });
  });

  it('maps DB row to domain TenantAttributes', async () => {
    const row = {
      tenantId: 't1',
      plan: 'pro',
      contractType: 'enterprise',
      features: ['sso', 'audit-log'],
      maxUsers: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = createMockDb([row]);
    const repo = new DrizzleTenantAttributesRepository(db);

    const result = await repo.getTenantAttributes('t1');

    expect(result).toEqual({
      plan: 'pro',
      contractType: 'enterprise',
      features: ['sso', 'audit-log'],
      userLimit: 100,
    });
  });
});
