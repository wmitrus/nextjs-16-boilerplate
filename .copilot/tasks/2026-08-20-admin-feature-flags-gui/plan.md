# Task Plan — Admin Feature Flags GUI

## Status

**SPECIALIST SEQUENCE COMPLETE — all 3 GO.** Architecture Guard, Security/Auth,
Next.js Runtime all reviewed. Consolidated constraint summary below.
Awaiting user go-ahead on implementation plus the one escalated question
(audit depth) before proceeding to Step 6.

## Consolidated Constraint Summary (Step 5)

**Architecture:**
1. New `DrizzleFeatureFlagAdminService` — separate class, no
   `core/contracts` interface, no DI token, directly instantiated in route
   handlers. `FeatureFlagService` and its 3 adapters stay untouched.
2. New `RESOURCES.FEATURE_FLAG` + `ACTIONS.FEATURE_FLAG_READ`/`_MANAGE` in
   `resources-actions.ts`.

**Security/Auth:**
3. `seed.ts`: add both new actions to the `acmeOwner`/`globexOwner` policy
   entries only (alongside their existing `SECURITY_*` grant) — not to
   `member`.
4. Gating per-operation: `FEATURE_FLAG_READ` for GET, `FEATURE_FLAG_MANAGE`
   for POST/PATCH/DELETE — mirrors `users/[id]/route.ts`, not one blanket
   check per route file.
5. Mutations logged via `logger.info({event: 'admin:feature_flag_*', ...})`
   — not `logActionAudit()`.
6. `[id]`-param routes must `z.uuid()`-parse before use in a Drizzle
   predicate (SEC-23).
7. Cross-tenant visibility in the list view is correct as designed — do
   not scope to the admin's own tenant.
8. **OPEN, escalated to user**: audit depth for flag mutations. Default
   recommendation is log-only (matches existing precedent for all admin
   mutations in this repo) — will proceed with that default unless told
   otherwise.

**Next.js Runtime:**
9. `feature-flags/page.tsx` — thin RSC shell (metadata + log context +
   render client component), no `connection()`, no `getAppContainer()`,
   mirrors `users/page.tsx`.
