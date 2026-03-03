import { and, eq, inArray, sql } from 'drizzle-orm';

import type { ExternalAuthProvider } from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import { TenantMembershipRequiredError } from '@/core/contracts/tenancy';
import type { DrizzleDb } from '@/core/db';

import {
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '../../domain/errors';
import type {
  ProvisioningInput,
  ProvisioningResult,
  ProvisioningService,
} from '../../domain/ProvisioningService';

import {
  authTenantIdentitiesTable,
  authUserIdentitiesTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import {
  membershipsTable,
  rolesTable,
  tenantAttributesTable,
  tenantsTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

function sanitizeForEmailLocalPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .slice(0, 64);
}

function buildFallbackEmail(
  provider: ExternalAuthProvider,
  externalId: string,
): string {
  return `external+${sanitizeForEmailLocalPart(provider)}-${sanitizeForEmailLocalPart(externalId)}@local.invalid`;
}

function mapTenantRoleClaim(claim: string | undefined): 'owner' | 'member' {
  if (!claim) return 'member';
  const normalized = claim.toLowerCase();
  if (normalized.includes('admin') || normalized.includes('owner'))
    return 'owner';
  return 'member';
}

function decideNewMembershipRole(
  input: ProvisioningInput,
  tenantCreatedNow: boolean,
): 'owner' | 'member' {
  if (input.tenancyMode === 'personal') return 'owner';

  if (input.tenancyMode === 'org' && input.tenantContextSource === 'provider') {
    const claimRole = mapTenantRoleClaim(input.tenantRole);
    if (tenantCreatedNow && claimRole === 'owner') return 'owner';
    return claimRole;
  }

  return 'member';
}

export class DrizzleProvisioningService implements ProvisioningService {
  constructor(
    private readonly db: DrizzleDb,
    private readonly freeTierMaxUsers: number,
  ) {}

  async ensureProvisioned(
    input: ProvisioningInput,
  ): Promise<ProvisioningResult> {
    const { provider, externalUserId, email } = input;

    return this.runInTransaction(async (db) => {
      const { internalUserId, userCreatedNow } = await resolveOrCreateUser(
        db,
        provider,
        externalUserId,
        email,
      );

      const { internalTenantId, tenantCreatedNow } = await resolveTenant(
        db,
        input,
        internalUserId,
      );

      await upsertTenantAttributesDefaults(
        db,
        internalTenantId,
        this.freeTierMaxUsers,
      );

      const roleMap = await ensureRoles(db, internalTenantId);

      if (input.tenancyMode === 'org' && input.tenantContextSource === 'db') {
        const existing = await getMembership(
          db,
          internalUserId,
          internalTenantId,
        );
        if (!existing) {
          throw new TenantMembershipRequiredError();
        }
        return {
          internalUserId,
          internalTenantId,
          membershipRole: existing.roleName as 'owner' | 'member',
          tenantCreatedNow,
          userCreatedNow,
        };
      }

      const existing = await getMembership(
        db,
        internalUserId,
        internalTenantId,
      );
      if (existing) {
        return {
          internalUserId,
          internalTenantId,
          membershipRole: existing.roleName as 'owner' | 'member',
          tenantCreatedNow,
          userCreatedNow,
        };
      }

      const membershipRole = decideNewMembershipRole(input, tenantCreatedNow);

      const memberCount = await getActiveMemberCount(db, internalTenantId);
      if (memberCount >= this.freeTierMaxUsers) {
        throw new TenantUserLimitReachedError();
      }

      const roleId = roleMap.get(membershipRole);
      if (!roleId) {
        throw new Error(
          `[provisioning] Role '${membershipRole}' not found in tenant '${internalTenantId}'`,
        );
      }

      await db
        .insert(membershipsTable)
        .values({ userId: internalUserId, tenantId: internalTenantId, roleId })
        .onConflictDoNothing();

      return {
        internalUserId,
        internalTenantId,
        membershipRole,
        tenantCreatedNow,
        userCreatedNow,
      };
    });
  }

  private async runInTransaction<T>(
    fn: (db: DrizzleDb) => Promise<T>,
  ): Promise<T> {
    return (
      this.db as unknown as {
        transaction: (fn: (tx: DrizzleDb) => Promise<T>) => Promise<T>;
      }
    ).transaction(fn);
  }
}

async function resolveOrCreateUser(
  db: DrizzleDb,
  provider: ExternalAuthProvider,
  externalUserId: string,
  email: string | undefined,
): Promise<{ internalUserId: string; userCreatedNow: boolean }> {
  const existing = await db
    .select({ userId: authUserIdentitiesTable.userId })
    .from(authUserIdentitiesTable)
    .where(
      and(
        eq(authUserIdentitiesTable.provider, provider),
        eq(authUserIdentitiesTable.externalUserId, externalUserId),
      ),
    )
    .limit(1);

  if (existing[0]?.userId) {
    return { internalUserId: existing[0].userId, userCreatedNow: false };
  }

  const userId = crypto.randomUUID();
  await db
    .insert(usersTable)
    .values({
      id: userId,
      email: email ?? buildFallbackEmail(provider, externalUserId),
    })
    .onConflictDoNothing();

  await db
    .insert(authUserIdentitiesTable)
    .values({ provider, externalUserId, userId })
    .onConflictDoNothing();

  const resolved = await db
    .select({ userId: authUserIdentitiesTable.userId })
    .from(authUserIdentitiesTable)
    .where(
      and(
        eq(authUserIdentitiesTable.provider, provider),
        eq(authUserIdentitiesTable.externalUserId, externalUserId),
      ),
    )
    .limit(1);

  if (!resolved[0]?.userId) {
    throw new Error(
      '[provisioning] Failed to resolve user identity mapping after create.',
    );
  }

  const createdUserId = resolved[0].userId;
  return {
    internalUserId: createdUserId,
    userCreatedNow: createdUserId === userId,
  };
}

async function resolveTenant(
  db: DrizzleDb,
  input: ProvisioningInput,
  internalUserId: string,
): Promise<{ internalTenantId: string; tenantCreatedNow: boolean }> {
  const { tenancyMode, tenantContextSource, provider } = input;

  if (tenancyMode === 'single') {
    if (!input.activeTenantId) {
      throw new TenantContextRequiredError(
        'TENANCY_MODE=single requires activeTenantId (DEFAULT_TENANT_ID) in ProvisioningInput.',
      );
    }
    const rows = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, input.activeTenantId))
      .limit(1);

    if (!rows[0]) {
      throw new TenantNotProvisionedError(
        `Single tenant '${input.activeTenantId}' does not exist. Ensure DEFAULT_TENANT_ID is seeded.`,
      );
    }
    return { internalTenantId: rows[0].id, tenantCreatedNow: false };
  }

  if (tenancyMode === 'personal') {
    return resolveOrCreatePersonalTenant(db, internalUserId);
  }

  if (tenancyMode === 'org') {
    if (tenantContextSource === 'provider') {
      if (!input.tenantExternalId) {
        throw new TenantContextRequiredError(
          'TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=provider requires tenantExternalId in ProvisioningInput.',
        );
      }
      return resolveOrCreateOrgTenant(db, provider, input.tenantExternalId);
    }

    if (tenantContextSource === 'db') {
      if (!input.activeTenantId) {
        throw new TenantContextRequiredError(
          'TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db requires activeTenantId in ProvisioningInput.',
        );
      }
      const rows = await db
        .select({ id: tenantsTable.id })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, input.activeTenantId))
        .limit(1);

      if (!rows[0]) {
        throw new TenantNotProvisionedError(
          `Tenant '${input.activeTenantId}' does not exist in database.`,
        );
      }
      return { internalTenantId: rows[0].id, tenantCreatedNow: false };
    }

    throw new Error(
      `[provisioning] Unknown TENANT_CONTEXT_SOURCE: ${String(tenantContextSource)}`,
    );
  }

  throw new Error(
    `[provisioning] Unknown TENANCY_MODE: ${String(tenancyMode)}`,
  );
}

