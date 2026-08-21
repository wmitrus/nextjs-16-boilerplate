# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: `2026-08-20-audit-logs-design-plan`
- Task Objective: Implement the audit-logging plan phase by phase. Phases 1-5 are complete, plus the Phase-3-flagged test-coverage gap.
- Current Run Scope: Phase 5 — documentation only, describing runtime placement decisions already made and validated in Phases 1-4. No runtime surfaces changed.
- Status: COMPLETED
- Last Updated: 2026-08-20 (Phase 5)
- Related Control Artifacts: `plan.md`, `01 - Architecture Guard - Summary.md`

## Scope Handled

- runtime entrypoints reviewed: `src/app/api/admin/feature-flags/route.ts` (pattern), `src/app/admin/feature-flags/page.tsx` (pattern)
- App Router surfaces reviewed: new `src/app/api/admin/audit-log-settings/route.ts`, new `src/app/admin/security/page.tsx`
- runtime questions in scope: Node vs Edge, `cacheComponents` dynamic opt-in, server/client component split

## Inputs Reviewed

- code paths reviewed: `next.config.ts` (`cacheComponents: true`), `AGENTS.md` §"Next.js 16 Key Configuration" (route segment config ban), `src/app/api/admin/feature-flags/route.ts`, `src/app/admin/feature-flags/page.tsx`, `src/app/admin/layout.tsx`
- runtime docs reviewed: `AGENTS.md` `cacheComponents: true` hard constraint section (route segment configs banned; `await connection()` is the only dynamic opt-in)
- earlier task artifacts reviewed: `plan.md` Part A.6 (Edge cannot reach Postgres directly — irrelevant to Phase 1 since there is no writer yet)

## Actions Performed

- server/client boundary review performed: route handler is server-only (Node runtime, DB access via `INFRASTRUCTURE.DB`); `src/app/admin/security/page.tsx` is a server component (RSC) that renders a `'use client'` `AuditSettingsClient` for the interactive table/form, exactly mirroring `feature-flags/page.tsx` + `FeatureFlagsClient.tsx`.
- route handler / server action review performed: no server actions used — this surface follows the existing admin-API route-handler convention (`fetch()` from the client component), not `createSecureAction`, consistent with every other `/api/admin/*` route in this repo.
- proxy review performed: `src/proxy.ts` unaffected — `/admin/security` and `/api/admin/audit-log-settings` fall under the existing admin route classification already handled by `src/app/admin/layout.tsx`'s guard; no proxy changes needed.
- cache / runtime review performed: `cacheComponents: true` is active repo-wide — the route handler and the RSC page must both call `await connection()` before any request-time/DB-touching work, exactly as `feature-flags/route.ts` and `feature-flags/page.tsx` already do. `export const runtime` / `export const dynamic` are banned and are not used anywhere in this change.

## Current-State Findings

- Confirmed: `src/app/api/admin/feature-flags/route.ts` calls `await connection()` as the first statement inside each handler, before `getAppContainer()` — this exact ordering is required (RSC Dynamic Rendering — `getAppContainer()` Pattern, `AGENTS.md`) because the DI initializer's Pino logger calls `Date.now()` internally.
- Confirmed: `src/app/admin/feature-flags/page.tsx` calls `getServerRequestLogContext({ pathname })` (which itself satisfies the dynamic-opt-in requirement via `headers()`/`connection()` internally) before rendering the client component — the new `/admin/security/page.tsx` follows the same shape.
- Risks: none — this is a direct structural copy of an already-working, already-tested runtime pattern.
- Drift: none.

## Runtime Boundary Assessment

