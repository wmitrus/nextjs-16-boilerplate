import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertTargetIdentityMatchesExpectation,
  computeVerifiedIdentityFingerprint,
  describeRemoteTarget,
  withReadOnlyRemoteDb,
} from './readonly-db-remote';

/**
 * `withReadOnlyRemoteDb` is never exercised end-to-end against a real
 * server anywhere in this repo (Phase A/B1 deliberately authorize no
 * remote execution -- see the module's own doc comment). These two
 * network functions are mocked purely to capture the exact options this
 * function passes to them, proving the connection contract (TLS,
 * isolation level) without needing a live remote target. The mocked
 * `transaction` never invokes its callback, so `verifyReadOnlyRole`
 * never runs and never needs its own DB-shaped fixtures here.
 */
vi.mock('postgres', () => ({
  default: vi.fn(() => ({ end: vi.fn().mockResolvedValue(undefined) })),
}));
vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => ({ transaction: vi.fn().mockResolvedValue(undefined) })),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('describeRemoteTarget', () => {
  it('fails closed with a clear message when the env var is unset', () => {
    vi.stubEnv('OZI79_STAGING_READONLY_DATABASE_URL', '');

    expect(() => describeRemoteTarget('staging')).toThrow(
      'OZI79_STAGING_READONLY_DATABASE_URL is required',
    );
  });

  it('fails closed on a malformed URL without ever echoing the value', () => {
    const secretLookingValue = 'not-a-postgres-url-but-maybe-a-secret-abc123';
    vi.stubEnv('OZI79_PRODUCTION_READONLY_DATABASE_URL', secretLookingValue);

    let thrown: unknown;
    try {
      describeRemoteTarget('production');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('OZI79_PRODUCTION_READONLY_DATABASE_URL');
    expect(message).not.toContain(secretLookingValue);
  });

  it('describes only host:port/database, never credentials, for a valid URL', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'postgres://ozi79-test-only-user:ozi79-test-only-password@staging-db.internal:5432/app_staging',
    );

    const description = describeRemoteTarget('staging');

    expect(description).toBe('staging-db.internal:5432/app_staging');
    expect(description).not.toContain('ozi79-test-only-user');
    expect(description).not.toContain('ozi79-test-only-password');
  });

  it("never mixes up the two targets' env vars", () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'postgres://u:p@staging-host:5432/staging_db',
    );
    vi.stubEnv(
      'OZI79_PRODUCTION_READONLY_DATABASE_URL',
      'postgres://u:p@production-host:5432/production_db',
    );

    expect(describeRemoteTarget('staging')).toBe(
      'staging-host:5432/staging_db',
    );
    expect(describeRemoteTarget('production')).toBe(
      'production-host:5432/production_db',
    );
  });
});

describe('assertTargetIdentityMatchesExpectation', () => {
  it('fails closed when the expected-identity env var is unset', () => {
    // Stubbed to the empty string, not merely left absent -- this test's
    // scenario must not depend on the operator's real shell not
    // happening to have this variable exported. OZI79_STAGING_READONLY_
    // DATABASE_URL deliberately left unset too: the unset-expectation
    // check must fire before this function ever resolves the URL.
    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', '');

    expect(() => assertTargetIdentityMatchesExpectation('staging')).toThrow(
      'OZI79_STAGING_EXPECTED_IDENTITY is required',
    );
  });

  it('fails closed when the resolved identity does not match the declared expectation -- the swapped-credential case', () => {
    vi.stubEnv(
      // What actually got resolved for "staging" -- the production
      // host and user, e.g. because the two credential env vars were
      // swapped during provisioning.
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'postgres://prod-user:pw@production-db.internal:5432/app_production',
    );
    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_IDENTITY',
      'staging-user@staging-db.internal:5432/app_staging',
    );

    expect(() => assertTargetIdentityMatchesExpectation('staging')).toThrow(
      /does not match the expected identity/,
    );
  });

  it('passes when the resolved identity matches exactly, including the username', () => {
    vi.stubEnv(
      'OZI79_PRODUCTION_READONLY_DATABASE_URL',
      'postgres://prod-user:pw@production-db.internal:5432/app_production',
    );
    vi.stubEnv(
      'OZI79_PRODUCTION_EXPECTED_IDENTITY',
      'prod-user@production-db.internal:5432/app_production',
    );

    expect(() =>
      assertTargetIdentityMatchesExpectation('production'),
    ).not.toThrow();
  });

  it('rejects a same-host, same-database, different-username pair -- the Supabase pooler case', () => {
    // This repository's own .env.example documents exactly this shape:
    // postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
    // -- every project sharing a region's pooler has an IDENTICAL
    // describeUrl() output (same host:port/database); only the username
    // carries which project (staging vs. production) this actually is.
    // A check built only on describeUrl's output would treat these two
    // as identical and silently accept the swap.
    const sharedPoolerHostAndDb =
      '@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      `postgres://postgres.production-project-ref:pw${sharedPoolerHostAndDb}`,
    );
    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_IDENTITY',
      `postgres.staging-project-ref${sharedPoolerHostAndDb}`,
    );

    expect(() => assertTargetIdentityMatchesExpectation('staging')).toThrow(
      /does not match the expected identity/,
    );
  });

  it("never mixes up the two targets' expectation env vars", () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'postgres://prod-user:pw@production-db.internal:5432/app_production',
    );
    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_IDENTITY',
      'staging-user@staging-db.internal:5432/app_staging',
    );
    vi.stubEnv(
      'OZI79_PRODUCTION_EXPECTED_IDENTITY',
      'prod-user@production-db.internal:5432/app_production',
    );

    // Staging's real (swapped-to-production) identity checked against
    // production's own expectation would happen to match -- but nothing
    // here calls assertTargetIdentityMatchesExpectation('production'),
    // so that coincidence is irrelevant; staging's own check must still
    // fail against its own, correctly-declared expectation.
    expect(() => assertTargetIdentityMatchesExpectation('staging')).toThrow(
      /does not match the expected identity/,
    );
  });

  it('never echoes the declared expectation value, the resolved username, or the full URL on a mismatch', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'postgres://oops-user:VERY-SECRET-PASSWORD@production.example/db',
    );
    const credentialBearingExpectation =
      'postgres://another-oops-user:ANOTHER-SECRET@staging.example/db';
    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', credentialBearingExpectation);

    let thrown: unknown;
    try {
      assertTargetIdentityMatchesExpectation('staging');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('OZI79_STAGING_EXPECTED_IDENTITY');
    expect(message).not.toContain(credentialBearingExpectation);
    expect(message).not.toContain('ANOTHER-SECRET');
    expect(message).not.toContain('another-oops-user');
    expect(message).not.toContain('VERY-SECRET-PASSWORD');
    expect(message).not.toContain('oops-user');
  });
});

