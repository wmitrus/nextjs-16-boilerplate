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
