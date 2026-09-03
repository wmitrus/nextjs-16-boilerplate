export class DuplicateFeatureFlagError extends Error {
  readonly code = 'DUPLICATE_FEATURE_FLAG';
  constructor(
    message = 'A feature flag with this key already exists for this scope',
  ) {
    super(message);
    this.name = 'DuplicateFeatureFlagError';
  }
}

export class FeatureFlagNotFoundError extends Error {
  readonly code = 'FEATURE_FLAG_NOT_FOUND';
  constructor(message = 'Feature flag not found') {
    super(message);
    this.name = 'FeatureFlagNotFoundError';
  }
}

/**
 * OZI-71 FF·B — a server-side contradiction encountered while constructing or
 * persisting a canonical Feature Flag write. Examples:
 * - authoritative organization resolution contradiction;
 * - ambiguous ordinary organization evidence (internal id and provider mapping
 *   name different organizations);
 * - a stale authoritative provider mapping (points at a missing organization);
 * - a canonical/legacy semantic mismatch (canonical global vs the legacy
 *   `tenant_id IS NULL` global classification, in either direction);
 * - the same-statement `(organization_id, tenant_id)` tuple proof matching
 *   zero `organizations` rows (invariant #11).
 *
 * Never a client authorization outcome and deliberately identifier-free. It
 * fails closed (no row written, never re-attributed as `intentional_global`)
 * and surfaces as the generic 500 through the established error handler —
 * unless a caller explicitly maps a separate typed resolution outcome such as
 * the platform-target 422.
 */
export class FeatureFlagCanonicalWriteInvariantError extends Error {
  readonly code = 'FEATURE_FLAG_CANONICAL_WRITE_INVARIANT';
  constructor(message = 'Feature flag canonical write invariant violated') {
    super(message);
    this.name = 'FeatureFlagCanonicalWriteInvariantError';
  }
}