async function resolveOrCreatePersonalTenant(
  db: DrizzleDb,
  internalUserId: string,
): Promise<{ internalTenantId: string; tenantCreatedNow: boolean }> {
  const existing = await db
    .select({ tenantId: authTenantIdentitiesTable.tenantId })
    .from(authTenantIdentitiesTable)
    .where(
      and(
        eq(authTenantIdentitiesTable.provider, 'personal'),
        eq(authTenantIdentitiesTable.externalTenantId, internalUserId),
      ),
    )
    .limit(1);

  if (existing[0]?.tenantId) {
    return { internalTenantId: existing[0].tenantId, tenantCreatedNow: false };
  }

  const tenantId = crypto.randomUUID();
  await db
    .insert(tenantsTable)
    .values({ id: tenantId, name: 'Personal Workspace' })
    .onConflictDoNothing();

  await db
    .insert(authTenantIdentitiesTable)
    .values({
      provider: 'personal',
      externalTenantId: internalUserId,
      tenantId,
    })
    .onConflictDoNothing();

  const resolved = await db
    .select({ tenantId: authTenantIdentitiesTable.tenantId })
    .from(authTenantIdentitiesTable)
    .where(
      and(
        eq(authTenantIdentitiesTable.provider, 'personal'),
        eq(authTenantIdentitiesTable.externalTenantId, internalUserId),
      ),
    )
    .limit(1);

  if (!resolved[0]?.tenantId) {
    throw new Error(
      '[provisioning] Failed to resolve personal tenant after create.',
    );
  }

  const createdTenantId = resolved[0].tenantId;
  return {
    internalTenantId: createdTenantId,
    tenantCreatedNow: createdTenantId === tenantId,
  };
}

