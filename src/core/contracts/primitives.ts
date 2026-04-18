/**
 * Unique identifier of an authenticated subject (user, service, system).
 */
export type SubjectId = string;

/**
 * Unique identifier of a tenant (top-level isolation boundary).
 */
export type TenantId = string;

/**
 * Unique identifier of an organization (operational unit within a tenant).
 * Phase 2+: canonical identifier for membership, roles, policies, and provisioning.
 */
export type OrganizationId = string;

/**
 * Identifier of a role within an organization boundary.
 */
export type RoleId = string;
