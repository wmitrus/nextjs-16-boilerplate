/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';

import { DrizzleInternalIdentityLookup } from './DrizzleInternalIdentityLookup';

function makeDb(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

describe('DrizzleInternalIdentityLookup', () => {
  describe('findInternalUserId', () => {
    it('returns internal user ID when mapping exists', async () => {
      const db = makeDb([{ userId: '00000000-0000-0000-0000-000000000001' }]);
      const lookup = new DrizzleInternalIdentityLookup(db as never);

      const result = await lookup.findInternalUserId('clerk', 'user_ext_123');

      expect(result).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('returns null when no mapping exists', async () => {
      const db = makeDb([]);
      const lookup = new DrizzleInternalIdentityLookup(db as never);

      const result = await lookup.findInternalUserId('clerk', 'user_unknown');

      expect(result).toBeNull();
    });

    it('does not perform any write operations', async () => {
      const db = makeDb([]);
      const insert = vi.fn();
      (db as Record<string, unknown>).insert = insert;
      const lookup = new DrizzleInternalIdentityLookup(db as never);

      await lookup.findInternalUserId('clerk', 'user_unknown');

      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe('findInternalTenantId', () => {
    it('returns internal tenant ID when mapping exists', async () => {
      const db = makeDb([{ tenantId: '10000000-0000-0000-0000-000000000001' }]);
      const lookup = new DrizzleInternalIdentityLookup(db as never);

      const result = await lookup.findInternalTenantId('clerk', 'org_ext_456');

      expect(result).toBe('10000000-0000-0000-0000-000000000001');
    });

    it('returns null when no mapping exists', async () => {
      const db = makeDb([]);
      const lookup = new DrizzleInternalIdentityLookup(db as never);

      const result = await lookup.findInternalTenantId('clerk', 'org_unknown');

      expect(result).toBeNull();
    });

    it('does not perform any write operations', async () => {
      const db = makeDb([]);
      const insert = vi.fn();
      (db as Record<string, unknown>).insert = insert;
      const lookup = new DrizzleInternalIdentityLookup(db as never);

      await lookup.findInternalTenantId('clerk', 'org_unknown');

      expect(insert).not.toHaveBeenCalled();
    });
  });
});
