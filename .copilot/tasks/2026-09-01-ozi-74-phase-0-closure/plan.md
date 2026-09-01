# OZI-74 Phase 0 — Closure Audit

## Objective

Determine whether OZI-74 ("Phase 0 — Contain tenant/organization scope risks
and establish migration evidence") can be closed truthfully. Prove every
OZI-74 parent acceptance criterion from authoritative repository evidence
(merged code, tests, task artifacts, PRs), not from child-issue status.

Documentation/verdict task only. No application code, migration, Production
operation, rollback, promote, data mutation, or Linear mutation was performed.

## Current main SHA

`4a70965dc72b7e4fad5a0afced5755b732ab628b` (branch `docs/ozi-74-phase-0-closure`
is even with `main`; working tree clean before this doc-only change).

## Evidence sources

- Live code on `main`:
  - `src/modules/authorization/domain/AdminOrganizationsScope.ts`
  - `src/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService.ts`
  - `src/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsMutationService.ts`
  - `src/app/api/admin/organizations/_lib.ts` + 10 routes + 7 Server Component loaders
  - `src/app/admin/waitlist/page.tsx`
  - `scripts/tenancy-inventory/**`, `scripts/rollback-assessment/**`
  - `scripts/validate-migration-journal.ts`, `scripts/validate-vercel-deploy-profiles.ts`
  - `.github/workflows/db-tests.yml`, `.github/workflows/prod-deploy.yml`
- Tests: `*.db.test.ts` under `src/modules/authorization/infrastructure/drizzle/`,
  `src/app/admin/waitlist/page.db.test.ts`, run in CI via `DB Tests
  (Testcontainers)` (`pnpm test:db:ci`); OZI-77 merge CI run `33069257769` PASS.
- Task artifacts:
  - `.copilot/tasks/2026-08-27-ozi-75-tenant-org-topology-inventory/`
  - `.copilot/tasks/2026-08-27-ozi-76-admin-scope-audit/`
  - `.copilot/tasks/2026-08-27-ozi-77-sibling-org-containment/`
  - `.copilot/tasks/2026-08-27-ozi-79-*`, `.../2026-08-28-ozi-79-phase-b2-remote-explain-wiring/`
  - `.copilot/tasks/2026-08-29-ozi-78-gate-a-canary-rollback-validation/`
- Linear (read-only): OZI-74/75/76/77/78/79 descriptions + comments, incl. the
  OZI-79 "Final production inventory evidence — acceptance handoff" comment.
- Merges on `main`: `b9a8f61c` (OZI-75), `92a3ba8c`/`0912756a`/`42a10f08` (OZI-76),
  `2450d410` (OZI-77), `f2d57d52` (OZI-79), PRs #89/#90/#91/#92/#93 (OZI-78),
  `8e552a22` (prod migration/deploy hardening), `8e06a40c` (OZI-78 final verification).

## OZI-74 acceptance matrix

| # | Criterion | Verdict | Evidence | Artifact / PR / test | Remaining risk / unknown |
|---|---|---|---|---|---|
| 1 | All known sibling-organization access paths contained or disabled for non-platform administrators | PASS | `AdminOrganizationsScope` is a `organization` \| `active-tenant` discriminated union. `_lib.ts:toAdminOrganizationsScope` derives scope **only** from `isPlatformAdmin`, which is set true **only** by server-side `isEnvBasedPlatformAdmin(email)`; ABAC `allowed` is never used as resource-scope proof (SEC-26). Non-platform reads/mutations bind `eq(organizationsTable.id, scope.organizationId)` AND-ed with the requested id in the same SQL statement; platform `active-tenant` re-resolves `tenantId` server-side (`resolveScope`). 16 in-scope callers individually diffed; `admin/waitlist/page.tsx` additionally gated to platform admin. | OZI-77 `02 - Security & Auth - Summary.md` (Post-Fix Recheck), `AdminOrganizationsScope.ts`, `DrizzleAdminOrganizations{Read,Mutation}Service.ts`, `_lib.ts`, merge `2450d410`; OZI-76 `matrix.md` | Delivery layer still conflates active-org id with tenant id (`TenantContext`); contained, not resolved — Phase 1. |
| 2 | Database-backed negative tests prove denied sibling and cross-tenant reads and mutations | PASS | `DrizzleAdminOrganizationsReadService.db.test.ts`: non-platform sibling read → `null`; platform sibling read allowed within active tenant only. `DrizzleAdminOrganizationsMutationService.db.test.ts`: non-platform sibling update rejected + row unchanged (`status` still `active`); platform active-tenant sibling update allowed; update outside active-tenant rejected. `admin/waitlist/page.db.test.ts` (real Postgres): tenant admin → 0 rows, platform → all rows. Runs in CI `DB Tests (Testcontainers)` / `pnpm test:db:ci`; OZI-77 merge CI run `33069257769` PASS (closes OZI-77's earlier "PGlite-only locally" gap). | OZI-77 `05 - Validation Strategy`, `validation-report.md`; OZI-76 `matrix.md` §DB-backed evidence; `.github/workflows/db-tests.yml` | None blocking. |
| 3 | Complete affected admin surface has a documented route/service/repository scope audit with no unexplained in-scope path | PASS | OZI-76 `matrix.md` classifies every `route.ts` + `page.tsx` under `src/app/api/admin/**` and `src/app/admin/**` (verdict per path, never downgraded for small fixes); `organizations/**` carried from OZI-77. `grep "'use server'"` confirmed no admin Server Actions. One CRITICAL (`admin/waitlist/page.tsx` reaching platform-global `listPending()` un-gated) fixed (`0912756a`) + DB-evidenced. Formal full-matrix Security/Auth sign-off recorded (`42a10f08`). | OZI-76 `matrix.md`, `02 - Security & Auth - Summary.md` §Full-Matrix Sign-Off | Considered-and-deferred arch-lint rule for direct service calls in admin pages (optional). |
| 4 | Read-only topology and identifier-integrity report/evidence package exists; no DB mutation in the inventory | PASS | OZI-75 `scripts/tenancy-inventory/` (merged `b9a8f61c`): 21-table ownership matrix, identifier-semantics inventory, read-only enforcement **proven** against real Postgres (`readonly-db.db.test.ts` — INSERT/UPDATE/DELETE/CREATE rejected with SQLSTATE `25006`). OZI-79 executed the **production** read-only inventory on `main@f2d57d52` with `readOnlyEnforcement: true`, dual control (SELECT-only role + `READ ONLY` txn), temporary role `ozi79_production_ro_20260829` REVOKE+DROP'd and independently verified absent. Aggregated/redacted findings only; raw evidence outside the repo. Zero mutation. | OZI-75 `matrix.md`, `validation-report.md`; OZI-79 Linear "Final production inventory evidence — acceptance handoff" + cleanup comments; PR #88 | Current prod is tiny (1 tenant / 1 org) — inventory proves current state, not scale. |
| 5 | Rollout, monitoring, rollback thresholds and Production validation documented and executable/readiness-validated | PASS (with documented limitations) | OZI-78 `plan.md`: ordered Gate A–E, provider/context matrix, remote-operation inventory. A2 redacted low-cardinality organization-boundary observability implemented. Rollback: `scripts/rollback-assessment/` — candidate identity, containment-floor ancestry (floor `2450d410`), environment-contract, schema-compat, AuthJS read-only smoke; 321 unit tests. A4.2c **final Production read-only verification** (`dpl_8FCKKvjZL11muPvhHuLrrq7AEE3w`, `main@4b274899`): 5/5 gates PASS, `rollbackAction: NOT_AUTHORIZED`, `rollbackExecutable: false`. Production migration validation hardened to fail closed on missing/duplicate/unknown journal entries; `prod-deploy.yml` serialized `concurrency: {group: production-deployment, cancel-in-progress: false}` with a self-validating contract. | OZI-78 `plan.md`, `04 - Implementation Agent - Summary.md`; PRs #89–#93; `8e552a22` | (a) Containment shipped to prod via normal deploy **before** a dedicated canary — recorded, not hidden. (b) Preview canary A3b (seeded sibling/cross-tenant negative assertions on a live Preview) built-capable but **not executed**; negative containment proven by real-DB tests + local AuthJS container Playwright + A3a read-only Preview PASS. (c) Prod topology (1 tenant / 1 org) cannot itself exercise sibling/cross-tenant denial — stated as a Gate D limitation, not falsely claimed. (d) Actual `vercel rollback`/`promote` traffic switch never rehearsed (would move prod traffic); readiness path exercised. |
| 6 | Phase 1 has a usable migration evidence handoff | PASS | OZI-79 "Final production inventory evidence — acceptance handoff" comment: **confirmed topology facts** (0 tenants w/ 0 orgs, 1 w/ exactly 1 org, 0 w/ multiple; 0 multi-org users; 0 multi-tenant users; 0 quota exceedance; 0 populated `tenant_id`-shape in feature_flags/audit_log_settings/audit_events), quantified. **Identifier-semantic drift**: local `dev-db` 100% of populated `audit_events.tenant_id` resolve to organization uuids, none to tenant (the exact conflation Phase 1 exists to fix); production none currently populated. **Ownership/scope findings**: OZI-75 ownership matrix + ambiguous rows. **Explicit unknowns**: scale/topology behaviour, `waitlist_entries.tenant_id` dead-column hypothesis, `policies.organization_id` NULL semantics. **Provider-mapping inputs**: 1 prod org w/o `auth_organization_identities`, 1 prod user w/ multiple same-provider `auth_user_identities`. **Deferred to Phase 1**: canonical two-ID / AccessContext model, tenant roles/memberships, column-drop decisions. No Phase 0 architecture guessed. | OZI-79 Linear handoff comment; OZI-75 `matrix.md`; OZI-79 description §Acceptance Criteria | Handoff reflects current prod state; 1:N and N:M tenant↔org cases remain unmeasured at scale. |
| 7 | No confirmed Critical or Major sibling-org / cross-tenant authorization defect open at Phase 0 exit | PASS | OZI-77 CRITICAL (sibling/cross-tenant read+mutation bypass) contained + verified on `main`. OZI-76 CRITICAL (waitlist page cross-tenant PII exposure) fixed + DB-evidenced. OZI-76 full-matrix sign-off: "No confirmed critical cross-tenant or sibling-organization path remains open." Production migration-journal drift found during OZI-78 is a schema/deployment-integrity issue, not an authorization defect, and was repaired under separate authorization. | OZI-77 `02 - Security & Auth` close-out verdict; OZI-76 `02 - Security & Auth` §Full-Matrix Sign-Off | None. |
| 8 | A final Security/Auth verdict can be stated on evidence, not assumption | PASS | This audit states it below, from merged code + CI + DB tests + task artifacts. | This document | None. |

## Final Security/Auth verdict

**GO — Phase 0 (OZI-74) may close.**

All six parent acceptance criteria and all eight required proof points are
supported by authoritative repository evidence. The blocking criteria (1, 2,
3, 4, 6, 7) are unconditionally PASS. Criterion 5 is PASS with explicitly
documented, non-blocking limitations that the parent acceptance criteria do
not require to be lifted in Phase 0.

### Security boundary preserved at Phase 0 exit

- **Organization-scoped non-platform administrators cannot widen to sibling
  organizations.** Resource scope is derived solely from the server-verified
  `isEnvBasedPlatformAdmin` check and enforced as `eq(organizationsTable.id,
  scope.organizationId)` AND-ed with the requested id in the same SQL
  statement. A spoofed scope object cannot roam.
- **Cross-tenant access remains denied.** Proven by real-Postgres negative
  tests for both reads and mutations; the platform `active-tenant` path
  re-resolves `tenantId` server-side from the active organization.
- **Platform-admin paths remain explicit and auditable.** `active-tenant`
  scope is never global; step-up (`withAdminStepUp`) and
  `recordAdminAuditEvent` behaviour is structurally unchanged; the
  platform-global waitlist read is gated to `isEnvBasedPlatformAdmin` at
  every call site.
- **Phase 0 containment is not presented as the final architecture.** Every
  artifact (Architecture Guard "GO WITH FOLLOW-UP", OZI-77/78/79 plans)
  explicitly defers the canonical two-ID / AccessContext / DataScope model,
  tenant roles/memberships, and legacy-resolver retirement to Phase 1.

## Residual risks / deferred Phase 1 items

### A. CLOSED in Phase 0

- Sibling-organization admin read/mutation bypass for non-platform actors (OZI-77).
- Waitlist admin page cross-tenant applicant-PII exposure (OZI-76).
- Absence of a documented admin-surface route/service/repository scope audit (OZI-76).
- Absence of a read-only tenant/organization topology + identifier-integrity
  inventory, and of authorized remote/production execution of it (OZI-75, OZI-79).
- Absence of rollback readiness, organization-boundary monitoring, and a
  Production validation record (OZI-78).
- Production migration-journal drift: duplicate `0009_authjs_credentials`
  row, retired `0014_pending_invitation_unique` row, and the orphaned
  `public.uq_invitations_org_email_pending` index — repaired under separate
  authorization; post-repair state independently verified (21 unique current
  hashes, retired index absent). Migration validation now fails closed on
  missing, duplicate, and unknown journal entries.
- Absence of Production-deploy serialization — `prod-deploy.yml` now carries
  `concurrency: {group: production-deployment, cancel-in-progress: false}`
  with a self-validating contract check. Preventive; **not** a proven cause
  of the historical duplicate row.

### B. ACCEPTED / DEFERRED to Phase 1

- Canonical two-ID / AccessContext / DataScope model (Phase 1 ADR).
- Tenant roles/memberships; retirement of `TENANCY_MODE=single/personal` code
  paths and legacy resolvers.
- Delivery-layer conflation of active-organization id with tenant id
  (`TenantContext`, `AdminOrganizationsScope`) — contained, not removed.
- `waitlist_entries.tenant_id` — dead-column vs wire-it-up decision.
- `policies.organization_id` NULL semantics / `NOT NULL` decision.
- `feature_flags` / `audit_log_settings` / `audit_events` `tenant_id`
  `text`-column shape (configuration-dependent; local `dev-db` shows
  organization uuids in `audit_events.tenant_id`).
- Provider-mapping anomalies: one production organization without an
  `auth_organization_identities` row; one production user with multiple
  `auth_user_identities` rows for the same provider — provider-parity input.
- Production topology at scale is unknown (current production is one tenant /
  one organization; 1:N and N:M tenant↔organization cases unexercised).

### C. OPTIONAL defense-in-depth / operational improvements

- DB-level advisory lock / migration serialization to cover non-GitHub /
  manual / native deploy paths (workflow `concurrency` only covers GitHub
  Actions).
- Arch-lint rule: every direct service call in `src/app/admin/**/page.tsx`
  must be preceded by an `isEnvBasedPlatformAdmin`/scope call (OZI-76
  considered-and-deferred).
- Execute Preview canary A3b: seeded sibling/cross-tenant negative assertions
  against a live isolated Preview deployment.
- Clerk-provider canary parity (Clerk is not the actively deployed provider;
  the container scenario is AuthJS).
- Tune redacted scope-denial telemetry alert thresholds against observed
  Production baseline rates.
- Pre-existing unrelated `arch:lint` FAIL in
  `src/security/api/strict-rate-limit.ts` (present on `main` before Phase 0;
  untouched by all Phase 0 work).

## Explicit Phase 1 handoff

Inputs Phase 1 should consume:

1. OZI-79 Linear "Final production inventory evidence — acceptance handoff"
   comment (aggregated/redacted topology facts, identifier drift,
   provider-mapping anomalies, explicit unknowns).
2. OZI-75 `scripts/tenancy-inventory/ownership-matrix.ts` + `matrix.md`
   (21-table ownership + identifier-semantics; source of truth for the
   two-ID split).
3. OZI-76 `matrix.md` (admin-surface scope map to migrate onto AccessContext).
4. OZI-77 `AdminOrganizationsScope` — the interim containment shape to be
   replaced by the canonical AccessContext / DataScope.
5. Raw environment-specific evidence in the external evidence store (outside
   the repository) for anyone re-deriving counts.

Phase 1 owns: the canonical tenant/organization architecture (OZI-71),
tenant-role model, legacy-resolver retirement, and the deferred schema
decisions in section B. Phase 0 has guessed none of them.

## Closure criteria

Met:

- OZI-75, OZI-76, OZI-77, OZI-78, OZI-79 are Done with accepted evidence.
- Every OZI-74 parent acceptance criterion is proven from merged code, CI, DB
  tests, and task artifacts (matrix above).
- No confirmed Critical/Major sibling-organization or cross-tenant
  authorization defect remains open.
- Final Security/Auth verdict recorded: **GO**.
- This closure performed no Production operation, migration, rollback,
  promote, or data mutation.

Not required for closure (deferred): section B and section C items.
