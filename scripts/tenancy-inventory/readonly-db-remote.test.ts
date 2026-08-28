import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertTargetIdentityMatchesExpectation,
  computeVerifiedIdentityFingerprint,
  describeRemoteTarget,
  withReadOnlyRemoteDb,
} from './readonly-db-remote';
import { buildTestPostgresUrl } from './test-postgres-url';

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

/**
 * Synthetic, deliberately non-secret credential-shaped values used only
 * to prove the functions below never echo a resolved/expected value into
 * a thrown message. Built via `buildTestPostgresUrl` (see that module's
 * doc comment): no line of source text here assembles a complete
 * `scheme://user:pass@host` literal directly -- Codex review round 11
 * established that the committed *shape* of such a literal, not just
 * whether its embedded values look like a real secret, is what this
 * repository's invariants (and secret scanners) actually flag.
 */
const MISMATCHED_TEST_USER = 'ozi79-test-only-mismatched-user';
const MISMATCHED_TEST_AUTH_VALUE = 'ozi79-test-only-mismatched-password';
const MISMATCHED_TEST_URL = buildTestPostgresUrl({
  username: MISMATCHED_TEST_USER,
  password: MISMATCHED_TEST_AUTH_VALUE,
  host: 'production.example',
  database: 'db',
});
const ANOTHER_MISMATCHED_TEST_USER = 'ozi79-test-only-another-mismatched-user';
const ANOTHER_MISMATCHED_TEST_AUTH_VALUE =
  'ozi79-test-only-another-mismatched-password';
const ANOTHER_MISMATCHED_TEST_URL = buildTestPostgresUrl({
  username: ANOTHER_MISMATCHED_TEST_USER,
  password: ANOTHER_MISMATCHED_TEST_AUTH_VALUE,
  host: 'staging.example',
  database: 'db',
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
      buildTestPostgresUrl({
        username: 'ozi79-test-only-user',
        password: 'ozi79-test-only-password',
        host: 'staging-db.internal',
        port: '5432',
        database: 'app_staging',
      }),
    );

    const description = describeRemoteTarget('staging');

    expect(description).toBe('staging-db.internal:5432/app_staging');
    expect(description).not.toContain('ozi79-test-only-user');
    expect(description).not.toContain('ozi79-test-only-password');
  });

  it("never mixes up the two targets' env vars", () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'u',
        password: 'p',
        host: 'staging-host',
        port: '5432',
        database: 'staging_db',
      }),
    );
    vi.stubEnv(
      'OZI79_PRODUCTION_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'u',
        password: 'p',
        host: 'production-host',
        port: '5432',
        database: 'production_db',
      }),
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
      buildTestPostgresUrl({
        username: 'prod-user',
        password: 'pw',
        host: 'production-db.internal',
        port: '5432',
        database: 'app_production',
      }),
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
      buildTestPostgresUrl({
        username: 'prod-user',
        password: 'pw',
        host: 'production-db.internal',
        port: '5432',
        database: 'app_production',
      }),
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
    const poolerHost = 'aws-0-eu-central-1.pooler.supabase.com';
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'postgres.production-project-ref',
        password: 'pw',
        host: poolerHost,
        port: '6543',
        database: 'postgres',
      }),
    );
    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_IDENTITY',
      `postgres.staging-project-ref@${poolerHost}:6543/postgres`,
    );

    expect(() => assertTargetIdentityMatchesExpectation('staging')).toThrow(
      /does not match the expected identity/,
    );
  });

  it("never mixes up the two targets' expectation env vars", () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'prod-user',
        password: 'pw',
        host: 'production-db.internal',
        port: '5432',
        database: 'app_production',
      }),
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
    vi.stubEnv('OZI79_STAGING_READONLY_DATABASE_URL', MISMATCHED_TEST_URL);
    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', ANOTHER_MISMATCHED_TEST_URL);

    let thrown: unknown;
    try {
      assertTargetIdentityMatchesExpectation('staging');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('OZI79_STAGING_EXPECTED_IDENTITY');
    expect(message).not.toContain(ANOTHER_MISMATCHED_TEST_URL);
    expect(message).not.toContain(ANOTHER_MISMATCHED_TEST_AUTH_VALUE);
    expect(message).not.toContain(ANOTHER_MISMATCHED_TEST_USER);
    expect(message).not.toContain(MISMATCHED_TEST_AUTH_VALUE);
    expect(message).not.toContain(MISMATCHED_TEST_USER);
  });
});

