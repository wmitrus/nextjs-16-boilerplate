import { describe, expect, it } from 'vitest';

import { AuthJsRequestIdentitySource } from './AuthJsRequestIdentitySource';

describe('AuthJsRequestIdentitySource', () => {
  it('throws a not-implemented error (stub — Auth.js provider pending)', () => {
    const source = new AuthJsRequestIdentitySource();

    expect(() => source.get()).toThrow(
      '[authModule] AUTH_PROVIDER=authjs is not yet implemented.',
    );
  });

  it('throws before returning any identity data (no org claims possible)', () => {
    const source = new AuthJsRequestIdentitySource();

    expect(() => source.get()).toThrow(
      'Implement AuthJsRequestIdentitySource.get() before using this provider.',
    );
  });
});
