import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertTargetDescriptorMatchesExpectation,
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

describe('assertTargetDescriptorMatchesExpectation', () => {
  it('fails closed when the expected-descriptor env var is unset', () => {
    expect(() =>
      assertTargetDescriptorMatchesExpectation(
        'staging',
        'staging-db.internal:5432/app_staging',
      ),
    ).toThrow('OZI79_STAGING_EXPECTED_DESCRIPTOR is required');
  });

  it('fails closed when the resolved descriptor does not match the declared expectation -- the swapped-credential case', () => {
    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_DESCRIPTOR',
      'staging-db.internal:5432/app_staging',
    );

    expect(() =>
      assertTargetDescriptorMatchesExpectation(
        'staging',
        // What OZI79_STAGING_READONLY_DATABASE_URL actually resolved to
        // -- the production host, e.g. because the two credential env
        // vars were swapped during provisioning.
        'production-db.internal:5432/app_production',
      ),
    ).toThrow(/does not match the expected descriptor/);
  });

  it('passes when the resolved descriptor matches exactly', () => {
    vi.stubEnv(
      'OZI79_PRODUCTION_EXPECTED_DESCRIPTOR',
      'production-db.internal:5432/app_production',
    );

    expect(() =>
      assertTargetDescriptorMatchesExpectation(
        'production',
        'production-db.internal:5432/app_production',
      ),
    ).not.toThrow();
  });

  it("never mixes up the two targets' expectation env vars", () => {
    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_DESCRIPTOR',
      'staging-db.internal:5432/app_staging',
    );
    vi.stubEnv(
      'OZI79_PRODUCTION_EXPECTED_DESCRIPTOR',
      'production-db.internal:5432/app_production',
    );

    // Staging's real descriptor checked against production's expectation
    // must fail, even though both env vars are set to *something*.
    expect(() =>
      assertTargetDescriptorMatchesExpectation(
        'staging',
        'production-db.internal:5432/app_production',
      ),
    ).toThrow(/does not match the expected descriptor/);
  });

  it('never echoes the declared expectation value on a mismatch, even if it looks credential-bearing', () => {
    const secretLookingValue =
      'postgres://readonly:s3cr3t-not-a-real-secret@internal-host:5432/app';
    vi.stubEnv('OZI79_STAGING_EXPECTED_DESCRIPTOR', secretLookingValue);

    let thrown: unknown;
    try {
      assertTargetDescriptorMatchesExpectation(
        'staging',
        'staging-db.internal:5432/app_staging',
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('OZI79_STAGING_EXPECTED_DESCRIPTOR');
    expect(message).not.toContain(secretLookingValue);
    expect(message).not.toContain('s3cr3t-not-a-real-secret');
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
      'OZI79_STAGING_EXPECTED_DESCRIPTOR',
      'staging-db.internal:5432/app_staging',
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
    // Deliberately left unset: OZI79_STAGING_EXPECTED_DESCRIPTOR.

    await expect(
      withReadOnlyRemoteDb('staging', async () => 'should never run'),
    ).rejects.toThrow(/OZI79_STAGING_EXPECTED_DESCRIPTOR is required/);
    expect(postgres).not.toHaveBeenCalled();
  });
});