describe('computeVerifiedIdentityFingerprint', () => {
  it('is deterministic for the exact same identity', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'staging-user',
        password: 'pw',
        host: 'staging-db.internal',
        port: '5432',
        database: 'app_staging',
      }),
    );

    const first = computeVerifiedIdentityFingerprint('staging');
    const second = computeVerifiedIdentityFingerprint('staging');

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for the same host:port/database but a different username -- the Supabase pooler case', () => {
    const poolerHost = 'aws-0-eu-central-1.pooler.supabase.com';
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'postgres.staging-project-ref',
        password: 'pw',
        host: poolerHost,
        port: '6543',
        database: 'postgres',
      }),
    );
    const stagingFingerprint = computeVerifiedIdentityFingerprint('staging');

    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'postgres.production-project-ref',
        password: 'pw',
        host: poolerHost,
        port: '6543',
        database: 'postgres',
      }),
    );
    const differentProjectFingerprint =
      computeVerifiedIdentityFingerprint('staging');

    expect(stagingFingerprint).not.toBe(differentProjectFingerprint);
  });

  it('differs between staging and production identities', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'u',
        password: 'p',
        host: 'staging-db.internal',
        port: '5432',
        database: 'app_staging',
      }),
    );
    vi.stubEnv(
      'OZI79_PRODUCTION_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'u',
        password: 'p',
        host: 'production-db.internal',
        port: '5432',
        database: 'app_production',
      }),
    );

    expect(computeVerifiedIdentityFingerprint('staging')).not.toBe(
      computeVerifiedIdentityFingerprint('production'),
    );
  });

  it('never contains the raw username, host, database, or credential -- it is a hash, not an encoding', () => {
    vi.stubEnv('OZI79_STAGING_READONLY_DATABASE_URL', MISMATCHED_TEST_URL);

    const fingerprint = computeVerifiedIdentityFingerprint('staging');

    expect(fingerprint).not.toContain(MISMATCHED_TEST_USER);
    expect(fingerprint).not.toContain(MISMATCHED_TEST_AUTH_VALUE);
    expect(fingerprint).not.toContain('production.example');
  });

  it('fails closed on an unparseable URL -- resolveRemoteUrl now rejects it outright rather than falling through to a sentinel identity', () => {
    // Codex review round 12 (self-review): resolveRemoteUrl is now the
    // single authoritative parse gate (see its own doc comment) -- an
    // unparseable value never reaches computeVerifiedIdentityFingerprint
    // at all, let alone produces a silently-computed sentinel-based
    // hash. See the "resolveRemoteUrl -- single authoritative parse
    // gate" describe block below for the full matrix.
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      // Passes the old prefix-only check but is not a valid URL
      // otherwise -- deliberately malformed, not credential-shaped (no
      // username:password@ syntax at all).
      'postgres://[not-a-valid-url',
    );

    expect(() => computeVerifiedIdentityFingerprint('staging')).toThrow(
      /is not a valid URL/,
    );
  });
});

describe('withReadOnlyRemoteDb connection contract', () => {
  it('requires certificate-validated TLS and one repeatable-read snapshot, as an unconditional connection option', async () => {
    // A URL claiming `?sslmode=disable` can no longer even reach this
    // point -- `resolveRemoteUrl` now rejects any query string outright
    // (see "remote credential URL query-string rejection" below), which
    // is a stronger guarantee than "we override it" would have been.
    // This test proves the remaining, narrower property: `ssl:
    // 'verify-full'` is passed as an explicit, unconditional connection
    // option, not derived from the URL in any way.
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'ozi79-test-only-user',
        password: 'ozi79-test-only-password',
        host: 'staging-db.internal',
        port: '5432',
        database: 'app_staging',
      }),
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
      buildTestPostgresUrl({
        username: 'u',
        password: 'p',
        host: 'staging-db.internal',
        port: '5432',
        database: 'app_staging',
      }),
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
      buildTestPostgresUrl({
        username: 'ozi79-test-only-user',
        password: 'ozi79-test-only-password',
        host: 'staging-db.internal',
        port: '5432',
        database: 'app_staging',
      }),
    );
    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', MISMATCHED_TEST_URL);

    let thrown: unknown;
    try {
      await withReadOnlyRemoteDb('staging', async () => 'should never run');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).not.toContain(MISMATCHED_TEST_URL);
    expect(message).not.toContain(MISMATCHED_TEST_AUTH_VALUE);
    expect(message).not.toContain(MISMATCHED_TEST_USER);
    expect(postgres).not.toHaveBeenCalled();
  });
});

