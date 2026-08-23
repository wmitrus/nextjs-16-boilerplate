/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import { getEnvDiagnostics } from './env-diagnostics';

/**
 * SEC-44. `EnvDiagnosticsEntry` used to carry
 * `value.slice(0,2) + '***' + value.slice(-4)`, so both
 * `/api/internal/env-check` and the `/env-summary` demo page handed out
 * fragments of `CLERK_SECRET_KEY` and of `INTERNAL_API_KEY` itself.
 *
 * Asserted at the source rather than on either consumer's output: fixing only
 * the route's JSON would have left `/env-summary` -- reachable by any
 * signed-in user with demo mode on -- serving the same fragments.
 */
describe('env diagnostics carry no secret material', () => {
  it('reports presence only, with no value fragment on any entry', () => {
    process.env.INTERNAL_API_KEY = 'super-secret-internal-key-value-1234';
    // Deliberately not shaped like a real vendor key (`sk_live_...`): a
    // realistic-looking secret in a fixture trips GitHub push protection
    // and teaches the shape to anyone copying this test. The assertions
    // below only need a value that is distinctive in the output.
    process.env.CLERK_SECRET_KEY = 'clerk-secret-fixture-value-not-real-5678';

    const diagnostics = getEnvDiagnostics();
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics.required.length).toBeGreaterThan(0);
    for (const entry of diagnostics.required) {
      expect(Object.keys(entry).sort()).toEqual(['name', 'present']);
    }

    // Neither the whole secret nor the fragments the old mask exposed.
    expect(serialized).not.toContain('super-secret-internal-key-value-1234');
    expect(serialized).not.toContain('1234');
    expect(serialized).not.toContain(
      'clerk-secret-fixture-value-not-real-5678',
    );
    expect(serialized).not.toContain('5678');
    expect(serialized).not.toContain('maskedValue');
  });

  it('still says which variables are missing', () => {
    // The endpoint's actual job -- diagnosing a broken deployment -- must
    // survive the change.
    delete process.env.INTERNAL_API_KEY;

    const diagnostics = getEnvDiagnostics();
    const internal = diagnostics.required.find(
      (entry) => entry.name === 'INTERNAL_API_KEY',
    );

    expect(internal?.present).toBe(false);
    // `ok` is derived from the missing-required set, so an absent variable
    // still flips the overall verdict -- which is what an operator reads.
    expect(diagnostics.ok).toBe(false);
  });
});
