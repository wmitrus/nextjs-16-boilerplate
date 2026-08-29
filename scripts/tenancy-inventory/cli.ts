import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  describeEvidenceRoot,
  readEvidence,
  writeEvidence,
} from './evidence-store';
import {
  buildExplainPreflightArtifactV2,
  checkArtifactIntegrityV2,
  checkRegistryCompatibility,
  checkSchemaCompatibility,
  checkTargetCompatibilityV2,
  collectExplainPreflightFacts,
  type ExplainPreflightArtifactV2,
} from './explain-preflight';
import {
  summarizeOwnership,
  TABLE_OWNERSHIP,
  TENANT_ORG_CONFLATION_NOTE,
} from './ownership-matrix';
import {
  describeLocalTarget,
  withReadOnlyDb,
  type LocalTarget,
} from './readonly-db';
import {
  assertTargetIdentityMatchesExpectation,
  computeVerifiedIdentityFingerprint,
  describeRemoteTarget,
  RemoteRoleNotReadOnlyError,
  withReadOnlyRemoteDb,
  type RemoteTarget,
} from './readonly-db-remote';
import {
  collectRemoteInventoryFindingsSequential,
  latestSchemaMigration,
  organizationsMissingTenantAttributesCount,
  policiesWithNullOrganizationCount,
  providerOrganizationMappingAnomalies,
  quotaEnforcementSignal,
  tenantIdShapeCounts,
  tenantOrganizationCounts,
  userProviderMappingAnomalies,
  usersInMultipleOrganizationsCount,
  usersInMultipleTenantsCount,
  waitlistEntriesWithTenantIdCount,
} from './topology-queries';

const TOOL_VERSION = '0.2.0';

/**
 * Every `git` invocation below (`resolveCommitSha`, `resolveCommitShaStrict`,
 * `isWorkingTreeDirty`) must run against THIS repository, not whatever
 * directory the process happened to be launched from: `execFileSync`
 * without an explicit `cwd` runs relative to `process.cwd()`, so invoking
 * this script by path from a different working directory (e.g. `cd
 * /elsewhere && tsx /path/to/this/repo/scripts/tenancy-inventory/cli.ts
 * plan ...`) would silently report *that* directory's commit/dirty-state
 * while still querying this repository's schema -- defeating the exact
 * commit-to-evidence binding `resolveCommitShaStrict` exists to
 * guarantee, and (separately) making a working-tree-cleanliness check
 * observe the wrong repository's dirty/clean state entirely. Anchored to
 * this repository's own root, computed from this script's location via
 * `import.meta.url` (`scripts/tenancy-inventory/cli.ts` is always exactly
 * two directories below the repo root) -- never `process.cwd()`.
 */
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

function readOption(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : undefined;
}

interface PlanArgs {
  readonly target: RemoteTarget;
  readonly executeRemoteExplain: boolean;
}

interface RemoteScanArgs {
  readonly target: RemoteTarget;
  readonly executeRemoteInventory: boolean;
  readonly approvedArtifactFileName: string;
  readonly approvedArtifactFingerprint: string;
}

/**
 * A `--`-prefixed token is only ever described by name when the
 * candidate flag-name portion (everything before `=`, or the whole
 * token if there is no `=`) is SHAPED like a real flag -- letters,
 * digits, and hyphens only. This is deliberately conservative: it exists
 * to let genuinely bare flags like `--allow-dirty`/`--dry-run` still be
 * named in the rejection message (useful for an operator), while
 * refusing to name anything containing `:`, `/`, `@`, `.`, or other
 * separators a URL or connection string would carry -- whether or not it
 * happens to also contain an `=`. Deliberately a strict allowlist, not a
 * denylist of "suspicious" characters: only clearly-safe shapes ever get
 * echoed.
 */
const SAFE_FLAG_NAME_PATTERN = /^--[A-Za-z0-9][A-Za-z0-9-]*$/;

/**
 * Describes a rejected argument WITHOUT reproducing its value: an
 * operator's mistake (a stray flag, a pasted secret in the wrong place)
 * must not turn into a credential-bearing string sitting in a thrown
 * `Error` that `run()`'s top-level handler prints to stderr. A
 * `--flag=value`-shaped argument is described by its flag name only when
 * that name matches `SAFE_FLAG_NAME_PATTERN` (never what follows `=`,
 * and never a flag-shaped prefix that isn't actually safe-shaped --
 * e.g. a pasted `--postgres://[username]:[REDACTED]@[host]/[database]=x`
 * credential must not be echoed just because it contains an `=`); a bare
 * `--flag` with no `=` is named the same way when it matches that
 * pattern (e.g. `--allow-dirty`); anything else -- including a
 * `--`-prefixed token with no `=` that is NOT flag-shaped, such as a
 * pasted `--postgres://[username]:[REDACTED]@[host]/[database]`
 * credential with no `=` in it at all -- is described only by its
 * 1-based position in the argument list.
 */