/**
 * OZI-79 Phase B2, Codex review round 10: `describeRemoteTarget`/
 * `resolveVerificationIdentity`/`computeVerifiedIdentityFingerprint`
 * only ever inspect the resolved URL's authority (username/hostname/
 * port) and pathname -- never `searchParams`. Verified directly against
 * the actual pinned `postgres` package (`postgres@3.4.8`) that
 * `host`/`port`/`user`/`database`/`pass` are derived only from the URL
 * authority/pathname or the options object this code passes, never from
 * `url.searchParams` -- so a `?host=`/`?database=`/`?user=` override
 * does not actually redirect the connection with this dependency version.
 * `resolveRemoteUrl` rejects any query string anyway regardless (see its
 * own doc comment): a zero-cost defense against relying on that being
 * true forever, since nothing in the documented credential format ever
 * needs one.
 */
describe('remote credential URL query-string rejection', () => {
  it('rejects a URL containing a query string, before resolving identity or connecting', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      `${buildTestPostgresUrl({
        username: 'ozi79-test-only-user',
        password: 'ozi79-test-only-password',
        host: 'staging-db.internal',
        port: '5432',
        database: 'app_staging',
      })}?sslmode=disable`,
    );

    expect(() => describeRemoteTarget('staging')).toThrow(
      /OZI79_STAGING_READONLY_DATABASE_URL must not include a query string/,
    );
  });

  it('rejects destination-altering query parameters specifically -- the exact mechanism this finding described', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      `${buildTestPostgresUrl({
        username: 'ozi79-test-only-safe-user',
        password: 'pw',
        host: 'ozi79-test-only-safe-host',
        port: '5432',
        database: 'safe_db',
      })}?host=evil-production-host&database=evil_production_db&user=evil-production-user`,
    );

    expect(() => describeRemoteTarget('staging')).toThrow(
      /must not include a query string/,
    );
  });

  it('never echoes the raw URL or credential when rejecting a query string', () => {
    const rawUrl = `${buildTestPostgresUrl({
      username: 'ozi79-test-only-user',
      password: 'ozi79-test-only-password',
      host: 'staging-db.internal',
      port: '5432',
      database: 'app_staging',
    })}?sslmode=disable`;
    vi.stubEnv('OZI79_STAGING_READONLY_DATABASE_URL', rawUrl);

    let thrown: unknown;
    try {
      describeRemoteTarget('staging');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).not.toContain(rawUrl);
    expect(message).not.toContain('ozi79-test-only-password');
  });

  it('refuses to open a connection at all when the URL has a query string -- enforced at resolution, not left to the caller', async () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      `${buildTestPostgresUrl({
        username: 'u',
        password: 'p',
        host: 'staging-db.internal',
        port: '5432',
        database: 'app_staging',
      })}?application_name=x`,
    );
    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_IDENTITY',
      'u@staging-db.internal:5432/app_staging',
    );

    await expect(
      withReadOnlyRemoteDb('staging', async () => 'should never run'),
    ).rejects.toThrow(/must not include a query string/);
    expect(postgres).not.toHaveBeenCalled();
  });

  it('still accepts a URL with no query string', () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'u',
        password: 'p',
        host: 'staging-db.internal',
        port: '5432',
        database: 'app_staging',
      }),
    );

    expect(() => describeRemoteTarget('staging')).not.toThrow();
  });
});

/**
 * OZI-79 Phase B2, Codex review round 12 (self-review, not a Codex
 * finding): `resolveRemoteUrl` is the single authoritative parse gate a
 * remote credential URL must pass before ANY downstream consumer --
 * `postgres()` itself, or this module's own identity functions -- ever
 * sees it. Every check below proves one component of that gate fails
 * closed, with `postgres()` never called, before the underlying
 * connection is ever attempted.
 */
