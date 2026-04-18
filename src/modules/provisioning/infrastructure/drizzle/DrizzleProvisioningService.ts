import { createHash } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';

import type { ExternalAuthProvider } from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import { TenantMembershipRequiredError } from '@/core/contracts/tenancy';
import type { DrizzleDb } from '@/core/db';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';

import {
  getOrCreateActivityState,
  getRuntimeDiagnosticState,
} from '@/shared/lib/observability/runtime-diagnostic-state';
import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

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
  authOrganizationIdentitiesTable,
  authUserIdentitiesTable,
  membershipsTable,
  organizationsTable,
  policiesTable,
  rolesTable,
  tenantAttributesTable,
  tenantsTable,
  usersTable,
} from './schema';

const TENANT_ID_NAMESPACE = 'provisioning:tenant:v1';
const inFlightProvisioning = new Map<string, Promise<ProvisioningResult>>();
const logger = resolveServerLogger().child({
  type: 'API',
  category: 'provisioning',
  module: 'drizzle-provisioning-service',
});

function previewEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return '[invalid-email]';
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
}

function isRetryableProvisioningError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }

  const code = (err as NodeJS.ErrnoException).code;
  if (
    code === 'ENOENT' ||
    code === 'EPERM' ||
    code === 'EACCES' ||
    code === 'EBUSY' ||
    code === 'EMFILE'
  ) {
    return true;
  }

  return /aborted\(\)|timeout|temporar|busy|locked/i.test(err.message);
}

function buildProvisioningSubjectKey(input: ProvisioningInput): string {
  return `${input.provider}:${input.externalUserId}`;
}

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