function safeArgumentDescription(arg: string, index: number): string {
  const equalsIndex = arg.indexOf('=');
  const flagPart = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
  if (SAFE_FLAG_NAME_PATTERN.test(flagPart)) {
    return flagPart;
  }
  return `argument #${index + 1}`;
}

/**
 * `plan`'s own strict, fail-closed argument parser -- deliberately not
 * `readOption`/`args.includes()` (the permissive style `scan`/`matrix`
 * use, which silently ignores an unrecognized or duplicated flag). A
 * remote target command gets one narrow, explicit contract instead:
 * exactly one `--target=staging|production`, the acknowledgement flag,
 * and nothing else. `args` here excludes the leading `plan` command word
 * itself (the caller passes `args.slice(1)`).
 */
function parsePlanArgs(args: readonly string[]): PlanArgs {
  const targetPrefix = '--target=';
  const targetArgs = args.filter((arg) => arg.startsWith(targetPrefix));

  if (targetArgs.length > 1) {
    throw new Error(
      `plan requires exactly one --target argument, got ` +
        `${targetArgs.length}. Refusing to guess which one was meant -- ` +
        `pass --target=staging or --target=production exactly once.`,
    );
  }

  const target = targetArgs[0]?.slice(targetPrefix.length);
  if (target !== 'staging' && target !== 'production') {
    throw new Error('plan requires --target=staging or --target=production.');
  }

  const unrecognized = args
    .map((arg, index) => ({ arg, index }))
    .filter(
      ({ arg }) =>
        arg !== '--execute-remote-explain' && !arg.startsWith(targetPrefix),
    );
  if (unrecognized.length > 0) {
    const described = unrecognized.map(({ arg, index }) =>
      safeArgumentDescription(arg, index),
    );
    throw new Error(
      `plan does not recognize: ${described.join(', ')}. Allowed ` +
        `arguments are exactly --target=staging|production and ` +
        `--execute-remote-explain -- refusing to guess what an ` +
        `unrecognized argument to a remote command was meant to do. ` +
        `(Argument values are never shown here -- one could contain a ` +
        `credential-bearing string pasted in the wrong place.)`,
    );
  }

  return {
    target,
    executeRemoteExplain: args.includes('--execute-remote-explain'),
  };
}

/**
 * Remote inventory execution deliberately has a separate, closed argument
 * contract from local `scan --target=dev|test`. In particular, an operator
 * supplies only a filename in the existing target-specific evidence store,
 * never an arbitrary path or a connection URL. The fingerprint is the
 * separately transcribed, human-reviewed identity of that exact artifact;
 * the artifact's self-reported fingerprint alone would prove integrity, not
 * that this particular artifact was the one approved for execution.
 */
function parseRemoteScanArgs(args: readonly string[]): RemoteScanArgs {
  const acknowledgement = '--execute-remote-inventory';
  let target: string | undefined;
  let approvedArtifactFileName: string | undefined;
  let approvedArtifactFingerprint: string | undefined;

  for (const [index, arg] of args.entries()) {
    if (arg === acknowledgement) continue;
    const equalsIndex = arg.indexOf('=');
    const flag = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    if (equalsIndex === -1) {
      throw new Error(
        `scan does not recognize: ${safeArgumentDescription(arg, index)}. ` +
          'Remote scan arguments are exactly --target=staging|production, ' +
          '--execute-remote-inventory, --approved-artifact=<evidence-file>, ' +
          'and --approved-artifact-fingerprint=<sha256>. Argument values are never shown.',
      );
    }
    const value = arg.slice(equalsIndex + 1);
    switch (flag) {
      case '--target':
        if (target !== undefined) {
          throw new Error(
            'scan requires exactly one --target argument for a remote scan. Refusing to guess which one was meant.',
          );
        }
        target = value;
        break;
      case '--approved-artifact':
        if (approvedArtifactFileName !== undefined) {
          throw new Error(
            'scan requires exactly one --approved-artifact argument for a remote scan. Refusing to guess which one was meant.',
          );
        }
        approvedArtifactFileName = value;
        break;
      case '--approved-artifact-fingerprint':
        if (approvedArtifactFingerprint !== undefined) {
          throw new Error(
            'scan requires exactly one --approved-artifact-fingerprint argument for a remote scan. Refusing to guess which one was meant.',
          );
        }
        approvedArtifactFingerprint = value;
        break;
      default:
        throw new Error(
          `scan does not recognize: ${safeArgumentDescription(arg, index)}. ` +
            'Remote scan arguments are exactly --target=staging|production, ' +
            '--execute-remote-inventory, --approved-artifact=<evidence-file>, ' +
            'and --approved-artifact-fingerprint=<sha256>. Argument values are never shown.',
        );
    }
  }

  if (target !== 'staging' && target !== 'production') {
    throw new Error('scan requires --target=staging or --target=production.');
  }
  if (!args.includes(acknowledgement)) {
    throw new Error(
      'scan --target=staging|production requires the explicit --execute-remote-inventory acknowledgement before it will read an approval artifact or open any remote connection.',
    );
  }
  if (!approvedArtifactFileName) {
    throw new Error(
      'Remote scan requires --approved-artifact=<evidence-file>; refusing to connect without the persisted, manually approved V2 EXPLAIN artifact.',
    );
  }
  if (
    !approvedArtifactFingerprint ||
    !/^[a-f0-9]{64}$/.test(approvedArtifactFingerprint)
  ) {
    throw new Error(
      'Remote scan requires --approved-artifact-fingerprint=<canonical lowercase SHA-256>; refusing to connect without the reviewed artifact identity.',
    );
  }

  return {
    target,
    executeRemoteInventory: args.includes(acknowledgement),
    approvedArtifactFileName,
    approvedArtifactFingerprint,
  };
}

function resolveCommitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * The strict counterpart to `resolveCommitSha` above, used only by the
 * `plan` (remote EXPLAIN preflight) command: `resolveCommitSha` silently
 * falls back to the string `'unknown'` so `scan`'s local, low-stakes
 * report is never blocked by a missing git binary/repo. A remote target's
 * artifact makes a much stronger claim -- "this exact commit was reviewed
 * against this exact remote database" -- so an unresolvable commit here
 * must be a hard failure, not a silent `'unknown'` placeholder baked into
 * evidence a human might later approve.
 *
 * Codex review round 12 (self-review): the thrown message is a fixed,
 * safe string -- it never interpolates the caught subprocess error's own
 * `.message`. `execFileSync`'s failure text can embed argv/environment
 * fragments (a git implementation may echo the failing command line, a
 * path, or other local detail) that this tool has no way to pre-verify
 * as safe, unlike this tool's own deliberately-authored errors elsewhere.
 * The original error is preserved only as `cause`, exactly like the raw
 * Postgres/Drizzle failure `runRemoteExplainPlan` sanitizes below -- a
 * caller that deliberately wants the raw diagnostic can inspect it there;
 * `run()`'s top-level handler never does.
 */
function resolveCommitShaStrict(): string {
  let sha: string;
  try {
    sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    throw new Error(
      'Could not resolve the current Git commit SHA (git rev-parse HEAD ' +
        'failed). A remote EXPLAIN preflight run must be tied to an ' +
        'exact, resolvable commit -- refusing to connect without one. ' +
        "The underlying error is not shown here -- inspect this error's " +
        '"cause" property directly if you need the raw diagnostic; do ' +
        'not forward it to a shared log.',
      { cause: error },
    );
  }
  if (!sha) {
    throw new Error(
      'git rev-parse HEAD returned an empty value. A remote EXPLAIN ' +
        'preflight run must be tied to an exact, resolvable commit -- ' +
        'refusing to connect without one.',
    );
  }
  return sha;
}

/**
 * Codex review round 13: `git status --porcelain` alone is insufficient
 * to prove the working tree matches HEAD, because Git's index can mark a
 * tracked file `assume-unchanged` or `skip-worktree` -- either flag makes
 * ordinary status output (and therefore `isWorkingTreeDirty` below)
 * silently ignore a real, uncommitted edit to that file. A remote EXPLAIN
 * preflight's entire claim is "this exact commit, this exact code, was
 * reviewed against this exact remote database"; a tracked query/control
 * file hidden behind one of these flags could differ from HEAD on disk
 * while every existing check reports clean and resolves the unchanged
 * commit SHA. Reproduced directly before writing this fix: `git
 * update-index --assume-unchanged <file>`, edit the file, `git status
 * --porcelain` returns nothing.
 *
 * Detected via `git ls-files -v -z` (NUL-delimited output, so a path
 * containing a newline can never be mis-split): each entry is
 * `<tag><space><path>`. `S` is the skip-worktree tag; a LOWERCASE tag
 * letter (of any kind -- `h`, `s`, an entry with both flags set renders
 * as lowercase `s`) indicates the assume-unchanged bit is set on that
 * entry. Only the tag character is ever inspected -- the path itself is
 * never compared, logged, or included in any thrown message.
 *
 * Exported directly (not just used internally by
 * `assertNoHiddenGitIndexState` below), taking an explicit `cwd` rather
 * than this script's own `REPO_ROOT`, specifically so it can be tested
 * against a real, disposable Git repository (`git update-index
 * --assume-unchanged`/`--skip-worktree`, actually run and actually
 * inspected -- see `cli.git-index.test.ts`) independent of this actual
 * checkout -- mirrors `readonly-db-remote.ts`'s `verifyReadOnlyRole`
 * export precedent for the same reason. Returns the raw tag character
 * for every tracked path carrying hidden state (empty = clean); throws
 * only on a subprocess failure, with no sanitization of its own -- that
 * is `assertNoHiddenGitIndexState`'s job, so this function stays a pure,
 * directly-assertable predicate.
 */
