import { describe, expect, it } from 'vitest';

import { buildAuthJsBootstrapIdentityValues } from './bootstrap-admin';

describe('buildAuthJsBootstrapIdentityValues', () => {
  it('uses the AuthJS credentials email as the external user id', () => {
    const identity = buildAuthJsBootstrapIdentityValues({
      email: 'admin@example.test',
      userId: '00000000-0000-4000-8000-000000000001',
    });

    expect(identity).toEqual({
      provider: 'authjs',
      externalUserId: 'admin@example.test',
      userId: '00000000-0000-4000-8000-000000000001',
    });
  });
});
