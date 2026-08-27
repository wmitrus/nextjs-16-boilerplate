# 02 - Security & Auth - Summary

## Task Context

- Task ID: OZI-77
- Task Objective: contain sibling-organization administration for non-platform actors
- Current Run Scope: pre-implementation trust-boundary review
- Status: COMPLETED
- Last Updated: 2026-08-27
- Related Control Artifacts: `plan.md`, `intake.md`, `constraints.md`, `implementation-plan.md`

## Scope Handled

- auth surfaces reviewed: `withNodeProvisioning`, admin layout, env platform-admin grant
- authorization surfaces reviewed: organization access helpers, read/status services, downstream role/member/policy/invitation routes
- trust-boundary questions in scope: active organization, requested organization/resource IDs, platform-admin distinction

## Inputs Reviewed

- code paths reviewed: organization admin routes/pages/services/tests and platform-admin guard
- security/auth docs reviewed: SEC-23, SEC-26, SEC-41 and the repository Security/Auth skill
- earlier task artifacts reviewed: OZI-77 brief and Phase 0 plan

## Actions Performed

- identity flow tracing performed: yes
- authorization enforcement review performed: yes
- tenant / org context review performed: yes
- sensitive-data exposure review performed: yes; no new response/log/cache exposure is required

## Current-State Findings

- Confirmed: env platform admin and organization-scoped ABAC are collapsed into a boolean by organization helpers.
- Confirmed: the read and status services expand an active organization into its parent tenant and accept sibling targets.
- Risks: an action-authorized owner of Organization A can reach Organization B under the same tenant.
- Drift: `platform-admin.ts` explicitly requires `{ allowed, isPlatformAdmin }`, but organization routes currently retain only a boolean.

## Trust Boundary Assessment

- where identity is established: `withNodeProvisioning` for API routes; provisioning access in the admin layout/page flow
- where authorization is enforced: organization `_lib.ts` helpers and the admin layout
- where tenant or org context is derived: current provisioning access, with `organizationId` used as both organization and legacy tenant context
- what claims or inputs are trusted: verified access and env platform-admin result; route params remain untrusted resource selectors

## Sensitive Data And Exposure Notes

- logging / telemetry review: preserve existing audit events; add no sensitive fields
- response exposure review: inaccessible valid UUIDs return the existing non-disclosing not-found response
- client exposure review: no security policy moves client-side
- cache exposure review: no cache changes; enforcement remains request-time and server-side

## Security Decisions / Constraints

- approved controls or constraints: explicit server-derived scope union; organization-only for non-platform; active-tenant only for platform; SQL-bound scope
- rejected directions: UI gating, boolean scope, shared-parent authorization for non-platform users, final-model redesign
- required enforcement points: organization read predicates and organization status update predicate; downstream operations must first resolve the target through this scope

## Artifact Synchronization

- `plan.md` updates: pre-implementation review marked complete
- `intake.md` updates: readiness and scenarios recorded
- `implementation-plan.md` updates: security scope steps and tests recorded
- specialist artifact updates: initial Security/Auth summary created

## Open Questions / Blockers

- unresolved questions: production rollout belongs to OZI-78
- blockers: none for local implementation
- evidence still needed: route and real-DB negative tests plus post-fix recheck

## Handoff Notes

- what the next agent should rely on: the scope must distinguish organization and explicit platform active-tenant access
- what should not be re-decided without new evidence: non-platform sibling access is denied during Phase 0
- recommended next specialist or step: Runtime and Architecture confirmation, then Validation Strategy

## Post-Fix Recheck — 2026-08-27

- Current Run Scope: post-implementation close-out recheck against merged code (commits `65ecd80e`, `3a2502da`, `0777bda9` on `fix/ozi-77-sibling-org-containment`)
- Status: COMPLETED

### Verification performed against live code