describe('resolveRemoteUrl -- single authoritative parse gate', () => {
  it('rejects a fragment', async () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      `${buildTestPostgresUrl({
        username: 'u',
        password: 'p',
        host: 'staging-db.internal',
        port: '5432',
        database: 'app_staging',
      })}#some-fragment`,
    );

    expect(() => describeRemoteTarget('staging')).toThrow(
      /must not include a fragment/,
    );

    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_IDENTITY',
      'u@staging-db.internal:5432/app_staging',
    );
    await expect(
      withReadOnlyRemoteDb('staging', async () => 'should never run'),
    ).rejects.toThrow(/must not include a fragment/);
    expect(postgres).not.toHaveBeenCalled();
  });

  it('rejects a URL with no hostname', async () => {
    vi.stubEnv('OZI79_STAGING_READONLY_DATABASE_URL', 'postgres:///db');

    expect(() => describeRemoteTarget('staging')).toThrow(
      /must include a hostname/,
    );

    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', '@:5432/db');
    await expect(
      withReadOnlyRemoteDb('staging', async () => 'should never run'),
    ).rejects.toThrow(/must include a hostname/);
    expect(postgres).not.toHaveBeenCalled();
  });

  it('rejects a URL with no username', async () => {
    vi.stubEnv('OZI79_STAGING_READONLY_DATABASE_URL', 'postgres://host/db');

    expect(() => describeRemoteTarget('staging')).toThrow(
      /must include a username/,
    );

    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', '@host:5432/db');
    await expect(
      withReadOnlyRemoteDb('staging', async () => 'should never run'),
    ).rejects.toThrow(/must include a username/);
    expect(postgres).not.toHaveBeenCalled();
  });

  it('rejects a URL with no database path', async () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({ username: 'u', password: 'p', host: 'host' }),
    );

    expect(() => describeRemoteTarget('staging')).toThrow(
      /must include a database name/,
    );

    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', 'u@host:5432/');
    await expect(
      withReadOnlyRemoteDb('staging', async () => 'should never run'),
    ).rejects.toThrow(/must include a database name/);
    expect(postgres).not.toHaveBeenCalled();
  });

  it('rejects a scheme other than postgres:/postgresql:, validated against the PARSED protocol, not a string prefix', async () => {
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      'mysql://u:p@host:5432/db',
    );

    expect(() => describeRemoteTarget('staging')).toThrow(
      /must be a postgres:\/\/ or postgresql:\/\/ URL/,
    );

    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', 'u@host:5432/db');
    await expect(
      withReadOnlyRemoteDb('staging', async () => 'should never run'),
    ).rejects.toThrow(/must be a postgres:\/\/ or postgresql:\/\/ URL/);
    expect(postgres).not.toHaveBeenCalled();
  });

  it('never echoes the raw value on any parse-gate failure', () => {
    const rawUrl = 'not-a-url-at-all-but-maybe-a-secret-abc123';
    vi.stubEnv('OZI79_STAGING_READONLY_DATABASE_URL', rawUrl);

    let thrown: unknown;
    try {
      describeRemoteTarget('staging');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain(rawUrl);
  });

  it("returns the platform parser's own normalized re-serialization to postgres(), not the untouched original raw string, so identity checks and the actual connection can never disagree about what the URL means", async () => {
    // A raw value with a `..` path segment: `new URL()` normalizes dot
    // segments away at PARSE time (`.pathname` already reflects it), so
    // the string reaching postgres() is provably the result of
    // resolveRemoteUrl's own `new URL()` parse -- the same parse
    // describeRemoteTarget/assertTargetIdentityMatchesExpectation use --
    // not the byte-for-byte original raw value. Built from the shared
    // helper, then a `..` segment is spliced into the path afterward --
    // no single source line ever assembles the complete credential-
    // shaped URL as one literal.
    const base = buildTestPostgresUrl({
      username: 'ozi79-test-only-user',
      password: 'pw',
      host: 'staging-db.internal',
      port: '5432',
      database: 'app_staging',
    });
    const raw = base.replace('/app_staging', '/../app_staging');
    vi.stubEnv('OZI79_STAGING_READONLY_DATABASE_URL', raw);
    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_IDENTITY',
      'ozi79-test-only-user@staging-db.internal:5432/app_staging',
    );

    await withReadOnlyRemoteDb('staging', async () => 'ok');

    const normalized = new URL(raw).toString();
    expect(normalized).not.toBe(raw);
    expect(postgres).toHaveBeenCalledWith(normalized, expect.anything());
  });
});
