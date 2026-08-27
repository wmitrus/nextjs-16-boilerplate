# OZI-76 — Admin Surface Tenant/Resource Scope Matrix

Route/page → identity boundary → authorization boundary → authoritative
scope → SQL sink, with a verdict per path. Verdicts are never downgraded
because a fix was small.

Legend: **safe** (already correctly scoped or correctly platform-only by
design) · **fixed** (confirmed gap, now closed with evidence) · **deferred**
(explicit blocking follow-up needed).

## Already covered — OZI-77 (not re-audited here)

`src/app/api/admin/organizations/**` (9 route files) and
`src/app/admin/organizations/**` + `src/app/admin/invitations/page.tsx`
(7 pages). All **safe** — `AdminOrganizationsScope` discriminated union,
server-derived from `isEnvBasedPlatformAdmin`, enforced in the same SQL
predicate as every read/mutation. See
`.copilot/tasks/2026-08-27-ozi-77-sibling-org-containment/`.

## Route handlers (`src/app/api/admin/**/route.ts`)

| Route | Identity | Authorization | Scope source | Sink | Verdict |
|---|---|---|---|---|---|
| `users/route.ts` (GET) | `withNodeProvisioning` | `checkAdminAccess` → ABAC or `isEnvBasedPlatformAdmin` | `AdminUserScope` = `{tenantId}` or `null` (platform) | `DrizzleAdminUsersService.listAll` — `EXISTS` membership subquery on `scope.tenantId` | **safe** |
| `users/[id]/route.ts` (GET/PATCH) | `withNodeProvisioning` (+`withAdminStepUp` on PATCH) | same | same `AdminUserScope`, passed per-call | `findById`/`updateProfile`/`deactivate` — same membership predicate AND'd with `id` | **safe** |
| `feature-flags/route.ts` (GET/POST) | `withNodeProvisioning` (+`withAdminStepUp` on POST) | ABAC or platform-admin | non-platform derives `tenantId` from `access.tenant.tenantId` (never trusts client `tenantId`) | `listForTenant`/`create` | **safe** — hardened per PR #71/#72 review |
| `feature-flags/[id]/route.ts` (PATCH/DELETE) | same, step-up on both | same | `MutationScope` = `{tenantId}` or `null` | `scopePredicate(id, scope)` — `id` AND `tenantId` in one predicate | **safe** |
| `invitations/route.ts` (GET/POST) | `withNodeProvisioning` (+step-up on POST) | ABAC (`SECURITY_MANAGE_POLICIES`) | always `access.tenant.organizationId`, never client-supplied; POST additionally re-verifies `roleId` belongs to that org in the same query | `listByOrganization`/`createInvitation` | **safe** |
| `audit-logs/route.ts` (GET) | `withNodeProvisioning` | ABAC or platform-admin | `listForTenant(access.tenant.tenantId, ...)` vs `listGlobal` | `eq(auditEventsTable.tenantId, tenantId)` | **safe** |
| `audit-log-settings/route.ts` (GET/PATCH/DELETE) | `withNodeProvisioning` (+step-up on mutations) | ABAC or platform-admin | `requestedTenantId` derived, never trusted from client for non-platform | `assertScopeAllows` in the service throws on `targetTenantId !== scope.tenantId` (defense-in-depth beyond the route's own derivation) | **safe** |
| `waitlist/route.ts` (GET) | `withNodeProvisioning` | **platform-admin only**, no ABAC path at all | N/A — platform-global resource, no tenant column | `listPending()` unscoped, gated entirely by caller check | **safe** — correctly platform-only by design (SEC-41) |
| `waitlist/[id]/route.ts` (POST approve/reject) | `withNodeProvisioning` + `withAdminStepUp` | **platform-admin only** | N/A | `approveEntry`/`rejectEntry` by id | **safe** |

## Server Component pages (`src/app/admin/**/page.tsx`)

| Page | Data loader | Gate | Verdict |
|---|---|---|---|
| `admin/page.tsx` (dashboard) | none — static links only | admin layout only | **safe** — no data loader to audit |
| `feature-flags/page.tsx` | none — delegates to `FeatureFlagsClient` → already-audited route | admin layout only | **safe** |
| `security/page.tsx` | none — delegates to `AuditSettingsClient` → already-audited route | admin layout only | **safe** |
| `security/audit-logs/page.tsx` | none — delegates to `AuditLogsClient` → already-audited route | admin layout only | **safe** |
| `users/page.tsx` | none — delegates to `UsersClient` → already-audited route | admin layout only | **safe** |
| `waitlist/page.tsx` | **direct** `service.listPending()` in the Server Component itself | **was: admin layout only (tenant-scoped ABAC) — CRITICAL gap.** Now: `loadPendingEntriesForPlatformAdmin()` checks `isEnvBasedPlatformAdmin` before touching the service, identical mechanism to the safe API route | **CRITICAL — confirmed, now fixed** (see below) |

## Finding: CRITICAL — `src/app/admin/waitlist/page.tsx` (fixed)

**Actor → page → service → DB sink trace (pre-fix):**

1. Actor: any authenticated user holding `SECURITY_MANAGE_POLICIES` on their
   own active tenant — i.e. any ordinary tenant/organization admin, not just
   an env-based platform admin.
2. `src/app/admin/layout.tsx` (`AdminLayoutGuard`) admits them into
   `/admin/**` on that tenant-scoped ABAC check alone (line ~181-195);
   it has no per-page resource-specific authority.
3. `src/app/admin/waitlist/page.tsx`'s `WaitlistAdminPage` called
   `resolveWaitlistService().listPending()` **unconditionally** — no
   `isEnvBasedPlatformAdmin` check, no scope of any kind.
4. Sink: `DrizzleWaitlistRepository.listPending()` — a genuinely unscoped
   `SELECT` (the table has no tenant column; `organization_id` is an
   unvalidated claim from the anonymous joiner, not a trust boundary).
5. Result: name + email of every pending waitlist applicant across every
   tenant on the platform, rendered directly in the page (`WaitlistTable`/
   `WaitlistRow`).

Mutations (approve/reject) were **not** part of this exposure: the POST
route independently re-verifies `isEnvBasedPlatformAdmin` server-side, so
the UI affordance existed for unauthorized viewers but any actual submit
would 403.

**Root cause:** the platform-global `listPending()` read was already
correctly recognized as platform-admin-only by the API route (with an
explicit SEC-41 doc comment explaining why), but that trust-boundary
decision was never mirrored at this second call site.

**Fix (commit-local, not yet pushed):** `src/app/admin/waitlist/page.tsx`
now exports `loadPendingEntriesForPlatformAdmin()`, which resolves
`resolveNodeProvisioningAccess(container)` and checks
`isEnvBasedPlatformAdmin(access.identity.email)` — the identical mechanism
the safe route already uses — before constructing the waitlist service or
calling `listPending()`. Returns `[]` or when the caller isn't ALLOWED or
isn't a platform admin, matching the same fail-closed, non-disclosing
posture as the analogous `organizations/page.tsx` loader. The waitlist
service's platform-global model was deliberately **not** changed — no
tenant scope was added to `DefaultWaitlistService`/`DrizzleWaitlistRepository`;
every admin call site (both routes and now this page) is explicit
platform-admin-only, which is the correct containment shape for a resource
with no trustworthy tenant column.

**Evidence:**

- `src/app/admin/waitlist/page.test.tsx` — 4 mocked cases: non-platform
  admin denied and `listPending` never called; tenant admin holding
  `SECURITY_MANAGE_POLICIES` denied and `listPending` never called;
  non-`ALLOWED` access denied; platform admin sees entries. 4/4 pass.
- `src/app/admin/waitlist/page.db.test.ts` — real PostgreSQL (`test-db`,
  port 5433), two real organizations seeded via the existing
  `seedAuthorization`/`seedUsers` fixtures, each given a pending waitlist
  entry. A Tenant-A-scoped non-platform admin's loader call returns `[]`
  despite both entries existing in the DB; a platform admin's call returns
  both. 2/2 pass.
- Existing `src/app/api/admin/waitlist/route.test.ts` and
  `.../[id]/route.test.ts` (approve/reject) — 18/18 pass unchanged, proving
  no regression to the already-safe mutation path.
- `pnpm typecheck`: clean. Targeted ESLint on the 3 changed/added files:
  clean after `--fix`. `pnpm arch:lint`: only the pre-existing, unrelated
  `strict-rate-limit.ts` FAIL (confirmed present on `main` before this
  session, per OZI-77's validation report).

**Post-fix Security/Auth verdict:** see
`02 - Security & Auth - Summary.md`.

## Remaining before OZI-76 sign-off

- [ ] Formal Security/Auth sign-off statement across the whole matrix (not
      just the one fixed finding).
- [ ] Linear OZI-76 evidence/closure update.
- [ ] Confirm no additional admin surface exists outside
      `src/app/api/admin/**` / `src/app/admin/**` that should be in scope
      (out of scope for this pass; flag only if surfaced).
