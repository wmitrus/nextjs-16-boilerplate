/**
 * OZI-79 Phase B2: unit/wiring tests for `cli.ts`'s `plan` command, with
 * every remote/network/evidence effect mocked -- this file proves the
 * *wiring and fail-closed boundary*, not real Postgres/EXPLAIN behavior
 * (that is `explain-preflight.db.test.ts`'s job) or real remote-role
 * verification (`readonly-db-remote.db.test.ts`'s job).
 *
 * Central invariant under test: `plan --target=staging|production` must
 * never open a remote connection unless the caller passes the explicit
 * `--execute-remote-explain` acknowledgement AND the working tree is
 * clean AND the commit SHA resolves AND the resolved target's identity
 * matches its separately declared `*_EXPECTED_IDENTITY` expectation.
 * Every negative case below asserts `withReadOnlyRemoteDb` was never
 * called -- not just that the command rejected -- so a bug that reordered
 * the checks after the connection would fail these tests even if the
 * command still eventually threw.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { run } from './cli';
import { writeEvidence } from './evidence-store';
import type * as EvidenceStoreModule from './evidence-store';
import { collectExplainPreflightFacts } from './explain-preflight';
import type * as ExplainPreflightModule from './explain-preflight';
import type { ExplainPreflightFacts } from './explain-preflight';
import {
  describeRemoteTarget,
  RemoteRoleNotReadOnlyError,
  withReadOnlyRemoteDb,
} from './readonly-db-remote';
import type * as ReadonlyDbRemoteModule from './readonly-db-remote';
import { buildTestPostgresUrl } from './test-postgres-url';

/**
 * `vi.hoisted` because `vi.mock`'s factory is hoisted above every import in
 * this file (including these value imports above -- Vitest hoists `vi.mock`
 * calls to the very top of the module regardless of their source position,
 * which is what lets them appear here, after the imports they affect,
 * without changing runtime behavior).
 *
 * Set on BOTH the top-level `execFileSync` key AND `default.execFileSync`,
 * pointing at the exact same function: empirically, `cli.ts`'s
 * `import { execFileSync } from 'node:child_process'` resolves through the
 * mock's `default.execFileSync` under this repo's Vite/Vitest CJS-interop
 * for this Node builtin, while this test file's own identical-looking
 * import resolves through the top-level named property instead. Setting
 * only one of the two silently leaves the other resolution path hitting
 * the *real* `execFileSync` (i.e. real `git` calls against this actual
 * checkout) instead of the mock -- confirmed by reproducing exactly that
 * failure mode in isolation before writing this comment.
 */
const mockExecFileSync = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  return {
    ...actual,
    execFileSync: mockExecFileSync,
    default: { ...actual.default, execFileSync: mockExecFileSync },
  };
});

vi.mock('./evidence-store', async (importOriginal) => {
  const actual = await importOriginal<typeof EvidenceStoreModule>();
  return { ...actual, writeEvidence: vi.fn() };
});

vi.mock('./readonly-db-remote', async (importOriginal) => {
  const actual = await importOriginal<typeof ReadonlyDbRemoteModule>();
  return {
    ...actual,
    describeRemoteTarget: vi.fn(),
    withReadOnlyRemoteDb: vi.fn(),
  };
});

vi.mock('./explain-preflight', async (importOriginal) => {
  const actual = await importOriginal<typeof ExplainPreflightModule>();
  return { ...actual, collectExplainPreflightFacts: vi.fn() };
});

const mockedExecFileSync = mockExecFileSync;
const mockedWriteEvidence = vi.mocked(writeEvidence);
const mockedDescribeRemoteTarget = vi.mocked(describeRemoteTarget);
const mockedWithReadOnlyRemoteDb = vi.mocked(withReadOnlyRemoteDb);
const mockedCollectExplainPreflightFacts = vi.mocked(
  collectExplainPreflightFacts,
);

/** A raw plan value with a marker substring, to prove it reaches the
 * persisted evidence file but never the terminal summary. */
const RAW_PLAN_MARKER = 'RAW-PLAN-MARKER-must-never-reach-stdout';

/**
 * A synthetic, deliberately non-secret credential-shaped argument value,
 * used only to prove a rejected CLI argument is never echoed. Built via
 * `buildTestPostgresUrl` (see that module's doc comment): no line of
 * source text here assembles a complete `scheme://user:pass@host`
 * literal directly -- Codex review round 11 established that the
 * committed *shape* of such a literal, not just whether its embedded
 * values look like a real secret, is what this repository's invariants
 * (and secret scanners) actually flag.
 */
