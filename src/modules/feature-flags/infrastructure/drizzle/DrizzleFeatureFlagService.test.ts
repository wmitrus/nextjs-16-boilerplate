import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { DrizzleDb } from '@/core/db';

import { DrizzleFeatureFlagService } from './DrizzleFeatureFlagService';

const ctx: AuthorizationContext = {
  tenant: { tenantId: 'tenant-uuid-1' },
  subject: { id: 'user-1' },
  resource: { type: 'feature' },
  action: 'feature:read',
};

function makeDb(rows: { enabled: boolean; tenantId: string | null }[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    }),
  } as unknown as DrizzleDb;
}

describe('DrizzleFeatureFlagService', () => {
  it('returns false when no rows match the flag key', async () => {
    const db = makeDb([]);
    const svc = new DrizzleFeatureFlagService(db);

    expect(await svc.isEnabled('some-flag', ctx)).toBe(false);
  });

  it('returns true for a tenant-scoped row with enabled=true', async () => {
    const db = makeDb([{ enabled: true, tenantId: 'tenant-uuid-1' }]);
    const svc = new DrizzleFeatureFlagService(db);

    expect(await svc.isEnabled('some-flag', ctx)).toBe(true);
  });

  it('returns false for a tenant-scoped row with enabled=false', async () => {
    const db = makeDb([{ enabled: false, tenantId: 'tenant-uuid-1' }]);
    const svc = new DrizzleFeatureFlagService(db);

    expect(await svc.isEnabled('some-flag', ctx)).toBe(false);
  });

  it('falls back to global row (tenantId=null) when no tenant-scoped row exists', async () => {
    const db = makeDb([{ enabled: true, tenantId: null }]);
    const svc = new DrizzleFeatureFlagService(db);

    expect(await svc.isEnabled('some-flag', ctx)).toBe(true);
  });

  it('prefers tenant-scoped row over global row', async () => {
    const db = makeDb([
      { enabled: false, tenantId: 'tenant-uuid-1' },
      { enabled: true, tenantId: null },
    ]);
    const svc = new DrizzleFeatureFlagService(db);

    expect(await svc.isEnabled('some-flag', ctx)).toBe(false);
  });

  it('returns false when only a different tenant row exists', async () => {
    const db = makeDb([{ enabled: true, tenantId: 'other-tenant' }]);
    const svc = new DrizzleFeatureFlagService(db);

    expect(await svc.isEnabled('some-flag', ctx)).toBe(false);
  });
});
