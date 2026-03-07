import { sql } from 'drizzle-orm';

import type { Container } from '@/core/container';
import { AUTH, INFRASTRUCTURE } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';
import type { DrizzleDb } from '@/core/db';
import { env } from '@/core/env';

import {
  evaluateNodeProvisioningAccess,
  type NodeProvisioningAccessOutcome,
} from './node-provisioning-access';

type QueryResultLike = { rows?: unknown[] } | unknown[];

function toRows(result: QueryResultLike): unknown[] {
  if (Array.isArray(result)) {
    return result;
  }

  if (result && typeof result === 'object' && Array.isArray(result.rows)) {
    return result.rows;
  }

  return [];
}

function createTenantExistsProbe(db: DrizzleDb) {
  return async (tenantId: string): Promise<boolean> => {
    const result = (await db.execute(
      sql`SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1`,
    )) as QueryResultLike;

    return toRows(result).length > 0;
  };
}

export async function resolveNodeProvisioningAccess(
  container: Container,
): Promise<NodeProvisioningAccessOutcome> {
  const identityProvider = container.resolve<IdentityProvider>(
    AUTH.IDENTITY_PROVIDER,
  );
  const tenantResolver = container.resolve<TenantResolver>(
    AUTH.TENANT_RESOLVER,
  );
  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );

  let tenantExistsProbe: ((tenantId: string) => Promise<boolean>) | undefined;

  if (env.TENANCY_MODE === 'single') {
    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    tenantExistsProbe = createTenantExistsProbe(db);
  }

  return evaluateNodeProvisioningAccess({
    identityProvider,
    tenantResolver,
    userRepository,
    tenancyMode: env.TENANCY_MODE,
    tenantExistsProbe,
  });
}