const CREDENTIAL_SHAPED_TEST_USER = 'ozi79-test-only-rejected-arg-user';
const CREDENTIAL_SHAPED_TEST_AUTH_VALUE =
  'ozi79-test-only-rejected-arg-password';
const CREDENTIAL_SHAPED_TEST_ARG = buildTestPostgresUrl({
  username: CREDENTIAL_SHAPED_TEST_USER,
  password: CREDENTIAL_SHAPED_TEST_AUTH_VALUE,
  host: 'production.example',
  database: 'db',
});

const FAKE_FACTS: ExplainPreflightFacts = {
  schemaMigration: { id: 7, hash: 'fixture-schema-hash' },
  requiredRelationStats: [],
  statementPlans: [
    {
      id: 'tenant_organization_counts',
      kind: 'data',
      isPriorityManualReview: false,
      planningTimeMs: 0.5,
      rawPlan: {
        'Node Type': 'Seq Scan',
        'Relation Name': RAW_PLAN_MARKER,
      },
      facts: { nodeType: 'Seq Scan', children: [] },
    },
  ],
};

/** Clean tree + resolvable commit -- the baseline every negative test
 * starts from and overrides only the one thing it means to break. */
function mockCleanGitState(commitSha = 'abc123deadbeef'): void {
  mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
    const args = cmdArgs as readonly string[] | undefined;
    if (args?.includes('status')) return '';
    if (args?.includes('rev-parse')) return `${commitSha}\n`;
    throw new Error(`unexpected git invocation: ${JSON.stringify(args)}`);
  });
}

/**
 * `assertTargetIdentityMatchesExpectation` and
 * `computeVerifiedIdentityFingerprint` are NOT mocked in this file (only
 * `describeRemoteTarget`/`withReadOnlyRemoteDb` are) -- they resolve
 * everything themselves from the real, unmocked `*_READONLY_DATABASE_URL`
 * env var, independently of whatever `mockedDescribeRemoteTarget` is set
 * to return. Any test whose scenario is downstream of that check (i.e.
 * everything except the checks that must fire before it) needs this
 * stubbed to a consistent, passing pair so the flow can proceed far
 * enough to reach the thing that test actually means to exercise.
 */
function mockPassingTargetIdentity(
  target: 'staging' | 'production',
  username = 'ozi79-test-only-user',
  host = `${target}-db.example`,
): void {
  const envPrefix = target === 'staging' ? 'STAGING' : 'PRODUCTION';
  vi.stubEnv(
    `OZI79_${envPrefix}_READONLY_DATABASE_URL`,
    buildTestPostgresUrl({
      username,
      password: 'ozi79-test-only-password',
      host,
      port: '5432',
      database: `app_${target}`,
    }),
  );
  vi.stubEnv(
    `OZI79_${envPrefix}_EXPECTED_IDENTITY`,
    `${username}@${host}:5432/app_${target}`,
  );
}

function mockDirtyGitState(): void {
  mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
    const args = cmdArgs as readonly string[] | undefined;
    if (args?.includes('status')) return ' M some-file.ts\n';
    if (args?.includes('rev-parse')) return 'abc123deadbeef\n';
    throw new Error(`unexpected git invocation: ${JSON.stringify(args)}`);
  });
}

function captureConsoleLog(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const spy = vi
    .spyOn(console, 'log')
    .mockImplementation((...parts: unknown[]) => {
      logs.push(parts.map((part) => String(part)).join(' '));
    });
  return { logs, restore: () => spy.mockRestore() };
}