export function findHiddenGitIndexStateTags(cwd: string): readonly string[] {
  const output = execFileSync('git', ['ls-files', '-v', '-z'], {
    cwd,
    encoding: 'utf8',
  });
  return output
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.charAt(0))
    .filter((tag) => tag.toUpperCase() === 'S' || /^[a-z]$/.test(tag));
}

/**
 * This is a VERIFIER, not a Git-state mutator: it never clears either
 * flag itself, and it never names the affected path in its thrown
 * message -- only that hidden index state exists somewhere in the
 * tracked tree and must be cleared before remote planning can proceed.
 * There is no exception for "but this file matches HEAD right now" --
 * the flag itself, not its current content, is what defeats the
 * exact-HEAD claim, since nothing prevents the file differing a moment
 * later while status keeps reporting clean regardless. Sparse-checkout/
 * skip-worktree is intentionally incompatible with this security-
 * sensitive remote-planning path.
 */
function assertNoHiddenGitIndexState(): void {
  let tags: readonly string[];
  try {
    tags = findHiddenGitIndexStateTags(REPO_ROOT);
  } catch (error) {
    throw new Error(
      'Could not inspect the Git index for hidden state (git ls-files ' +
        '-v failed). A remote EXPLAIN preflight run must be able to ' +
        'prove no tracked file is hidden from the ordinary cleanliness ' +
        'check before it is trusted -- refusing to proceed without that ' +
        'proof. The underlying error is not shown here -- inspect this ' +
        'error\'s "cause" property directly if you need the raw ' +
        'diagnostic; do not forward it to a shared log.',
      { cause: error },
    );
  }

  if (tags.length > 0) {
    throw new Error(
      'The Git index has hidden state (assume-unchanged and/or ' +
        'skip-worktree) set on at least one tracked path. Either flag ' +
        'can make the ordinary working-tree cleanliness check silently ' +
        'miss a real edit to that file, so this tool cannot prove the ' +
        'commit it is about to resolve actually matches what is on ' +
        'disk. Clear it first (git update-index --no-assume-unchanged / ' +
        '--no-skip-worktree on the affected path(s) -- run `git ' +
        'ls-files -v` locally to find them) -- refusing to connect ' +
        'without that proof. (The affected path is not named here.)',
    );
  }
}

/**
 * A report claiming to describe "the state at commit X" is misleading if
 * the working tree has uncommitted changes at run time -- `git rev-parse
 * HEAD` alone doesn't detect that. `scan` refuses to run against a dirty
 * tree unless the caller explicitly passes `--allow-dirty` (for local
 * iteration); the report always records `workingTreeDirty` either way, so
 * an `--allow-dirty` report is still self-describing evidence, not silent.
 *
 * `--porcelain=v1` (rather than the bare `--porcelain`, which defaults to
 * the same v1 format today but leaves that implicit) and
 * `--untracked-files=all` are both explicit on purpose: v1 is guaranteed
 * stable, and pinning it removes any dependence on Git's current default;
 * `--untracked-files=all` overrides an operator's local
 * `status.showUntrackedFiles` config (which can otherwise suppress
 * untracked files, or collapse them to their containing directory) so
 * this check's result never silently depends on ambient Git
 * configuration.
 */
function isWorkingTreeDirty(): boolean {
  try {
    const output = execFileSync(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      },
    );
    return output.trim().length > 0;
  } catch {
    // Can't determine cleanliness -- fail closed, treat as dirty.
    return true;
  }
}

function printMatrix(): void {
  console.log('[tenancy-inventory] Table ownership matrix\n');
  for (const row of TABLE_OWNERSHIP) {
    console.log(
      `  ${row.table.padEnd(28)} ${row.owner.padEnd(12)} module=${row.module}`,
    );
  }
  console.log('\n[tenancy-inventory] Summary:', summarizeOwnership());
  console.log(`\n[tenancy-inventory] ${TENANT_ORG_CONFLATION_NOTE}`);
}