async function resolveOrCreateOrgTenant(
  db: DrizzleDb,
  provider: ExternalAuthProvider,
  externalTenantId: string,
): Promise<{ internalTenantId: string; tenantCreatedNow: boolean }> {
  const existing = await db
    .select({ tenantId: authTenantIdentitiesTable.tenantId })
    .from(authTenantIdentitiesTable)
    .where(
      and(
        eq(authTenantIdentitiesTable.provider, provider),
        eq(authTenantIdentitiesTable.externalTenantId, externalTenantId),
      ),
    )
    .limit(1);

  if (existing[0]?.tenantId) {
    return { internalTenantId: existing[0].tenantId, tenantCreatedNow: false };
  }

  const tenantId = crypto.randomUUID();
  await db
    .insert(tenantsTable)
    .values({ id: tenantId, name: `Tenant ${externalTenantId.slice(0, 16)}` })
    .onConflictDoNothing();

  await db
    .insert(authTenantIdentitiesTable)
    .values({ provider, externalTenantId, tenantId })
    .onConflictDoNothing();

  const resolved = await db
    .select({ tenantId: authTenantIdentitiesTable.tenantId })
    .from(authTenantIdentitiesTable)
    .where(
      and(
        eq(authTenantIdentitiesTable.provider, provider),
        eq(authTenantIdentitiesTable.externalTenantId, externalTenantId),
      ),
    )
    .limit(1);

  if (!resolved[0]?.tenantId) {
    throw new Error(
      '[provisioning] Failed to resolve org tenant after create.',
    );
  }

  const createdTenantId = resolved[0].tenantId;
  return {
    internalTenantId: createdTenantId,
    tenantCreatedNow: createdTenantId === tenantId,
  };
}

async function upsertTenantAttributesDefaults(
  db: DrizzleDb,
  tenantId: string,
  freeTierMaxUsers: number,
): Promise<void> {
  await db
    .insert(tenantAttributesTable)
    .values({
      tenantId,
      plan: 'free',
      contractType: 'standard',
      features: [],
      maxUsers: freeTierMaxUsers,
    })
    .onConflictDoNothing();
}

async function ensureRoles(
  db: DrizzleDb,
  tenantId: string,
): Promise<Map<string, string>> {
  const ownerPreId = crypto.randomUUID();
  const memberPreId = crypto.randomUUID();

  await db
    .insert(rolesTable)
    .values([
      { id: ownerPreId, tenantId, name: 'owner', isSystem: true },
      { id: memberPreId, tenantId, name: 'member', isSystem: true },
    ])
    .onConflictDoNothing();

  const rows = await db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(
      and(
        eq(rolesTable.tenantId, tenantId),
        inArray(rolesTable.name, ['owner', 'member']),
      ),
    );

  const roleMap = new Map<string, string>();
  for (const row of rows) {
    roleMap.set(row.name, row.id);
  }
  return roleMap;
}

async function getMembership(
  db: DrizzleDb,
  userId: string,
  tenantId: string,
): Promise<{ roleId: string; roleName: string } | null> {
  const rows = await db
    .select({ roleId: membershipsTable.roleId, roleName: rolesTable.name })
    .from(membershipsTable)
    .innerJoin(rolesTable, eq(rolesTable.id, membershipsTable.roleId))
    .where(
      and(
        eq(membershipsTable.userId, userId),
        eq(membershipsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function getActiveMemberCount(
  db: DrizzleDb,
  tenantId: string,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(membershipsTable)
    .where(eq(membershipsTable.tenantId, tenantId));

  return rows[0]?.count ?? 0;
}
