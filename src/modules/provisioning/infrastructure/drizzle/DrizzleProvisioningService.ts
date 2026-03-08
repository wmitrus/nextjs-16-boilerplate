import { createHash } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';

import type { ExternalAuthProvider } from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import { TenantMembershipRequiredError } from '@/core/contracts/tenancy';
import type { DrizzleDb } from '@/core/db';
import { resolveServerLogger } from '@/core/logger/di';

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
  POLICY_TEMPLATE_VERSION,
  memberPolicies,
  ownerPolicies,
} from '../../policy/templates';

import {
  authTenantIdentitiesTable,
  authUserIdentitiesTable,
  membershipsTable,
  policiesTable,
  rolesTable,
  tenantAttributesTable,
  tenantsTable,
  usersTable,
} from './schema';

const TENANT_ID_NAMESPACE = 'provisioning:tenant:v1';
const logger = resolveServerLogger().child({
  type: 'API',
  category: 'provisioning',
  module: 'drizzle-provisioning-service',
});

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

function isSyntheticFallbackEmail(email: string): boolean {
  return email.endsWith('@local.invalid') && email.startsWith('external+');
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

      // Step 5: Apply policy template versioning — idempotent, only adds missing policies
      await applyPolicyTemplateVersion(db, internalTenantId, roleMap);

      // Step 6: Idempotent path — return early if membership already exists
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

      // Step 7: Decide role for new membership
      const membershipRole = decideNewMembershipRole(input, tenantCreatedNow);

      // Step 8: Enforce free-tier limit before insert (race-safe — locked above)
      const memberCount = await getActiveMemberCount(db, internalTenantId);
      if (memberCount >= this.freeTierMaxUsers) {
        throw new TenantUserLimitReachedError();
      }

      // Step 9: Insert membership idempotently — onConflictDoNothing preserves existing role
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
  // Fast path: identity mapping already exists — verify users row is intact
  const existingIdentity = await db
    .select({
      userId: authUserIdentitiesTable.userId,
      existingUserId: usersTable.id,
      existingEmail: usersTable.email,
    })
    .from(authUserIdentitiesTable)
    .leftJoin(usersTable, eq(usersTable.id, authUserIdentitiesTable.userId))
    .where(
      and(
        eq(authUserIdentitiesTable.provider, provider),
        eq(authUserIdentitiesTable.externalUserId, externalUserId),
      ),
    )
    .limit(1);

  if (existingIdentity[0]?.userId) {
    if (!existingIdentity[0].existingUserId) {
      throw new Error(
        '[provisioning] Identity mapping points to missing user row — bootstrap invariant violated.',
      );
    }

    const currentEmail = existingIdentity[0].existingEmail;
    if (
      typeof email === 'string' &&
      currentEmail &&
      isSyntheticFallbackEmail(currentEmail) &&
      currentEmail !== email
    ) {
      const emailOwner = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

      if (!emailOwner[0]?.id) {
        await db
          .update(usersTable)
          .set({ email })
          .where(eq(usersTable.id, existingIdentity[0].userId));

        logger.info(
          {
            event: 'provisioning:repair_synthetic_email',
            provider,
            externalUserId,
            internalUserId: existingIdentity[0].userId,
          },
          'Provisioning repaired a synthetic fallback email using a real provider email claim',
        );
      } else if (emailOwner[0].id !== existingIdentity[0].userId) {
        logger.warn(
          {
            event: 'provisioning:repair_synthetic_email_skipped',
            provider,
            externalUserId,
            internalUserId: existingIdentity[0].userId,
            conflictingUserId: emailOwner[0].id,
          },
          'Provisioning could not repair a synthetic fallback email because the real email is already owned by another user',
        );
      }
    }

    return {
      internalUserId: existingIdentity[0].userId,
      userCreatedNow: false,
    };
  }

  // Determine effective email — fall back to a deterministic synthetic address when absent
  const isRealEmail = email !== undefined;
  if (!isRealEmail) {
    const logMethod =
      process.env.NODE_ENV === 'test' ? logger.debug : logger.warn;
    logMethod.call(
      logger,
      {
        event: 'provisioning:fallback_email',
        provider,
        externalUserId,
      },
      'Provisioning is using a synthetic fallback email because the auth provider did not supply an email claim',
    );
  }
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

    // Race condition: another transaction won the INSERT for the same real email.
    // We must apply the same policy gate here — the check in the if-branch above
    // did not run because our SELECT saw no existing user at that point.
    if (resolved[0].id !== candidateId && isRealEmail) {
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

    internalUserId = resolved[0].id;
    userCreatedNow = resolved[0].id === candidateId;
  }

  // Link the provider identity to the resolved internal user.
  // ON CONFLICT DO NOTHING because a concurrent transaction may have already committed
  // this mapping with the same (provider, externalUserId) PK.
  await db
    .insert(authUserIdentitiesTable)
    .values({ provider, externalUserId, userId: internalUserId })
    .onConflictDoNothing();

  // Re-read the mapping as the authoritative source of truth.
  // A concurrent transaction could have committed a mapping with the same PK but
  // pointing to a different userId (e.g. concurrent onboarding race).
  // The DB record is canonical — always use what the DB says.
  const canonicalMapping = await db
    .select({ userId: authUserIdentitiesTable.userId })
    .from(authUserIdentitiesTable)
    .where(
      and(
        eq(authUserIdentitiesTable.provider, provider),
        eq(authUserIdentitiesTable.externalUserId, externalUserId),
      ),
    )
    .limit(1);

  if (!canonicalMapping[0]?.userId) {
    throw new Error(
      '[provisioning] Failed to resolve identity mapping after insert.',
    );
  }

  return {
    internalUserId: canonicalMapping[0].userId,
    userCreatedNow:
      userCreatedNow && canonicalMapping[0].userId === internalUserId,
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

/**
 * Resolves or creates a personal tenant for the given internal user.
 *
 * Legacy compatibility: always reads the existing auth_tenant_identities mapping first.
 * Tenants created before the deterministic UUID migration retain their original random UUID.
 *
 * Race-safety: uses a deterministic tenant UUID for new tenants so concurrent transactions
 * compute the same ID and both INSERT with ON CONFLICT DO NOTHING — no orphaned rows.
 */
async function resolveOrCreatePersonalTenant(
  db: DrizzleDb,
  internalUserId: string,
): Promise<{ internalTenantId: string; tenantCreatedNow: boolean }> {
  // Check for pre-existing mapping first (handles legacy random-UUID tenants)
  const existingMapping = await db
    .select({ tenantId: authTenantIdentitiesTable.tenantId })
    .from(authTenantIdentitiesTable)
    .where(
      and(
        eq(authTenantIdentitiesTable.provider, 'personal'),
        eq(authTenantIdentitiesTable.externalTenantId, internalUserId),
      ),
    )
    .limit(1);

  if (existingMapping[0]?.tenantId) {
    return {
      internalTenantId: existingMapping[0].tenantId,
      tenantCreatedNow: false,
    };
  }

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

  // Re-read the mapping as the authoritative source of truth.
  // Both concurrent transactions compute the same deterministic tenantId, so the
  // re-read is always consistent — but it closes the theoretical gap where an
  // in-flight mapping insert conflicts with a committed one.
  const canonicalMapping = await db
    .select({ tenantId: authTenantIdentitiesTable.tenantId })
    .from(authTenantIdentitiesTable)
    .where(
      and(
        eq(authTenantIdentitiesTable.provider, 'personal'),
        eq(authTenantIdentitiesTable.externalTenantId, internalUserId),
      ),
    )
    .limit(1);

  if (!canonicalMapping[0]?.tenantId) {
    throw new Error(
      '[provisioning] Failed to resolve personal tenant mapping after insert.',
    );
  }

  return {
    internalTenantId: canonicalMapping[0].tenantId,
    tenantCreatedNow:
      tenantRows.length > 0 && canonicalMapping[0].tenantId === tenantId,
  };
}

/**
 * Resolves or creates an org tenant identified by (provider, externalTenantId).
 *
 * Legacy compatibility: always reads the existing auth_tenant_identities mapping first.
 * Tenants created before the deterministic UUID migration retain their original random UUID.
 *
 * Race-safety: uses a deterministic tenant UUID for new tenants so concurrent transactions
 * compute the same ID and both INSERT with ON CONFLICT DO NOTHING — no orphaned rows.
 */
async function resolveOrCreateOrgTenant(
  db: DrizzleDb,
  provider: ExternalAuthProvider,
  externalTenantId: string,
): Promise<{ internalTenantId: string; tenantCreatedNow: boolean }> {
  // Check for pre-existing mapping first (handles legacy random-UUID tenants)
  const existingMapping = await db
    .select({ tenantId: authTenantIdentitiesTable.tenantId })
    .from(authTenantIdentitiesTable)
    .where(
      and(
        eq(authTenantIdentitiesTable.provider, provider),
        eq(authTenantIdentitiesTable.externalTenantId, externalTenantId),
      ),
    )
    .limit(1);

  if (existingMapping[0]?.tenantId) {
    return {
      internalTenantId: existingMapping[0].tenantId,
      tenantCreatedNow: false,
    };
  }

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

  // Re-read the mapping as the authoritative source of truth.
  // Concurrent transactions computing the same deterministic tenantId will both
  // conflict-resolve cleanly — but re-reading ensures the returned ID is canonical.
  const canonicalMapping = await db
    .select({ tenantId: authTenantIdentitiesTable.tenantId })
    .from(authTenantIdentitiesTable)
    .where(
      and(
        eq(authTenantIdentitiesTable.provider, provider),
        eq(authTenantIdentitiesTable.externalTenantId, externalTenantId),
      ),
    )
    .limit(1);

  if (!canonicalMapping[0]?.tenantId) {
    throw new Error(
      '[provisioning] Failed to resolve org tenant mapping after insert.',
    );
  }

  return {
    internalTenantId: canonicalMapping[0].tenantId,
    tenantCreatedNow:
      tenantRows.length > 0 && canonicalMapping[0].tenantId === tenantId,
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

/**
 * Checks the stored policy template version and idempotently upserts any missing
 * default policies when the stored version is behind the current template version.
 *
 * INVARIANTS:
 * - Only ADDS policies that are not already present (no removal, no privilege creep).
 * - Policy uniqueness is enforced by DB unique constraint:
 *   (tenantId, roleId, effect, resource, actions, conditions).
 * - Updates policy_template_version only after all templates are applied.
 * - No wildcard resource ('*') or wildcard actions (['*']) are ever inserted.
 */
async function applyPolicyTemplateVersion(
  db: DrizzleDb,
  tenantId: string,
  roleMap: Map<string, string>,
): Promise<void> {
  const attrRows = await db
    .select({
      policyTemplateVersion: tenantAttributesTable.policyTemplateVersion,
    })
    .from(tenantAttributesTable)
    .where(eq(tenantAttributesTable.tenantId, tenantId))
    .limit(1);

  const currentVersion = attrRows[0]?.policyTemplateVersion ?? 0;
  if (currentVersion >= POLICY_TEMPLATE_VERSION) {
    return;
  }

  const ownerRoleId = roleMap.get('owner');
  const memberRoleId = roleMap.get('member');

  if (ownerRoleId) {
    for (const policy of ownerPolicies) {
      await db
        .insert(policiesTable)
        .values({
          id: crypto.randomUUID(),
          tenantId,
          roleId: ownerRoleId,
          effect: policy.effect,
          resource: policy.resource,
          actions: policy.actions,
          conditions: policy.conditions ?? {},
        })
        .onConflictDoNothing();
    }
  }

  if (memberRoleId) {
    for (const policy of memberPolicies) {
      await db
        .insert(policiesTable)
        .values({
          id: crypto.randomUUID(),
          tenantId,
          roleId: memberRoleId,
          effect: policy.effect,
          resource: policy.resource,
          actions: policy.actions,
          conditions: policy.conditions ?? {},
        })
        .onConflictDoNothing();
    }
  }

  await db
    .update(tenantAttributesTable)
    .set({ policyTemplateVersion: POLICY_TEMPLATE_VERSION })
    .where(eq(tenantAttributesTable.tenantId, tenantId));
}
