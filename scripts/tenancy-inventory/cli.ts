import { execFileSync } from 'node:child_process';

import { describeEvidenceRoot, writeEvidence } from './evidence-store';
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

function readOption(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : undefined;
}

function resolveCommitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
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

async function run(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
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

  throw new Error(
    'Usage: tenancy-inventory <matrix|scan --target=dev|test [--allow-dirty]>.',
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
