import { describe, expect, it } from 'vitest';

import { SystemIdentitySource } from './SystemIdentitySource';

describe('SystemIdentitySource', () => {
  it('returns system userId and orgExternalId', async () => {
    const source = new SystemIdentitySource();
    const result = await source.get();

    expect(result).toEqual({
      userId: 'system',
      orgExternalId: 'system',
      email: undefined,
    });
  });

  it('always returns the same static values', async () => {
    const source = new SystemIdentitySource();
    const first = await source.get();
    const second = await source.get();

    expect(first).toEqual(second);
  });
});
