import 'server-only';

import {
  internalOrganizationIdFromOrgRow,
  isCanonicalIdRepresentation,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';
import type { ExternalAuthProvider } from '@/core/contracts/identity';
import type { DrizzleDb } from '@/core/db/types';

import { DrizzleInternalIdentityLookup } from '@/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup';
import { DrizzleOrganizationScopeAuthority } from '@/modules/authorization/infrastructure/drizzle/DrizzleOrganizationScopeAuthority';
import { FeatureFlagCanonicalWriteInvariantError } from '@/modules/feature-flags/domain/errors';
import type { CanonicalFeatureFlagWriteFacts } from '@/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService';

/**
 * OZI-71 FF·B — the ONE server-only composition seam that turns an
 * already-authorized Feature Flag create into the canonical ownership facts
 * `DrizzleFeatureFlagAdminService.create` persists alongside the legacy
 * `tenant_id`. It answers only "which internal organization is this, and what
 * is its authoritative parent tenant?" — never "may this caller mutate
 * feature flags?" (that is settled upstream by `checkAdminAccess` +
 * `withAdminStepUp`).
 *
 * Lives in `src/app` (composition layer), so it may wire `@/core` ports to
 * their `@/modules` Drizzle adapters and hand the feature-flags module a
 * branded fact. It introduces no `feature-flags -> auth`/`-> authorization`
 * module edge and no `security -> modules` edge (plan §14a.13). Mirrors
 * `src/app/api/admin/users/users-admin-scope.ts`.
 *
 * Resolution rule (plan §14a.4): the candidate's provenance is NOT assumed.
 * Both an internal-id verification AND a provider external-org mapping lookup
 * are attempted for EVERY organization-owned write (ordinary and platform
 * alike); a value is never branded by UUID shape alone, and the parent tenant
 * is ALWAYS read independently from `organizations.tenant_id` for the proven
 * organization row (never a legacy `TenantContext` field).
 */

export type CanonicalFeatureFlagWriteResolution =
  | {
      readonly outcome: 'resolved';
      readonly facts: CanonicalFeatureFlagWriteFacts;
    }
  /**
   * A platform admin targeted an organization that resolves to no authoritative
   * internal `organizations.id` (unknown id, absent provider mapping, a bare
   * `tenants.id`) or to two DIFFERENT organizations (ambiguous evidence). The
   * route maps this to 422 and writes nothing. A *stale* provider mapping
   * (points at a missing org row) is a server data contradiction and throws
   * {@link FeatureFlagCanonicalWriteInvariantError} instead (generic 500).
   */
  | { readonly outcome: 'unresolvable-organization-target' };

export interface ResolveCanonicalFeatureFlagWriteInput {
  /** Server-verified platform-admin capability (never client-derived). */
  readonly isPlatformAdmin: boolean;
  /**
   * The ordinary (non-platform-admin) caller's server-resolved active
   * organization id (`access.tenant.organizationId`). Its provenance is NOT
   * assumed: it is resolved through the same authoritative candidate evidence
   * as a platform target — a verified internal `organizations.id`, OR a
   * provider external org id with a valid `auth_organization_identities`
   * mapping (degraded legacy resolution can leave one here). Anything else
   * fails closed.
   */
  readonly ordinaryActiveOrganizationId: string;
  /**
   * A platform admin's explicit target: `null` == an explicit platform-global
   * create; a non-empty string == an organization-targeted create whose
   * candidate provenance is ambiguous (internal id, provider external org id,
   * or neither) and is resolved against authoritative state below.
   */
  readonly platformTargetOrganizationId: string | null;
  readonly db: DrizzleDb;
  /** The configured external auth provider, for `auth_organization_identities` lookups. */
  readonly authProvider: ExternalAuthProvider;
}

export async function resolveCanonicalFeatureFlagWrite(
  input: ResolveCanonicalFeatureFlagWriteInput,
): Promise<CanonicalFeatureFlagWriteResolution> {
  const authority = new DrizzleOrganizationScopeAuthority(input.db);

  if (!input.isPlatformAdmin) {
    return {
      outcome: 'resolved',
      facts: await resolveOrdinaryOrganization(
        input.ordinaryActiveOrganizationId,
        input.authProvider,
        input.db,
        authority,
      ),
    };
  }

  if (input.platformTargetOrganizationId === null) {
    // Explicit platform-global create. Platform-admin capability alone never
    // converts an unresolved organization target into global (§7): this
    // branch is reached only for an explicit `tenantId: null` request.
    return { outcome: 'resolved', facts: { kind: 'global' } };
  }

  return resolvePlatformOrganizationTarget(
    input.platformTargetOrganizationId,
    input.authProvider,
    input.db,
    authority,
  );
}

type OrganizationFacts = Extract<
  CanonicalFeatureFlagWriteFacts,
  { kind: 'organization' }
>;

/**
 * Authoritative candidate-evidence resolution (plan §14a.4) — identical for the
 * ordinary and the platform-targeted path. The two disagree only on how a
 * non-`resolved` outcome is surfaced (invariant vs 422), which is the caller's
 * job.
 *
 * - `resolved`   — exactly one of the two evidence paths matched, or both
 *   matched the SAME organization.
 * - `unresolved` — no authoritative evidence at all (not an internal
 *   `organizations.id`, and no provider mapping).
 * - `ambiguous`  — internal-id evidence and provider-mapping evidence name
 *   DIFFERENT organizations. Never resolved by precedence (§14a.10 Case
 *   D-different).
 *
 * A provider mapping that resolves to a non-existent `organizations` row throws
 * {@link FeatureFlagCanonicalWriteInvariantError} directly (server data
 * contradiction — never a 422, on either path).
 */
type CandidateEvidence =
  | { readonly kind: 'resolved'; readonly facts: OrganizationFacts }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'ambiguous' };

