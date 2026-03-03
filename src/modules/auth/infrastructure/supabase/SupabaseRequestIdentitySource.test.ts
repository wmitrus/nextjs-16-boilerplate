import { describe, expect, it } from 'vitest';

import { SupabaseRequestIdentitySource } from './SupabaseRequestIdentitySource';

describe('SupabaseRequestIdentitySource', () => {
  it('returns normalized identity data with all fields undefined (stub)', async () => {
    const source = new SupabaseRequestIdentitySource();
    const result = await source.get();

    expect(result).toEqual({
      userId: undefined,
      email: undefined,
      emailVerified: undefined,
      tenantExternalId: undefined,
      tenantRole: undefined,
    });
  });

  it('returns undefined tenantExternalId and tenantRole (Supabase has no org claims by default)', async () => {
    const source = new SupabaseRequestIdentitySource();
    const result = await source.get();

    expect(result.tenantExternalId).toBeUndefined();
    expect(result.tenantRole).toBeUndefined();
  });
});