async function runScan(
  target: LocalTarget,
  options: { allowDirty: boolean },
): Promise<void> {
  const dirty = isWorkingTreeDirty();
  if (dirty && !options.allowDirty) {
    throw new Error(
      'Working tree has uncommitted changes. A formal evidence run must be ' +
        'against a clean, committed tree so the report is unambiguously tied ' +
        'to a real commit. Commit or stash first, or pass --allow-dirty for ' +
        'local iteration (the report will record workingTreeDirty: true).',
    );
  }

  console.log(
    `[tenancy-inventory] Scanning ${describeLocalTarget(target)} (read-only transaction)…`,
  );

  const findings = await withReadOnlyDb(target, async (tx) => {
    const [
      schemaMigration,
      tenantOrgCounts,
      usersInMultipleOrgs,
      usersInMultipleTenants,
      orgsMissingTenantAttributes,
      organizationMappingAnomalies,
      userMappingAnomalies,
      waitlistEntriesWithTenantId,
      policiesWithNullOrganization,
      quotaSignal,
      featureFlagTenantIdShape,
      auditLogSettingsTenantIdShape,
      auditEventsTenantIdShape,
    ] = await Promise.all([
      latestSchemaMigration(tx),
      tenantOrganizationCounts(tx),
      usersInMultipleOrganizationsCount(tx),
      usersInMultipleTenantsCount(tx),
      organizationsMissingTenantAttributesCount(tx),
      providerOrganizationMappingAnomalies(tx),
      userProviderMappingAnomalies(tx),
      waitlistEntriesWithTenantIdCount(tx),
      policiesWithNullOrganizationCount(tx),
      quotaEnforcementSignal(tx),
      tenantIdShapeCounts(tx, 'feature_flags'),
      tenantIdShapeCounts(tx, 'audit_log_settings'),
      tenantIdShapeCounts(tx, 'audit_events'),
    ]);

    return {
      schemaMigration,
      tenantOrgCounts,
      usersInMultipleOrgs,
      usersInMultipleTenants,
      orgsMissingTenantAttributes,
      organizationMappingAnomalies,
      userMappingAnomalies,
      waitlistEntriesWithTenantId,
      policiesWithNullOrganization,
      quotaSignal,
      tenantIdShape: {
        featureFlags: featureFlagTenantIdShape,
        auditLogSettings: auditLogSettingsTenantIdShape,
        auditEvents: auditEventsTenantIdShape,
      },
    };
  });

  const report = {
    tool: 'tenancy-inventory',
    toolVersion: TOOL_VERSION,
    environment: 'local' as const,
    target,
    targetDescriptor: describeLocalTarget(target),
    commitSha: resolveCommitSha(),
    workingTreeDirty: dirty,
    generatedAt: new Date().toISOString(),
    readOnlyEnforced: true,
    findings,
  };

  // Every finding above is an aggregate count/bucket -- there is no raw PII
  // or row-level identifier in this object, so it is safe to both print in
  // full and write to the local (never committed) evidence store as-is.
  console.log(JSON.stringify(report, null, 2));

  const fileName = `${target}-${report.generatedAt.replace(/[:.]/g, '-')}.json`;
  const writtenPath = await writeEvidence(
    'local',
    fileName,
    JSON.stringify(report, null, 2),
  );
  console.log(`\n[tenancy-inventory] Evidence written to ${writtenPath}`);
  console.log(`[tenancy-inventory] Evidence root: ${describeEvidenceRoot()}`);
}

function assertCompatible(result: {
  compatible: boolean;
  reason: string;
}): void {
  if (!result.compatible) {
    throw new Error(
      `[tenancy-inventory] Approved EXPLAIN artifact rejected: ${result.reason}`,
    );
  }
}

function assertCommitCompatibility(
  currentCommitSha: string,
  artifact: Pick<ExplainPreflightArtifactV2, 'commit'>,
): void {
  if (
    !artifact?.commit ||
    artifact.commit.workingTreeDirty !== false ||
    artifact.commit.commitSha !== currentCommitSha
  ) {
    throw new Error(
      '[tenancy-inventory] Approved EXPLAIN artifact does not match the exact clean current commit; refusing to connect.',
    );
  }
}

async function loadApprovedArtifact(
  target: RemoteTarget,
  fileName: string,
): Promise<ExplainPreflightArtifactV2> {
  let raw: string;
  try {
    raw = await readEvidence(target, fileName);
  } catch (error) {
    throw new Error(
      '[tenancy-inventory] Could not read the approved EXPLAIN artifact from the confined evidence store. The underlying error is not shown here.',
      { cause: error },
    );
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { version?: unknown }).version !== 2
    ) {
      throw new Error('not a V2 artifact');
    }
    return parsed as ExplainPreflightArtifactV2;
  } catch (error) {
    throw new Error(
      '[tenancy-inventory] Approved EXPLAIN artifact is malformed or is not V2; refusing to connect.',
      { cause: error },
    );
  }
}

