import { describe, expect, it } from 'vitest';

import { SupabaseRequestIdentitySource } from './SupabaseRequestIdentitySource';

describe('SupabaseRequestIdentitySource', () => {
  it('throws a not-implemented error (stub — Supabase provider pending)', () => {
    const source = new SupabaseRequestIdentitySource();

    expect(() => source.get()).toThrow(
      '[authModule] AUTH_PROVIDER=supabase is not yet implemented.',
    );
  });

  it('throws before returning any identity data (no org claims possible)', () => {
    const source = new SupabaseRequestIdentitySource();

    expect(() => source.get()).toThrow(
      'Implement SupabaseRequestIdentitySource.get() before using this provider.',
    );
  });
});