describe('computeVerifiedIdentityFingerprint', () => {
  it('is deterministic for the exact same identity', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'postgres://staging-user:pw@staging-db.internal:5432/app_staging',
    );

    const first = computeVerifiedIdentityFingerprint('staging');
    const second = computeVerifiedIdentityFingerprint('staging');

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for the same host:port/database but a different username -- the Supabase pooler case', () => {
    const sharedPoolerHostAndDb =
      '@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      `postgres://postgres.staging-project-ref:pw${sharedPoolerHostAndDb}`,
    );
    const stagingFingerprint = computeVerifiedIdentityFingerprint('staging');

    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      `postgres://postgres.production-project-ref:pw${sharedPoolerHostAndDb}`,
    );
    const differentProjectFingerprint =
      computeVerifiedIdentityFingerprint('staging');

    expect(stagingFingerprint).not.toBe(differentProjectFingerprint);
  });

  it('differs between staging and production identities', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'postgres://u:p@staging-db.internal:5432/app_staging',
    );
    vi.stubEnv(
      'OZI79_PRODUCTION_READONLY_DATABASE_URL',
      'postgres://u:p@production-db.internal:5432/app_production',
    );

    expect(computeVerifiedIdentityFingerprint('staging')).not.toBe(
      computeVerifiedIdentityFingerprint('production'),
    );
  });

  it('never contains the raw username, host, database, or credential -- it is a hash, not an encoding', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'postgres://oops-user:VERY-SECRET-PASSWORD@production.example/db',
    );

    const fingerprint = computeVerifiedIdentityFingerprint('staging');

    expect(fingerprint).not.toContain('oops-user');
    expect(fingerprint).not.toContain('VERY-SECRET-PASSWORD');
    expect(fingerprint).not.toContain('production.example');
  });

  it('still produces a stable, well-formed fingerprint for an unparseable URL (fails closed via the sentinel identity, not by throwing)', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      // Passes resolveRemoteUrl's postgres:// prefix check but is not a
      // valid URL otherwise.
      'postgres://[not-a-valid-url',
    );

    const fingerprint = computeVerifiedIdentityFingerprint('staging');

    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('withReadOnlyRemoteDb connection contract', () => {
  it('requires certificate-validated TLS and one repeatable-read snapshot, regardless of what the URL itself claims', async () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      // sslmode=disable in the URL must NOT weaken the connection --
      // proving the explicit `ssl` option always wins.
      'postgres://ozi79-test-only-user:ozi79-test-only-password@staging-db.internal:5432/app_staging?sslmode=disable',
    );
    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_IDENTITY',
      'ozi79-test-only-user@staging-db.internal:5432/app_staging',
    );

    await withReadOnlyRemoteDb('staging', async () => 'ok');

    expect(postgres).toHaveBeenCalledWith(
      expect.stringContaining('staging-db.internal:5432/app_staging'),
      expect.objectContaining({ ssl: 'verify-full' }),
    );
    const dbInstance = vi.mocked(drizzle).mock.results[0]?.value as {
      transaction: ReturnType<typeof vi.fn>;
    };
    expect(dbInstance.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: 'read only',
      isolationLevel: 'repeatable read',
    });
  });

  it('refuses to open a connection at all when the target-identity safeguard fails -- baked into the function itself, not left to the caller', async () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'postgres://u:p@staging-db.internal:5432/app_staging',
    );
    // Stubbed to the empty string, not merely left absent -- see the
    // identical note on the unit-level test above.
    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', '');

    await expect(
      withReadOnlyRemoteDb('staging', async () => 'should never run'),
    ).rejects.toThrow(/OZI79_STAGING_EXPECTED_IDENTITY is required/);
    expect(postgres).not.toHaveBeenCalled();
  });

  it('refuses to open a connection when the declared expectation is a mismatched, credential-bearing value -- and never echoes it', async () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'postgres://ozi79-test-only-user:ozi79-test-only-password@staging-db.internal:5432/app_staging',
    );
    const credentialBearingValue =
      'postgres://oops-user:VERY-SECRET-PASSWORD@production.example/db';
    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', credentialBearingValue);

    let thrown: unknown;
    try {
      await withReadOnlyRemoteDb('staging', async () => 'should never run');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).not.toContain(credentialBearingValue);
    expect(message).not.toContain('VERY-SECRET-PASSWORD');
    expect(message).not.toContain('oops-user');
    expect(postgres).not.toHaveBeenCalled();
  });
});
