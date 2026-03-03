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
   * INVARIANT (Node/DB paths): When resolved via InternalIdentityLookup, always an
   * internal UUID from our database (users.id). Never an external provider ID.
   * Used exclusively for domain/security/authorization — never passed to provider SDKs.
   *
   * Edge context-only exception: In Edge middleware (proxy.ts) where no DB lookup is
   * configured, this field may temporarily hold the external provider ID for
   * authentication-presence checks only (is user authenticated?). Such paths MUST
   * have enforceResourceAuthorization: false and MUST NOT use identity.id for domain ops.
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

/**
 * Auth provider identifier — one of the supported external identity providers.
 * Used as a discriminant for identity mapping (provider + externalId => internalId).
 */
export type ExternalAuthProvider = 'clerk' | 'authjs' | 'supabase';

/**
 * Read-only lookup: resolves external provider IDs to internal database UUIDs.
 *
 * INVARIANT: Pure read-path — zero write side-effects (no INSERT/UPDATE/UPSERT).
 * Returns null when no mapping exists. Never auto-creates records.
 *
 * Write-path (create/link user, tenant, membership, role) belongs exclusively
 * to ProvisioningService.ensureProvisioned().
 */
export interface InternalIdentityLookup {
  /**
   * Looks up the internal user UUID for a given provider + external user ID pair.
   * Returns null if no mapping exists (user not yet provisioned).
   */
  findInternalUserId(
    provider: ExternalAuthProvider,
    externalUserId: string,
  ): Promise<string | null>;

  /**
   * Looks up the internal tenant UUID for a given provider + external tenant ID pair.
   * Returns null if no mapping exists (tenant not yet provisioned).
   */
  findInternalTenantId(
    provider: ExternalAuthProvider,
    externalTenantId: string,
  ): Promise<string | null>;

  /**
   * Looks up the personal tenant UUID for a given internal user UUID.
   * Used in TENANCY_MODE=personal where each user has exactly one personal tenant.
   * Returns null if no personal tenant has been provisioned for this user yet.
   */
  findPersonalTenantId(internalUserId: string): Promise<string | null>;
}
