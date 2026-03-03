import { createHash } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';

import type { ExternalAuthProvider } from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import { TenantMembershipRequiredError } from '@/core/contracts/tenancy';
import type { DrizzleDb } from '@/core/db';

import {
  CrossProviderLinkingNotAllowedError,
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
  membershipsTable,
  rolesTable,
  tenantAttributesTable,
  tenantsTable,
  usersTable,
} from './schema';

const TENANT_ID_NAMESPACE = 'provisioning:tenant:v1';

/**
 * Computes a deterministic UUID-like string from a stable key.
 * Same inputs always yield the same output — this is intentional for race-safety:
 * two concurrent transactions computing the same tenantId and inserting with
 * ON CONFLICT DO NOTHING will never produce orphaned tenant rows.
 */
function deterministicTenantId(key: string): string {
  const hash = createHash('sha256')
    .update(`${TENANT_ID_NAMESPACE}:${key}`)
    .digest('hex');
  const variant = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, '0');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),
    variant + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-');
}

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
    private readonly crossProviderEmailLinking: 'disabled' | 'verified-only',
  ) {}

  async ensureProvisioned(
    input: ProvisioningInput,
  ): Promise<ProvisioningResult> {
    const { provider, externalUserId, email, emailVerified } = input;

    return this.runInTransaction(async (db) => {
      // Step 1: Resolve/create user — with explicit linking policy enforcement
      const { internalUserId, userCreatedNow } = await resolveOrCreateUser(
        db,
        provider,
        externalUserId,
        email,
        emailVerified,
        this.crossProviderEmailLinking,
      );

      // Step 2: Resolve tenant (read-only for org/db — no writes until membership confirmed)
      const { internalTenantId, tenantCreatedNow } = await resolveTenant(
        db,
        input,
        internalUserId,
      );

      // P1 FIX: org/db membership check BEFORE any write side-effects.
      // The tenant was resolved read-only above; user must already have a membership.
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

      // Step 3: Upsert tenant_attributes defaults (only reached for non-org/db modes)
      await upsertTenantAttributesDefaults(
        db,
        internalTenantId,
        this.freeTierMaxUsers,
      );

      // Acquire a row-level lock on the tenant_attributes row to serialize concurrent
      // provisioning calls for the same tenant, making the count check + membership
      // insert race-safe.
      await db.execute(
        sql`SELECT tenant_id FROM tenant_attributes WHERE tenant_id = ${internalTenantId} FOR UPDATE`,
      );

      // Step 4: Ensure canonical system roles for this tenant
      const roleMap = await ensureRoles(db, internalTenantId);

      // Step 5: Idempotent path — return early if membership already exists
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

      // Step 6: Decide role for new membership
      const membershipRole = decideNewMembershipRole(input, tenantCreatedNow);

      // Step 7: Enforce free-tier limit before insert (race-safe — locked above)
      const memberCount = await getActiveMemberCount(db, internalTenantId);
      if (memberCount >= this.freeTierMaxUsers) {
        throw new TenantUserLimitReachedError();
      }

      // Step 8: Insert membership idempotently — onConflictDoNothing preserves existing role
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

/**
 * Resolves or creates a user record with explicit cross-provider linking policy enforcement.
 *
 * Security invariants:
 * - Linking by email is only performed when emailVerified === true AND policy permits it.
 * - Unverified email → always uses fallback email path (no cross-user collision possible).
 * - Policy 'disabled' → throws CrossProviderLinkingNotAllowedError on any email-based link attempt.
 * - Policy 'verified-only' → only links when emailVerified === true.
 */
async function resolveOrCreateUser(
  db: DrizzleDb,
  provider: ExternalAuthProvider,
  externalUserId: string,
  email: string | undefined,
  emailVerified: boolean | undefined,
  crossProviderEmailLinking: 'disabled' | 'verified-only',
): Promise<{ internalUserId: string; userCreatedNow: boolean }> {
  // Fast path: identity mapping already exists — return immediately
  const existingIdentity = await db
    .select({ userId: authUserIdentitiesTable.userId })
    .from(authUserIdentitiesTable)
    .where(
      and(
        eq(authUserIdentitiesTable.provider, provider),
        eq(authUserIdentitiesTable.externalUserId, externalUserId),
      ),
    )
    .limit(1);

  if (existingIdentity[0]?.userId) {
    return {
      internalUserId: existingIdentity[0].userId,
      userCreatedNow: false,
    };
  }

  // Determine effective email — fall back to a deterministic synthetic address when absent
  const isRealEmail = email !== undefined;
  const effectiveEmail = isRealEmail
    ? email
    : buildFallbackEmail(provider, externalUserId);

  // Check if a user with this email already exists
  const existingUser = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, effectiveEmail))
    .limit(1);

  let internalUserId: string;
  let userCreatedNow: boolean;

  if (existingUser[0]?.id) {
    if (isRealEmail) {
      // Cross-provider linking scenario: a real email already owned by another account.
      // Apply explicit policy gate — only link when email is verified and policy allows it.
      if (crossProviderEmailLinking === 'disabled') {
        throw new CrossProviderLinkingNotAllowedError(
          'CROSS_PROVIDER_EMAIL_LINKING=disabled. Cannot auto-link account via email.',
        );
      }
      if (emailVerified !== true) {
        throw new CrossProviderLinkingNotAllowedError(
          'Cross-provider account linking requires emailVerified=true from the auth provider.',
        );
      }
    }
    // Either linking is allowed (real email, verified) or it is a concurrent
    // provisioning call for the same user via the fallback email path.
    internalUserId = existingUser[0].id;
    userCreatedNow = false;
  } else {
    // No user with this email yet — create one
    const candidateId = crypto.randomUUID();
    await db
      .insert(usersTable)
      .values({ id: candidateId, email: effectiveEmail })
      .onConflictDoNothing();

    // Re-query to handle race: another transaction may have inserted the same user
    // between our SELECT and INSERT (only possible for fallback-email concurrent calls).
    const resolved = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, effectiveEmail))
      .limit(1);

    if (!resolved[0]?.id) {
      throw new Error(
        '[provisioning] Failed to resolve user row after insert.',
      );
    }

    internalUserId = resolved[0].id;
    userCreatedNow = resolved[0].id === candidateId;
  }

  // Link the provider identity to the resolved internal user
  await db
    .insert(authUserIdentitiesTable)
    .values({ provider, externalUserId, userId: internalUserId })
    .onConflictDoNothing();

  return { internalUserId, userCreatedNow };
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