/**
 * Phase B3 remote inventory path. Every artifact, Git, and credential
 * identity gate runs before `withReadOnlyRemoteDb` can open a connection.
 * Inside its already-verified READ ONLY / REPEATABLE READ transaction the
 * schema migration is read and compared first; only an exact match permits
 * the frozen inventory query set to execute.
 */
async function runRemoteScan(options: RemoteScanArgs): Promise<void> {
  if (!options.executeRemoteInventory) {
    throw new Error(
      'scan --target=staging|production requires the explicit --execute-remote-inventory acknowledgement before it will open any remote connection.',
    );
  }

  const artifact = await loadApprovedArtifact(
    options.target,
    options.approvedArtifactFileName,
  );
  assertCompatible(checkArtifactIntegrityV2(artifact));
  if (artifact.artifactFingerprint !== options.approvedArtifactFingerprint) {
    throw new Error(
      '[tenancy-inventory] Approved EXPLAIN artifact fingerprint does not match the separately supplied reviewed fingerprint; refusing to connect.',
    );
  }
  assertCompatible(checkRegistryCompatibility(artifact));
  assertNoHiddenGitIndexState();
  if (isWorkingTreeDirty()) {
    throw new Error(
      'Working tree has uncommitted changes. A remote inventory scan must be tied to an exact, clean, committed state; there is no --allow-dirty escape hatch.',
    );
  }
  const commitSha = resolveCommitShaStrict();
  assertCommitCompatibility(commitSha, artifact);
  assertTargetIdentityMatchesExpectation(options.target);
  const descriptor = describeRemoteTarget(options.target);
  const verifiedIdentityFingerprint = computeVerifiedIdentityFingerprint(
    options.target,
  );
  assertCompatible(
    checkTargetCompatibilityV2(
      {
        environment: options.target,
        descriptor,
        verifiedIdentityFingerprint,
      },
      artifact,
    ),
  );

  let findings;
  try {
    findings = await withReadOnlyRemoteDb(options.target, async (tx) => {
      const schemaMigration = await latestSchemaMigration(tx);
      assertCompatible(checkSchemaCompatibility(schemaMigration, artifact));

      const findings = await collectRemoteInventoryFindingsSequential(tx);
      return {
        schemaMigration,
        ...findings,
      };
    });
  } catch (error) {
    if (error instanceof RemoteRoleNotReadOnlyError) throw error;
    if (
      error instanceof Error &&
      error.message.startsWith(
        '[tenancy-inventory] Approved EXPLAIN artifact rejected:',
      )
    ) {
      throw error;
    }
    throw new Error(
      `[tenancy-inventory] Remote inventory scan against ${options.target} failed during connection, authorization, schema validation, or an inventory query. The underlying error is not shown here.`,
      { cause: error },
    );
  }

  const report = {
    tool: 'tenancy-inventory',
    toolVersion: TOOL_VERSION,
    environment: options.target,
    commitSha,
    generatedAt: new Date().toISOString(),
    readOnlyEnforced: true,
    approvedExplain: {
      scopeFingerprint: artifact.scopeFingerprint,
      artifactFingerprint: artifact.artifactFingerprint,
      registryFingerprint: artifact.registryFingerprint,
      verifiedIdentityFingerprint: artifact.target.verifiedIdentityFingerprint,
      schemaMigration: artifact.schemaMigration,
    },
    findings,
  };
  const fileName = `${options.target}-inventory-${report.generatedAt.replace(/[:.]/g, '-')}-${artifact.artifactFingerprint.slice(0, 12)}.json`;
  const writtenPath = await writeEvidence(
    options.target,
    fileName,
    JSON.stringify(report, null, 2),
  );
  console.log('[tenancy-inventory] Remote inventory scan complete');
  console.log(`  target:                       ${options.target}`);
  console.log(
    `  approvedArtifactFingerprint:  ${artifact.artifactFingerprint}`,
  );
  console.log(`  evidence:                     ${writtenPath}`);
}

