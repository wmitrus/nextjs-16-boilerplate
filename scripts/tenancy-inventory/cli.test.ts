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
import { readEvidence, writeEvidence } from './evidence-store';
import type * as EvidenceStoreModule from './evidence-store';
import {
  buildExplainPreflightArtifactV2,
  collectExplainPreflightFacts,
  computeArtifactFingerprintV2,
  computeScopeFingerprintV2,
} from './explain-preflight';
import type * as ExplainPreflightModule from './explain-preflight';
import type { ExplainPreflightFacts } from './explain-preflight';
import {
  describeRemoteTarget,
  RemoteRoleNotReadOnlyError,
  withReadOnlyRemoteDb,
} from './readonly-db-remote';
import type * as ReadonlyDbRemoteModule from './readonly-db-remote';
import { buildTestPostgresUrl } from './test-postgres-url';
import {
  collectRemoteInventoryFindingsSequential,
  latestSchemaMigration,
} from './topology-queries';
import type * as TopologyQueriesModule from './topology-queries';

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
    collectRemoteInventoryFindingsSequential: vi.fn(),
    execFileSync: mockExecFileSync,
    default: { ...actual.default, execFileSync: mockExecFileSync },
  };
});

vi.mock('./evidence-store', async (importOriginal) => {
  const actual = await importOriginal<typeof EvidenceStoreModule>();
  return { ...actual, readEvidence: vi.fn(), writeEvidence: vi.fn() };
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

vi.mock('./topology-queries', async (importOriginal) => {
  const actual = await importOriginal<typeof TopologyQueriesModule>();
  return {
    ...actual,
    collectRemoteInventoryFindingsSequential: vi.fn(),
    latestSchemaMigration: vi.fn(),
    organizationsMissingTenantAttributesCount: vi.fn(),
    policiesWithNullOrganizationCount: vi.fn(),
    providerOrganizationMappingAnomalies: vi.fn(),
    quotaEnforcementSignal: vi.fn(),
    tenantIdShapeCounts: vi.fn(),
    tenantOrganizationCounts: vi.fn(),
    userProviderMappingAnomalies: vi.fn(),
    usersInMultipleOrganizationsCount: vi.fn(),
    usersInMultipleTenantsCount: vi.fn(),
    waitlistEntriesWithTenantIdCount: vi.fn(),
  };
});

const mockedExecFileSync = mockExecFileSync;
const mockedWriteEvidence = vi.mocked(writeEvidence);
const mockedReadEvidence = vi.mocked(readEvidence);
const mockedDescribeRemoteTarget = vi.mocked(describeRemoteTarget);
const mockedWithReadOnlyRemoteDb = vi.mocked(withReadOnlyRemoteDb);
const mockedCollectExplainPreflightFacts = vi.mocked(
  collectExplainPreflightFacts,
);
const mockedLatestSchemaMigration = vi.mocked(latestSchemaMigration);
const mockedCollectRemoteInventoryFindingsSequential = vi.mocked(
  collectRemoteInventoryFindingsSequential,
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
/** A `git ls-files -v -z` result with no hidden-index-state entries. */
const CLEAN_LS_FILES_OUTPUT = 'H some-tracked-file.ts\0';

function mockCleanGitState(commitSha = 'abc123deadbeef'): void {
  mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
    const args = cmdArgs as readonly string[] | undefined;
    if (args?.includes('ls-files')) return CLEAN_LS_FILES_OUTPUT;
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
    if (args?.includes('ls-files')) return CLEAN_LS_FILES_OUTPUT;
    if (args?.includes('status')) return ' M some-file.ts\n';
    if (args?.includes('rev-parse')) return 'abc123deadbeef\n';
    throw new Error(`unexpected git invocation: ${JSON.stringify(args)}`);
  });
}

function makeApprovedArtifact(
  target: 'staging' | 'production',
  options: {
    commitSha?: string;
    descriptor?: string;
    verifiedIdentityFingerprint?: string;
    schemaMigration?: { id: number; hash: string } | null;
  } = {},
) {
  const username = 'ozi79-test-only-user';
  const host = `${target}-db.example.internal`;
  const descriptor = options.descriptor ?? `${host}:5432/app_${target}`;
  const verifiedIdentityFingerprint =
    options.verifiedIdentityFingerprint ??
    createHash('sha256')
      .update(
        `ozi79:remote-target-verified-identity:v1:${username}@${host}:5432/app_${target}`,
        'utf8',
      )
      .digest('hex');
  return buildExplainPreflightArtifactV2(
    {
      ...FAKE_FACTS,
      schemaMigration: options.schemaMigration ?? {
        id: 23,
        hash: '655e6efd5df662bd745132b7ece5237dce3e6b47c8e0feea75c8636aa171d3a0',
      },
    },
    {
      target: { environment: target, descriptor, verifiedIdentityFingerprint },
      commit: {
        commitSha: options.commitSha ?? 'abc123deadbeef',
        workingTreeDirty: false,
      },
      generatedAt: '2026-08-29T00:00:00.000Z',
    },
  );
}

function remoteScanArgv(
  target: 'staging' | 'production',
  artifactFingerprint: string,
): string[] {
  return [
    'scan',
    `--target=${target}`,
    '--execute-remote-inventory',
    '--approved-artifact=approved-explain.json',
    `--approved-artifact-fingerprint=${artifactFingerprint}`,
  ];
}

function mockRemoteScanLocalGates(
  target: 'staging' | 'production',
  artifact = makeApprovedArtifact(target),
): void {
  mockCleanGitState();
  mockPassingTargetIdentity(
    target,
    'ozi79-test-only-user',
    `${target}-db.example.internal`,
  );
  mockedDescribeRemoteTarget.mockReturnValue(
    `${target}-db.example.internal:5432/app_${target}`,
  );
  mockedReadEvidence.mockResolvedValue(JSON.stringify(artifact));
}

function mockRemoteInventorySuccess(): void {
  mockedWithReadOnlyRemoteDb.mockImplementation(async (_target, fn) =>
    fn({} as never),
  );
  mockedLatestSchemaMigration.mockResolvedValue({
    id: 23,
    hash: '655e6efd5df662bd745132b7ece5237dce3e6b47c8e0feea75c8636aa171d3a0',
  });
  mockedCollectRemoteInventoryFindingsSequential.mockResolvedValue({
    tenantOrgCounts: {} as never,
    usersInMultipleOrgs: 0,
    usersInMultipleTenants: 0,
    orgsMissingTenantAttributes: 0,
    organizationMappingAnomalies: {} as never,
    userMappingAnomalies: {} as never,
    waitlistEntriesWithTenantId: 0,
    policiesWithNullOrganization: 0,
    quotaSignal: {} as never,
    tenantIdShape: {} as never,
  });
  mockedWriteEvidence.mockResolvedValue('/fake/evidence/inventory.json');
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
    // `ls-files` (hidden-index-state check) then `status` were checked;
    // `rev-parse` must never have been reached.
    expect(mockedExecFileSync).toHaveBeenCalledTimes(2);
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
      if (args?.includes('ls-files')) return CLEAN_LS_FILES_OUTPUT;
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
      if (args?.includes('ls-files')) return CLEAN_LS_FILES_OUTPUT;
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

  it('never echoes the raw git subprocess error text when the commit SHA cannot be resolved -- only a stable safe message, with the original preserved as cause', async () => {
    // Codex review round 12 (self-review): a raw execFileSync failure
    // message can embed local detail (a path, a username, argv) this
    // tool has no way to pre-verify as safe -- resolveCommitShaStrict
    // must not interpolate it into the thrown message.
    const rawGitError = new Error(
      'fatal: /home/some-operator/.gitconfig: exec of git-remote-https failed for user some-operator',
    );
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
      const args = cmdArgs as readonly string[] | undefined;
      if (args?.includes('ls-files')) return CLEAN_LS_FILES_OUTPUT;
      if (args?.includes('status')) return '';
      if (args?.includes('rev-parse')) throw rawGitError;
      throw new Error('unexpected git invocation');
    });

    let thrown: unknown;
    try {
      await run(['plan', '--target=staging', '--execute-remote-explain']);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).not.toContain(rawGitError.message);
    expect(message).not.toContain('some-operator');
    expect((thrown as Error).cause).toBe(rawGitError);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects when git rev-parse succeeds but returns an empty value', async () => {
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
      const args = cmdArgs as readonly string[] | undefined;
      if (args?.includes('ls-files')) return CLEAN_LS_FILES_OUTPUT;
      if (args?.includes('status')) return '';
      if (args?.includes('rev-parse')) return '   \n';
      throw new Error('unexpected git invocation');
    });
    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/returned an empty value/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  /**
   * Codex review round 13: `git status --porcelain` alone can be made to
   * silently miss a real edit to a tracked file via
   * `assume-unchanged`/`skip-worktree` index flags. Every scenario below
   * proves `assertNoHiddenGitIndexState` rejects before `resolveCommitShaStrict`
   * or `withReadOnlyRemoteDb` ever runs -- mocked at the `git ls-files -v -z`
   * boundary here; a real, unmocked Git repository exercises the actual
   * flag semantics in `cli.git-index.test.ts`.
   */
  it('rejects an assume-unchanged entry before resolving a commit or connecting', async () => {
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
      const args = cmdArgs as readonly string[] | undefined;
      if (args?.includes('ls-files')) return 'h hidden-file.ts\0';
      if (args?.includes('status')) return '';
      if (args?.includes('rev-parse')) return 'abc123deadbeef\n';
      throw new Error(`unexpected git invocation: ${JSON.stringify(args)}`);
    });

    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/hidden state/);
    // Only `ls-files` was called -- neither `status` nor `rev-parse` was
    // reached, and no connection was attempted.
    expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects a skip-worktree entry before resolving a commit or connecting', async () => {
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
      const args = cmdArgs as readonly string[] | undefined;
      if (args?.includes('ls-files')) return 'S hidden-file.ts\0';
      if (args?.includes('status')) return '';
      if (args?.includes('rev-parse')) return 'abc123deadbeef\n';
      throw new Error(`unexpected git invocation: ${JSON.stringify(args)}`);
    });

    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/hidden state/);
    expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects an entry with both assume-unchanged and skip-worktree combined', async () => {
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
      const args = cmdArgs as readonly string[] | undefined;
      if (args?.includes('ls-files')) return 's hidden-file.ts\0';
      if (args?.includes('status')) return '';
      if (args?.includes('rev-parse')) return 'abc123deadbeef\n';
      throw new Error(`unexpected git invocation: ${JSON.stringify(args)}`);
    });

    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/hidden state/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects purely because the hidden-index flag is set, even though ordinary status reports a fully clean tree', async () => {
    // The whole point of this guard: an assume-unchanged/skip-worktree
    // file's on-disk content could differ from HEAD at any moment while
    // `git status --porcelain` keeps reporting clean regardless -- so the
    // guard must reject on the flag's mere presence, never on whether the
    // file's content "currently happens to" match HEAD (which this tool
    // has no way to check for a hidden file, and must not pretend to).
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
      const args = cmdArgs as readonly string[] | undefined;
      if (args?.includes('ls-files')) return 'h hidden-file.ts\0';
      if (args?.includes('status')) return ''; // ordinary status: clean
      if (args?.includes('rev-parse')) return 'abc123deadbeef\n';
      throw new Error(`unexpected git invocation: ${JSON.stringify(args)}`);
    });

    await expect(
      run(['plan', '--target=staging', '--execute-remote-explain']),
    ).rejects.toThrow(/hidden state/);
  });

  it('never names the affected path in the hidden-index-state rejection message', async () => {
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
      const args = cmdArgs as readonly string[] | undefined;
      if (args?.includes('ls-files'))
        return 'h scripts/tenancy-inventory/query-registry.ts\0';
      if (args?.includes('status')) return '';
      if (args?.includes('rev-parse')) return 'abc123deadbeef\n';
      throw new Error(`unexpected git invocation: ${JSON.stringify(args)}`);
    });

    let thrown: unknown;
    try {
      await run(['plan', '--target=staging', '--execute-remote-explain']);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain('query-registry.ts');
  });

  it('fails closed and does not leak raw subprocess output when git ls-files itself fails', async () => {
    const rawLsFilesError = new Error(
      'fatal: /home/some-operator/repo: not a git repository (or any parent up to mount point)',
    );
    mockedExecFileSync.mockImplementation((_cmd, cmdArgs) => {
      const args = cmdArgs as readonly string[] | undefined;
      if (args?.includes('ls-files')) throw rawLsFilesError;
      throw new Error(`unexpected git invocation: ${JSON.stringify(args)}`);
    });

    let thrown: unknown;
    try {
      await run(['plan', '--target=staging', '--execute-remote-explain']);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).not.toContain(rawLsFilesError.message);
    expect(message).not.toContain('some-operator');
    expect((thrown as Error).cause).toBe(rawLsFilesError);
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

describe('scan -- remote inventory remains acknowledgement-gated', () => {
  it('scan --target=staging alone fails without reaching any remote wiring', async () => {
    await expect(run(['scan', '--target=staging'])).rejects.toThrow(
      /--execute-remote-inventory/,
    );
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('scan --target=production alone fails without reaching any remote wiring', async () => {
    await expect(run(['scan', '--target=production'])).rejects.toThrow(
      /--execute-remote-inventory/,
    );
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });
});

describe('scan -- remote inventory approval gate (Phase B3)', () => {
  it('requires explicit acknowledgement before reading evidence, Git state, or opening a remote connection', async () => {
    await expect(run(['scan', '--target=production'])).rejects.toThrow(
      /--execute-remote-inventory/,
    );
    expect(mockedReadEvidence).not.toHaveBeenCalled();
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it.each(['--allow-dirty', '--dry-run', '--database-url=ignored'])(
    'rejects arbitrary or bypass flag %s before reading evidence or connecting',
    async (flag) => {
      await expect(
        run([
          'scan',
          '--target=staging',
          '--execute-remote-inventory',
          '--approved-artifact=approved-explain.json',
          `--approved-artifact-fingerprint=${'a'.repeat(64)}`,
          flag,
        ]),
      ).rejects.toThrow(/scan does not recognize/);
      expect(mockedReadEvidence).not.toHaveBeenCalled();
      expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed or tampered persisted artifacts before any Git or network call', async () => {
    mockedReadEvidence.mockResolvedValue('{ definitely not JSON');
    await expect(
      run(remoteScanArgv('staging', 'a'.repeat(64))),
    ).rejects.toThrow(/malformed or is not V2/);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();

    vi.resetAllMocks();
    const artifact = makeApprovedArtifact('staging');
    mockedReadEvidence.mockResolvedValue(
      JSON.stringify({ ...artifact, scopeFingerprint: 'a'.repeat(64) }),
    );
    await expect(
      run(remoteScanArgv('staging', artifact.artifactFingerprint)),
    ).rejects.toThrow(/contents do not match/);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('rejects a fingerprint different from the separately reviewed artifact identity before Git or network calls', async () => {
    const artifact = makeApprovedArtifact('production');
    mockedReadEvidence.mockResolvedValue(JSON.stringify(artifact));
    await expect(
      run(remoteScanArgv('production', 'a'.repeat(64))),
    ).rejects.toThrow(
      /does not match the separately supplied reviewed fingerprint/,
    );
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it.each([
    ['dirty tree', () => mockDirtyGitState(), /uncommitted changes/],
    [
      'hidden Git index state',
      () => {
        mockedExecFileSync.mockImplementation((_cmd, commandArgs) => {
          const gitArgs = commandArgs as readonly string[] | undefined;
          if (gitArgs?.includes('ls-files')) return 'h hidden.ts\0';
          throw new Error('unexpected Git call');
        });
      },
      /hidden state/,
    ],
  ] as const)(
    'rejects %s before any remote connection',
    async (_name, arrange, message) => {
      const artifact = makeApprovedArtifact('staging');
      mockedReadEvidence.mockResolvedValue(JSON.stringify(artifact));
      arrange();
      await expect(
        run(remoteScanArgv('staging', artifact.artifactFingerprint)),
      ).rejects.toThrow(message);
      expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'wrong commit',
      makeApprovedArtifact('staging', { commitSha: 'different-commit' }),
      /exact clean current commit/,
    ],
    [
      'wrong target',
      makeApprovedArtifact('production'),
      /Current target does not match/,
    ],
  ] as const)(
    'rejects %s before any remote connection',
    async (_name, artifact, message) => {
      mockRemoteScanLocalGates('staging', artifact);
      await expect(
        run(remoteScanArgv('staging', artifact.artifactFingerprint)),
      ).rejects.toThrow(message);
      expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
    },
  );

  it('rejects a self-consistent changed registry and a wrong verified identity before any remote connection', async () => {
    const artifact = makeApprovedArtifact('staging');
    const registryChanged = {
      ...artifact,
      registryFingerprint: 'a'.repeat(64),
    };
    const registryChangedWithScope = {
      ...registryChanged,
      scopeFingerprint: computeScopeFingerprintV2(registryChanged),
    };
    const selfConsistentRegistryChanged = {
      ...registryChangedWithScope,
      artifactFingerprint: computeArtifactFingerprintV2(
        registryChangedWithScope,
      ),
    };
    mockRemoteScanLocalGates('staging', selfConsistentRegistryChanged);
    await expect(
      run(
        remoteScanArgv(
          'staging',
          selfConsistentRegistryChanged.artifactFingerprint,
        ),
      ),
    ).rejects.toThrow(/QUERY_REGISTRY does not match/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();

    vi.resetAllMocks();
    const wrongIdentity = makeApprovedArtifact('staging', {
      verifiedIdentityFingerprint: 'b'.repeat(64),
    });
    mockRemoteScanLocalGates('staging', wrongIdentity);
    await expect(
      run(remoteScanArgv('staging', wrongIdentity.artifactFingerprint)),
    ).rejects.toThrow(/Current target does not match/);
    expect(mockedWithReadOnlyRemoteDb).not.toHaveBeenCalled();
  });

  it('verifies the live schema migration before any inventory query runs', async () => {
    const artifact = makeApprovedArtifact('production');
    mockRemoteScanLocalGates('production', artifact);
    mockedWithReadOnlyRemoteDb.mockImplementation(async (_target, fn) =>
      fn({} as never),
    );
    mockedLatestSchemaMigration.mockResolvedValue({ id: 24, hash: 'changed' });
    await expect(
      run(remoteScanArgv('production', artifact.artifactFingerprint)),
    ).rejects.toThrow(/schema migration does not match/);
    expect(
      mockedCollectRemoteInventoryFindingsSequential,
    ).not.toHaveBeenCalled();
  });

  it('fails closed on readonly-role failure and sanitizes raw remote failures', async () => {
    const artifact = makeApprovedArtifact('production');
    mockRemoteScanLocalGates('production', artifact);
    mockedWithReadOnlyRemoteDb.mockRejectedValue(
      new RemoteRoleNotReadOnlyError(
        'Connected role has elevated attribute(s): rolsuper.',
      ),
    );
    await expect(
      run(remoteScanArgv('production', artifact.artifactFingerprint)),
    ).rejects.toThrow(/elevated attribute/);
    expect(mockedWriteEvidence).not.toHaveBeenCalled();

    vi.resetAllMocks();
    mockRemoteScanLocalGates('production', artifact);
    const rawError = new Error(
      'password rejected for readonly_prod at internal-db.example',
    );
    mockedWithReadOnlyRemoteDb.mockRejectedValue(rawError);
    let thrown: unknown;
    try {
      await run(remoteScanArgv('production', artifact.artifactFingerprint));
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).not.toContain('readonly_prod');
    expect((thrown as Error).message).not.toContain('internal-db.example');
    expect((thrown as Error).cause).toBe(rawError);
  });

  it.each(['staging', 'production'] as const)(
    'uses the same approved-artifact pipeline for %s and writes only outside-repository evidence',
    async (target) => {
      const artifact = makeApprovedArtifact(target);
      mockRemoteScanLocalGates(target, artifact);
      mockRemoteInventorySuccess();
      await expect(
        run(remoteScanArgv(target, artifact.artifactFingerprint)),
      ).resolves.toBeUndefined();
      expect(mockedWithReadOnlyRemoteDb).toHaveBeenCalledWith(
        target,
        expect.any(Function),
      );
      const [, evidenceFileName, evidenceContents] =
        mockedWriteEvidence.mock.calls[0]!;
      expect(mockedWriteEvidence).toHaveBeenCalledWith(
        target,
        expect.any(String),
        expect.not.stringContaining('ozi79-test-only-user'),
      );
      expect(
        typeof evidenceFileName === 'string' &&
          evidenceFileName.startsWith(`${target}-inventory-`),
      ).toBe(true);
      expect(evidenceContents).not.toContain('ozi79-test-only-user');
    },
  );
});