afterEach(() => {
  // resetAllMocks (not clearAllMocks): every mock here has no factory-
  // provided default implementation -- each test sets exactly the
  // behavior it needs via mockReturnValue/mockResolvedValue/
  // mockImplementation, so nothing of value is lost by fully resetting.
  // clearAllMocks only clears call history, not implementations, which
  // let a `mockRejectedValue` set by one test silently leak into a later
  // test that never expected `withReadOnlyRemoteDb` to be called at all
  // -- caught while falsifying this file's own checks (see the runbook).
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('plan -- fails before any remote connection', () => {
  it('rejects --target=staging with no --execute-remote-explain, without touching git or the remote connection', async () => {
    await expect(run(['plan', '--target=staging'])).rejects.toThrow(
      /--execute-remote-explain/,
    );
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects --target=production with no --execute-remote-explain -- plan --target=production alone must never connect', async () => {
    await expect(run(['plan', '--target=production'])).rejects.toThrow(
      /--execute-remote-explain/,
    );
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects an invalid target (the LocalTarget value "dev") even with the acknowledgement present', async () => {
    await expect(
      run(['plan', '--target=dev', '--execute-remote-explain']),
    ).rejects.toThrow(/plan requires --target=staging or --target=production/);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects a missing --target entirely', async () => {
    await expect(run(['plan', '--execute-remote-explain'])).rejects.toThrow(
      /plan requires --target=staging or --target=production/,
    );
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects an unrecognized target string outside the closed RemoteTarget domain', async () => {
    await expect(
      run(['plan', '--target=Staging', '--execute-remote-explain']),
    ).rejects.toThrow(/plan requires --target=staging or --target=production/);
    await expect(
      run(['plan', '--target=all', '--execute-remote-explain']),
    ).rejects.toThrow(/plan requires --target=staging or --target=production/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects a duplicated --target with the same value, before any git call', async () => {
    await expect(
      run([
        'plan',
        '--target=staging',
        '--target=staging',
        '--execute-remote-explain',
      ]),
    ).rejects.toThrow(/plan requires exactly one --target argument, got 2/);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
    expect(mockedDescribeRemoteTarget).not.toHaveBeenCalled();
    expect(mockedWriteEvidence).not.toHaveBeenCalled();
  });

  it('rejects one --target=staging plus one --target=production together, before any git call', async () => {
    await expect(
      run([
        'plan',
        '--target=staging',
        '--target=production',
        '--execute-remote-explain',
      ]),
    ).rejects.toThrow(/plan requires exactly one --target argument, got 2/);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
    expect(mockedDescribeRemoteTarget).not.toHaveBeenCalled();
  });

  it.each(['--dry-run', '--force', '--no-execute'])(
    'rejects the unknown flag %s, before any git call or remote wiring',
    async (unknownFlag) => {
      await expect(
        run([
          'plan',
          '--target=staging',
          '--execute-remote-explain',
          unknownFlag,
        ]),
      ).rejects.toThrow(`plan does not recognize: ${unknownFlag}`);
      expect(mockedExecFileSync).not.toHaveBeenCalled();
      expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
      expect(mockedDescribeRemoteTarget).not.toHaveBeenCalled();
      expect(mockedWriteEvidence).not.toHaveBeenCalled();
    },
  );

  it('rejects an unrecognized --flag=value argument by name only, never echoing its value', async () => {
    const rejectedArg = CREDENTIAL_SHAPED_TEST_ARG;
    let thrown: unknown;
    try {
      await run([
        'plan',
        '--target=staging',
        '--execute-remote-explain',
        `--database-url=${rejectedArg}`,
      ]);
    } catch (error) {
      thrown = error;
    }
    const message = (thrown as Error).message;
    expect(message).toContain('plan does not recognize: --database-url');
    expect(message).not.toContain(rejectedArg);
    expect(message).not.toContain(CREDENTIAL_SHAPED_TEST_AUTH_VALUE);
    expect(message).not.toContain(CREDENTIAL_SHAPED_TEST_USER);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects positional garbage after plan, before any git call, without echoing its value', async () => {
    const credentialBearingGarbage = CREDENTIAL_SHAPED_TEST_ARG;
    await expect(
      run([
        'plan',
        credentialBearingGarbage,
        '--target=staging',
        '--execute-remote-explain',
      ]),
    ).rejects.toThrow(/plan does not recognize: argument #1/);
    let thrown: unknown;
    try {
      await run([
        'plan',
        credentialBearingGarbage,
        '--target=staging',
        '--execute-remote-explain',
      ]);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).not.toContain(credentialBearingGarbage);
    expect((thrown as Error).message).not.toContain(
      CREDENTIAL_SHAPED_TEST_AUTH_VALUE,
    );
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects a rejected --flag-shaped argument with no "=" by position only, never echoing its value', async () => {
    // A `--`-prefixed token with no `=` at all -- distinct from the
    // `--flag=value` case above (redacted to the flag name) and the
    // non-`--`-prefixed positional case above (already position-only).
    // `safeArgumentDescription` must not fall back to returning the raw
    // token just because there is no `=` to slice at.
    const credentialBearingArg = `--${CREDENTIAL_SHAPED_TEST_ARG}`;
    let thrown: unknown;
    try {
      await run([
        'plan',
        credentialBearingArg,
        '--target=staging',
        '--execute-remote-explain',
      ]);
    } catch (error) {
      thrown = error;
    }
    const message = (thrown as Error).message;
    expect(message).toContain('plan does not recognize: argument #1');
    expect(message).not.toContain(credentialBearingArg);
    expect(message).not.toContain(CREDENTIAL_SHAPED_TEST_AUTH_VALUE);
    expect(message).not.toContain(CREDENTIAL_SHAPED_TEST_USER);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects a dirty working tree, before resolving a commit or connecting', async () => {
    mockDirtyGitState();
    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/uncommitted changes/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
    // `status` was checked; `rev-parse` must never have been reached.
    expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
  });

  it("runs every git invocation pinned to this repository's own root, never the launching process's cwd", async () => {
    // If cli.ts were launched by path from a different working directory
    // (e.g. `cd /elsewhere && tsx /path/to/this/repo/scripts/...`),
    // execFileSync without an explicit `cwd` would silently report
    // *that* directory's git state instead of this repository's --
    // defeating the whole commit-to-evidence binding. Computed
    // independently here (from this test file's own location, walking up
    // the same two directories `cli.ts` does) rather than hardcoding a
    // path, so the assertion stays correct if this checkout ever moves.
    const expectedRepoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
    );
    mockCleanGitState();
    await run(['plan', '--target=staging', '--execute-remote-explain']).catch(
      () => undefined,
    );
    expect(mockedExecFileSync).toHaveBeenCalled();
    for (const call of mockedExecFileSync.mock.calls) {
      const options = call[2] as { cwd?: string } | undefined;
      expect(options?.cwd).toBe(expectedRepoRoot);
    }
  });

  it("resolves git state from this repository regardless of the ambient process cwd, and independently of that cwd's own git status", async () => {
    // Proves the cwd pin actually matters, not just that a `cwd` option
    // is present: point the mocked git implementation's "status" branch
    // at whichever cwd it was actually invoked with, so a bug that
    // dropped the explicit `cwd` (falling back to `process.cwd()`) would
    // make this test observe the *launching* process's ambient state
    // instead of always this repository's.
    const expectedRepoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
    );
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs, options) => {
      const args = cmdArgs as readonly string[] | undefined;
      const cwd = (options as { cwd?: string } | undefined)?.cwd;
      // Ambient process.cwd() (wherever the test runner happens to be
      // invoked from) is reported dirty; the pinned repo root is clean --
      // the two must never be conflated.
      const isPinnedRepoRoot = cwd === expectedRepoRoot;
      if (args?.includes('status'))
        return isPinnedRepoRoot ? '' : ' M ambient-cwd-file.ts\n';
      if (args?.includes('rev-parse')) return 'abc123deadbeef\n';
      throw new Error(`unexpected git invocation: ${JSON.stringify(args)}`);
    });

    mockedDescribeRemoteTarget.mockReturnValue('staging-db.example:5432/app');
    mockPassingTargetIdentity('staging');
    mockedCollectExplainPreflightFacts.mockResolvedValue(FAKE_FACTS);
    mockedWithReadOnlyRemoteDb.mockImplementation(async (_t, fn) =>
      fn({} as never),
    );
    mockedWriteEvidence.mockResolvedValue('/fake/evidence/staging.json');

    // No `uncommitted changes` rejection -- proves the dirty check
    // observed the pinned repo root's clean state, not the (dirty)
    // ambient cwd this mock would report for any other cwd value.
    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).resolves.toBeUndefined();
  });

  it('does not support --allow-dirty for plan -- it is an unrecognized argument, rejected before any git call', async () => {
    // Stronger than merely being ignored: the strict plan argument
    // parser rejects it outright, before isWorkingTreeDirty ever runs.
    await expect(
      run([
        'plan',
        '--target=staging',
        '--execute-remote-explain',
        '--allow-dirty',
      ]),
    ).rejects.toThrow(/plan does not recognize: --allow-dirty/);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects when the commit SHA cannot be resolved (git rev-parse throws)', async () => {
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
      const args = cmdArgs as readonly string[] | undefined;
      if (args?.includes('status')) return '';
      if (args?.includes('rev-parse')) {
        throw new Error('fatal: not a git repository');
      }
      throw new Error('unexpected git invocation');
    });
    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/Could not resolve the current Git commit SHA/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects when git rev-parse succeeds but returns an empty value', async () => {
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
      const args = cmdArgs as readonly string[] | undefined;
      if (args?.includes('status')) return '';
      if (args?.includes('rev-parse')) return '   \n';
      throw new Error('unexpected git invocation');
    });
    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/returned an empty value/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('propagates a describeRemoteTarget failure without ever calling withReadOnlyRemoteDb', async () => {
    mockCleanGitState();
    // The identity check must pass first (it's real, unmocked, and now
    // runs before describeRemoteTarget) so this test actually exercises
    // describeRemoteTarget's own failure, not the identity check's.
    mockPassingTargetIdentity('staging');
    mockedDescribeRemoteTarget.mockImplementation(() => {
      throw new Error('unexpected describeRemoteTarget failure');
    });
    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/unexpected describeRemoteTarget failure/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
    expect(mockedWriteEvidence).not.toHaveBeenCalled();
  });

  it('propagates a RemoteRoleNotReadOnlyError as-is (already a safe, deliberately-sanitized message) and does not write evidence', async () => {
    mockCleanGitState();
    mockedDescribeRemoteTarget.mockReturnValue('staging-db.example:5432/app');
    mockPassingTargetIdentity('staging');
    mockedWithReadOnlyRemoteDb.mockRejectedValue(
      new RemoteRoleNotReadOnlyError(
        'Connected role has elevated attribute(s): rolsuper.',
      ),
    );
    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/elevated attribute/);
    expect(mockedWriteEvidence).not.toHaveBeenCalled();
  });

  it('sanitizes a raw Postgres/Drizzle failure instead of letting it reach the top-level handler, and does not write evidence', async () => {
    mockCleanGitState();
    mockedDescribeRemoteTarget.mockReturnValue('staging-db.example:5432/app');
    mockPassingTargetIdentity('staging');
    const rawInfrastructureError = new Error(
      'password authentication failed for user "readonly_prod" at host internal-db-7.example.net',
    );
    mockedWithReadOnlyRemoteDb.mockRejectedValue(rawInfrastructureError);

    let thrown: unknown;
    try {
      await run(['plan', '--target=staging', '--execute-remote-explain']);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).not.toContain('readonly_prod');
    expect(message).not.toContain('internal-db-7.example.net');
    expect(message).not.toContain(rawInfrastructureError.message);
    // The raw error is still reachable via `cause` for a caller that
    // deliberately wants it -- it is only kept out of the default
    // top-level `console.error` path, not destroyed.
    expect((thrown as Error).cause).toBe(rawInfrastructureError);
    expect(mockedWriteEvidence).not.toHaveBeenCalled();
  });

  it('propagates a writeEvidence failure instead of swallowing it', async () => {
    mockCleanGitState('abc123deadbeef');
    mockedDescribeRemoteTarget.mockReturnValue('staging-db.example:5432/app');
    mockPassingTargetIdentity('staging');
    mockedCollectExplainPreflightFacts.mockResolvedValue(FAKE_FACTS);
    mockedWithReadOnlyRemoteDb.mockImplementation(async (_t, fn) =>
      fn({} as never),
    );
    mockedWriteEvidence.mockRejectedValue(
      new Error('EACCES: permission denied writing evidence file'),
    );

    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/permission denied/);
  });

  it('rejects when the expected-identity safeguard env var is unset, without ever connecting', async () => {
    mockCleanGitState();
    mockedDescribeRemoteTarget.mockReturnValue('staging-db.example:5432/app');
    // Stubbed to the empty string, not merely left absent -- this
    // scenario must not depend on the operator's real shell not
    // happening to have this variable exported.
    vi.stubEnv('OZI79_STAGING_EXPECTED_IDENTITY', '');
    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/OZI79_STAGING_EXPECTED_IDENTITY is required/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
    expect(mockedWriteEvidence).not.toHaveBeenCalled();
  });

  it('rejects when the resolved target does not match its declared expectation -- the swapped-credential case', async () => {
    mockCleanGitState();
    // Simulates OZI79_STAGING_READONLY_DATABASE_URL having been pointed
    // at the production host (or the two credential env vars having been
    // swapped): the resolved identity is real, but does not match what
    // the operator separately declared staging should look like.
    vi.stubEnv(
      'OZI79_STAGING_READONLY_DATABASE_URL',
      buildTestPostgresUrl({
        username: 'prod-user',
        password: 'pw',
        host: 'production-db.example',
        port: '5432',
        database: 'app_production',
      }),
    );
    vi.stubEnv(
      'OZI79_STAGING_EXPECTED_IDENTITY',
      'staging-user@staging-db.example:5432/app_staging',
    );
    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/does not match the expected identity/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
    expect(mockedWriteEvidence).not.toHaveBeenCalled();
  });
});