10. `env.FEATURE_FLAG_PROVIDER` is read in the `GET` route handler,
    returned as `activeProvider` in the response payload — not read in the
    page component (corrects the original phrasing of Architecture Guard's
    constraint #4 above).
11. Route handlers: `withErrorHandler(withNodeProvisioning(...))`,
    `await connection()` first — mirrors `invitations/route.ts`.

**Explicitly allowed implementation scope:** everything listed in
`intake.md`'s Requirements/Scenarios, using the file shape below.

**Explicitly forbidden:** widening `FeatureFlagService`; adding
`connection()`/`getAppContainer()` to the RSC page; granting the new
actions to `member`; using `logActionAudit()`; any change to the 3
existing feature-flag adapters, the CLI tooling, or the DB schema.

## Planned File Shape (Step 6 target)

- `src/core/contracts/resources-actions.ts` — add `RESOURCES.FEATURE_FLAG`,
  `ACTIONS.FEATURE_FLAG_READ`, `ACTIONS.FEATURE_FLAG_MANAGE`
- `src/modules/authorization/infrastructure/drizzle/seed.ts` — extend
  `acmeOwner`/`globexOwner` policy entries
- `src/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService.ts`
  (new) — `listAll()`, `create()`, `update()`, `delete()`
- `src/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService.db.test.ts`
  (new)
- `src/app/api/admin/feature-flags/route.ts` (new) — GET, POST
- `src/app/api/admin/feature-flags/route.test.ts` (new)
- `src/app/api/admin/feature-flags/[id]/route.ts` (new) — PATCH, DELETE
- `src/app/api/admin/feature-flags/[id]/route.test.ts` (new)
- `src/app/admin/feature-flags/page.tsx` (new)
- `src/app/admin/feature-flags/FeatureFlagsClient.tsx` (new)
- `src/app/admin/feature-flags/FeatureFlagsClient.test.tsx` (new)
- `src/app/admin/page.tsx` — flip Feature Flags card `status` to `'active'`

## Objective

Build the admin GUI for Feature Flags management at `/admin/feature-flags`,
wiring the existing, unchanged `feature_flags` backend to a new admin CRUD
surface, following the established pattern of `/admin/users` and
`/admin/waitlist`. Flip the "Feature Flags" card on `/admin` from
`coming-soon` to `active` once the page exists.

This is the first real feature built with the repository's Claude Code
skill set (ported this session from Codex) — run the full
`safe-feature-workflow` sequence properly.

## Why This Task, Why Now

Chosen over the other remaining `coming-soon` admin card ("Security" — audit
logs / security events / API access policies) because Feature Flags has a
fully-built backend (contract, 3 adapters, DB table, migrations, CLI
tooling) and only the admin UI is missing, whereas Security has no
persisted audit store or API-access-policy concept at all yet — a
materially larger, more architecturally open task. See chat transcript for
the comparison; not duplicated here to avoid restating evidence already
gathered.

## Likely Affected Areas

- `src/core/contracts/resources-actions.ts` — new `RESOURCES.FEATURE_FLAG`,
  `ACTIONS.FEATURE_FLAG_READ`/`FEATURE_FLAG_MANAGE`
- `src/modules/authorization/infrastructure/drizzle/seed.ts` — wire the new
  resource/actions into seeded role policy blocks
- `src/modules/feature-flags/infrastructure/drizzle/` — new
  `DrizzleFeatureFlagAdminService` (separate from `DrizzleFeatureFlagService`)
- `src/app/api/admin/feature-flags/` — new route handler(s)
- `src/app/admin/feature-flags/` — new RSC page + client component
- `src/app/admin/page.tsx` — flip Feature Flags card status
- Tests mirroring the existing admin-route/admin-page test shape

## Expected Specialist Sequence

1. Architecture Guard — **done**, GO with binding placement constraints
2. Security/Auth — next (resource/action naming, seed wiring, gating shape)
3. Next.js Runtime — RSC/client split, route handler shape, caching
4. Constraint summary
5. Implementation
6. Validation

## Task List

- [x] Architecture Guard review
- [x] Security/Auth review
- [ ] Next.js Runtime review
- [ ] Constraint summary
- [ ] Implementation
- [ ] Validation
- [ ] Flip `/admin/page.tsx` card status to `active`

## Planned Artifacts

- `plan.md` (this file)
- `intake.md`
- `01 - Architecture Guard - Summary.md` — done
- `02 - Security & Auth - Summary.md`
- `03 - Next.js Runtime - Summary.md`
- `04 - Implementation Agent - Summary.md`
- `validation-report.md`

## Leantime

Not performed. No real `.env.leantime`/`.env.leantime-dev` exists in this
session (only `.env.leantime.example`/`.env.leantime-dev.example`), and
`pnpm lt -- list` hangs rather than failing cleanly. Recorded as a session
environment limitation per `docs/ai/general/LEANTIME_AUTOMATION.md`'s
diagnostic rule, not a claim that the repo's Leantime integration is
broken.

## Architecture Guard Decision (binding constraint for Implementation)

1. New `DrizzleFeatureFlagAdminService` — separate class, no
   `core/contracts` interface, no DI token, directly instantiated at the
   route-handler call site. Does **not** extend `FeatureFlagService`
   (widening that interface would break Static/GrowthBook adapter
   substitutability and the fail-safe contract).
2. New `RESOURCES.FEATURE_FLAG` + `ACTIONS.FEATURE_FLAG_READ`/`_MANAGE`,
   wired into `seed.ts`'s role policy blocks (skipping this leaves the ABAC
   path unreachable, `isEnvBasedPlatformAdmin` becoming the only gate).
3. The admin page must read and surface `env.FEATURE_FLAG_PROVIDER`, and
   must not present mutations as meaningful when the active provider isn't
   `db` (editing DB rows has zero runtime effect under `static`/`growthbook`).

Full reasoning: `01 - Architecture Guard - Summary.md`.
