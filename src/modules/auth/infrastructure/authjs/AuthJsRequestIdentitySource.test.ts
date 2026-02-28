import { describe, expect, it } from 'vitest';

import { AuthJsRequestIdentitySource } from './AuthJsRequestIdentitySource';

describe('AuthJsRequestIdentitySource', () => {
  it('throws not implemented error', async () => {
    const source = new AuthJsRequestIdentitySource();

    await expect(source.get()).rejects.toThrow(
      'AuthJsRequestIdentitySource: not implemented',
    );
  });
});
