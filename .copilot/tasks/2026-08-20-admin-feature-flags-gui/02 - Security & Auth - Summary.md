# 02 - Security & Auth - Summary

## Task Context

- Task ID: 2026-08-20-admin-feature-flags-gui
- Task Objective: Build the admin GUI for Feature Flags management at `/admin/feature-flags`
- Current Run Scope: Security/auth review before implementation (safe-feature-workflow Step 3)
- Status: COMPLETED — one open decision escalated to the user (see Open Questions)
- Last Updated: 2026-08-20
- Related Control Artifacts: `plan.md`, `intake.md`, `01 - Architecture Guard - Summary.md`

## Scope Handled

- auth surfaces reviewed: `isEnvBasedPlatformAdmin`, `AuthorizationService.can()` call
  sites in admin routes
- authorization surfaces reviewed: `resources-actions.ts`, `seed.ts` policy data,
  per-operation gating pattern in `users/route.ts` and `users/[id]/route.ts`
- trust-boundary questions in scope: naming/seed wiring for new ABAC
  resource+actions; gating shape for new routes; audit approach; cross-tenant
  visibility in a platform-wide (not org-scoped) admin panel

## Inputs Reviewed

- code paths reviewed: `src/security/core/platform-admin.ts`,
  `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[id]/route.ts`,
  `src/core/contracts/resources-actions.ts`,
  `src/modules/authorization/infrastructure/drizzle/seed.ts`,
  `src/security/actions/action-audit.ts` (+ grep confirming zero use under
  `src/app/api/admin/`)
- security/auth docs reviewed: `docs/ai/general/02 - Security & Auth Agent.md`,
  `docs/ai/general/SECURITY_CODING_PATTERNS.md`, `docs/features/35 - Admin User Management.md`
- earlier task artifacts reviewed: `01 - Architecture Guard - Summary.md`

## Actions Performed

- identity flow tracing performed: confirmed `access.identity.email`/`access.user.id`/
  `access.tenant.tenantId` come from `withNodeProvisioning`'s already-authenticated
  context; no new identity surface
- authorization enforcement review performed: confirmed gating is per-operation
  (distinct action per HTTP verb/mode), not one blanket check per route file
- tenant / org context review performed: confirmed the admin's own tenant is used
  only for the ABAC check, not as a data filter; `userRepo.listAll()` is
  deliberately cross-tenant, matching this being a platform-level (not
  org-scoped) admin surface
- sensitive-data exposure review performed: no new PII/secret exposure surface;
  flag `key`/`description`/`enabled` are not sensitive-classified data

## Current-State Findings

- Confirmed: only the seeded `owner` role reaches any admin-panel-shaped ABAC
  action today; no seeded `member` policy does
- Confirmed: `logActionAudit()` is unused under `src/app/api/admin/` — existing
  admin mutations use plain `logger.info({event: 'admin:...', ...})`, log-only,
  not persisted/queryable
- Risks: audit approach for a "changes behavior instantly, no approval step"
  mutation type is a real, undecided risk-appetite question (see Open Questions)
- Drift: none — `docs/features/35` matches code exactly

## Trust Boundary Assessment

- where identity is established: `withNodeProvisioning` (unchanged, reused)
- where authorization is enforced: route handler, `authzService.can()`,
  server-side only
- where tenant or org context is derived: `access.tenant.tenantId`, used for the
  ABAC check only, not as a visibility filter (platform-admin surface is
  intentionally cross-tenant)
- what claims or inputs are trusted: none from the client; `email`/`user.id`/
  `tenantId` all come from the already-verified `access` context

## Sensitive Data And Exposure Notes

- logging / telemetry review: planned `logger.info` calls carry `flagKey`,
  `adminId`, `tenantId` — no secrets, tokens, or PII; consistent with existing
  `admin:user_update` shape
- response exposure review: flag rows contain no sensitive fields
- client exposure review: n/a, all logic server-side
- cache exposure review: n/a for this admin surface (not cached); the
  *runtime* `isEnabled()` path is unaffected by this task

## Security Decisions / Constraints

- approved controls or constraints:
  1. `FEATURE_FLAG_READ` for GET, `FEATURE_FLAG_MANAGE` for POST/PATCH/DELETE
     — per-operation, matching `users/[id]/route.ts`
  2. `seed.ts`: add both actions to `acmeOwner`/`globexOwner` policy entries
     only (alongside their existing `SECURITY_*` grant), not to `member`
  3. Mutations logged via `logger.info({event: 'admin:feature_flag_*', ...})`,
     not `logActionAudit()`
  4. Any `[id]`-param route must `z.uuid()`-parse before use in a Drizzle
     predicate (SEC-23)
  5. Cross-tenant visibility in the list view is correct as designed —
     matches existing platform-admin precedent, not a new risk
- rejected directions: scoping the admin view to only the admin's own tenant
  (would be an undiscussed, inconsistent narrowing vs. the existing
  `userRepo.listAll()` platform-admin model)
- required enforcement points: `src/app/api/admin/feature-flags/route.ts` (list +
  create), `src/app/api/admin/feature-flags/[id]/route.ts` (update/delete)

## Artifact Synchronization

- `plan.md` updates: none required beyond what Architecture Guard already added;
  this review refines gating granularity but doesn't change the 4 binding
  constraints
- `intake.md` updates: none required — requirements already anticipated
  per-operation gating and the uniqueness-validation requirement
- `implementation-plan.md` updates: not yet created
- specialist artifact updates: this file (new)

## Open Questions / Blockers

- unresolved questions: **whether flag mutations need more than log-only
  audit**, given instant, unapproved, potentially tenant-wide or global
  blast radius. Recommendation given (match existing precedent: log-only),
  but this is a real product/risk-appetite decision, not purely technical —
  escalating to the user rather than deciding unilaterally.
- blockers: none — recommendation stands as the default if the user doesn't
  weigh in before implementation
- evidence still needed: none

## Handoff Notes

- what the next agent should rely on: the 5 approved constraints above are
  settled (pending the audit-scope answer, which defaults to log-only)
- what should not be re-decided without new evidence: gating shape,
  seed-wiring target roles, cross-tenant visibility being correct-as-designed
- recommended next specialist or step: Next.js Runtime review — route handler
  placement/shape, RSC page vs client component split, whether the
  `FEATURE_FLAG_PROVIDER` banner needs `await connection()` before reading env
  in an async RSC page (per the RSC dynamic rendering note in `AGENTS.md`)

## Update Log

### Update Entry

- Date: 2026-08-20
- Trigger: Initial Security & Auth review for safe-feature-workflow Step 3
- Summary of change: First and only pass; GO with 5 constraints, 1 escalated
  open question (audit depth)
- Sections refreshed: all