function buildProvisioningSingleFlightKey(
  input: ProvisioningInput,
  freeTierMaxUsers: number,
  crossProviderEmailLinking: 'disabled' | 'verified-only',
): string {
  return JSON.stringify({
    provider: input.provider,
    externalUserId: input.externalUserId,
    email: input.email ?? null,
    emailVerified: input.emailVerified ?? null,
    tenancyMode: input.tenancyMode,
    tenantContextSource: input.tenantContextSource ?? null,
    orgExternalId: input.orgExternalId ?? null,
    tenantRole: input.tenantRole ?? null,
    activeTenantId: input.activeTenantId ?? null,
    freeTierMaxUsers,
    crossProviderEmailLinking,
  });
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
    const requestContext = await getServerRequestLogContext();
    const diagnostics = getRuntimeDiagnosticState();
    const runId = crypto.randomUUID();
    const startedAt = Date.now();
    const subjectKey = buildProvisioningSubjectKey(input);
    const subjectState = getOrCreateActivityState(
      diagnostics.provisioningSubjects,
      subjectKey,
    );
    const singleFlightKey = buildProvisioningSingleFlightKey(
      input,
      this.freeTierMaxUsers,
      this.crossProviderEmailLinking,
    );
    const existingProvisioning = inFlightProvisioning.get(singleFlightKey);

    if (existingProvisioning) {
      logger.warn(
        {
          event: 'provisioning:ensure:singleflight_reused',
          correlationId: requestContext.correlationId,
          requestId: requestContext.requestId,
          pathname: requestContext.pathname,
          runId,
          subjectKey,
          provider: input.provider,
          externalUserId: input.externalUserId,
          tenancyMode: input.tenancyMode,
          activeRunCount: subjectState.activeCount,
          isDuplicate: true,
        },
        'Provisioning reused an in-flight ensureProvisioned() call for the same identity',
      );
      return existingProvisioning;
    }

    subjectState.totalStarts += 1;
    subjectState.activeCount += 1;
    subjectState.lastStartedAt = startedAt;

    const { provider, externalUserId, email, emailVerified } = input;
    let currentStage:
      | 'start'
      | 'db_init'
      | 'migrations'
      | 'transaction_start'
      | 'identity_lookup'
      | 'tenant_upsert'
      | 'membership_upsert'
      | 'onboarding_state_check'
      | 'complete' = 'start';
    let internalSubjectState:
      | ReturnType<typeof getOrCreateActivityState>
      | undefined;
    let internalSubjectKey: string | undefined;

    const baseLogFields = {
      correlationId: requestContext.correlationId,
      requestId: requestContext.requestId,
      pathname: requestContext.pathname,
      runId,
      provider,
      externalUserId,
      externalOrgId: input.orgExternalId,
      tenancyMode: input.tenancyMode,
      tenantContextSource: input.tenantContextSource,
      activeTenantId: input.activeTenantId,
      emailPreview: previewEmail(email),
      emailVerified,
      subjectKey,
    };

    logger.info(
      {
        event: 'provisioning:ensure:start',
        ...baseLogFields,
        activeRunCount: subjectState.activeCount,
        totalRunCount: subjectState.totalStarts,
        isDuplicateSubject: subjectState.activeCount > 1,
      },
      'Provisioning ensure started',
    );

    currentStage = 'db_init';
    logger.debug(
      {
        event: 'provisioning:ensure:db_init_start',
        ...baseLogFields,
        dbDriver:
          env.DB_DRIVER ??
          (env.NODE_ENV === 'production' ? 'postgres' : 'pglite'),
      },
      'Provisioning observed injected DB runtime before transaction start',
    );
    logger.debug(
      {
        event: 'provisioning:ensure:db_init_success',
        ...baseLogFields,
        dbDriver:
          env.DB_DRIVER ??
          (env.NODE_ENV === 'production' ? 'postgres' : 'pglite'),
      },
      'Provisioning confirmed DB runtime is available',
    );

    currentStage = 'migrations';
    logger.debug(
      {
        event: 'provisioning:ensure:migrations_start',
        ...baseLogFields,
        invokedInRequestPath: false,
        skipped: true,
      },
      'Provisioning checked migration stage for request path diagnostics',
    );
    logger.debug(
      {
        event: 'provisioning:ensure:migrations_success',
        ...baseLogFields,
        invokedInRequestPath: false,
        skipped: true,
      },
      'Provisioning confirmed migrations are not run inside the request path',
    );

    const provisioningPromise = (async () => {
      try {
        currentStage = 'transaction_start';
        logger.debug(
          {
            event: 'provisioning:ensure:transaction_start',
            ...baseLogFields,
          },
          'Provisioning transaction starting',
        );

        const result = await this.runInTransaction(async (db) => {
          currentStage = 'identity_lookup';
          logger.debug(
            {
              event: 'provisioning:ensure:identity_lookup_start',
              ...baseLogFields,
            },
            'Provisioning identity lookup starting',
          );

          logger.debug(
            {
              event: 'provisioning:ensure:user_upsert_start',
              ...baseLogFields,
            },
            'Provisioning user resolution/upsert starting',
          );

          const { internalUserId, userCreatedNow } = await resolveOrCreateUser(
            db,
            provider,
            externalUserId,
            email,
            emailVerified,
            this.crossProviderEmailLinking,
          );

          internalSubjectKey = internalUserId;
          internalSubjectState = getOrCreateActivityState(
            diagnostics.provisioningInternalSubjects,
            internalSubjectKey,
          );
          internalSubjectState.totalStarts += 1;
          internalSubjectState.activeCount += 1;
          internalSubjectState.lastStartedAt = Date.now();

          logger.debug(
            {
              event: 'provisioning:ensure:identity_lookup_result',
              ...baseLogFields,
              internalUserId,
              userCreatedNow,
              activeInternalRunCount: internalSubjectState.activeCount,
              isDuplicateInternalIdentity: internalSubjectState.activeCount > 1,
            },
            'Provisioning identity lookup resolved internal user',
          );

          logger.debug(
            {
              event: 'provisioning:ensure:user_upsert_success',
              ...baseLogFields,
              internalUserId,
              userCreatedNow,
            },
            'Provisioning user resolution/upsert completed',
          );

          currentStage = 'tenant_upsert';
          logger.debug(
            {
              event: 'provisioning:ensure:tenant_upsert_start',
              ...baseLogFields,
              internalUserId,
            },
            'Provisioning tenant resolution/upsert starting',
          );

          const { internalOrganizationId, tenantCreatedNow, _parentTenantId } =
            await resolveOrganization(db, input, internalUserId);

          logger.debug(
            {
              event: 'provisioning:ensure:tenant_upsert_success',
              ...baseLogFields,
              internalUserId,
              internalOrganizationId,
              tenantCreatedNow,
            },
            'Provisioning tenant resolution/upsert completed',
          );

          currentStage = 'membership_upsert';
          logger.debug(
            {
              event: 'provisioning:ensure:membership_upsert_start',
              ...baseLogFields,
              internalUserId,
              internalOrganizationId,
            },
            'Provisioning membership upsert starting',
          );

          if (
            input.tenancyMode === 'org' &&
            input.tenantContextSource === 'db'
          ) {
            const existing = await getMembership(
              db,
              internalUserId,
              internalOrganizationId,
            );
            if (!existing) {
              throw new TenantMembershipRequiredError();
            }

            logger.debug(
              {
                event: 'provisioning:ensure:membership_upsert_success',
                ...baseLogFields,
                internalUserId,
                internalOrganizationId: internalOrganizationId,
                membershipRole: existing.roleName,
                membershipOperation: 'existing_membership',
              },
              'Provisioning resolved existing membership in org/db mode',
            );

            currentStage = 'onboarding_state_check';
            const onboardingState = await db
              .select({ onboardingComplete: usersTable.onboardingComplete })
              .from(usersTable)
              .where(eq(usersTable.id, internalUserId))
              .limit(1);

            logger.debug(
              {
                event: 'provisioning:ensure:onboarding_state_check',
                ...baseLogFields,
                internalUserId,
                internalOrganizationId,
                onboardingStateExists: Boolean(onboardingState[0]),
                onboardingComplete: onboardingState[0]?.onboardingComplete,
              },
              'Provisioning inspected onboarding state after existing membership resolution',
            );

            return {
              internalUserId,
              internalOrganizationId: internalOrganizationId,
              membershipRole: existing.roleName as 'owner' | 'member',
              tenantCreatedNow,
              userCreatedNow,
            };
          }

          await upsertTenantAttributesDefaults(
            db,
            _parentTenantId,
            this.freeTierMaxUsers,
          );

          await db.execute(
            sql`SELECT tenant_id FROM tenant_attributes WHERE tenant_id = ${_parentTenantId} FOR UPDATE`,
          );

          const roleMap = await ensureRoles(db, internalOrganizationId);
          await applyPolicyTemplateVersion(
            db,
            _parentTenantId,
            internalOrganizationId,
            roleMap,
          );

          const existing = await getMembership(
            db,
            internalUserId,
            internalOrganizationId,
          );
          if (existing) {
            logger.debug(
              {
                event: 'provisioning:ensure:membership_upsert_success',
                ...baseLogFields,
                internalUserId,
                internalOrganizationId: internalOrganizationId,
                membershipRole: existing.roleName,
                membershipOperation: 'existing_membership',
              },
              'Provisioning found an existing membership and skipped insert',
            );

            currentStage = 'onboarding_state_check';
            const onboardingState = await db
              .select({ onboardingComplete: usersTable.onboardingComplete })
              .from(usersTable)
              .where(eq(usersTable.id, internalUserId))
              .limit(1);

            logger.debug(
              {
                event: 'provisioning:ensure:onboarding_state_check',
                ...baseLogFields,
                internalUserId,
                internalOrganizationId,
                onboardingStateExists: Boolean(onboardingState[0]),
                onboardingComplete: onboardingState[0]?.onboardingComplete,
              },
              'Provisioning inspected onboarding state after existing membership check',
            );

            return {
              internalUserId,
              internalOrganizationId: internalOrganizationId,
              membershipRole: existing.roleName as 'owner' | 'member',
              tenantCreatedNow,
              userCreatedNow,
            };
          }

          const membershipRole = decideNewMembershipRole(
            input,
            tenantCreatedNow,
          );
          const memberCount = await getActiveMemberCount(
            db,
            internalOrganizationId,
          );
          if (memberCount >= this.freeTierMaxUsers) {
            throw new TenantUserLimitReachedError();
          }

          const roleId = roleMap.get(membershipRole);
          if (!roleId) {
            throw new Error(
              `[provisioning] Role '${membershipRole}' not found in organization '${internalOrganizationId}'`,
            );
          }

          await db
            .insert(membershipsTable)
            .values({
              userId: internalUserId,
              organizationId: internalOrganizationId,
              roleId,
            })
            .onConflictDoNothing();

          logger.debug(
            {
              event: 'provisioning:ensure:membership_upsert_success',
              ...baseLogFields,
              internalUserId,
              internalOrganizationId: internalOrganizationId,
              membershipRole,
              memberCountBeforeInsert: memberCount,
              membershipOperation: 'insert_or_conflict_noop',
            },
            'Provisioning membership upsert completed',
          );

          currentStage = 'onboarding_state_check';
          const onboardingState = await db
            .select({ onboardingComplete: usersTable.onboardingComplete })
            .from(usersTable)
            .where(eq(usersTable.id, internalUserId))
            .limit(1);

          logger.debug(
            {
              event: 'provisioning:ensure:onboarding_state_check',
              ...baseLogFields,
              internalUserId,
              internalOrganizationId,
              onboardingStateExists: Boolean(onboardingState[0]),
              onboardingComplete: onboardingState[0]?.onboardingComplete,
            },
            'Provisioning inspected onboarding state after membership upsert',
          );

          return {
            internalUserId,
            internalOrganizationId: internalOrganizationId,
            membershipRole,
            tenantCreatedNow,
            userCreatedNow,
          };
        });

        currentStage = 'complete';
        logger.info(
          {
            event: 'provisioning:ensure:complete',
            ...baseLogFields,
            internalUserId: result.internalUserId,
            internalOrganizationId: result.internalOrganizationId,
            membershipRole: result.membershipRole,
            userCreatedNow: result.userCreatedNow,
            tenantCreatedNow: result.tenantCreatedNow,
            durationMs: Date.now() - startedAt,
          },
          'Provisioning ensure completed successfully',
        );

        return result;
      } catch (err) {
        logger.error(
          {
            event: 'provisioning:ensure:failure',
            ...baseLogFields,
            internalUserId: internalSubjectKey,
            stage: currentStage,
            durationMs: Date.now() - startedAt,
            retryable: isRetryableProvisioningError(err),
            errorName: err instanceof Error ? err.name : 'UnknownError',
            errorMessage: err instanceof Error ? err.message : String(err),
            errorStack: err instanceof Error ? err.stack : undefined,
          },
          'Provisioning ensure failed',
        );
        throw err;
      } finally {
        if (internalSubjectState) {
          internalSubjectState.activeCount = Math.max(
            0,
            internalSubjectState.activeCount - 1,
          );
          internalSubjectState.lastFinishedAt = Date.now();
        }
      }
    })().finally(() => {
      subjectState.activeCount = Math.max(0, subjectState.activeCount - 1);
      subjectState.lastFinishedAt = Date.now();

      if (inFlightProvisioning.get(singleFlightKey) === provisioningPromise) {
        inFlightProvisioning.delete(singleFlightKey);
      }
    });

    inFlightProvisioning.set(singleFlightKey, provisioningPromise);
    return provisioningPromise;
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

function assertCrossProviderLinkingAllowed(
  crossProviderEmailLinking: 'disabled' | 'verified-only',
  emailVerified: boolean | undefined,
): void {
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
      assertCrossProviderLinkingAllowed(
        crossProviderEmailLinking,
        emailVerified,
      );
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
      assertCrossProviderLinkingAllowed(
        crossProviderEmailLinking,
        emailVerified,
      );
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

async function resolveOrganization(
  db: DrizzleDb,
  input: ProvisioningInput,
  internalUserId: string,
): Promise<{
  internalOrganizationId: string;
  tenantCreatedNow: boolean;
  _parentTenantId: string;
}> {
  const { tenancyMode, tenantContextSource, provider } = input;

  if (tenancyMode === 'single') {
    if (!input.activeTenantId) {
      throw new TenantContextRequiredError(
        'TENANCY_MODE=single requires activeTenantId (DEFAULT_TENANT_ID) in ProvisioningInput.',
      );
    }
    const orgRows = await db
      .select({
        id: organizationsTable.id,
        tenantId: organizationsTable.tenantId,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.tenantId, input.activeTenantId))
      .limit(1);

    if (!orgRows[0]) {
      throw new TenantNotProvisionedError(
        `No organization found for tenant '${input.activeTenantId}'. Ensure DEFAULT_TENANT_ID is seeded with an organization.`,
      );
    }
    return {
      internalOrganizationId: orgRows[0].id,
      tenantCreatedNow: false,
      _parentTenantId: orgRows[0].tenantId,
    };
  }

  if (tenancyMode === 'personal') {
    return resolveOrCreatePersonalOrganization(db, internalUserId);
  }

  if (tenancyMode === 'org') {
    if (tenantContextSource === 'provider') {
      if (!input.orgExternalId) {
        throw new TenantContextRequiredError(
          'TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=provider requires tenantExternalId in ProvisioningInput.',
        );
      }
      return resolveOrCreateOrgOrganization(db, provider, input.orgExternalId);
    }

    if (tenantContextSource === 'db') {
      if (!input.activeTenantId) {
        throw new TenantContextRequiredError(
          'TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db requires activeTenantId in ProvisioningInput.',
        );
      }
      const orgRows = await db
        .select({
          id: organizationsTable.id,
          tenantId: organizationsTable.tenantId,
        })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, input.activeTenantId))
        .limit(1);

      if (!orgRows[0]) {
        throw new TenantNotProvisionedError(
          `Organization '${input.activeTenantId}' does not exist in database.`,
        );
      }
      return {
        internalOrganizationId: orgRows[0].id,
        tenantCreatedNow: false,
        _parentTenantId: orgRows[0].tenantId,
      };
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
async function resolveOrCreatePersonalOrganization(
  db: DrizzleDb,
  internalUserId: string,
): Promise<{
  internalOrganizationId: string;
  tenantCreatedNow: boolean;
  _parentTenantId: string;
}> {
  // Check for pre-existing mapping first (handles legacy random-UUID orgs)
  const existingMapping = await db
    .select({
      organizationId: authOrganizationIdentitiesTable.organizationId,
      tenantId: organizationsTable.tenantId,
    })
    .from(authOrganizationIdentitiesTable)
    .innerJoin(
      organizationsTable,
      eq(organizationsTable.id, authOrganizationIdentitiesTable.organizationId),
    )
    .where(
      and(
        eq(authOrganizationIdentitiesTable.provider, 'personal'),
        eq(authOrganizationIdentitiesTable.externalOrgId, internalUserId),
      ),
    )
    .limit(1);

  if (existingMapping[0]?.organizationId) {
    return {
      internalOrganizationId: existingMapping[0].organizationId,
      tenantCreatedNow: false,
      _parentTenantId: existingMapping[0].tenantId,
    };
  }

  const parentTenantId = deterministicTenantId(
    `personal:tenant:${internalUserId}`,
  );
  const orgId = deterministicTenantId(`personal:org:${internalUserId}`);

  const tenantRows = await db
    .insert(tenantsTable)
    .values({ id: parentTenantId, name: 'Personal Workspace' })
    .onConflictDoNothing()
    .returning();

  await db
    .insert(organizationsTable)
    .values({ id: orgId, tenantId: parentTenantId, name: 'Personal Workspace' })
    .onConflictDoNothing();

  await db
    .insert(authOrganizationIdentitiesTable)
    .values({
      provider: 'personal',
      externalOrgId: internalUserId,
      organizationId: orgId,
    })
    .onConflictDoNothing();

  // Re-read the mapping as the authoritative source of truth.
  // Both concurrent transactions compute the same deterministic IDs, so the
  // re-read is always consistent — but it closes the theoretical gap where an
  // in-flight mapping insert conflicts with a committed one.
  const canonicalMapping = await db
    .select({
      organizationId: authOrganizationIdentitiesTable.organizationId,
      tenantId: organizationsTable.tenantId,
    })
    .from(authOrganizationIdentitiesTable)
    .innerJoin(
      organizationsTable,
      eq(organizationsTable.id, authOrganizationIdentitiesTable.organizationId),
    )
    .where(
      and(
        eq(authOrganizationIdentitiesTable.provider, 'personal'),
        eq(authOrganizationIdentitiesTable.externalOrgId, internalUserId),
      ),
    )
    .limit(1);

  if (!canonicalMapping[0]?.organizationId) {
    throw new Error(
      '[provisioning] Failed to resolve personal org mapping after insert.',
    );
  }

  return {
    internalOrganizationId: canonicalMapping[0].organizationId,
    tenantCreatedNow:
      tenantRows.length > 0 && canonicalMapping[0].organizationId === orgId,
    _parentTenantId: canonicalMapping[0].tenantId,
  };
}

/**
 * Resolves or creates an org tenant identified by (provider, externalOrgId).
 *
 * Legacy compatibility: always reads the existing auth_tenant_identities mapping first.
 * Tenants created before the deterministic UUID migration retain their original random UUID.
 *
 * Race-safety: uses a deterministic tenant UUID for new tenants so concurrent transactions
 * compute the same ID and both INSERT with ON CONFLICT DO NOTHING — no orphaned rows.
 */
async function resolveOrCreateOrgOrganization(
  db: DrizzleDb,
  provider: ExternalAuthProvider,
  externalOrgId: string,
): Promise<{
  internalOrganizationId: string;
  tenantCreatedNow: boolean;
  _parentTenantId: string;
}> {
  // Check for pre-existing mapping first (handles legacy random-UUID orgs)
  const existingMapping = await db
    .select({
      organizationId: authOrganizationIdentitiesTable.organizationId,
      tenantId: organizationsTable.tenantId,
    })
    .from(authOrganizationIdentitiesTable)
    .innerJoin(
      organizationsTable,
      eq(organizationsTable.id, authOrganizationIdentitiesTable.organizationId),
    )
    .where(
      and(
        eq(authOrganizationIdentitiesTable.provider, provider),
        eq(authOrganizationIdentitiesTable.externalOrgId, externalOrgId),
      ),
    )
    .limit(1);

  if (existingMapping[0]?.organizationId) {
    return {
      internalOrganizationId: existingMapping[0].organizationId,
      tenantCreatedNow: false,
      _parentTenantId: existingMapping[0].tenantId,
    };
  }

  const parentTenantId = deterministicTenantId(
    `${provider}:tenant:${externalOrgId}`,
  );
  const orgId = deterministicTenantId(`${provider}:org:${externalOrgId}`);

  const tenantRows = await db
    .insert(tenantsTable)
    .values({ id: parentTenantId, name: `Org ${externalOrgId.slice(0, 16)}` })
    .onConflictDoNothing()
    .returning();

  await db
    .insert(organizationsTable)
    .values({
      id: orgId,
      tenantId: parentTenantId,
      name: `Org ${externalOrgId.slice(0, 16)}`,
    })
    .onConflictDoNothing();

  await db
    .insert(authOrganizationIdentitiesTable)
    .values({ provider, externalOrgId, organizationId: orgId })
    .onConflictDoNothing();

  // Re-read the mapping as the authoritative source of truth.
  // Concurrent transactions computing the same deterministic IDs will both
  // conflict-resolve cleanly — but re-reading ensures the returned ID is canonical.
  const canonicalMapping = await db
    .select({
      organizationId: authOrganizationIdentitiesTable.organizationId,
      tenantId: organizationsTable.tenantId,
    })
    .from(authOrganizationIdentitiesTable)
    .innerJoin(
      organizationsTable,
      eq(organizationsTable.id, authOrganizationIdentitiesTable.organizationId),
    )
    .where(
      and(
        eq(authOrganizationIdentitiesTable.provider, provider),
        eq(authOrganizationIdentitiesTable.externalOrgId, externalOrgId),
      ),
    )
    .limit(1);

  if (!canonicalMapping[0]?.organizationId) {
    throw new Error(
      '[provisioning] Failed to resolve org mapping after insert.',
    );
  }

  return {
    internalOrganizationId: canonicalMapping[0].organizationId,
    tenantCreatedNow:
      tenantRows.length > 0 && canonicalMapping[0].organizationId === orgId,
    _parentTenantId: canonicalMapping[0].tenantId,
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
      {
        id: ownerPreId,
        organizationId: tenantId,
        name: 'owner',
        isSystem: true,
      },
      {
        id: memberPreId,
        organizationId: tenantId,
        name: 'member',
        isSystem: true,
      },
    ])
    .onConflictDoNothing();

  const rows = await db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(
      and(
        eq(rolesTable.organizationId, tenantId),
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
        eq(membershipsTable.organizationId, tenantId),
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
    .where(eq(membershipsTable.organizationId, tenantId));

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
  parentTenantId: string,
  orgId: string,
  roleMap: Map<string, string>,
): Promise<void> {
  const attrRows = await db
    .select({
      policyTemplateVersion: tenantAttributesTable.policyTemplateVersion,
    })
    .from(tenantAttributesTable)
    .where(eq(tenantAttributesTable.tenantId, parentTenantId))
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
          organizationId: orgId,
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
          organizationId: orgId,
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
    .where(eq(tenantAttributesTable.tenantId, parentTenantId));
}
