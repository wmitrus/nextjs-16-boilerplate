import type { OrganizationId, TenantId, UserId } from './canonical-ids';

/**
 * OZI-71 FF·D — the canonical, provider-neutral scope a feature-flag
 * evaluation runs under.
 *
 * `organization` carries BOTH `organizationId` and its authoritative parent
 * `tenantId` — the tuple is proven valid (an `organizations` row where
 * `id = organizationId AND tenant_id = tenantId`) by the DB provider BEFORE
 * either a canonical organization override or an `intentional_global`
 * fallback may match (plan §14a.7). `platform-global` carries no tenant or
 * organization id and resolves only `intentional_global` rows.
 */
export type FeatureFlagScope =
  | {
      readonly kind: 'organization';
      readonly organizationId: OrganizationId;
      readonly tenantId: TenantId;
    }
  | { readonly kind: 'platform-global' };

/**
 * What a rollout/targeting provider (e.g. GrowthBook) hashes/buckets on.
 * `system` is for platform-level callers with no authenticated user (the
 * operational switch) — `systemSubjectId` is a stable, explicit value, never
 * a fabricated tenant/org id.
 */
export type FeatureFlagSubject =
  | { readonly kind: 'user'; readonly userId: UserId }
  | { readonly kind: 'system'; readonly systemSubjectId: string };

/**
 * Provider-neutral evaluation context. `scope` is the DB provider's
 * containment key; `subject` is what a targeting provider hashes on;
 * `attributes` are optional additional provider-neutral facts — NEVER
 * authority. Nothing here may carry a provider SDK type.
 */
export interface FeatureFlagEvaluationContext {
  readonly scope: FeatureFlagScope;
  readonly subject: FeatureFlagSubject;
  readonly attributes?: Record<string, unknown>;
}

/**
 * Contract for feature flag evaluation.
 *
 * FAIL-SAFE GUARANTEE:
 * Implementations registered via the factory are wrapped in ResilientFeatureFlagService.
 * `isEnabled()` MUST NEVER reject — any infrastructure error (DB unreachable, table
 * missing, SDK timeout, etc.) returns `false` (the "off" state) and logs a warning.
 *
 * Callers must NOT wrap flag evaluation in try/catch. The contract guarantees safety.
 * Missing flags always return `false`.
 */
export interface FeatureFlagService {
  isEnabled(
    flag: string,
    context: FeatureFlagEvaluationContext,
  ): Promise<boolean>;
}
