import { describe, expect, it } from 'vitest';

import { NeonRequestIdentitySource } from './NeonRequestIdentitySource';

describe('NeonRequestIdentitySource', () => {
  it('throws a not-implemented error (stub - Neon provider pending)', () => {
    const source = new NeonRequestIdentitySource();

    expect(() => source.get()).toThrow(
      '[authModule] AUTH_PROVIDER=neon is not yet implemented.',
    );
  });

  it('throws before returning any identity data', () => {
    const source = new NeonRequestIdentitySource();

    expect(() => source.get()).toThrow(
      'Implement NeonRequestIdentitySource.get() and the Neon-specific session/UI integration before using this provider.',
    );
  });
});
