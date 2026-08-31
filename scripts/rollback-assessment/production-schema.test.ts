import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assessAppliedMigrationHashSetCompatibility,
  readCandidateMigrationJournal,
  readProductionAppliedMigrationHashes,
  resolveVerifiedProductionDatabaseUrl,
} from './production-schema';

const gitSha = 'a'.repeat(40);
const productionHost = 'ep-production.us-east-2.aws.neon.tech';
const productionDatabaseName = 'app_production';
const productionUrl = `postgres://user:pass@${productionHost}/${productionDatabaseName}`;

function stubProductionDatabaseAnchors(): void {
  vi.stubEnv('DATABASE_URL', productionUrl);
  vi.stubEnv('DATABASE_URL_UNPOOLED', '');
  vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
  vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('candidate migration journal (local Git object access)', () => {
  it('resolves candidate evidence from the exact trusted SHA, not the working tree', () => {
    const journalJson = JSON.stringify({
      entries: [
        { tag: '0000_rainy_lenny_balinger' },
        { tag: '0001_unique_richard_fisk' },
      ],
    });
    const executor = vi
      .fn()
      .mockReturnValueOnce('false\n')
      .mockReturnValueOnce(journalJson)
      .mockReturnValueOnce('sql-body-0')
      .mockReturnValueOnce('sql-body-1');

    const result = readCandidateMigrationJournal(gitSha, executor);
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.journal).toEqual([
      {
        hash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown as string,
        tag: '0000_rainy_lenny_balinger',
      },
      {
        hash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown as string,
        tag: '0001_unique_richard_fisk',
      },
    ]);
    expect(executor.mock.calls[1]?.[1]).toEqual([
      'show',
      `${gitSha}:src/core/db/migrations/generated/meta/_journal.json`,
    ]);
    expect(executor.mock.calls[2]?.[1]).toEqual([
      'show',
      `${gitSha}:src/core/db/migrations/generated/0000_rainy_lenny_balinger.sql`,
    ]);
  });

  it('hashes deterministically -- identical SQL bytes yield identical hashes', () => {
    const journalJson = JSON.stringify({
      entries: [{ tag: '0000_rainy_lenny_balinger' }],
    });
    const run = () =>
      readCandidateMigrationJournal(
        gitSha,
        vi
          .fn()
          .mockReturnValueOnce('false\n')
          .mockReturnValueOnce(journalJson)
          .mockReturnValueOnce('stable sql body'),
      );
    const first = run();
    const second = run();
    expect(first).toEqual(second);
  });

  it('blocks a shallow checkout without fetching', () => {
    const executor = vi.fn().mockReturnValue('true\n');
    const result = readCandidateMigrationJournal(gitSha, executor);
    expect(result).toMatchObject({ status: 'BLOCKED' });
    expect(executor).toHaveBeenCalledOnce();
    expect(executor.mock.calls[0]?.[1]).not.toContain('fetch');
  });

  it('blocks when the candidate commit or journal cannot be resolved locally', () => {
    const executor = vi
      .fn()
      .mockReturnValueOnce('false\n')
      .mockImplementationOnce(() => {
        throw new Error('fatal: Not a valid object name');
      });
    expect(readCandidateMigrationJournal(gitSha, executor)).toMatchObject({
      status: 'BLOCKED',
    });
  });

  it('errors when shallow-ness cannot be determined', () => {
    expect(
      readCandidateMigrationJournal(gitSha, () => {
        throw new Error('raw stderr');
      }),
    ).toMatchObject({ status: 'ERROR' });
  });
});