async function resolveCandidateEvidence(
  candidate: string,
  authProvider: ExternalAuthProvider,
  db: DrizzleDb,
  authority: DrizzleOrganizationScopeAuthority,
): Promise<CandidateEvidence> {
  // Path 1 — the candidate is claimed to be an internal `organizations.id`.
  const internalMatch = await verifyInternalOrganization(candidate, authority);

  // Path 2 — the candidate is a provider external organization identity.
  const lookup = new DrizzleInternalIdentityLookup(db);
  const providerMappedId = await lookup.findInternalOrganizationId(
    authProvider,
    candidate,
  );
  const providerMatch =
    providerMappedId === null
      ? null
      : await verifyInternalOrganization(providerMappedId, authority);

  if (providerMappedId !== null && providerMatch === null) {
    // A provider mapping exists but points at no `organizations` row — a
    // server-side data contradiction, not a client error. Fail closed.
    throw new FeatureFlagCanonicalWriteInvariantError();
  }

  if (internalMatch === null && providerMatch === null) {
    return { kind: 'unresolved' };
  }

  if (
    internalMatch !== null &&
    providerMatch !== null &&
    internalMatch.organizationId !== providerMatch.organizationId
  ) {
    return { kind: 'ambiguous' };
  }

  // Exactly one path matched, or both matched the same organization.
  const facts = internalMatch ?? providerMatch;
  if (facts === null) {
    // Unreachable: the both-null case returned `unresolved` above.
    throw new FeatureFlagCanonicalWriteInvariantError();
  }
  return { kind: 'resolved', facts };
}

/**
 * Ordinary org-context writer. Runs the shared authoritative candidate
 * evidence. `unresolved` (CF-1's mis-seeded `tenants.id`, an unknown UUID, an
 * unmapped external id) and `ambiguous` (internal/provider evidence disagree)
 * are both a server-side working-context contradiction for an ordinary caller
 * — FAIL CLOSED: never `organization_id = NULL`, never `intentional_global`,
 * never `{ kind: 'global' }`.
 */
async function resolveOrdinaryOrganization(
  candidate: string,
  authProvider: ExternalAuthProvider,
  db: DrizzleDb,
  authority: DrizzleOrganizationScopeAuthority,
): Promise<CanonicalFeatureFlagWriteFacts> {
  const evidence = await resolveCandidateEvidence(
    candidate,
    authProvider,
    db,
    authority,
  );
  if (evidence.kind === 'resolved') {
    return evidence.facts;
  }
  throw new FeatureFlagCanonicalWriteInvariantError();
}

async function resolvePlatformOrganizationTarget(
  candidate: string,
  authProvider: ExternalAuthProvider,
  db: DrizzleDb,
  authority: DrizzleOrganizationScopeAuthority,
): Promise<CanonicalFeatureFlagWriteResolution> {
  const evidence = await resolveCandidateEvidence(
    candidate,
    authProvider,
    db,
    authority,
  );
  if (evidence.kind === 'resolved') {
    return { outcome: 'resolved', facts: evidence.facts };
  }
  // `unresolved` or `ambiguous` -> a client-facing validation outcome; the
  // route returns 422 and writes nothing. (A stale provider mapping already
  // threw the invariant inside `resolveCandidateEvidence`.)
  return { outcome: 'unresolvable-organization-target' };
}

/**
 * `candidate` -> a branded canonical `{ organizationId, tenantId }` iff it is
 * a real `organizations.id` row, else `null`. UUID shape is checked first ONLY
 * to keep a non-UUID string from reaching a `uuid`-typed SQL predicate; it is
 * never itself treated as proof of provenance. The parent tenant is the value
 * read from `organizations.tenant_id` for THAT row.
 */
async function verifyInternalOrganization(
  candidate: string,
  authority: DrizzleOrganizationScopeAuthority,
): Promise<OrganizationFacts | null> {
  if (!isCanonicalIdRepresentation(candidate)) {
    return null;
  }

  const parentTenantId = await authority.readParentTenantId(candidate);
  if (parentTenantId === null) {
    return null;
  }

  return {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(candidate),
    tenantId: parentTenantIdFromOrgRow(parentTenantId),
  };
}
