import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeEvidenceRoot, writeEvidence } from './evidence-store';
import {
  buildExplainPreflightArtifactV2,
  collectExplainPreflightFacts,
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
 * A report claiming to describe "the state at commit X" is misleading if
 * the working tree has uncommitted changes at run time -- `git rev-parse
 * HEAD` alone doesn't detect that. `scan` refuses to run against a dirty
 * tree unless the caller explicitly passes `--allow-dirty` (for local
 * iteration); the report always records `workingTreeDirty` either way, so
 * an `--allow-dirty` report is still self-describing evidence, not silent.
 */
function isWorkingTreeDirty(): boolean {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
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
 * 2. the working tree is clean (unlike `scan`, there is no
 *    `--allow-dirty` escape hatch here -- a remote target's artifact is
 *    exactly the kind of evidence a human might later approve, and an
 *    ambiguous "which commit does this describe" is not acceptable for
 *    that);
 * 3. the current commit SHA can be resolved (`resolveCommitShaStrict`,
 *    not the lenient `'unknown'`-falling-back `resolveCommitSha` `scan`
 *    uses);
 * 4. the resolved target's identity matches a separately, independently
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
    'Usage: tenancy-inventory <matrix|scan --target=dev|test [--allow-dirty]|plan --target=staging|production --execute-remote-explain>.',
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
