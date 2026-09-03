import { isCanonicalIdRepresentation } from './canonical-ids.provenance';

/**
 * OZI-71 §14a.10 — the ONE authoritative, evidence-only classifier that maps a
 * legacy scope value (`feature_flags.tenant_id` for FF·C, `audit_*.tenant_id`
 * for a future AUD·C) to a canonical `(organization_id, ownership_state)`
 * proposal.
 *
 * It is deliberately PURE and neutral:
 * - no `@/modules/**` import (no feature-flags, audit-log or auth infrastructure);
 * - no provider SDK type — a "provider" here is an opaque diagnostic string;
 * - every authoritative fact (does a `organizations.id` row exist? which
 *   internal organizations does this string map to via
 *   `auth_organization_identities`, across ALL providers? is it a real
 *   `tenants.id`? does NULL provably mean "global" for THIS source table?) is
 *   gathered by the caller and handed in as {@link LegacyOwnershipEvidence}.
 *
 * UUID syntax alone never classifies ownership; a provider external string is
 * never branded — only the internal `auth_organization_identities.organization_id`
 * it maps to, re-verified against `organizations`. The current runtime
 * `AUTH_PROVIDER` is NOT provenance for historical data.
 *
 * Two runtime-only outcomes are NOT produced here (they depend on the write
 * attempt): `canonical_collision_quarantined` and `concurrently_changed`. The
 * backfill orchestrator adds those.
 */

/** Stable reason codes. Later gates (e.g. FF·D) reason over these. */
export type LegacyOwnershipReason =
  // resolved -> a mutation is proposed
  | 'resolved_internal_organization' // Case B
  | 'resolved_provider_organization' // Case C (one provider)
  | 'resolved_multi_provider_organization' // Case C (>1 provider, all agree)
  | 'resolved_same_internal_and_provider' // Case D (internal + provider agree)
  | 'intentional_global_legacy_null' // Case A (NULL, proven global semantics)
  // unresolved -> row stays `unresolved_legacy`, no mutation, reported
  | 'ambiguous_internal_vs_provider' // Case D (internal vs provider disagree)
  | 'ambiguous_provider_evidence' // Case G (providers disagree among themselves)
  | 'stale_provider_mapping' // §6 — only signal is a mapping to a missing org
  | 'unresolved_tenant_id_only' // Case E — a real tenants.id, nothing more
  | 'unresolved_unknown_uuid' // Case F — UUID-shaped, matches nothing
  | 'unresolved_arbitrary_string' // Case F — not UUID-shaped, matches nothing
  | 'unresolved_null_semantics_not_proven'; // NULL, but this table has NOT proven NULL == global

/**
 * A `organizations` row proven to exist, with its authoritative parent tenant
 * read from `organizations.tenant_id` (never from the legacy column).
 */
export interface ResolvedOrganization {
  readonly organizationId: string;
  readonly parentTenantId: string;
}

/**
 * Whether the SOURCE TABLE has independently proven that a legacy `NULL`
 * historically meant the explicit platform-global / unowned value. Feature
 * Flags: `'proven_intentional_global'` (the legacy FF runtime establishes it,
 * plan §14a.2). A future AUD·C supplies its own independently-proven value —
 * never inherits the Feature Flag assumption.
 */
export type LegacyNullSemantics = 'proven_intentional_global' | 'not_proven';

/** One `auth_organization_identities` row consulted for the legacy value. */
export interface ProviderMappingEvidence {
  /** Opaque diagnostic only — NEVER used to break ties. */
  readonly provider: string;
  /** Raw `auth_organization_identities.organization_id`. */
  readonly mappedOrganizationId: string;
  /**
   * `mappedOrganizationId` re-verified against `organizations` (with its parent
   * tenant), or `null` when that organization no longer exists (a stale
   * mapping, §6).
   */
  readonly verified: ResolvedOrganization | null;
}

export interface LegacyOwnershipEvidence {
  /** The historical legacy scope value (`*.tenant_id`), verbatim. */
  readonly legacyValue: string | null;
  /** Whether `NULL` provably means "global" for this source table (Case A). */
  readonly nullSemantics: LegacyNullSemantics;
  /**
   * Case B — `legacyValue` is exactly a real `organizations.id` (parent tenant
   * loaded), else `null`.
   */
  readonly directInternalOrganization: ResolvedOrganization | null;
  /**
   * Cases C / D / G — EVERY `auth_organization_identities` row whose
   * `external_org_id` equals `legacyValue`, across all providers.
   */
  readonly providerMappings: readonly ProviderMappingEvidence[];
  /**
   * Case E — `legacyValue` is a real `tenants.id` row. Only meaningful when
   * {@link directInternalOrganization} is `null`.
   */
  readonly isKnownTenantId: boolean;
}

