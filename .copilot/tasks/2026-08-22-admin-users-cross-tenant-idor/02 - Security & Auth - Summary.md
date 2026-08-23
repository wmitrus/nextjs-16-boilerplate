# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-08-22-admin-users-cross-tenant-idor`
- Task Objective: Close a cross-tenant IDOR/BOLA in `/api/admin/users` and `/api/admin/users/[id]`.
- Current Run Scope: Security/Auth review of the reported finding and the proposed fix shape.
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `intake.md`, `plan.md`, `04 - Implementation Agent - Summary.md`, `docs/ai/general/SECURITY_CODING_PATTERNS.md` (SEC-26 update)

## Scope Handled

- auth surfaces reviewed: `checkAdminAccess()` in both admin/users route handlers; `isEnvBasedPlatformAdmin()`; `AuthorizationService.can()`
- authorization surfaces reviewed: ABAC policy grant shape (`RESOURCES.USER` / `USER_READ`/`USER_UPDATE`/`USER_DEACTIVATE`), tenant/org membership model (`memberships`, `organizations`, `tenants`)
- trust-boundary questions in scope: does an ABAC action-type grant imply authority over an arbitrary target user id; where is tenant/org context actually derived and verified

## Inputs Reviewed

- code paths reviewed: `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[id]/route.ts`, `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts`, `src/core/contracts/user.ts`, `src/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository.ts`, `src/core/contracts/tenancy.ts`, `src/modules/provisioning/infrastructure/{SingleTenantResolver,PersonalOrganizationResolver,OrgDbOrganizationResolver}.ts`
- security/auth docs reviewed: `docs/ai/general/SECURITY_CODING_PATTERNS.md` (SEC-23, SEC-26, SEC-27), `AGENTS.md` Auth/Tenancy non-negotiables, `docs/features/35 - Admin User Management.md`
- earlier task artifacts reviewed: none specific to this finding pre-existed; the analogous fix for `/api/admin/feature-flags` (SEC-26 original, `.copilot/tasks/2026-08-20-admin-feature-flags-gui/`) was used as the established remediation pattern

## Actions Performed

- identity flow tracing performed: confirmed `access.tenant.tenantId` (from `withNodeProvisioning`) is the resolved organization UUID in every tenancy mode (`TenantContext.tenantId === TenantContext.organizationId`, per `src/core/contracts/tenancy.ts`'s own doc comment); confirmed all three resolvers (`single`, `personal`, `org-db`) populate it consistently
- authorization enforcement review performed: confirmed `checkAdminAccess()` in both routes only proved "is `USER_READ`/`USER_UPDATE`/`USER_DEACTIVATE` allowed for this subject in this tenant" — never "for which target user id". Confirmed the underlying DB layer (`DrizzleUserRepository`) has zero tenant awareness: `findById`, `updateProfile`, `deactivate` all predicate on `usersTable.id` alone; `listAll` predicates only on optional email/displayName search, no tenant filter at all.
- tenant / org context review performed: confirmed `users` has no `tenant_id`/`organization_id` column — tenant membership is only derivable via `memberships.organization_id` (join), never a direct column on the target row (unlike the `feature_flags` case that produced the original SEC-26 entry).
- sensitive-data exposure review performed: confirmed the `GET /api/admin/users/[id]` 404 contract (no distinguishing 403 for "exists but wrong tenant") was already correct pre-fix for the "doesn't exist" case, but the fix must preserve exactly this non-distinguishing behavior once cross-tenant denial is added, to avoid a new enumeration side-channel replacing the old vulnerability.

## Current-State Findings

- Confirmed: cross-tenant IDOR/BOLA is real and exploitable by any ABAC-authorized (non-platform-admin) tenant owner/admin — not merely theoretical. Verified end-to-end by DB-level regression test (`DrizzleAdminUsersService.db.test.ts`) using two real seeded orgs (`acme`, `globex`) and asserting a `globex`-scoped caller cannot reach `bob` (a real user, member only of `acme`).
- Risks: this is the same defect class as SEC-26 (ABAC action check without matching resource-scope check), but strictly worse — the original SEC-26 occurrence (feature flags) at least had a `tenantId` column on the target row; here the domain repository had no scoping mechanism to forget to invoke, because it was never designed for cross-user (admin) access at all.
- Drift: `AGENTS.md`'s "Key rules currently in effect" table (lines ~996-1023) stops at SEC-25. SEC-26 through SEC-32 already exist in `docs/ai/general/SECURITY_CODING_PATTERNS.md` (confirmed by direct grep) but were never propagated into `AGENTS.md`'s summary table, despite the repo's own propagation rule naming `AGENTS.md` as a required location. This is pre-existing drift from before this task, not introduced by it. Reported here per "Source of Truth" discipline rather than silently reconciled; not fixed as part of this task (backfilling 7 historical rows is outside this incident's blast radius) — see `plan.md` residual risks.

## Trust Boundary Assessment

