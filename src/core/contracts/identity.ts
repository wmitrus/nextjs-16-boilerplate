/**
 * Identity model — minimal, stable representation of an authenticated principal.
 *
 * This interface:
 * - Documents the contract.
 * - Prevents future scope creep ("I'll just add a role here because it's easier").
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
   * INVARIANT: Always an internal UUID from our database (users.id).
   * Never an external provider ID (e.g. Clerk user_xxx).
   * Used exclusively for domain/security/authorization — never passed to provider SDKs.
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
 * Raw data returned by an identity source (auth provider claims).
 *
 * INVARIANT: All fields are external provider claims — never internal DB IDs.
 * - userId: external user ID from the provider (e.g. Clerk user_xxx)
 * - email: email claim from the provider session
 * - tenantExternalId: external organization/tenant ID from the provider (e.g. Clerk org_xxx)
 * - tenantRole: role claim from the provider (e.g. 'org:admin', 'org:member')
 *
 * Must remain framework-agnostic — populated by infrastructure adapters (e.g. Clerk).
 * Internal UUIDs are resolved separately via InternalIdentityLookup.
 */
export interface RequestIdentitySourceData {
  readonly userId?: string;
  readonly email?: string;
  readonly tenantExternalId?: string;
  readonly tenantRole?: string;
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

/**
 * Thrown when an authenticated user has no internal provisioned record.
 * The user exists in the auth provider but has not yet completed onboarding/provisioning.
 * Read-path resolvers must throw this — never auto-create records.
 */
export class UserNotProvisionedError extends Error {
  constructor(message = 'User is not provisioned. Complete onboarding first.') {
    super(message);
    this.name = 'UserNotProvisionedError';
  }
}

/**
 * Thrown when the tenant context cannot be resolved to an internal tenant record.
 * The tenant exists externally (or is expected) but has no internal provisioned mapping.
 * Read-path resolvers must throw this — never auto-create records.
 */
export class TenantNotProvisionedError extends Error {
  constructor(
    message = 'Tenant is not provisioned. Complete onboarding first.',
  ) {
    super(message);
    this.name = 'TenantNotProvisionedError';
  }
}