export interface LegacyOwnershipClassification {
  readonly proposedOwnershipState:
    | 'canonical_organization'
    | 'intentional_global'
    | 'unresolved_legacy';
  readonly organizationId: string | null;
  readonly parentTenantId: string | null;
  readonly reason: LegacyOwnershipReason;
  /** Whether the classifier proposes a row mutation (`false` == report only). */
  readonly mutates: boolean;
}

function resolved(
  org: ResolvedOrganization,
  reason: LegacyOwnershipReason,
): LegacyOwnershipClassification {
  return {
    proposedOwnershipState: 'canonical_organization',
    organizationId: org.organizationId,
    parentTenantId: org.parentTenantId,
    reason,
    mutates: true,
  };
}

function unresolved(
  reason: LegacyOwnershipReason,
): LegacyOwnershipClassification {
  return {
    proposedOwnershipState: 'unresolved_legacy',
    organizationId: null,
    parentTenantId: null,
    reason,
    mutates: false,
  };
}

/**
 * Reduce the (possibly plural) provider mappings to a single verified
 * organization, or flag conflict / stale-only.
 */
function reduceProviderEvidence(mappings: readonly ProviderMappingEvidence[]): {
  readonly org: ResolvedOrganization | null;
  readonly conflict: boolean; // >1 DISTINCT verified organization
  readonly staleOnly: boolean; // mappings exist but none verify
} {
  const verified = mappings
    .map((m) => m.verified)
    .filter((v): v is ResolvedOrganization => v !== null);
  const distinct = new Set(verified.map((v) => v.organizationId));
  return {
    org: distinct.size === 1 ? verified[0]! : null,
    conflict: distinct.size > 1,
    staleOnly: mappings.length > 0 && verified.length === 0,
  };
}

/** Classify one historical row's evidence. See plan §14a.10. */
export function classifyLegacyOwnership(
  evidence: LegacyOwnershipEvidence,
): LegacyOwnershipClassification {
  // Case A — legacy NULL. Only global when THIS table's NULL semantics are
  // independently proven; otherwise it is unresolved, not global.
  if (evidence.legacyValue === null) {
    return evidence.nullSemantics === 'proven_intentional_global'
      ? {
          proposedOwnershipState: 'intentional_global',
          organizationId: null,
          parentTenantId: null,
          reason: 'intentional_global_legacy_null',
          mutates: true,
        }
      : unresolved('unresolved_null_semantics_not_proven');
  }

  const direct = evidence.directInternalOrganization;
  const providers = reduceProviderEvidence(evidence.providerMappings);
  const verifiedProviderOrgs = evidence.providerMappings
    .map((m) => m.verified)
    .filter((v): v is ResolvedOrganization => v !== null);

  // Case D — direct internal evidence AND at least one provider mapping.
  if (direct !== null && evidence.providerMappings.length > 0) {
    const anyProviderDisagrees =
      providers.conflict ||
      verifiedProviderOrgs.some(
        (o) => o.organizationId !== direct.organizationId,
      );
    if (anyProviderDisagrees) {
      // §3 — ANY valid provider evidence naming a different org fails closed.
      return unresolved('ambiguous_internal_vs_provider');
    }
    if (verifiedProviderOrgs.length > 0) {
      return resolved(direct, 'resolved_same_internal_and_provider');
    }
    // Only stale provider mappings alongside a clean internal match.
    return resolved(direct, 'resolved_internal_organization');
  }

  // Case B — internal id only.
  if (direct !== null) {
    return resolved(direct, 'resolved_internal_organization');
  }

  // Provider evidence only.
  if (providers.conflict) {
    // §3 — multiple providers map the same string to DIFFERENT organizations.
    return unresolved('ambiguous_provider_evidence');
  }
  if (providers.org !== null) {
    return resolved(
      providers.org,
      verifiedProviderOrgs.length > 1
        ? 'resolved_multi_provider_organization'
        : 'resolved_provider_organization',
    );
  }
  if (providers.staleOnly) {
    return unresolved('stale_provider_mapping');
  }

  // Case E — a real `tenants.id` and nothing else. Cardinality is not provenance.
  if (evidence.isKnownTenantId) {
    return unresolved('unresolved_tenant_id_only');
  }

  // Case F — no authoritative match at all.
  return unresolved(
    isCanonicalIdRepresentation(evidence.legacyValue)
      ? 'unresolved_unknown_uuid'
      : 'unresolved_arbitrary_string',
  );
}
