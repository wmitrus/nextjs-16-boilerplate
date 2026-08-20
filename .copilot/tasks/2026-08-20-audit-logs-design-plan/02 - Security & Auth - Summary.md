# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-08-20-audit-logs-design-plan`
- Task Objective: Implement Phase 1 (audit-log category settings: schema, admin CRUD, admin API route, admin toggle UI).
- Current Run Scope: authorization/tenancy correctness of the new admin route and CRUD service.
- Status: COMPLETED
- Last Updated: 2026-08-20
- Related Control Artifacts: `plan.md`, `01 - Architecture Guard - Summary.md`

## Scope Handled

- auth surfaces reviewed: `isEnvBasedPlatformAdmin` fallback, ABAC via `AuthorizationService.can()`
- authorization surfaces reviewed: `RESOURCES.SECURITY` / `ACTIONS.SECURITY_READ_AUDIT` (existing), new `ACTIONS.SECURITY_MANAGE_AUDIT_SETTINGS`
- trust-boundary questions in scope: whether an ABAC-authorized (non-platform-admin) caller can read/write another tenant's or the global category settings

## Inputs Reviewed

- code paths reviewed: `src/app/api/admin/feature-flags/route.ts`, `src/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService.ts`, `docs/ai/general/SECURITY_CODING_PATTERNS.md` (SEC-26 entry in full), `src/modules/provisioning/policy/templates.ts`
- security/auth docs reviewed: SEC-26 ("ABAC Action Checks Must Also Constrain Resource Scope, Not Just Action Type") — full dangerous-pattern / correct-pattern / required-validation text
- earlier task artifacts reviewed: `plan.md` Part A.5

## Actions Performed

- identity flow tracing performed: confirmed the route will use `withNodeProvisioning` (same as `feature-flags` route) to get a verified `access.user.id` / `access.tenant.tenantId` before any authorization check
- authorization enforcement review performed: confirmed the two-grant-shape pattern (`isEnvBasedPlatformAdmin` unscoped vs. `authzService.can()` tenant-scoped) must be distinguished explicitly, not collapsed into one boolean
- tenant / org context review performed: designed `AuditSettingsAdminService.upsert`/`resetToDefault` to take an explicit `MutationScope` (`{ tenantId } | null`), mirroring `DrizzleFeatureFlagAdminService` exactly
- sensitive-data exposure review performed: settings rows carry no PII (category enum, booleans, integers, an admin's own `updatedByUserId`) — no redaction requirement for this table, unlike the future `audit_events` table

## Current-State Findings

- Confirmed: SEC-26 is a real, previously-shipped defect class in this exact admin-CRUD shape (feature-flags PR #70, fixed as a follow-up) — the new route must not repeat it.
- Confirmed: the repo's now-settled fix pattern for SEC-26 is to **derive** the tenant scope from `access.tenant.tenantId` for a non-platform-admin caller rather than reject a mismatched client-supplied value (see `feature-flags/route.ts` POST handler and its SEC-26-regression tests) — the new route follows the same derive-don't-reject shape for consistency with the rest of the admin surface.
- Risks: none novel — this is a faithful application of an already-validated pattern, not new territory.
- Drift: none.

## Trust Boundary Assessment

- where identity is established: `resolveNodeProvisioningAccess()` inside `withNodeProvisioning`, before the route body runs (unchanged from `feature-flags`).
- where authorization is enforced: server-side, in the route handler, via `isEnvBasedPlatformAdmin(email)` OR `authzService.can({ resource: { type: RESOURCES.SECURITY, id: 'admin-panel' }, action })`.
- where tenant or org context is derived: `access.tenant.tenantId` (server-verified), never the request body, for any non-platform-admin caller.
- what claims or inputs are trusted: only `access.*` (server-derived) is trusted for scope; the request body's `tenantId` is accepted only for a verified platform admin, and is otherwise silently overridden — never used to reject-vs-allow branching that could leak whether a foreign tenant's row exists.

## Sensitive Data And Exposure Notes

- logging / telemetry review: the route's `logger.info()` call logs `event`, `adminId`, `tenantId`, `category` — no raw error objects (SEC-10-compliant), no secrets.
- response exposure review: `AuditSettingDto` exposes only category/scope/enabled/retention/sampleRate/timestamps/`updatedByUserId` — no cross-tenant leakage since `listEffectiveForTenant` only ever returns the caller's own tenant's override plus the global default row.
- client exposure review: `AuditSettingsClient.tsx` receives exactly the same DTO shape as the server returns — no additional server-only fields need stripping.
- cache exposure review: route uses `await connection()` (dynamic, per-request) — no caching of tenant-sensitive settings data.

## Security Decisions / Constraints

- approved controls or constraints:
  - GET gated by `ACTIONS.SECURITY_READ_AUDIT` (existing action, already granted in the admin template) OR `isEnvBasedPlatformAdmin`.
  - PATCH/DELETE gated by the new `ACTIONS.SECURITY_MANAGE_AUDIT_SETTINGS` OR `isEnvBasedPlatformAdmin`.
  - Non-platform-admin caller's `tenantId` is always derived from `access.tenant.tenantId`, never trusted from the request body (SEC-26).
  - `DrizzleAuditLogSettingsAdminService.upsert()`/`resetToDefault()` re-validate the scope server-side (defense in depth) even though the route already derives it — matches AGENTS.md's "never trust a single enforcement layer" posture.
  - `retentionDays` bounded server-side to `[7, 730]`; `sampleRate` bounded to `[0, 1]` or `null` — both in the Zod schema at the route **and** in the service (defense in depth, since the service is a reusable unit that must not depend solely on the route's validation).
- rejected directions: trusting an ABAC `can()` grant alone as sufficient authorization for a client-supplied `tenantId` (the exact SEC-26 anti-pattern) — rejected.
- required enforcement points: route handler (primary), `DrizzleAuditLogSettingsAdminService` (defense in depth for scope + numeric bounds).

## Artifact Synchronization

- `plan.md` updates: none beyond the Architecture Guard's route-path correction; the authorization design already matched what's proposed here.
- `intake.md` updates: none.
- `implementation-plan.md` updates: n/a.
- specialist artifact updates: this file created.

## Open Questions / Blockers

- unresolved questions: none for Phase 1.
- blockers: none.
- evidence still needed: a SEC-26-shaped regression test (ABAC-authorized-but-not-platform-admin caller supplying a foreign/global `tenantId` must be rejected/derived, not merely "no grant → 403") is **required** before this is considered done — tracked in the route test file.

## Handoff Notes

- what the next agent should rely on: the derive-don't-reject SEC-26 pattern is settled; implement it exactly as in `feature-flags/route.ts`, not a variant.
- what should not be re-decided without new evidence: the GET/PATCH action split (`SECURITY_READ_AUDIT` vs. `SECURITY_MANAGE_AUDIT_SETTINGS`).
- recommended next specialist or step: Next.js Runtime review (route/page placement, `connection()` usage, `cacheComponents` constraints), then Implementation.

## Update Log

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 1 implementation kickoff
- Summary of change: SEC-26 pattern re-confirmed applicable and mapped onto the new route/service design.
- Sections refreshed: all
