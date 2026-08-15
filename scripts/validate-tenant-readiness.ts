import './load-env';

import { count, eq } from 'drizzle-orm';

import { createDb } from '@/core/db/create-db';

import {
  organizationsTable,
  tenantsTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';

export interface TenantReadinessSnapshot {
  defaultTenantId?: string;
  matchingOrganizationCount: number;
  matchingTenantCount: number;
  tenancyMode?: string;
  tenantCount: number;
}

export type TenantReadinessResult =
  | { status: 'ready'; message: string }
  | { status: 'skipped'; message: string }
  | { status: 'blocked'; message: string };

export function evaluateTenantReadiness(
  snapshot: TenantReadinessSnapshot,
): TenantReadinessResult {
  if (snapshot.tenancyMode === 'personal' || snapshot.tenancyMode === 'org') {
    return {
      status: 'skipped',
      message: `[tenant-readiness] Skipped for TENANCY_MODE=${snapshot.tenancyMode}.`,
    };
  }

  if (snapshot.tenancyMode !== 'single') {
    return {
      status: 'blocked',
      message:
        '[tenant-readiness] BLOCKED: TENANCY_MODE must be explicitly set to single, personal, or org.',
    };
  }

  if (!snapshot.defaultTenantId) {
    return {
      status: 'blocked',
      message:
        '[tenant-readiness] BLOCKED: TENANCY_MODE=single requires DEFAULT_TENANT_ID.',
    };
  }

  if (snapshot.matchingTenantCount !== 1) {
    const remediation =
      snapshot.tenantCount > 0
        ? 'The target database already contains tenant data. Align DEFAULT_TENANT_ID with the existing bootstrapped tenant; do not create a duplicate tenant.'
        : 'The target database has not been bootstrapped. Run the documented one-time admin bootstrap before deploying.';

    return {
      status: 'blocked',
      message: `[tenant-readiness] BLOCKED: DEFAULT_TENANT_ID does not identify a tenant in the target database. ${remediation}`,
    };
  }

  if (snapshot.matchingOrganizationCount < 1) {
    return {
      status: 'blocked',
      message:
        '[tenant-readiness] BLOCKED: DEFAULT_TENANT_ID identifies a tenant without an organization. Repair the one-time bootstrap data before deploying.',
    };
  }

  return {
    status: 'ready',
    message:
      '[tenant-readiness] Ready: DEFAULT_TENANT_ID identifies a provisioned tenant and organization.',
  };
}

function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    undefined
  );
}

export async function run(): Promise<void> {
  const tenancyMode = process.env.TENANCY_MODE?.trim();
  const defaultTenantId = process.env.DEFAULT_TENANT_ID?.trim();

  const configResult = evaluateTenantReadiness({
    tenancyMode,
    defaultTenantId,
    tenantCount: 0,
    matchingTenantCount: 0,
    matchingOrganizationCount: 0,
  });

  if (configResult.status === 'skipped') {
    console.log(configResult.message);
    return;
  }

  if (configResult.status === 'blocked' && tenancyMode !== 'single') {
    throw new Error(configResult.message);
  }

  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      '[tenant-readiness] BLOCKED: DATABASE_URL_UNPOOLED or DATABASE_URL is required to validate the target database.',
    );
  }

  if (!defaultTenantId) {
    throw new Error(configResult.message);
  }

  const dbRuntime = createDb({
    provider: 'drizzle',
    driver: 'postgres',
    url,
  });

  try {
    const [tenantCountRow] = await dbRuntime.db
      .select({ value: count() })
      .from(tenantsTable);
    const matchingTenants = await dbRuntime.db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, defaultTenantId))
      .limit(2);
    const matchingOrganizations = await dbRuntime.db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(eq(organizationsTable.tenantId, defaultTenantId))
      .limit(1);

    const result = evaluateTenantReadiness({
      tenancyMode,
      defaultTenantId,
      tenantCount: tenantCountRow?.value ?? 0,
      matchingTenantCount: matchingTenants.length,
      matchingOrganizationCount: matchingOrganizations.length,
    });

    if (result.status === 'blocked') {
      throw new Error(result.message);
    }

    console.log(result.message);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.startsWith('[tenant-readiness]')
    ) {
      throw error;
    }

    throw new Error(
      '[tenant-readiness] BLOCKED: unable to verify tenant data in the target database. Confirm database connectivity and that production migrations completed.',
      { cause: error },
    );
  } finally {
    await dbRuntime.close?.();
  }
}

if (process.argv[1]?.endsWith('/validate-tenant-readiness.ts')) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