- where identity is established: `withNodeProvisioning` (Clerk/AuthJS session → internal `access.user.id` / `access.identity.email`), upstream of both route handlers — not re-litigated here.
- where authorization is enforced: `checkAdminAccess()` in each route handler, via `isEnvBasedPlatformAdmin()` (unscoped override) or `AuthorizationService.can()` (ABAC, scoped to `access.tenant.tenantId` for the _action_ check only, pre-fix).
- where tenant or org context is derived: `access.tenant.tenantId`, resolved server-side by the active `TenantResolver` (`single`/`personal`/`org-db`) during `withNodeProvisioning` — never client-supplied, already correct pre-fix.
- what claims or inputs are trusted: `access.tenant.tenantId` and `access.user.id` are server-verified and safe to use as the scoping authority. The `id` path param (target user) is **not** trusted as anything other than an opaque candidate row identifier — it must never be assumed to belong to the caller's tenant just because the caller passed an authorization check for the action type.

## Sensitive Data And Exposure Notes

- logging / telemetry review: `logger.info()` calls in both routes already log only ids/tenantId/counts, no PII beyond what was already logged pre-fix; unchanged by this fix.
- response exposure review: `GET /:id` and the two `PATCH` branches must return the same `404 NOT_FOUND` for "doesn't exist" and "exists, wrong tenant" — verified this is what the implementation does (`service.findById`/`updateProfile`/`deactivate` return `null` in both cases, and the route always maps `null` to the same 404).
- client exposure review: no client-side changes; `UsersClient.tsx` already only renders whatever the (now correctly scoped) API returns.
- cache exposure review: route is dynamic (`await connection()` already present), no caching involved.

## Security Decisions / Constraints

- approved controls or constraints:
  - `checkAdminAccess()` must return `{ allowed: boolean; isPlatformAdmin: boolean }` in both routes (matching the `DrizzleFeatureFlagAdminService`/SEC-26 pattern), never a bare `boolean`.
  - Every DB read/mutation reachable from these two routes must derive its tenant scope from `isPlatformAdmin ? null : { tenantId: access.tenant.tenantId }` and enforce it in the same SQL predicate as the operation itself (no separate check-then-act).
  - A new admin-only, non-DI-registered service (`DrizzleAdminUsersService`) is required rather than adding a scope parameter to `UserRepository`/`DrizzleUserRepository` — that repository's other callers are legitimate unscoped self-service lookups (a user reading their own record), and retrofitting scope there would require every self-service call site to remember to keep passing "no scope" correctly, forever, which is a worse long-term risk shape than a dedicated admin surface.
  - Cross-tenant target and nonexistent id must remain indistinguishable (`404` in both cases).
  - `:id` must be validated as `z.uuid()` before any DB call (SEC-23), since the route was already being rewritten.
- rejected directions:
  - Rejected: scoping via a preceding `membershipRepository.isMember()` check followed by an unscoped read/write. This is a TOCTOU shape and was explicitly called out as unacceptable by the reporting audit ("Nie robić: SELECT target → sprawdź tenant → UPDATE target"); it also doesn't match this repo's established SEC-26 remediation shape (single-predicate scoping).
  - Rejected: adding a `tenantId` column directly to the `users` table to make scoping trivial. Out of scope for this incident (a schema/data-model change with much larger blast radius than the reported vulnerability requires) and not necessary — the existing `memberships` join gives an equally enforceable, atomic predicate.
- required enforcement points: `src/app/api/admin/users/route.ts` (`GET`), `src/app/api/admin/users/[id]/route.ts` (`GET`, `PATCH` — both the `deactivate` and `displayName` update branches).

## Artifact Synchronization

- `plan.md` updates: workflow step sequence and gate results recorded.
- `intake.md` updates: scope and acceptance criteria recorded.
- `implementation-plan.md` updates: not used for this task (this workflow's artifact set is `intake.md`/`plan.md` per the Security Incident Workflow, not a separate implementation-plan file).
- specialist artifact updates: `docs/ai/general/SECURITY_CODING_PATTERNS.md` SEC-26 updated with a dated "Update 2026-08-22" section (second real-world occurrence + the membership-join scoping technique); Pattern Index row's classification text updated to reference it.

## Open Questions / Blockers

- unresolved questions: none blocking. The `AGENTS.md` SEC-table drift (noted above) is an open item but not a blocker for this fix.
- blockers: none.
- evidence still needed: none — DB-level regression test provides direct proof against a real seeded two-tenant fixture.

## Handoff Notes

- what the next agent should rely on: `DrizzleAdminUsersService`'s `AdminUserScope` contract and `membershipScopePredicate()` technique are now the established pattern for any future admin surface over a table with no direct tenant column.
- what should not be re-decided without new evidence: the "same 404 for nonexistent vs. wrong-tenant" contract; the "dedicated admin service, not a repository retrofit" architectural choice.
- recommended next specialist or step: Validation Strategy (already run, see `05 - Validation Strategy - Summary.md`) then Implementation (already run, see `04 - Implementation Agent - Summary.md`). For the broader audit series, the next case is whatever the user pastes next (per the user's stated multi-case workflow).

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Initial security review for this incident.
- Summary of change: Confirmed the reported cross-tenant IDOR/BOLA, classified it as a second real-world occurrence of SEC-26, defined the required fix shape (scoped admin service + same-predicate enforcement + SEC-23 UUID validation), and updated `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
- Sections refreshed: all.
