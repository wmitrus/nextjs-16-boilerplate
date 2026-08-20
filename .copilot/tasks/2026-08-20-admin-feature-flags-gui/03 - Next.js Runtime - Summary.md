# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: 2026-08-20-admin-feature-flags-gui
- Task Objective: Build the admin GUI for Feature Flags management at `/admin/feature-flags`
- Current Run Scope: Runtime review before implementation (safe-feature-workflow Step 4)
- Status: COMPLETED
- Last Updated: 2026-08-20
- Related Control Artifacts: `plan.md`, `intake.md`, `01 - Architecture Guard - Summary.md`, `02 - Security & Auth - Summary.md`

## Scope Handled

- runtime entrypoints reviewed: `src/app/admin/layout.tsx`,
  `src/app/admin/users/{page.tsx,UsersClient.tsx}`,
  `src/app/api/admin/invitations/route.ts`
- App Router surfaces reviewed: admin layout guard, RSC page shell pattern,
  client-side data-fetching pattern, route handler shape
- runtime questions in scope: route handler placement, RSC/client split,
  where to read `env.FEATURE_FLAG_PROVIDER`, caching, Edge/Node

## Inputs Reviewed

- code paths reviewed: see Scope Handled; also grepped `UsersClient.tsx`
  for `fetch`/`useEffect`/`getAppContainer` to confirm the client-fetch
  pattern rather than assume it
- runtime docs reviewed: `docs/ai/general/03 - Next.js Runtime Agent.md`,
  `AGENTS.md`'s RSC Dynamic Rendering / `getAppContainer()` note
- earlier task artifacts reviewed: `01 - Architecture Guard - Summary.md`,
  `02 - Security & Auth - Summary.md`

## Actions Performed

- server/client boundary review performed: confirmed `users/page.tsx` does
  zero server-side data fetching; all CRUD happens client-side via `fetch()`
- route handler / server action review performed: confirmed
  `withErrorHandler(withNodeProvisioning(...))` + `connection()`-first shape
  is uniform across `users/route.ts`, `users/[id]/route.ts`,
  `invitations/route.ts`
- proxy review performed: confirmed `src/proxy.ts` is not the enforcement
  point for `/admin/*` (the layout guard is) and is untouched by this task
- cache / runtime review performed: confirmed no `export const dynamic`/
  `runtime` anywhere in the admin route tree (would be a build error under
  `cacheComponents: true`); confirmed the new page needs no `connection()`
  call of its own

## Current-State Findings

- Confirmed: admin auth gate lives at `src/app/admin/layout.tsx`, not
  per-page — child pages don't re-check access
- Confirmed: the Users admin page pattern is "thin RSC shell + client-side
  `fetch()`", not "RSC pre-fetches, passes props"
- Risks: Architecture Guard's constraint ("admin page must surface
  `env.FEATURE_FLAG_PROVIDER`") was phrased assuming server-side page data
  fetching that doesn't exist in this pattern — corrected below
- Drift: none — `AGENTS.md`'s RSC/`getAppContainer()` guidance is accurately
  reflected everywhere checked, and correctly doesn't apply to the planned
  page (which won't call `getAppContainer()`)

## Runtime Boundary Assessment

- server vs client placement: RSC page = thin shell (metadata + log context
  + render client component), matching `users/page.tsx`; all data
  fetching/mutation client-side via `fetch()` to the new route handlers
- edge vs node placement: Node throughout, by inheritance — no edge export
  anywhere in `/admin` or `/api/admin/*`, and DB access requires Node
- route handler / page / layout responsibilities: layout = auth gate
  (unchanged); page = shell (no data); route handlers = all CRUD + env read
- proxy responsibilities: none, untouched

## Caching And Revalidation Notes

- cache-sensitive observations: page itself fetches nothing dynamic, so
  there's no tenant/user-sensitive caching risk at the page level; route
  handlers are request-time by construction (`connection()` first)
- revalidation observations: n/a — client-side `fetch()` on mount/action,
  no ISR/ `revalidate` involved anywhere in this pattern
- request-time vs build-time notes: the `/admin` hub page's card-status
  flip (`coming-soon` → `active`) is a static string literal in
  `adminCards`, not fetched or cached data — no caching interaction to
  consider

## Runtime Decisions / Constraints

- approved runtime constraints:
  1. `feature-flags/page.tsx` is a thin shell — no `connection()`, no
     `getAppContainer()`, matching `users/page.tsx`
  2. `env.FEATURE_FLAG_PROVIDER` is read in the **route handler**
     (`GET /api/admin/feature-flags`), returned as an `activeProvider`
     field in the response payload — not read in the page component
  3. Route handlers: `withErrorHandler(withNodeProvisioning(...))`,
     `await connection()` first, mirroring `invitations/route.ts`/
     `users/route.ts` exactly
- rejected directions: adding server-side data fetching to the RSC page
  just to read one env var — would diverge from every sibling admin page's
  shape for no benefit
- runtime assumptions requiring validation: none outstanding

## Artifact Synchronization

- `plan.md` updates: none required beyond noting the constraint correction
  (see below)
- `intake.md` updates: none required — requirements text didn't specify
  *where* the provider is read, only that it must be surfaced
- `implementation-plan.md` updates: not yet created
- specialist artifact updates: this file (new)

## Open Questions / Blockers

- unresolved questions: none
- blockers: none — full specialist sequence (Architecture, Security, Runtime)
  is now GO
- evidence still needed: none

## Handoff Notes

- what the next agent should rely on: the corrected placement for
  `env.FEATURE_FLAG_PROVIDER` (route handler, not page); the thin-shell
  page pattern; the route handler shape mirroring `invitations/route.ts`
- what should not be re-decided without new evidence: RSC/client split,
  Node-only placement, no `connection()` in the page
- recommended next specialist or step: Implementation, using the
  consolidated constraint summary in `plan.md`

## Update Log

### Update Entry

- Date: 2026-08-20
- Trigger: Initial Next.js Runtime review for safe-feature-workflow Step 4
- Summary of change: First and only pass; GO, one correction to Architecture
  Guard's phrasing (env read location), full specialist sequence now complete
- Sections refreshed: all
