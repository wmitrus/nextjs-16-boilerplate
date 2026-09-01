/**
 * Canonical, compile-time-distinct domain identity primitives for the
 * OZI-71 tenant/organization architecture (Phase 1).
 *
 * Authoritative design:
 * `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md`
 * §6-§7 and §13 (invariant #9).
 *
 * These types are ADDITIVE. They deliberately do NOT replace the legacy
 * string aliases in `./primitives.ts` (`TenantId` / `OrganizationId` /
 * `SubjectId` / `RoleId` = `string`), which remain authoritative for every
 * existing runtime consumer for the duration of the OZI-71 migration.
 *
 * The import path is the migration boundary:
 * - existing runtime code keeps importing identity types from `./primitives`;
 * - new OZI-71 canonical contracts import identity types only from here.
 *
 * Later OZI-71 slices migrate consumers deliberately, module by module
 * (plan §16 Slices 3-4); the legacy aliases are retired only once no
 * consumer reads them (plan §16 Slice 9). Until then the two modules
 * coexisting — a branded `TenantId` here and a `string` `TenantId` in
 * `./primitives` — is the intended, temporary transitional state.
 *
 * Semantics (mandatory):
 * - `TenantId`       — internal tenant identity; represents `tenants.id`.
 *                      Never implicitly interchangeable with `OrganizationId`.
 * - `OrganizationId` — internal organization identity; represents
 *                      `organizations.id`. Belongs to exactly one tenant
 *                      (`organizations.tenant_id`, strict 1:N). Never
 *                      implicitly interchangeable with `TenantId`.
 * - `UserId`         — internal application user identity. Narrower than the
 *                      legacy `SubjectId` (which also covers service and
 *                      system subjects). `SubjectId` is unchanged and is NOT
 *                      aliased to this. Distinct from external provider user
 *                      ids.
 *
 * Slice 1 defines the types only. No constructors / parsers / casts are
 * provided: there is no runtime consumer of the canonical ids yet, so there
 * is no representation boundary to cross. Slice 2 introduces the first real
 * construction/derivation boundary and decides there, from concrete
 * provenance (raw DB values, authenticated user ids, organization ids), how
 * a raw value becomes a canonical id — with the distinction that
 * representation validation is not authority.
 */

// Ambient brand key: `declare` means it has no runtime existence — `Brand<T>`
// is a purely compile-time intersection. Never exported.
declare const canonicalIdBrand: unique symbol;

type Brand<T, B extends string> = T & {
  readonly [canonicalIdBrand]: B;
};

export type TenantId = Brand<string, 'TenantId'>;
export type OrganizationId = Brand<string, 'OrganizationId'>;
export type UserId = Brand<string, 'UserId'>;
