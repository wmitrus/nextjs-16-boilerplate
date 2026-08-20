# Intake — Admin Feature Flags GUI

## Title

Admin GUI for Feature Flags management.

## Objective

Give platform administrators a working `/admin/feature-flags` page to view
and manage `feature_flags` rows (global and tenant-scoped), matching the
UX and access-control shape of the existing `/admin/users` and
`/admin/waitlist` admin pages.

## Problem Statement

The `/admin` hub already advertises a "Feature Flags" card
(`src/app/admin/page.tsx`) with `status: 'coming-soon'` and target route
`/admin/feature-flags` — the route does not exist yet. The backend
(`FeatureFlagService`, 3 adapters, `feature_flags` table, migrations, CLI
import/export/migrate tooling) is fully built and documented
(`docs/features/24 - Feature Flags.md`); only the admin CRUD surface is
missing.

## Scope

- New admin-only CRUD service for `feature_flags` rows (list including
  tenant-scoped overrides, create, update `enabled`/`description`, delete).
- New `/api/admin/feature-flags` route handler(s), gated the same way as
  existing admin routes.
- New `/admin/feature-flags` RSC page + client component, following the
  `UsersClient.tsx` pattern (search/pagination optional given expected low
  row counts, but list/create/edit/delete must all be present).
- Surface the active `FEATURE_FLAG_PROVIDER` prominently; disable/block
  mutations when it isn't `db` (see Architecture Guard finding).
- New `RESOURCES.FEATURE_FLAG` / `ACTIONS.FEATURE_FLAG_READ`,
  `FEATURE_FLAG_MANAGE`, wired into `seed.ts` role policy blocks.
- Flip the `/admin` card's `status` to `'active'`.
- Tests: unit (route handlers), DB integration (`*.db.test.ts` for the new
  admin service), component test for the client, E2E spec if the risk
  warrants it (decided at the Validation Strategy / implementation stage).

## Out Of Scope

- Any change to `FeatureFlagService`, its 3 adapters, or the
  `ResilientFeatureFlagService` wrapper — read-only for this task.
- Any change to the feature-flag CLI tooling (`flags:migrate`/`export`/`import`).
- The "Security" admin card (audit logs / security events / API access
  policies) — the other remaining `coming-soon` card, deliberately not
  picked for this task; no persisted audit store exists yet, a materially
  larger task.
- Per-tenant flag override UI beyond what the existing table already
  models (global row = `tenant_id IS NULL`, tenant row = specific
  `tenant_id`) — no new tenant-scoping concept is being introduced.

## Requirements

1. List all `feature_flags` rows (global + tenant-scoped), paginated if row
   count could reasonably exceed one screen.
2. Create a new flag (key, optional tenant scope, enabled, description).
3. Update a flag's `enabled` state and `description`.
4. Delete a flag row.
5. Enforce the unique `(key, tenant_id)` constraint at the API layer with a
   clear validation error, not a raw DB constraint-violation surfaced to
   the client.
6. Gate access via `isEnvBasedPlatformAdmin(email)` OR
   `AuthorizationService.can()` with the new `FEATURE_FLAG_*` actions,
   mirroring `src/app/api/admin/users/route.ts`'s `checkAdminAccess` shape.
7. Show the active `FEATURE_FLAG_PROVIDER` and prevent mutations from
   appearing meaningful when it isn't `db`.

## Scenarios / Use Cases

- S1: Admin views the flags list, sees global and tenant-scoped rows
  clearly distinguished.
- S2: Admin creates a new global flag.
- S3: Admin creates a tenant-scoped override for an existing key.
- S4: Admin attempts to create a duplicate `(key, tenant_id)` pair → clear
  validation error, no 500.
- S5: Admin toggles a flag's `enabled` state.
- S6: Admin deletes a flag row.
- S7: Non-admin authenticated user hits the API directly → 403.
- S8: Unauthenticated request → rejected before the admin check runs
  (matches existing admin route behavior via `withNodeProvisioning`).
- S9: `FEATURE_FLAG_PROVIDER` is `static` or `growthbook` → admin page
  makes this visible and does not let the admin believe a mutation changed
  live behavior.

## Acceptance Criteria

- [ ] `/admin/feature-flags` renders for a platform admin, gated the same
      way as other admin pages.
- [ ] All CRUD operations work against the `feature_flags` table via the
      new admin-only service (not through `FeatureFlagService`).
- [ ] Non-admin and unauthenticated requests are rejected per S7/S8.
- [ ] `env.FEATURE_FLAG_PROVIDER` is visible on the page; non-`db` providers
      are clearly flagged and mutations are not presented as effective.
- [ ] `seed.ts` grants the new actions to the appropriate seeded role(s),
      consistent with how other admin-reachable resources are seeded.
- [ ] `/admin` card status flips to `'active'`.
- [ ] Unit + DB-integration tests pass; `pnpm typecheck` passes.

## Verification Sources

- `docs/features/24 - Feature Flags.md` (backend contract/schema)
- `docs/features/35 - Admin User Management.md` (documented admin
  access-control pattern)
- `src/app/api/admin/users/route.ts`, `src/app/admin/users/UsersClient.tsx`
  (pattern to mirror)
- `src/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsMutationService.ts`
  (placement precedent — see Architecture Guard summary)
- `01 - Architecture Guard - Summary.md` (binding placement constraints)

## Affected Areas

See `plan.md` → "Likely Affected Areas".

## Constraints

- Do not widen `FeatureFlagService`/adapters (Architecture Guard, binding).
- Do not skip the `seed.ts` update for the new resource/actions
  (Architecture Guard, binding).
- Follow `src/shared/lib/api/response-service.ts` /
  `with-error-handler.ts` for the new route handlers (`AGENTS.md` API
  Response Discipline).
- No DB migration needed — `featureFlagsTable` already has every required
  column.

## Execution Control

`straight-through` — single session, sequential specialist fallback
(no `.claude/agents/*.md` subagents exist yet), each stage's skill invoked
in turn per `MODE_MANIFEST.md`'s single-agent fallback rule.

## Environment / Preconditions

- Leantime: not available in this session (see `plan.md`). Task ID and
  scope recorded here instead of a Leantime task record.
- Local DB: PGlite in-memory for `*.db.test.ts`, matching the existing
  `DrizzleFeatureFlagService.db.test.ts` pattern.

## Evidence Expectations

- `04 - Implementation Agent - Summary.md` listing all changed files.
- `validation-report.md` with typecheck + targeted test results.
- No Playwright E2E run planned by default (admin CRUD over an existing,
  already-tested table/service is a moderate-not-high risk change); revisit
  if Validation Strategy disagrees.

## Open Questions

- None blocking. Whether to add an E2E spec is deferred to the validation
  stage rather than decided here.