/**
 * OZI-79 Phase B2: wires the already-reviewed Phase A (`RemoteTarget`,
 * `withReadOnlyRemoteDb`, `describeRemoteTarget`) and Phase B1
 * (`collectExplainPreflightFacts`, `buildExplainPreflightArtifact`)
 * components together into one narrowly scoped command. Still no remote
 * *inventory* execution, no approval records, no persisted-artifact
 * loading, and no automated verdict -- this only produces the plain-
 * `EXPLAIN` preflight artifact and writes it to disk for a human to read.
 *
 * `target`/`descriptor` are the only two things this function ever learns
 * about "where" -- `target` from the caller's already-validated
 * `RemoteTarget` (checked by `run()` before this is even called) and
 * `descriptor` from `describeRemoteTarget(target)`. There is no parameter
 * here, and no code path anywhere in this function, that accepts a
 * caller-supplied connection URL, descriptor string, arbitrary SQL, a
 * query id/subset, or an environment string outside that closed domain --
 * `collectExplainPreflightFacts` always runs the full, frozen
 * `QUERY_REGISTRY`, unmodified.
 *
 * Every check below runs, in this order, before `withReadOnlyRemoteDb` is
 * ever called -- the whole point of the explicit `--execute-remote-explain`
 * acknowledgement is that `plan --target=staging|production` alone, with
 * no other flag, must never open a remote connection:
 *
 * 1. the acknowledgement flag is present;
 * 2. the Git index carries no hidden state (`assertNoHiddenGitIndexState`)
 *    -- checked BEFORE the ordinary cleanliness check, because
 *    `assume-unchanged`/`skip-worktree` are exactly what could make that
 *    next check lie;
 * 3. the working tree is clean (unlike `scan`, there is no
 *    `--allow-dirty` escape hatch here -- a remote target's artifact is
 *    exactly the kind of evidence a human might later approve, and an
 *    ambiguous "which commit does this describe" is not acceptable for
 *    that);
 * 4. the current commit SHA can be resolved (`resolveCommitShaStrict`,
 *    not the lenient `'unknown'`-falling-back `resolveCommitSha` `scan`
 *    uses);
 * 5. the resolved target's identity matches a separately, independently
 *    declared expectation (`assertTargetIdentityMatchesExpectation`) --
 *    defense-in-depth against `OZI79_STAGING_READONLY_DATABASE_URL`/
 *    `OZI79_PRODUCTION_READONLY_DATABASE_URL` being swapped or
 *    misconfigured, since the closed `RemoteTarget` domain only
 *    constrains which env var name is *read*, not what value an operator
 *    actually put there.
 *
 * Once connected, a raw Postgres/Drizzle failure (TLS/authentication/
 * connection setup, or a preflight query itself) is never allowed to
 * reach `run()`'s top-level `catch`, which prints `error.message` to
 * stderr: those infrastructure errors can contain a hostname, username,
 * or other connection-string fragment, unlike this tool's own
 * deliberately-sanitized errors (`RemoteRoleNotReadOnlyError`, the
 * checks above). Such a failure is translated to a stable, safe message
 * before it propagates, with the original attached only as `cause` --
 * present for a caller that deliberately inspects it, never printed by
 * the default top-level handler.
 */
