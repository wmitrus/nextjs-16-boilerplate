# Intake — Cross-Tenant IDOR/BOLA in Admin Users (Case 1 of multi-case security audit)

## Source

User-supplied security audit summary (external review), Case 1 of an ongoing
multi-case remediation series. Full audit summary listed additional findings
(P1 credentials-login throttling, P1/P2 password-reset token race + AuthJS JWT
invalidation, P2 SEC-23 regression in 3 admin routes, P2 raw `error.message`
exposure in Server Actions, P2 `secureFetch()` HTTPS enforcement, cross-origin
redirect body forwarding, waitlist/invitation scope, and several P3 hardening
items) — **out of scope for this task**, to be opened as separate cases as the
user provides details for each.

## Mode

`security-incident-workflow` (per `docs/ai/general/MODE_MANIFEST.md` selection
rule #2 — authorization gap / cross-tenant issue).

## Severity

**P1 / CRITICAL** — confirmed cross-tenant broken access control (IDOR/BOLA).

## Problem Statement

`checkAdminAccess()` in `/api/admin/users` and `/api/admin/users/[id]` verified
only that the caller held the `USER_READ`/`USER_UPDATE`/`USER_DEACTIVATE`
**action** grant within their own tenant (via `AuthorizationService.can()`).
It never constrained _which users_ that grant could reach. Every DB call
(`listAll`, `findById`, `updateProfile`, `deactivate`) went through the
DI-registered `UserRepository` / `DrizzleUserRepository`, which queries the
global `users` table with no tenant/organization predicate whatsoever.

Result: any ABAC-authorized (non-platform-admin) tenant owner/admin could
list, read, rename, or deactivate **any user in any other tenant**, given
only that user's UUID (itself discoverable via the unscoped `listAll`).

## Scope

- `src/app/api/admin/users/route.ts` (`GET` — list)
- `src/app/api/admin/users/[id]/route.ts` (`GET`, `PATCH` — read / update /
  deactivate)
- New tenant-scoped admin data-access surface for the above (does not modify
  `UserRepository`/`DrizzleUserRepository`, which stay in place for
  self-service lookups elsewhere in the app)
- Regression tests (unit + real-DB integration) proving cross-tenant access
  is denied and same-tenant / platform-admin access still works
- `docs/features/35 - Admin User Management.md` and
  `docs/ai/general/SECURITY_CODING_PATTERNS.md` (SEC-26 update)

## Out Of Scope (explicitly deferred to later cases in this series)

- SEC-23 UUID-validation regression in the _other_ 2 admin routes named in
  the audit summary (only `/api/admin/users/[id]` was fixed here, since it
  was already being rewritten for the IDOR fix)
- Credentials-login throttling, password-reset race/JWT invalidation, raw
  `error.message` exposure, `secureFetch()` HTTPS enforcement, cross-origin
  redirect body forwarding, waitlist/invitation scope, and all P3 hardening
  items from the audit summary
- Backfilling the pre-existing SEC-26/27/28/29/30/31/32 rows into `AGENTS.md`'s
  summary table (observed drift — see Security & Auth summary; not part of
  this task's blast radius)

## Acceptance Criteria

1. An ABAC-authorized (non-platform-admin) caller cannot list, read, rename,
   or deactivate a user who is not a member of the caller's own tenant/org.
2. A cross-tenant target and a nonexistent id both resolve to the same `404`
   (no distinguishing `403` that would leak existence).
3. Platform-admin (env-based) access remains fully unscoped, unchanged.
4. Tenant scoping is enforced in the same SQL predicate as the read/mutation,
   not a separate check-then-act step.
5. `/api/admin/users/[id]`'s `:id` is validated as a UUID before any DB call.
6. Regression tests exist at both the route-handler (unit) and data-access
   (real-DB integration) layers.
7. `docs/features/35 - Admin User Management.md` and
   `docs/ai/general/SECURITY_CODING_PATTERNS.md` reflect the fix.
8. All quality gates green: `pnpm typecheck`, `pnpm lint --fix`, `pnpm test`,
   `pnpm test:db`, `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check`.

## Leantime

See `plan.md` for task-open/close status.
