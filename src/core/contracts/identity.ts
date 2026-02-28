/**
 * Identity model — minimal, stable representation of an authenticated principal.
 *
 * This interface:
 * - Documents the contract.
 * - Prevents future scope creep (“I’ll just add a role here because it’s easier”).
 * - Establishes a strict semantic boundary between authentication and all other domains.
 *
 * Forbidden fields:
 * - roles: string[]
 * - permissions: string[]
 * - tenantId: string
 * - onboardingComplete: boolean
 * - metadata: any
 *
 * Rationale:
 * - Identity ≠ Authorization
 * - Identity ≠ User
 * - Identity ≠ Tenant
 */

export interface Identity {
  /**
   * Unique authenticated principal identifier.
   * Must be stable across sessions.
   */
  readonly id: string;

  /**
   * Optional primary email associated with identity.
   * Not guaranteed to be verified.
   */
  readonly email?: string;
}

/**
 * Provider responsible for retrieving the currently authenticated principal.
 * Must not throw when unauthenticated.
 */
export interface IdentityProvider {
  /**
   * Returns currently authenticated principal. Or null if unauthenticated.
   * Must not throw if unauthenticated.
   */
  getCurrentIdentity(): Promise<Identity | null>;
}

/**
 * Raw data returned by an identity source.
 *
 * This is the primitive auth-provider data before it is mapped to domain types.
 * Must remain framework-agnostic — populated by infrastructure adapters (e.g. Clerk).
 */
export interface RequestIdentitySourceData {
  readonly userId?: string;
  readonly orgId?: string;
  readonly email?: string;
}

/**
 * Source of raw identity data for the current request.
 *
 * Implementations are infrastructure adapters (e.g. ClerkRequestIdentitySource).
 * The domain never calls auth() directly — it reads from this source.
 *
 * Designed to be request-scoped and injected into IdentityProvider and TenantResolver.
 */
export interface RequestIdentitySource {
  get(): Promise<RequestIdentitySourceData>;
}