- `AdminOrganizationsScope` (`src/modules/authorization/domain/AdminOrganizationsScope.ts`) is a discriminated union (`organization` | `active-tenant`); `createAdminOrganizationsScope` selects `active-tenant` only when `isPlatformAdmin` is true, else `organization`.
- `_lib.ts` keeps action authorization (`allowed`, from `authzService.can(...)` or `isEnvBasedPlatformAdmin`) and resource scope (`isPlatformAdmin`) as independent fields — `allowed: true` is never used as proof of resource scope; `toAdminOrganizationsScope` derives scope only from `isPlatformAdmin`, which is only ever set from the server-verified `isEnvBasedPlatformAdmin(email)` check. Satisfies SEC-26.
- `DrizzleAdminOrganizationsReadService` and `DrizzleAdminOrganizationsMutationService`: for `organization` scope, every read/mutation predicate binds directly to `eq(organizationsTable.id, scope.organizationId)` — no tenant widening. For `active-tenant` scope, the service independently re-resolves the active organization's `tenantId` server-side before widening (`resolveScope`/`resolveScopeFilter`), so a spoofed scope object still can't roam outside the tenant that was actually looked up. Sibling/cross-tenant target IDs (`input.organizationId`) are always AND-ed with the scope filter in the same statement.
- All 16 in-scope callers (10 API routes' GET/PATCH/POST/DELETE handlers under `src/app/api/admin/organizations/**`, and 7 Server Component loaders under `src/app/admin/organizations/**` + `src/app/admin/invitations/page.tsx`) were individually diffed: every one replaced the bare boolean with `adminAccess`/`isEnvBasedPlatformAdmin(...)` and now passes an explicit `scope` derived server-side into the service call. No caller was missed.
- UUID boundary (SEC-23): `organizationIdSchema` (`z.uuid()`) is still parsed before any service/DB call in every route; a new route test proves `PATCH` returns 400 with zero calls to `getDetailInActiveScope`/`updateOrganizationStatus` for a malformed id.
- Non-disclosure: `OrganizationNotFoundError` message ("Organization not found in this tenant") is unchanged/generic and does not distinguish "exists but out of scope" from "does not exist"; read paths return `null`/empty list the same way for both cases.
- Step-up/MFA (`withAdminStepUp`) and `recordAdminAuditEvent` calls are structurally unchanged in every route diff — only the local variable name (`isAdmin` → `adminAccess`) and the scope construction changed.
- No UI-only gating, no bare-boolean scope, no shared-parent-tenant trust for non-platform actors, no client/provider-supplied scope anywhere in the diff.

### Evidence already gathered this session (supporting, not re-run by this recheck)

- Focused route tests: 54/54 passing (`vitest run --config vitest.unit.config.ts` scoped to the organizations/invitations admin paths).
- Real-DB PGlite tests: 7/7 passing, covering S1/S2 (non-platform organization-scope read allow/deny), S4 (non-platform sibling mutation denied, row unchanged), S6/S7 (platform active-tenant scope allow within tenant / deny across tenant).
- `pnpm typecheck`: clean. Targeted ESLint on the full changed-file set: clean after `--fix` plus one manual import-order fix. `pnpm arch:lint`: the only FAIL (`security must not directly depend on app/features/modules`, `src/security/api/strict-rate-limit.ts`) is confirmed pre-existing on `main` and untouched by this diff.

### Residual gap

- PostgreSQL-backed real-DB validation (`pnpm test:db:local`) could not run in this environment — no local Postgres test service is available (no `pg_isready`, no matching Docker container). PGlite real-DB evidence stands in for this locally; the Postgres-backed run remains required before/at production rollout under OZI-78 and is not yet obtained.

### Close-out verdict

- **SAFE TO CLOSE LOCALLY** — the CRITICAL sibling-organization/cross-tenant authorization bypass is contained: every non-platform admin data path is now bound to the caller's own organization in the SQL predicate, the explicit platform-admin path is preserved and re-scoped to a server-verified active tenant, and DB-backed negative tests prove both the sibling and cross-tenant denial with unchanged rows. This closes OZI-77 as implemented and validated in this environment. It does not clear OZI-78 (production rollout), which still needs the PostgreSQL-backed real-DB run as a precondition.

### Update Log

### 2026-08-27 — Initial Review

- Trigger: OZI-77 implementation start
- Summary of change: confirmed CRITICAL scope bypass and approved minimum containment
- Sections refreshed: all

### 2026-08-27 — Post-Fix Recheck

- Trigger: OZI-77 implementation already merged to the fix branch; workflow-mandated post-fix Security/Auth close-out
- Summary of change: verified merged code against every approved constraint; confirmed CRITICAL bypass is closed locally; flagged missing Postgres-backed real-DB run as a residual gap before OZI-78 rollout
- Sections refreshed: Post-Fix Recheck, Update Log
