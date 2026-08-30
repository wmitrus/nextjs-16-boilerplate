import 'server-only';

import { and, asc, eq } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';

import {
  organizationsTable,
  rolesTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';

export const CONTAINMENT_FIXTURE = {
  siblingOrganizationId: '15000000-0000-4000-8000-000000000003',
} as const;

export type ContainmentTopology = {
  activeOrganizationId: string;
  outsideTenantOrganizationId: string;
  siblingOrganizationId: string;
};

export function isLocalContainmentFixtureTarget(): boolean {
  if (
    env.DB_DRIVER !== 'postgres' ||
    env.VERCEL_ENV === 'preview' ||
    env.VERCEL_ENV === 'production' ||
    !env.DATABASE_URL
  ) {
    return false;
  }

  try {
    const databaseUrl = new URL(env.DATABASE_URL);
    const isPostgresProtocol =
      databaseUrl.protocol === 'postgres:' ||
      databaseUrl.protocol === 'postgresql:';
    const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(
      databaseUrl.hostname,
    );
    const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));

    return (
      isPostgresProtocol &&
      isLocalHost &&
      databaseUrl.port === '5433' &&
      databaseName === 'app_test'
    );
  } catch {
    return false;
  }
}

export function verifyContainmentTopology(
  organizations: Array<{ id: string; tenantId: string }>,
  defaultTenantId: string,
  activeOrganizationId: string,
  outsideTenantOrganizationId: string,
): ContainmentTopology | null {
  const siblingOrganizationId = CONTAINMENT_FIXTURE.siblingOrganizationId;
  const organizationById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );
  const activeOrganization = organizationById.get(activeOrganizationId);
  const siblingOrganization = organizationById.get(siblingOrganizationId);
  const outsideTenantOrganization = organizationById.get(
    outsideTenantOrganizationId,
  );

  if (
    new Set([
      activeOrganizationId,
      siblingOrganizationId,
      outsideTenantOrganizationId,
    ]).size !== 3 ||
    activeOrganization?.tenantId !== defaultTenantId ||
    siblingOrganization?.tenantId !== defaultTenantId ||
    outsideTenantOrganization?.tenantId === defaultTenantId
  ) {
    return null;
  }

  return {
    activeOrganizationId,
    outsideTenantOrganizationId,
    siblingOrganizationId,
  };
}

export async function findCanonicalOrganizationWithOwner(
  db: DrizzleDb,
  defaultTenantId: string,
) {
  const [organization] = await db
    .select({
      id: organizationsTable.id,
      ownerRoleId: rolesTable.id,
    })
    .from(organizationsTable)
    .innerJoin(
      rolesTable,
      and(
        eq(rolesTable.organizationId, organizationsTable.id),
        eq(rolesTable.name, 'owner'),
      ),
    )
    .where(eq(organizationsTable.tenantId, defaultTenantId))
    .orderBy(asc(organizationsTable.id), asc(rolesTable.id))
    .limit(1);

  return organization;
}