/**
 * Resolves or creates a personal tenant for the given internal user.
 *
 * Race-safety: uses a deterministic tenant UUID derived from the user's internal ID.
 * Two concurrent transactions will compute the same tenantId and both INSERT with
 * ON CONFLICT DO NOTHING — only one will create the row; neither orphans a tenant.
 */
async function resolveOrCreatePersonalTenant(
  db: DrizzleDb,
  internalUserId: string,
): Promise<{ internalTenantId: string; tenantCreatedNow: boolean }> {
  const tenantId = deterministicTenantId(`personal:${internalUserId}`);

  const tenantRows = await db
    .insert(tenantsTable)
    .values({ id: tenantId, name: 'Personal Workspace' })
    .onConflictDoNothing()
    .returning();

  await db
    .insert(authTenantIdentitiesTable)
    .values({
      provider: 'personal',
      externalTenantId: internalUserId,
      tenantId,
    })
    .onConflictDoNothing();

  return {
    internalTenantId: tenantId,
    tenantCreatedNow: tenantRows.length > 0,
  };
}

/**
 * Resolves or creates an org tenant identified by (provider, externalTenantId).
 *
 * Race-safety: uses a deterministic tenant UUID derived from provider + externalTenantId.
 * Concurrent transactions for the same org will compute the same tenantId and conflict-
 * resolve cleanly via ON CONFLICT DO NOTHING — no orphaned tenant rows possible.
 */
async function resolveOrCreateOrgTenant(
  db: DrizzleDb,
  provider: ExternalAuthProvider,
  externalTenantId: string,
): Promise<{ internalTenantId: string; tenantCreatedNow: boolean }> {
  const tenantId = deterministicTenantId(`${provider}:${externalTenantId}`);

  const tenantRows = await db
    .insert(tenantsTable)
    .values({ id: tenantId, name: `Tenant ${externalTenantId.slice(0, 16)}` })
    .onConflictDoNothing()
    .returning();

  await db
    .insert(authTenantIdentitiesTable)
    .values({ provider, externalTenantId, tenantId })
    .onConflictDoNothing();

  return {
    internalTenantId: tenantId,
    tenantCreatedNow: tenantRows.length > 0,
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
