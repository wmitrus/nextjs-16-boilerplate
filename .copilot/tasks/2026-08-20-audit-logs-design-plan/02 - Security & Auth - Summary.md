# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-08-20-audit-logs-design-plan`
- Task Objective: Implement the audit-logging plan phase by phase. Phases 1-5 are complete, plus the Phase-3-flagged test-coverage gap.
- Current Run Scope: Phase 5 — documentation only; plus a security-relevant drift correction found while writing it (`SECURITY_AUDIT_LOG_ENABLED` does not actually gate anything, contrary to existing docs).
- Status: COMPLETED
- Last Updated: 2026-08-20 (Phase 5)
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
- **CRITICAL (Phase 3):** `POST /api/admin/waitlist/[id]` has no admin authorization check — see the Phase 3 Update Log entry below for the full writeup. Reported to the user; not fixed in this task.

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
- ~~open, user-facing (Phase 3): whether/when to fix `POST /api/admin/waitlist/[id]`'s missing authorization check~~ — **resolved**: user chose to fix it now; shipped as its own commit (`SEC-27`).

## Handoff Notes

- what the next agent should rely on: the derive-don't-reject SEC-26 pattern is settled; implement it exactly as in `feature-flags/route.ts`, not a variant. As of Phase 2: the two-layer fail-open pattern (resolution try/catch + `ResilientAuditLogService`) and caller-side redaction are also settled — new call sites (Phase 3's admin route instrumentation) should copy `action-audit.ts`'s `recordAuditEvent` pattern rather than inventing a variant. As of Phase 3: `src/security/actions/record-admin-audit-event.ts` is the settled pattern for `/api/admin/**` routes specifically (not `action-audit.ts`'s `recordAuditEvent`, which is action-audit-specific) — reuse it for any new admin route rather than inventing a fourth copy.
- what should not be re-decided without new evidence: the GET/PATCH action split (`SECURITY_READ_AUDIT` vs. `SECURITY_MANAGE_AUDIT_SETTINGS`); redaction happening before the `AuditLogService` contract boundary, never after.
- recommended next specialist or step: if the user approves fixing the waitlist authorization gap, that is a `security-incident-workflow`-shaped task, not a continuation of this audit-logging plan — treat it as a separate task. Otherwise, Phase 4 (partitioning, purge job, `/admin/audit-logs` read UI) per `plan.md`.

