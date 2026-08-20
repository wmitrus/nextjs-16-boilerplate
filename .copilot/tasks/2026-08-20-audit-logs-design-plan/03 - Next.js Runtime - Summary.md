# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: `2026-08-20-audit-logs-design-plan`
- Task Objective: Implement Phase 1 (audit-log category settings: schema, admin CRUD, admin API route, admin toggle UI).
- Current Run Scope: runtime placement of the new route handler and admin page.
- Status: COMPLETED
- Last Updated: 2026-08-20
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

- what the next agent should rely on: the `connection()`-first ordering and the ResponseService convention are both settled — copy them exactly, do not improvise a variant.
- what should not be re-decided without new evidence: Node-only placement (no Edge component in Phase 1).
- recommended next specialist or step: Implementation.

## Update Log

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 1 implementation kickoff
- Summary of change: Runtime placement confirmed as a direct structural mirror of the feature-flags admin surface; no deviations required.
- Sections refreshed: all