async function runRemoteExplainPlan(
  target: RemoteTarget,
  options: { readonly executeRemoteExplain: boolean },
): Promise<void> {
  if (!options.executeRemoteExplain) {
    throw new Error(
      'plan --target=staging|production requires the explicit ' +
        '--execute-remote-explain acknowledgement before it will open any ' +
        'remote connection. Omitting the flag is the safe default, not an ' +
        'oversight to work around.',
    );
  }

  assertNoHiddenGitIndexState();

  if (isWorkingTreeDirty()) {
    throw new Error(
      'Working tree has uncommitted changes. A remote EXPLAIN preflight ' +
        'run must be tied to an exact, clean, committed state -- unlike ' +
        '`scan`, there is no --allow-dirty escape hatch for a remote ' +
        'target. Commit or stash first.',
    );
  }

  const commitSha = resolveCommitShaStrict();
  assertTargetIdentityMatchesExpectation(target);
  const descriptor = describeRemoteTarget(target);
  // Non-secret SHA-256 of the username-inclusive verification identity
  // (see `computeVerifiedIdentityFingerprint`'s doc comment) -- computed
  // here, once, from the same already-verified `target` so the artifact
  // and every later compatibility check share one source of truth for
  // "which underlying database instance was this". Safe to persist and
  // print: a SHA-256 hash never reveals the username it was computed
  // from, unlike `descriptor` alone, which two different projects behind
  // the same provider pooler can share.
  const verifiedIdentityFingerprint =
    computeVerifiedIdentityFingerprint(target);

  console.log(
    `[tenancy-inventory] Remote EXPLAIN preflight against ${descriptor} (read-only transaction)…`,
  );

  let artifact;
  try {
    artifact = await withReadOnlyRemoteDb(target, async (tx) => {
      const facts = await collectExplainPreflightFacts(tx);
      return buildExplainPreflightArtifactV2(facts, {
        target: {
          environment: target,
          descriptor,
          verifiedIdentityFingerprint,
        },
        commit: { commitSha, workingTreeDirty: false },
      });
    });
  } catch (error) {
    if (error instanceof RemoteRoleNotReadOnlyError) {
      // Already a deliberately-sanitized, safe-to-print message.
      throw error;
    }
    // A raw Postgres/Drizzle error (connection refused, TLS/auth
    // failure, a preflight query error, ...) can contain a hostname,
    // username, or other connection-string fragment. Never let it reach
    // the top-level handler's console.error -- keep it only as `cause`
    // for a caller that deliberately inspects this error, not something
    // printed by default.
    throw new Error(
      `[tenancy-inventory] Remote EXPLAIN preflight against ${target} ` +
        `(${descriptor}) failed during connection, authentication, or a ` +
        `preflight query. The underlying error is not shown here -- it ` +
        `may contain a hostname, username, or other connection-string ` +
        `fragment. Inspect this error's "cause" property directly if you ` +
        `need the raw diagnostic; do not forward it to a shared log.`,
      { cause: error },
    );
  }

  // Fingerprint prefix, not a counter/random suffix: two runs against the
  // same second would otherwise collide, and this keeps the filename
  // itself a piece of self-describing evidence. Neither this nor
  // `generatedAt` contains a hostname, database name, URL, or credential
  // -- `target` is one of exactly two literal words.
  const fileName = `${target}-explain-preflight-${artifact.generatedAt.replace(/[:.]/g, '-')}-${artifact.artifactFingerprint.slice(0, 12)}.json`;
  const writtenPath = await writeEvidence(
    target,
    fileName,
    JSON.stringify(artifact, null, 2),
  );

  // Deliberately NOT `console.log(JSON.stringify(artifact, ...))`, unlike
  // `scan`: the full artifact holds every raw `EXPLAIN` plan for every
  // registry statement. That is safe to persist as evidence for a human
  // to open deliberately, but not to dump into CI/terminal output that
  // may be captured in logs far more casually than an evidence file a
  // reviewer has to go and read.
  console.log('[tenancy-inventory] Remote EXPLAIN preflight summary');
  console.log(`  target:                       ${target}`);
  console.log(`  descriptor:                   ${descriptor}`);
  console.log(`  commit:                       ${commitSha}`);
  console.log(
    `  schemaMigration:              ${artifact.schemaMigration ? `#${artifact.schemaMigration.id} (${artifact.schemaMigration.hash})` : 'none'}`,
  );
  console.log(
    `  registryFingerprint:          ${artifact.registryFingerprint}`,
  );
  console.log(`  scopeFingerprint:             ${artifact.scopeFingerprint}`);
  console.log(
    `  artifactFingerprint:          ${artifact.artifactFingerprint}`,
  );
  console.log(
    `  verifiedIdentityFingerprint:  ${artifact.target.verifiedIdentityFingerprint}`,
  );
  console.log(
    `  statementCount:               ${artifact.statementPlans.length}`,
  );
  console.log(
    `  priorityManualReviewStatementIds: ${artifact.priorityManualReviewStatementIds.join(', ')}`,
  );
  console.log(
    `  requiresManualReview:         ${artifact.requiresManualReview}`,
  );
  console.log(`  evidence:                     ${writtenPath}`);
}

export async function run(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const args = argv.filter((arg) => arg !== '--');
  const command = args[0];

  if (command === 'matrix') {
    printMatrix();
    return;
  }

  if (command === 'scan') {
    const target = readOption(args, '--target');
    if (target === 'staging' || target === 'production') {
      await runRemoteScan(parseRemoteScanArgs(args.slice(1)));
      return;
    }
    if (target !== 'dev' && target !== 'test') {
      throw new Error(
        'scan requires --target=dev or --target=test. No other target is authorized this pass.',
      );
    }
    await runScan(target, { allowDirty: args.includes('--allow-dirty') });
    return;
  }

  if (command === 'plan') {
    const planArgs = parsePlanArgs(args.slice(1));
    await runRemoteExplainPlan(planArgs.target, {
      executeRemoteExplain: planArgs.executeRemoteExplain,
    });
    return;
  }

  throw new Error(
    'Usage: tenancy-inventory <matrix|scan --target=dev|test [--allow-dirty]|scan --target=staging|production --execute-remote-inventory --approved-artifact=<evidence-file> --approved-artifact-fingerprint=<sha256>|plan --target=staging|production --execute-remote-explain>.',
  );
}

const isMain = process.argv[1]?.endsWith('/scripts/tenancy-inventory/cli.ts');
if (isMain) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[tenancy-inventory] ${message}`);
    process.exit(1);
  });
}