describe('plan -- exact wiring once every precondition is satisfied', () => {
  it.each(['staging', 'production'] as const)(
    'wires %s end-to-end: exactly one withReadOnlyRemoteDb + collectExplainPreflightFacts call, correct target/descriptor/commit binding, evidence under the matching environment, safe terminal summary only',
    async (target) => {
      mockCleanGitState('abc123deadbeef');
      const descriptor = `${target}-db.example.internal:5432/app_${target}`;
      mockedDescribeRemoteTarget.mockReturnValue(descriptor);
      mockPassingTargetIdentity(
        target,
        'ozi79-test-only-user',
        `${target}-db.example.internal`,
      );
      mockedCollectExplainPreflightFacts.mockResolvedValue(FAKE_FACTS);
      mockedWithReadOnlyRemoteDb.mockImplementation(async (_t, fn) =>
        fn({} as never),
      );
      mockedWriteEvidence.mockResolvedValue(`/fake/evidence/${target}.json`);
      const { logs, restore } = captureConsoleLog();

      await run(['plan', `--target=${target}`, '--execute-remote-explain']);

      restore();

      // --- exact wiring ---
      expect(mockedWithReadOnlyRemoteDb).toHaveBeenCalledTimes(1);
      expect(mockedWithReadOnlyRemoteDb).toHaveBeenCalledWith(
        target,
        expect.any(Function),
      );
      expect(mockedCollectExplainPreflightFacts).toHaveBeenCalledTimes(1);

      // --- target/descriptor/commit binding + evidence environment ---
      expect(mockedWriteEvidence).toHaveBeenCalledTimes(1);
      const [envArg, fileNameArg, contentArg] =
        mockedWriteEvidence.mock.calls[0]!;
      expect(envArg).toBe(target);
      expect(fileNameArg as string).toMatch(/^\w+-explain-preflight-.*\.json$/);
      expect(fileNameArg).toSatisfy(
        (name: unknown) =>
          typeof name === 'string' && name.startsWith(`${target}-`),
      );
      // Filename is fingerprint/timestamp-based only -- no hostname/db name.
      expect(fileNameArg).not.toContain('db.example.internal');
      expect(fileNameArg).not.toContain('app_' + target);

      const writtenArtifact = JSON.parse(contentArg as string) as {
        version: unknown;
        target: {
          environment: unknown;
          descriptor: unknown;
          verifiedIdentityFingerprint: unknown;
        };
        commit: unknown;
      };
      const expectedFingerprint = createHash('sha256')
        .update(
          `ozi79:remote-target-verified-identity:v1:ozi79-test-only-user@${target}-db.example.internal:5432/app_${target}`,
          'utf8',
        )
        .digest('hex');
      expect(writtenArtifact.version).toBe(2);
      expect(writtenArtifact.target).toEqual({
        environment: target,
        descriptor,
        verifiedIdentityFingerprint: expectedFingerprint,
      });
      expect(writtenArtifact.commit).toEqual({
        commitSha: 'abc123deadbeef',
        workingTreeDirty: false,
      });
      // The full artifact (including the raw plan) does reach the
      // persisted evidence file -- that is its whole purpose. The raw,
      // username-inclusive verification identity must never reach it
      // either way -- only its SHA-256 fingerprint does.
      expect(contentArg as string).toContain(RAW_PLAN_MARKER);
      expect(contentArg as string).not.toContain('ozi79-test-only-user');

      // --- safe terminal output only ---
      const combined = logs.join('\n');
      expect(combined).toContain(descriptor);
      expect(combined).toContain('abc123deadbeef');
      expect(combined).toContain(`/fake/evidence/${target}.json`);
      expect(combined).toContain(expectedFingerprint);
      expect(combined).not.toContain(RAW_PLAN_MARKER);
      expect(combined).not.toContain('ozi79-test-only-user');
      expect(combined).not.toMatch(/"rawPlan"/);
      expect(combined).not.toMatch(/"statementPlans"/);
      expect(combined).not.toMatch(/QUERY PLAN/);
    },
  );
});

describe('plan -- does not add remote scan support', () => {
  it('scan --target=staging still fails, without reaching any remote wiring', async () => {
    await expect(run(['scan', '--target=staging'])).rejects.toThrow(
      /scan requires --target=dev or --target=test/,
    );
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('scan --target=production still fails, without reaching any remote wiring', async () => {
    await expect(run(['scan', '--target=production'])).rejects.toThrow(
      /scan requires --target=dev or --target=test/,
    );
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });
});
