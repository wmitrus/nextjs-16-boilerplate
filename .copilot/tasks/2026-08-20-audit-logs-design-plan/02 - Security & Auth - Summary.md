# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-08-20-audit-logs-design-plan`
- Task Objective: Implement the audit-logging plan phase by phase. Phase 1 (settings) and Phase 2 (writer wiring) are both complete.
- Current Run Scope: Phase 2 — the write path's fail-open guarantee, redaction reuse, and the metadata that ends up persisted (sensitive-data exposure).
- Status: COMPLETED
- Last Updated: 2026-08-20 (Phase 2)
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

- what the next agent should rely on: the derive-don't-reject SEC-26 pattern is settled; implement it exactly as in `feature-flags/route.ts`, not a variant. As of Phase 2: the two-layer fail-open pattern (resolution try/catch + `ResilientAuditLogService`) and caller-side redaction are also settled — new call sites (Phase 3's admin route instrumentation) should copy `action-audit.ts`'s `recordAuditEvent` pattern rather than inventing a variant.
- what should not be re-decided without new evidence: the GET/PATCH action split (`SECURITY_READ_AUDIT` vs. `SECURITY_MANAGE_AUDIT_SETTINGS`); redaction happening before the `AuditLogService` contract boundary, never after.
- recommended next specialist or step: Phase 3 — map each `src/app/api/admin/**` mutation route to its audit category (per `plan.md` Part B.5) and add the equivalent `recordAuditEvent`-shaped call at each mutation branch.

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
  - **Fail-open, at two layers.** `AuditLogService.record()` (the DI-registered `ResilientAuditLogService`) never throws — but `logActionAudit`/`logSecurityEvent` also wrap the *resolution* of the service (`getAppContainer().resolve(AUDIT_LOG.SERVICE)`) in their own try/catch, because resolution itself can throw (confirmed in practice: the global test double for `getAppContainer()` in `tests/setup.tsx` never registers `AUDIT_LOG.SERVICE` at all, so every one of the ~200 existing unit test files that transitively exercise a secure action would have started failing with "Service not found" if only `record()`'s own fail-open guarantee were relied on). Verified via the full unit suite (207 files / 1437 tests, all passing) plus `src/testing/integration/server-actions.test.ts`, which uses the *real* (non-mocked) composition root and confirms the production resolution path also degrades safely when the underlying PGlite instance has no migrated `audit_log_settings` table.
  - **Redaction is caller-side, not module-side** (see the Architecture Guard entry above for the dependency-direction reasoning). Practical consequence for security review: `action-audit.ts`/`security-logger.ts` now call `redactAuditInput()` **unconditionally** (both success and failure), not only on failure as the Pino path still does — this is what lets a category's `captureInputOnSuccess` setting actually capture something on success. Verified the redactor itself did not change behavior during extraction: all 7 pre-existing redaction scenarios (nested fields, `URLSearchParams`, arrays, non-object values, circular references) pass unchanged via the new `src/security/actions/redact.test.ts`, and `action-audit.test.ts`'s original assertions (unmodified) still pass against the re-exported function.
  - **What gets persisted vs. logged differs by design**, and this is intentional, not drift: Pino continues to log full redacted input only on failure (unchanged); the DB path persists redacted input on failure always, and on success only when the category's admin-configured `captureInputOnSuccess` is true. Both paths use the same redaction rules, so nothing unredacted is ever persisted through either path.
  - **`security_event` outcome mapped to `'failure'`**, not `'denied'` — a judgment call (documented inline in `security-logger.ts`) since every event that utility logs (`ssrf_attempt`, `tenant_violation`, `rate_limit_bypass`, `replay_attack`, `auth_failure`) represents a blocked/flagged attempt rather than a completed action, and `auth_failure` in particular doesn't fit "denied" cleanly. Revisit if Phase 4's read UI needs finer-grained outcome filtering.
- Sections refreshed: Actions Performed, Sensitive Data And Exposure Notes, Security Decisions / Constraints, Handoff Notes
