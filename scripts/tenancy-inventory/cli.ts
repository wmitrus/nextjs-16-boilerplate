import { execFileSync } from 'node:child_process';

import { describeEvidenceRoot, writeLocalEvidence } from './evidence-store';
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
  organizationsMissingTenantAttributesCount,
  policiesWithNullOrganizationCount,
  providerOrganizationMappingAnomalies,
  quotaEnforcementSignal,
  tenantIdShapeCounts,
  tenantOrganizationCounts,
  usersInMultipleOrganizationsCount,
  waitlistEntriesWithTenantIdCount,
} from './topology-queries';

const TOOL_VERSION = '0.1.0';

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

async function runScan(target: LocalTarget): Promise<void> {
  console.log(
    `[tenancy-inventory] Scanning ${describeLocalTarget(target)} (read-only transaction)…`,
  );

  const findings = await withReadOnlyDb(target, async (tx) => {
    const [
      tenantOrgCounts,
      usersInMultipleOrgs,
      orgsMissingTenantAttributes,
      providerMappingAnomalies,
      waitlistEntriesWithTenantId,
      policiesWithNullOrganization,
      quotaSignal,
      featureFlagTenantIdShape,
      auditLogSettingsTenantIdShape,
      auditEventsTenantIdShape,
    ] = await Promise.all([
      tenantOrganizationCounts(tx),
      usersInMultipleOrganizationsCount(tx),
      organizationsMissingTenantAttributesCount(tx),
      providerOrganizationMappingAnomalies(tx),
      waitlistEntriesWithTenantIdCount(tx),
      policiesWithNullOrganizationCount(tx),
      quotaEnforcementSignal(tx),
      tenantIdShapeCounts(tx, 'feature_flags'),
      tenantIdShapeCounts(tx, 'audit_log_settings'),
      tenantIdShapeCounts(tx, 'audit_events'),
    ]);

    return {
      tenantOrgCounts,
      usersInMultipleOrgs,
      orgsMissingTenantAttributes,
      providerMappingAnomalies,
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
    generatedAt: new Date().toISOString(),
    readOnlyEnforced: true,
    findings,
  };

  // Every finding above is an aggregate count/bucket -- there is no raw PII
  // or row-level identifier in this object, so it is safe to both print in
  // full and write to the local (never committed) evidence store as-is.
  console.log(JSON.stringify(report, null, 2));

  const fileName = `${target}-${report.generatedAt.replace(/[:.]/g, '-')}.json`;
  const writtenPath = await writeLocalEvidence(
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
    await runScan(target);
    return;
  }

  throw new Error('Usage: tenancy-inventory <matrix|scan --target=dev|test>.');
}

const isMain = process.argv[1]?.endsWith('/scripts/tenancy-inventory/cli.ts');
if (isMain) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[tenancy-inventory] ${message}`);
    process.exit(1);
  });
}