## Update Log

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 1 implementation kickoff
- Summary of change: SEC-26 pattern re-confirmed applicable and mapped onto the new route/service design.
- Sections refreshed: all

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 2 implementation kickoff
- Summary of change:
  - **Fail-open, at two layers.** `AuditLogService.record()` (the DI-registered `ResilientAuditLogService`) never throws — but `logActionAudit`/`logSecurityEvent` also wrap the _resolution_ of the service (`getAppContainer().resolve(AUDIT_LOG.SERVICE)`) in their own try/catch, because resolution itself can throw (confirmed in practice: the global test double for `getAppContainer()` in `tests/setup.tsx` never registers `AUDIT_LOG.SERVICE` at all, so every one of the ~200 existing unit test files that transitively exercise a secure action would have started failing with "Service not found" if only `record()`'s own fail-open guarantee were relied on). Verified via the full unit suite (207 files / 1437 tests, all passing) plus `src/testing/integration/server-actions.test.ts`, which uses the _real_ (non-mocked) composition root and confirms the production resolution path also degrades safely when the underlying PGlite instance has no migrated `audit_log_settings` table.
  - **Redaction is caller-side, not module-side** (see the Architecture Guard entry above for the dependency-direction reasoning). Practical consequence for security review: `action-audit.ts`/`security-logger.ts` now call `redactAuditInput()` **unconditionally** (both success and failure), not only on failure as the Pino path still does — this is what lets a category's `captureInputOnSuccess` setting actually capture something on success. Verified the redactor itself did not change behavior during extraction: all 7 pre-existing redaction scenarios (nested fields, `URLSearchParams`, arrays, non-object values, circular references) pass unchanged via the new `src/security/actions/redact.test.ts`, and `action-audit.test.ts`'s original assertions (unmodified) still pass against the re-exported function.
  - **What gets persisted vs. logged differs by design**, and this is intentional, not drift: Pino continues to log full redacted input only on failure (unchanged); the DB path persists redacted input on failure always, and on success only when the category's admin-configured `captureInputOnSuccess` is true. Both paths use the same redaction rules, so nothing unredacted is ever persisted through either path.
  - **`security_event` outcome mapped to `'failure'`**, not `'denied'` — a judgment call (documented inline in `security-logger.ts`) since every event that utility logs (`ssrf_attempt`, `tenant_violation`, `rate_limit_bypass`, `replay_attack`, `auth_failure`) represents a blocked/flagged attempt rather than a completed action, and `auth_failure` in particular doesn't fit "denied" cleanly. Revisit if Phase 4's read UI needs finer-grained outcome filtering.
- Sections refreshed: Actions Performed, Sensitive Data And Exposure Notes, Security Decisions / Constraints, Handoff Notes

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 3 implementation kickoff
- Summary of change: Reviewed every `/api/admin/**` route's authorization gate while mapping it to its audit category (a necessary step, since `access.tenant.tenantId`/`access.user.id` needed for the audit record come from the same `withNodeProvisioning` result the authorization check uses).

  **CRITICAL — real finding, not fixed in this phase:**
  `POST /api/admin/waitlist/[id]?action=approve|reject`
  (`src/app/api/admin/waitlist/[id]/route.ts`) has **no admin authorization
  check at all**. Its sibling `GET /api/admin/waitlist` on the same
  resource calls `checkAdminAccess()` (env-based platform admin OR ABAC
  `SECURITY_MANAGE_POLICIES`) before listing entries. `POST` skips that
  entirely — it only passes through `withNodeProvisioning`, which verifies
  the caller is authenticated and provisioned (onboarded, has tenant
  context), **not** that they hold any admin grant. Concretely: any
  authenticated, provisioned, non-admin user in the app can call this
  endpoint directly (it is not gated by the `/admin` page layout's guard —
  that guard only wraps page rendering, not this API route) to:
  - approve an arbitrary waitlist entry, which creates a **real invitation
    email** to whatever organization/role the approval resolves to
    (`WAITLIST_INVITE_ORGANIZATION_ID`/`WAITLIST_INVITE_ROLE_ID`, or the
    single-tenancy auto-resolved org/role), or
  - reject an arbitrary waitlist entry, sending a rejection email on the
    product's behalf.

  This is confirmed by direct code reading (`_request, context` are the
  only params destructured in the current handler — no `access`, so
  `checkAdminAccess`/`isEnvBasedPlatformAdmin` are never called on this
  path), not inferred. This is exactly the kind of gap
  `docs/ai/general/SECURITY_CODING_PATTERNS.md`'s catalogue exists to
  track once remediated (a new SEC-XX entry, likely closest in shape to a
  missing-authorization-check pattern rather than SEC-26's scope-not-type
  issue, since here there is no authorization check of any kind, not an
  under-scoped one).

  **Not fixed inside the Phase 3 commit.** Per `AGENTS.md`'s Change
  Management guidance ("never hide architectural changes inside 'small'
  edits... mix unrelated cleanup with risky behavioral changes without
  saying so"), an authorization-tightening fix is a distinct, user-facing
  behavior change from audit-log instrumentation and was kept out of that
  commit. Reported directly to the user via `AskUserQuestion`
  immediately after Phase 3 shipped; **user chose "fix it now" as its own
  separate commit on this branch.**

  **FIXED (2026-08-20, separate commit):** added the same `checkAdminAccess()`
  gate the sibling `GET` already has to `POST`'s handler in
  `waitlist/[id]/route.ts` (duplicated per-file, matching the existing
  `checkAdminAccess`-per-route-file convention used elsewhere, e.g.
  `feature-flags/route.ts` / `feature-flags/[id]/route.ts`) — env-based
  platform admin OR ABAC `SECURITY_MANAGE_POLICIES`, checked before any
  business logic runs. Added a full new test file for this route (it had
  none before, a pre-existing gap): `waitlist/[id]/route.test.ts`,
  covering the 403-for-non-admin case, both admin grant paths (env +
  ABAC), and the approve/reject success + audit-record paths. Documented
  as `SEC-27` in `docs/ai/general/SECURITY_CODING_PATTERNS.md` per this
  repo's mandatory post-fix pattern-catalogue update.

  Every other route reviewed in this phase already has a real
  authorization check before its mutation (`checkAdminAccess`,
  `checkOrganizationsAdminAccess`, or `checkOrganizationsActionAccess`,
  each with the `isEnvBasedPlatformAdmin` OR ABAC `can()` shape) — this
  appears to be an isolated oversight on this one route, not a systemic
  pattern across the admin surface.

- Sections refreshed: Current-State Findings, Trust Boundary Assessment, Open Questions / Blockers, Handoff Notes

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 4 implementation kickoff
- Summary of change: Gated the new `GET /api/admin/audit-logs` route the same way as `GET /api/admin/audit-log-settings` (Phase 1) and every SEC-27-audited mutation route: `isEnvBasedPlatformAdmin(access.identity.email)` OR ABAC `authzService.can(...)` against `ACTIONS.SECURITY_READ_AUDIT` (the taxonomy already had this action defined and granted in the admin/owner policy template since before this task started — it had simply never had a route to gate yet). No new resource/action was introduced.

  **SEC-26 re-applied, not re-litigated:** the route branches on `adminAccess.isPlatformAdmin` exactly like the settings route does — an env-based platform admin gets `service.listGlobal(...)` (unscoped), an ABAC-authorized non-platform-admin gets `service.listForTenant(access.tenant.tenantId, ...)`, deriving the tenant scope from the server-verified `SecurityContext`, never from a client-supplied query parameter (there is no `tenantId` query parameter on this route at all — filters are category/outcome/actorUserId/targetType/targetId/date-range only, none of which can widen the caller's own tenant scope).

  **A stricter scoping rule than the settings table, by design:** `DrizzleAuditLogReadService.listForTenant` uses a plain `eq(auditEventsTable.tenantId, tenantId)` predicate, not the settings table's override/overlay `OR (tenantId = X OR tenantId IS NULL)` pattern. An audit trail has no "global default row a tenant inherits from" concept the way settings does — a tenant-scoped viewer must never see `tenantId: null` (platform-level) events or another tenant's events, full stop. Verified by a dedicated `DrizzleAuditLogReadService.db.test.ts` test ("SEC-26: never returns another tenant or null-tenant rows") inserting all three shapes and asserting exactly one row (the caller's own tenant) comes back.

  **The purge job (`purgeExpiredAuditEvents`) does not need an authorization gate** — it runs out-of-band via a scheduled GitHub Actions workflow, authenticated at the infrastructure level (`VERCEL_TOKEN` pulling production environment variables, same trust boundary as `prod-deploy.yml`'s own database access), not as an admin-facing HTTP endpoint. It does still respect tenant boundaries operationally: it purges strictly by (category, tenantId) pair rather than a single global cutoff, so a tenant with a longer retention override is never truncated to another tenant's or the global default's shorter window.

  Outcome-mapping question raised in the Phase 3 entry above ("revisit if Phase 4's read UI needs finer-grained outcome filtering") — resolved as no: the read UI's outcome filter uses the same three-value `success | failure | denied` enum already stored on every row; no finer granularity was needed to make the browse UI useful.

- Sections refreshed: Trust Boundary Assessment, Security Decisions / Constraints, Handoff Notes

### Update Entry

- Date: 2026-08-20
- Trigger: residual test-coverage-gap fix (flagged in Phase 3), then Phase 5 implementation kickoff
- Summary of change: (1) The `policies`/`roles` route test coverage gap closed this session is a test-completeness fix, not a security-behavior change — every added success-path test asserts the _existing_ authorization/audit-recording behavior fires correctly (403 for a non-admin caller, `recordAdminAuditEvent` called with the right category/action/target on success, not called on a domain-error branch); no route handler code changed. (2) While writing `docs/features/36 - Audit Logging & Retention.md` §8 (Security Notes) and updating `docs/features/20`'s §7 config table, re-verified `SECURITY_AUDIT_LOG_ENABLED`'s actual behavior directly against the code rather than trusting this task's own `intake.md`, which had characterized it (Phase 0, unverified) as "a single global on/off switch read from env at process start" gating the existing Pino audit logging. **Grep-confirmed: `src/security/actions/action-audit.ts` and `src/security/utils/security-logger.ts` never reference `env` at all** — `SECURITY_AUDIT_LOG_ENABLED` is defined in `src/core/env.ts`'s schema but is not read anywhere to gate `logActionAudit`, `logSecurityEvent`, or `recordAdminAuditEvent`. This is a **security-relevant documentation drift**, not a vulnerability introduced by this task: an operator reading `docs/features/20`'s §7 table (as it read before this update) would reasonably believe setting `SECURITY_AUDIT_LOG_ENABLED=false` disables audit logging, when in fact it currently does nothing. Corrected the table entry to state the actual (unwired) behavior rather than perpetuate the inaccurate description, per this repo's "trust the code, report drift explicitly" precedence rule. Did **not** attempt to wire the var up or remove it — that's a distinct, separately-scoped fix (touches `action-audit.ts`/`security-logger.ts` behavior, not this task's `audit-log` module) and was not requested.
- Sections refreshed: Current-State Findings, Sensitive Data And Exposure Notes, Handoff Notes