- server vs client placement: `page.tsx` (RSC, server) renders `AuditSettingsClient.tsx` (`'use client'`) which owns all fetch/mutation state — identical split to `feature-flags`.
- edge vs node placement: Node only. No Edge-runtime code is introduced in Phase 1 (the future `AuditLogService` writer's Edge-forwarding concern from `plan.md` A.6 is out of scope here — there is no writer yet).
- route handler / page / layout responsibilities: `route.ts` owns auth + DB CRUD; `page.tsx` owns metadata + dynamic opt-in + composition; `AuditSettingsClient.tsx` owns fetch/mutate/render; `src/app/admin/layout.tsx` (unchanged) owns the outer admin-panel gate.
- proxy responsibilities: unchanged.

## Caching And Revalidation Notes

- cache-sensitive observations: settings are tenant-sensitive (a tenant's own override must never be cached and served to a different tenant) — the route's `await connection()` plus per-request container resolution (no module-level caching of the DB result) prevents this; same posture as `feature-flags`.
- revalidation observations: no `revalidatePath`/`revalidateTag` needed — the client re-fetches via `fetchSettings()` after every mutation, same as `FeatureFlagsClient.fetchFlags()`.
- request-time vs build-time notes: nothing in this surface can be statically prerendered (admin-gated, DB-backed, tenant-sensitive) — `await connection()` makes that explicit rather than relying on incidental dynamism.

## Runtime Decisions / Constraints

- approved runtime constraints:
  - `await connection()` first in every route handler export and at the top of the page's async function, before any `getAppContainer()`/DB call.
  - No `export const runtime` / `export const dynamic` anywhere in the new files (banned under `cacheComponents: true`).
  - Route handler uses the shared `ResponseService` helpers (`createSuccessResponse`/`createServerErrorResponse`) per `AGENTS.md` API Response Discipline — no ad hoc `NextResponse.json()`.
- rejected directions: none — no runtime alternative was considered necessary given the strength of the existing precedent.
- runtime assumptions requiring validation: none for Phase 1.

## Artifact Synchronization

- `plan.md` updates: none beyond the Architecture Guard's `/admin/security` path correction (already recorded there).
- `intake.md` updates: none.
- `implementation-plan.md` updates: n/a.
- specialist artifact updates: this file created.

## Open Questions / Blockers

- unresolved questions: none.
- blockers: none.
- evidence still needed: none for Phase 1.

## Handoff Notes

- what the next agent should rely on: the `connection()`-first ordering and the ResponseService convention are both settled — copy them exactly, do not improvise a variant. As of Phase 2: the writer is Node-only and must stay that way; if a future phase wires `security_event`-worthy detections that originate in `src/proxy.ts` (Edge), route them through the existing edge->node `/api/logs` ingest bridge per `plan.md` A.6, not a direct DB call from Edge.
- what should not be re-decided without new evidence: Node-only placement for the writer path.
- recommended next specialist or step: Phase 3's admin-route instrumentation stays Node-only (every `/api/admin/**` route already is) — no new runtime review needed there unless a route turns out to run on Edge.

## Update Log

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 1 implementation kickoff
- Summary of change: Runtime placement confirmed as a direct structural mirror of the feature-flags admin surface; no deviations required.
- Sections refreshed: all

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 2 implementation kickoff
- Summary of change: Confirmed both new call sites (`logActionAudit` in `src/security/actions/action-audit.ts`, invoked from `createSecureAction`; `logSecurityEvent` in `src/security/utils/security-logger.ts`) are already exclusively Node-runtime today — `createSecureAction`'s existing DB-backed ABAC authorization already required Node, and `logSecurityEvent` was never called from `src/proxy.ts` (Edge) at all (confirmed by grep: its only callers before this phase were its own test file and the docs example). Adding a `getAppContainer()`/DB-touching call inside both is therefore safe under the Edge-vs-Node boundary rule (`docs/architecture/15 - Edge vs Node Composition Root Boundary.md`) without any new runtime guard. No `src/proxy.ts` changes were needed or made. `AUDIT_LOG.SERVICE` registration in `src/core/runtime/bootstrap.ts`'s `createRequestContainer()` runs in the same Node composition-root path as every other service there (`FEATURE_FLAGS.SERVICE`, `PROVISIONING.SERVICE`) — no new lifecycle concern.
- Sections refreshed: Scope Handled, Runtime Boundary Assessment, Runtime Decisions / Constraints, Handoff Notes

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 3 implementation kickoff
- Summary of change: All ~15 touched route files already call `await connection()` first (unchanged); the new `await recordAdminAuditEvent(...)` calls were inserted after each mutation's own DB work completes and before its `return createSuccessResponse(...)`, so no route's response shape, status code, or error-branch behavior changed — confirmed by the full existing route-test suite (208 files) passing unchanged plus wiring assertions added to 5 representative test files. `src/app/admin/layout.tsx` is an RSC (Server Component), not a route handler, but is already `await connection()`-gated (via `getServerRequestLogContext`) before any of the three new audit calls — same dynamic-rendering posture as the rest of the file, no change needed. All instrumented call sites remain Node-only; `src/proxy.ts` was not touched.
- Sections refreshed: Scope Handled, Actions Performed, Current-State Findings

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 4 implementation kickoff
- Summary of change: Three new/changed runtime surfaces reviewed:
  1. `GET /api/admin/audit-logs` (`src/app/api/admin/audit-logs/route.ts`) — same shape as every other admin route this task has touched: `await connection()` first, `withNodeProvisioning` wraps the handler (Node-only, DB-backed authorization), `getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB)` for the read service. No caching directives needed or added — this is an always-dynamic, always-fresh admin read, matching the settings route's precedent.
  2. `/admin/security/audit-logs` (`src/app/admin/security/audit-logs/page.tsx`) — an `async` Server Component calling `await getServerRequestLogContext({ pathname: '/admin/security/audit-logs' })` before rendering, identical to the existing `/admin/security` and `/admin/feature-flags` pages' pattern (this call is itself what makes the page correctly dynamic under `cacheComponents: true`, without needing `export const dynamic`, which this repo's `next.config` bans). `AuditLogsClient` is a plain `'use client'` component that fetches from the new route on mount/filter-change/pagination — no server-side data fetching in the page itself, matching `AuditSettingsClient`'s existing shape exactly (client-fetches-its-own-data, not RSC-fetched-then-passed-as-props).
  3. `scripts/audit-log/purge-expired.ts` + `.github/workflows/audit-log-purge.yml` — **not** part of the Next.js request/render runtime at all. It is a standalone Node script invoked by a scheduled GitHub Actions job, using `createDb()` directly (the same composition pattern every other standalone script in `scripts/` already uses — `db-seed.ts`, `flags/migrate.ts`) rather than going through `getAppContainer()`/the request-scoped composition root. No Edge/Node boundary question applies to it; it never runs inside a request. Confirmed no raw `DATABASE_URL` GitHub secret exists in this repo for scheduled workflows (grepped `.github/workflows/*.yml`) — the workflow reuses `prod-deploy.yml`'s already-proven `vercel pull --environment=production --token=${{ secrets.VERCEL_TOKEN }}` step to materialize `.vercel/.env.production.local`, then invokes `pnpm audit-log:purge:vercel:prod` (`node --env-file=.vercel/.env.production.local --import tsx ...`), matching the existing `tenant:readiness:vercel:prod` script's env-file convention exactly.
- Sections refreshed: Scope Handled, Actions Performed, Runtime Boundary Assessment, Handoff Notes

### Update Entry

- Date: 2026-08-20
- Trigger: residual test-coverage-gap fix (flagged in Phase 3), then Phase 5 implementation kickoff
- Summary of change: No runtime surface changed in either follow-up. The `policies`/`roles` route test additions exercise existing runtime behavior (`await connection()`, `withNodeProvisioning`) without modifying it. Phase 5 is a docs-only pass describing the runtime placement decisions already recorded above (Phase 4 entry) — `docs/features/36 - Audit Logging & Retention.md` §2's layer map and the new `docs/architecture/10` §8.4 catalog entry both restate, rather than revise, those decisions. Nothing new to assess here.
- Sections refreshed: Handoff Notes
