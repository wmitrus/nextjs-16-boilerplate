/**
 * Port: source of the currently active tenant ID in the request context.
 *
 * Used by OrgDbTenantResolver (TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db) to
 * determine which tenant the user is operating in for the current request.
 *
 * Implementations read the tenant ID from request-scoped headers or cookies.
 * INVARIANT: Returns an internal tenant UUID (already stored in DB).
 * Never creates tenants — pure read-path.
 */
export interface ActiveTenantContextSource {
  /**
   * Returns the active internal tenant ID for this request, or null if not set.
   */
  getActiveTenantId(): Promise<string | null>;
}