describe('Production database identity binding (host + database name)', () => {
  it('proves the resolved connection targets both the declared host and database name', () => {
    stubProductionDatabaseAnchors();
    expect(resolveVerifiedProductionDatabaseUrl()).toEqual({
      connectionString: productionUrl,
      status: 'OK',
    });
  });

  it('prefers DATABASE_URL_UNPOOLED when both anchors match', () => {
    const unpooled = `postgres://user:pass@${productionHost}/${productionDatabaseName}?unpooled=1`;
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@other-host/other-db');
    vi.stubEnv('DATABASE_URL_UNPOOLED', unpooled);
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    expect(resolveVerifiedProductionDatabaseUrl()).toEqual({
      connectionString: unpooled,
      status: 'OK',
    });
  });

  it('blocks correct host + wrong database name', () => {
    vi.stubEnv(
      'DATABASE_URL',
      `postgres://user:pass@${productionHost}/wrong_db`,
    );
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    const result = resolveVerifiedProductionDatabaseUrl();
    expect(result).toMatchObject({ status: 'BLOCKED' });
    expect(JSON.stringify(result)).not.toContain('wrong_db');
  });

  it('blocks wrong host + correct database name', () => {
    vi.stubEnv(
      'DATABASE_URL',
      `postgres://user:pass@wrong-host/${productionDatabaseName}`,
    );
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    const result = resolveVerifiedProductionDatabaseUrl();
    expect(result).toMatchObject({ status: 'BLOCKED' });
    expect(JSON.stringify(result)).not.toContain('wrong-host');
  });

  it('blocks without opening a connection when PRODUCTION_DATABASE_HOST is not configured', () => {
    vi.stubEnv('DATABASE_URL', productionUrl);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    expect(resolveVerifiedProductionDatabaseUrl()).toMatchObject({
      status: 'BLOCKED',
    });
  });

  it('blocks without opening a connection when PRODUCTION_DATABASE_NAME is not configured', () => {
    vi.stubEnv('DATABASE_URL', productionUrl);
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    const result = resolveVerifiedProductionDatabaseUrl();
    expect(result).toMatchObject({ status: 'BLOCKED' });
  });

  it('blocks when DATABASE_URL is not configured at all', () => {
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    expect(resolveVerifiedProductionDatabaseUrl()).toMatchObject({
      status: 'BLOCKED',
    });
  });

  it('blocks an empty database path (host matches, database name does not)', () => {
    vi.stubEnv('DATABASE_URL', `postgres://user:pass@${productionHost}/`);
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    expect(resolveVerifiedProductionDatabaseUrl()).toMatchObject({
      status: 'BLOCKED',
    });
  });

  it('errors on a non-PostgreSQL scheme before client construction', () => {
    vi.stubEnv(
      'DATABASE_URL',
      `https://${productionHost}/${productionDatabaseName}`,
    );
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    expect(resolveVerifiedProductionDatabaseUrl()).toMatchObject({
      status: 'ERROR',
    });
  });

  it('errors on a malformed connection string without leaking it', () => {
    const malformed = 'not a url';
    vi.stubEnv('DATABASE_URL', malformed);
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    const result = resolveVerifiedProductionDatabaseUrl();
    expect(result).toMatchObject({ status: 'ERROR' });
    expect(JSON.stringify(result)).not.toContain(malformed);
  });

  it('host-surface separation: PRODUCTION_RUNTIME_DATABASE_HOST (the environment-contract pin) does not affect schema target verification', () => {
    stubProductionDatabaseAnchors();
    // Set to something that would fail this function's own comparison if it
    // were ever accidentally consulted -- proving it genuinely is not read.
    vi.stubEnv(
      'PRODUCTION_RUNTIME_DATABASE_HOST',
      'ep-pooler-runtime-host.us-east-2.aws.neon.tech',
    );
    expect(resolveVerifiedProductionDatabaseUrl()).toEqual({
      connectionString: productionUrl,
      status: 'OK',
    });
  });

  it('accepts a legitimate pooled-runtime/direct-schema host split: DATABASE_URL_UNPOOLED (direct) matches PRODUCTION_DATABASE_HOST while DATABASE_URL (pooled) and PRODUCTION_RUNTIME_DATABASE_HOST differ, independently of the environment-contract pin', () => {
    const pooledUrl = `postgres://user:pass@ep-prod-pooler.us-east-2.aws.neon.tech/${productionDatabaseName}`;
    const directUrl = `postgres://user:pass@${productionHost}/${productionDatabaseName}`;
    vi.stubEnv('DATABASE_URL', pooledUrl);
    vi.stubEnv('DATABASE_URL_UNPOOLED', directUrl);
    vi.stubEnv(
      'PRODUCTION_RUNTIME_DATABASE_HOST',
      'ep-prod-pooler.us-east-2.aws.neon.tech',
    );
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    // The schema proof uses DATABASE_URL_UNPOOLED (direct) against
    // PRODUCTION_DATABASE_HOST (direct) -- unaffected by the pooled pair.
    expect(resolveVerifiedProductionDatabaseUrl()).toEqual({
      connectionString: directUrl,
      status: 'OK',
    });
  });
});

