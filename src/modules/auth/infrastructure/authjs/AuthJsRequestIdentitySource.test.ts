import { describe, expect, it } from 'vitest';

import { AuthJsRequestIdentitySource } from './AuthJsRequestIdentitySource';

describe('AuthJsRequestIdentitySource', () => {
  it('returns normalized identity data with all fields undefined (stub)', async () => {
    const source = new AuthJsRequestIdentitySource();
    const result = await source.get();

    expect(result).toEqual({
      userId: undefined,
      email: undefined,
      emailVerified: undefined,
      tenantExternalId: undefined,
      tenantRole: undefined,
    });
  });

  it('returns undefined tenantExternalId and tenantRole (Auth.js has no org claims)', async () => {
    const source = new AuthJsRequestIdentitySource();
    const result = await source.get();

    expect(result.tenantExternalId).toBeUndefined();
    expect(result.tenantRole).toBeUndefined();
  });
});
