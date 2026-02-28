import { describe, expect, it } from 'vitest';

import { SupabaseRequestIdentitySource } from './SupabaseRequestIdentitySource';

describe('SupabaseRequestIdentitySource', () => {
  it('throws not implemented error', async () => {
    const source = new SupabaseRequestIdentitySource();

    await expect(source.get()).rejects.toThrow(
      'SupabaseRequestIdentitySource: not implemented',
    );
  });
});