describe('Production applied-migration-hash read', () => {
  function fakeFactory(options: {
    endError?: Error;
    rows?: Array<{ hash: string }>;
    throwOnBegin?: Error;
    throwOnConstruct?: Error;
  }) {
    const calls: {
      beginOptions?: string;
      connectOptions?: unknown;
      queryStrings?: readonly string[];
      queryValues?: unknown[];
    } = {};
    let ended = false;
    let constructed = false;
    const factory = ((_url: string, connectOptions: unknown) => {
      if (options.throwOnConstruct) throw options.throwOnConstruct;
      constructed = true;
      calls.connectOptions = connectOptions;
      return {
        begin: async (
          beginOptions: string,
          fn: (
            tx: (
              strings: TemplateStringsArray,
              ...values: unknown[]
            ) => Promise<unknown>,
          ) => unknown,
        ) => {
          calls.beginOptions = beginOptions;
          if (options.throwOnBegin) throw options.throwOnBegin;
          const tx = (strings: TemplateStringsArray, ...values: unknown[]) => {
            calls.queryStrings = [...strings];
            calls.queryValues = values;
            return Promise.resolve(options.rows ?? []);
          };
          return fn(tx);
        },
        end: async () => {
          ended = true;
          if (options.endError) throw options.endError;
        },
      };
    }) as unknown as Parameters<typeof readProductionAppliedMigrationHashes>[1];
    return {
      calls,
      factory,
      wasConstructed: () => constructed,
      wasEnded: () => ended,
    };
  }

  it('2. does not connect at all when the database identity cannot be proven', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@wrong-host/wrong-db');
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    const { calls, factory, wasConstructed } = fakeFactory({ rows: [] });
    const result = await readProductionAppliedMigrationHashes(1, factory);
    expect(result).toMatchObject({ status: 'BLOCKED' });
    expect(wasConstructed()).toBe(false);
    expect(calls.beginOptions).toBeUndefined();
  });

  it('1. client construction throwing synchronously -> bounded ERROR, sentinel absent, no client.end() attempted', async () => {
    const sentinel = 'sentinel-construct-secret';
    stubProductionDatabaseAnchors();
    const { factory, wasEnded } = fakeFactory({
      throwOnConstruct: new Error(`invalid connection options: ${sentinel}`),
    });
    const result = await readProductionAppliedMigrationHashes(1, factory);
    expect(result).toEqual({
      reason: 'Production migration-journal read failed.',
      status: 'ERROR',
    });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    // No client was ever established, so there is nothing to close.
    expect(wasEnded()).toBe(false);
  });

  it('3. construction + SELECT + close all succeed -> normal OK', async () => {
    stubProductionDatabaseAnchors();
    const { factory, wasConstructed, wasEnded } = fakeFactory({
      rows: [{ hash: 'a'.repeat(64) }],
    });
    const result = await readProductionAppliedMigrationHashes(1, factory);
    expect(result).toEqual({ hashes: ['a'.repeat(64)], status: 'OK' });
    expect(wasConstructed()).toBe(true);
    expect(wasEnded()).toBe(true);
  });

  it('4. construction succeeds + SELECT fails -> bounded ERROR', async () => {
    stubProductionDatabaseAnchors();
    const { factory, wasConstructed } = fakeFactory({
      throwOnBegin: new Error('sentinel-query-failure'),
    });
    const result = await readProductionAppliedMigrationHashes(1, factory);
    expect(result).toEqual({
      reason: 'Production migration-journal read failed.',
      status: 'ERROR',
    });
    expect(wasConstructed()).toBe(true);
  });

  it('5. construction and SELECT succeed but close fails -> bounded ERROR', async () => {
    stubProductionDatabaseAnchors();
    const { factory, wasConstructed } = fakeFactory({
      endError: new Error('sentinel-close-failure'),
      rows: [{ hash: 'a'.repeat(64) }],
    });
    const result = await readProductionAppliedMigrationHashes(1, factory);
    expect(result).toEqual({
      reason: 'Production migration-journal read failed.',
      status: 'ERROR',
    });
    expect(wasConstructed()).toBe(true);
  });

  it('is SELECT-only, bounded to expectedCount + 1 rows, inside a read-only transaction, with one connection and deterministic close', async () => {
    stubProductionDatabaseAnchors();
    const { calls, factory, wasEnded } = fakeFactory({
      rows: [{ hash: 'a'.repeat(64) }, { hash: 'b'.repeat(64) }],
    });
    const result = await readProductionAppliedMigrationHashes(2, factory);
    expect(result).toEqual({
      hashes: ['a'.repeat(64), 'b'.repeat(64)],
      status: 'OK',
    });
    expect(calls.beginOptions).toBe('read only');
    expect(calls.queryStrings?.join(' ')).toMatch(/^select hash/);
    expect(calls.queryStrings?.join(' ')).toMatch(/limit/);
    expect(calls.queryStrings?.join(' ')).not.toMatch(/created_at/);
    expect(calls.queryValues).toEqual([3]);
    expect(calls.queryStrings?.join(' ')).not.toMatch(
      /\b(insert|update|delete|drop|alter|truncate)\b|\bcreate\b/i,
    );
    expect(calls.connectOptions).toMatchObject({
      connect_timeout: 10,
      connection: expect.objectContaining({
        default_transaction_read_only: true,
        statement_timeout: 5000,
      }) as unknown,
      max: 1,
      ssl: 'verify-full',
    });
    expect(wasEnded()).toBe(true);
  });

  it("passes ssl: 'verify-full' unconditionally even when the connection string itself asks for ?sslmode=disable", async () => {
    const insecureUrl = `postgres://user:pass@${productionHost}/${productionDatabaseName}?sslmode=disable`;
    vi.stubEnv('DATABASE_URL', insecureUrl);
    vi.stubEnv('DATABASE_URL_UNPOOLED', '');
    vi.stubEnv('PRODUCTION_DATABASE_HOST', productionHost);
    vi.stubEnv('PRODUCTION_DATABASE_NAME', productionDatabaseName);
    const { calls, factory } = fakeFactory({
      rows: [{ hash: 'a'.repeat(64) }],
    });
    const result = await readProductionAppliedMigrationHashes(1, factory);
    expect(result).toMatchObject({ status: 'OK' });
    // The explicit option object -- not the URL's own ?sslmode= -- is what
    // this asserts: `postgres-js` merges its parsed-URL options under
    // whatever is present here, so passing 'verify-full' unconditionally
    // wins regardless of what the connection string itself claims.
    expect(calls.connectOptions).toMatchObject({ ssl: 'verify-full' });
  });

  it('rejects an out-of-bound expectedCount before ever connecting', async () => {
    stubProductionDatabaseAnchors();
    const { calls, factory } = fakeFactory({ rows: [] });
    const result = await readProductionAppliedMigrationHashes(100_000, factory);
    expect(result).toMatchObject({ status: 'ERROR' });
    expect(calls.beginOptions).toBeUndefined();
  });

  it('returns bounded ERROR without leaking the connection string', async () => {
    const sentinel = 'super-secret-pass';
    stubProductionDatabaseAnchors();
    const { factory } = fakeFactory({
      throwOnBegin: new Error(`connection failed: ${sentinel}`),
    });
    const result = await readProductionAppliedMigrationHashes(1, factory);
    expect(result.status).toBe('ERROR');
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });

  it('closes the connection deterministically even on query failure', async () => {
    stubProductionDatabaseAnchors();
    const { factory, wasEnded } = fakeFactory({
      throwOnBegin: new Error('boom'),
    });
    await readProductionAppliedMigrationHashes(1, factory);
    expect(wasEnded()).toBe(true);
  });

  it('a close failure after an otherwise-successful SELECT still produces bounded ERROR, never a false OK', async () => {
    const sentinel = 'sentinel-driver-secret';
    stubProductionDatabaseAnchors();
    const { factory } = fakeFactory({
      endError: new Error(`connection reset: ${sentinel}`),
      rows: [{ hash: 'a'.repeat(64) }],
    });
    const result = await readProductionAppliedMigrationHashes(1, factory);
    expect(result).toEqual({
      reason: 'Production migration-journal read failed.',
      status: 'ERROR',
    });
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });

  it('a close failure after a failed SELECT stays bounded ERROR, neither raw error leaks', async () => {
    const querySentinel = 'sentinel-query-secret';
    const endSentinel = 'sentinel-end-secret';
    stubProductionDatabaseAnchors();
    const { factory } = fakeFactory({
      endError: new Error(`close failed: ${endSentinel}`),
      throwOnBegin: new Error(`query failed: ${querySentinel}`),
    });
    const result = await readProductionAppliedMigrationHashes(1, factory);
    expect(result).toEqual({
      reason: 'Production migration-journal read failed.',
      status: 'ERROR',
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(querySentinel);
    expect(serialized).not.toContain(endSentinel);
  });

  it('never imports the migration-repair tooling', () => {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(dirname, 'production-schema.ts'),
      'utf8',
    );
    expect(source).not.toMatch(
      /import[\s\S]*?from ['"].*(validate-migration-journal|reconcile-known-migration-state)/,
    );
  });
});

describe('applied-migration hash-set compatibility (exact evidence equality)', () => {
  const hashA = 'a'.repeat(64);
  const hashB = 'b'.repeat(64);
  const hashC = 'c'.repeat(64);

  it('1-2. PASSes on exact set equality regardless of order', () => {
    expect(
      assessAppliedMigrationHashSetCompatibility({
        candidateMigrationHashes: [hashA, hashB, hashC],
        productionAppliedMigrationHashes: [hashC, hashA, hashB],
      }),
    ).toMatchObject({ status: 'PASS' });
  });

  it('3. duplicate Production hash -> INVALID', () => {
    expect(
      assessAppliedMigrationHashSetCompatibility({
        candidateMigrationHashes: [hashA, hashB],
        productionAppliedMigrationHashes: [hashA, hashA],
      }),
    ).toMatchObject({ status: 'INVALID' });
  });

  it('4. duplicate candidate hash -> INVALID', () => {
    expect(
      assessAppliedMigrationHashSetCompatibility({
        candidateMigrationHashes: [hashA, hashA],
        productionAppliedMigrationHashes: [hashA, hashB],
      }),
    ).toMatchObject({ status: 'INVALID' });
  });

  it('5. missing Production hash -> BLOCKED', () => {
    expect(
      assessAppliedMigrationHashSetCompatibility({
        candidateMigrationHashes: [hashA, hashB, hashC],
        productionAppliedMigrationHashes: [hashA, hashB],
      }),
    ).toMatchObject({ status: 'BLOCKED' });
  });

  it('6. unknown/extra Production hash -> BLOCKED', () => {
    expect(
      assessAppliedMigrationHashSetCompatibility({
        candidateMigrationHashes: [hashA, hashB],
        productionAppliedMigrationHashes: [hashA, hashB, hashC],
      }),
    ).toMatchObject({ status: 'BLOCKED' });
  });

  it('7. malformed Production hash -> INVALID', () => {
    expect(
      assessAppliedMigrationHashSetCompatibility({
        candidateMigrationHashes: [hashA],
        productionAppliedMigrationHashes: ['not-a-hash'],
      }),
    ).toMatchObject({ status: 'INVALID' });
  });

  it('8. exact set -> PASS', () => {
    expect(
      assessAppliedMigrationHashSetCompatibility({
        candidateMigrationHashes: [hashA],
        productionAppliedMigrationHashes: [hashA],
      }),
    ).toMatchObject({ status: 'PASS' });
  });

  it('missing evidence -> BLOCKED', () => {
    expect(
      assessAppliedMigrationHashSetCompatibility({
        candidateMigrationHashes: [hashA],
      }),
    ).toMatchObject({ status: 'BLOCKED' });
  });

  it('10. never fabricates or requires a Production tag -- hashes only', () => {
    const result = assessAppliedMigrationHashSetCompatibility({
      candidateMigrationHashes: [hashA],
      productionAppliedMigrationHashes: [hashA],
    });
    expect(JSON.stringify(result)).not.toMatch(/tag/i);
  });
});

describe('9. candidateCount + 1 bound still detects an extra Production row under set semantics', () => {
  function fakeFactory(rows: Array<{ hash: string }>) {
    const factory = ((_url: string) => ({
      begin: async (
        _options: string,
        fn: (
          tx: (
            strings: TemplateStringsArray,
            ...values: unknown[]
          ) => Promise<unknown>,
        ) => unknown,
      ) => {
        const tx = (_strings: TemplateStringsArray, ..._values: unknown[]) =>
          Promise.resolve(rows);
        return fn(tx);
      },
      end: async () => undefined,
    })) as unknown as Parameters<
      typeof readProductionAppliedMigrationHashes
    >[1];
    return factory;
  }

  it('a Production journal one row longer than the candidate is still detected as a mismatch under exact set-size comparison', async () => {
    stubProductionDatabaseAnchors();
    const candidateHashes = ['a'.repeat(64), 'b'.repeat(64)];
    const productionRows = [
      { hash: 'a'.repeat(64) },
      { hash: 'b'.repeat(64) },
      { hash: 'c'.repeat(64) },
    ];
    const result = await readProductionAppliedMigrationHashes(
      candidateHashes.length,
      fakeFactory(productionRows),
    );
    expect(result).toMatchObject({
      hashes: productionRows.map((r) => r.hash),
      status: 'OK',
    });
    if (result.status !== 'OK') throw new Error('unreachable');
    expect(
      assessAppliedMigrationHashSetCompatibility({
        candidateMigrationHashes: candidateHashes,
        productionAppliedMigrationHashes: result.hashes,
      }),
    ).toMatchObject({ status: 'BLOCKED' });
  });
});

describe('regression: created_at is not a valid proxy for candidate journal order in this repository', () => {
  it("models this repository's real non-monotonic _journal.json `when` values -- created_at-order hashes must not be paired positionally with candidate tags", () => {
    // Real values from this repository's _journal.json (see FINDING 1):
    // 0004_cool_morgan_stark:        1772572754936
    // 0005_generic_profile_fields:   1741363295000  (earlier than 0004)
    // 0008_auth_foundation_redesign: 1745490000000
    // 0012_users_deactivated_at:     1745574000000
    // Sorting by created_at (== these `when` values) does NOT reproduce
    // _journal.entries order (0004, 0005, 0008, 0012). If a comparator ever
    // paired created_at-sorted Production rows positionally with candidate
    // tags again, this fixture would silently mismatch tags to the wrong
    // hashes. The set-based comparator below is provably immune to that:
    // it only inspects membership, so the createdAt-scrambled order here
    // still PASSes when the underlying hash sets are identical.
    const hashByTag = new Map<string, string>([
      ['0004_cool_morgan_stark', '4'.repeat(64)],
      ['0005_generic_profile_fields', '5'.repeat(64)],
      ['0008_auth_foundation_redesign', '8'.repeat(64)],
      ['0012_users_deactivated_at', '1'.repeat(64)],
    ]);
    const journalOrderTags = [
      '0004_cool_morgan_stark',
      '0005_generic_profile_fields',
      '0008_auth_foundation_redesign',
      '0012_users_deactivated_at',
    ];
    // Real `when` values from this repository's _journal.json, sorted
    // ascending -- the order `created_at ASC` would actually return.
    const createdAtOrderTags = [
      '0005_generic_profile_fields', // 1741363295000
      '0008_auth_foundation_redesign', // 1745490000000
      '0012_users_deactivated_at', // 1745574000000
      '0004_cool_morgan_stark', // 1772572754936 -- newest `when`, oldest tag
    ];
    expect(createdAtOrderTags).not.toEqual(journalOrderTags);

    const candidateMigrationHashes = journalOrderTags.map((tag) =>
      hashByTag.get(tag),
    );
    const productionAppliedMigrationHashes = createdAtOrderTags.map((tag) =>
      hashByTag.get(tag),
    );

    expect(
      assessAppliedMigrationHashSetCompatibility({
        candidateMigrationHashes,
        productionAppliedMigrationHashes,
      }),
    ).toMatchObject({ status: 'PASS' });
  });
});
