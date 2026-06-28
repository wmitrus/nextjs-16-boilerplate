# 01 - Architecture Guard - Summary

**Task**: `2026-04-24-admin-user-management`
**Agent**: Architecture Guard (01)
**Date**: 2026-04-24
**Status**: COMPLETE

---

## Objective

Determine correct module boundaries, ownership, data model, and layer placement for the admin user management feature before implementation begins.

---

## Current-State Findings

### Existing Code Audit

| File/Location                                                      | Status                | Finding                                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/user-management/api/userService.ts`                  | ⚠️ STALE              | Calls `apiClient.get('/api/users')` — hits sample data route. Not production-ready. Architecture violation: feature delivery code calling a sample/probe API as if it were a real data API. |
| `src/features/user-management/types/index.ts`                      | ⚠️ STALE              | `User` type is `{id, name, email}` — does not match `src/core/contracts/user.ts` which is the authoritative `User` contract.                                                                |
| `src/features/user-management/components/UserList.tsx`             | ⚠️ STALE              | Calls `getUsers()` from stale service. Renders `user.name` which doesn't exist in the DB schema (`displayName` exists).                                                                     |
| `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts` | ✅ CORRECT            | Implements `UserRepository` contract. Missing `listAll()`, `deactivate()`.                                                                                                                  |
| `src/core/contracts/user.ts`                                       | ✅ CORRECT            | Authoritative `User` contract. Missing admin-scoped methods.                                                                                                                                |
| `src/app/api/users/route.ts`                                       | ✅ CORRECT (as probe) | Explicitly documented as a provisioning probe with sample data. Must NOT be changed to serve real DB data — it would break its documented purpose.                                          |
| `src/app/api/admin/invitations/route.ts`                           | ✅ REFERENCE          | Correct pattern for admin API routes.                                                                                                                                                       |

### Schema Gap

`usersTable` has no `status`, `deactivatedAt`, or `active` column. Deactivation requires either:

- A schema migration adding `deactivatedAt timestamp nullable` (preferred — preserves audit trail)
- Abusing `onboardingComplete = false` (wrong — conflates two concepts)

---

## Architectural Assessment

### Module Ownership Decision

**FINDING**: `src/features/user-management/` is misaligned with the repository's modular-monolith architecture. It contains stale stubs that violate the contract hierarchy:

- `features/user-management/types/User` ≠ `core/contracts/user.User` (different shape)
- `features/user-management/api/userService` → `GET /api/users` → sample data (not real data flow)

**DECISION**:

1. `src/features/user-management/` stubs are STALE and must be **replaced/aligned** — not extended. The stale `User` type, stale `userService.ts`, and stale `UserList.tsx` must be updated to use the correct contracts and real admin API.
2. Domain logic (`listAll`, `deactivate`) belongs in `src/modules/user/` (infrastructure layer).
3. Admin delivery code (RSC page, client component) belongs in `src/app/admin/users/`.
4. The admin API belongs in `src/app/api/admin/users/`.

### Repository Contract Extension

The `UserRepository` contract in `src/core/contracts/user.ts` should be extended minimally:

```typescript
// Add to UserRepository interface:
listAll(options?: { limit?: number; offset?: number; search?: string }): Promise<{ users: User[]; total: number }>;
deactivate(id: SubjectId, deactivatedAt: Date): Promise<void>;
```

`deactivate()` sets `deactivatedAt` timestamp. The `User` contract should gain `deactivatedAt?: Date`.

### Schema Migration Required

A new migration must add `deactivated_at timestamp with time zone nullable` to `users`:

```sql
ALTER TABLE users ADD COLUMN deactivated_at TIMESTAMP WITH TIME ZONE;
```

This is a non-breaking additive migration. No data changes.

### Layer Mapping

| Concern              | Layer            | Location                                                           |
| -------------------- | ---------------- | ------------------------------------------------------------------ |
| DB query: list users | Infrastructure   | `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts` |
| DB query: deactivate | Infrastructure   | same                                                               |
| User domain contract | Core             | `src/core/contracts/user.ts`                                       |
| Admin API routes     | App/API delivery | `src/app/api/admin/users/route.ts`, `[id]/route.ts`                |
| RSC admin page       | App delivery     | `src/app/admin/users/page.tsx`                                     |
| Client component     | App delivery     | `src/app/admin/users/UsersClient.tsx`                              |
| Old feature stubs    | Feature delivery | `src/features/user-management/` — must align to real data          |

### Dependency Direction

```
app/admin/users/ → api/admin/users/ → modules/user/ → core/contracts/user
features/user-management/ → api/admin/users/ (NOT /api/users probe)
```

---

## Risks

| Risk                                                                    | Severity | Mitigation                                                                                                  |
| ----------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| Schema migration in dev — may require `pnpm db:migrate`                 | LOW      | Additive only; backward compatible                                                                          |
| Stale `features/user-management/` types misaligning with implementation | MAJOR    | Must update stale types before or during implementation                                                     |
| `listAll()` on large tables without pagination → timeout                | MAJOR    | Mandatory: `LIMIT`/`OFFSET` with total count; max 50 per page                                               |
| Admin accessing users from other tenants                                | MAJOR    | `TENANCY_MODE=single` — only one tenant, but filter by org must still be applied if multi-tenant ever added |

---

## Constraints for Implementation

1. **No `export const dynamic` or `export const runtime`** in any route or page segment — `cacheComponents: true` hard constraint
2. **`await connection()`** required before `getAppContainer()` in any RSC or route handler
3. **Pagination mandatory** — `listAll()` must never be unconstrained; default limit 50, max 100
4. **Stale feature stubs must be fixed** — `features/user-management/types/User` must match `core/contracts/user.User`; `userService.ts` must point to real admin API, not probe
5. **Schema migration required** — must generate and apply `deactivated_at` column migration before implementation can be tested end-to-end
6. **`/api/users` probe route must NOT be changed** — it has a documented purpose as a sample/provisioning probe
7. **Auth pattern**: `withNodeProvisioning` + `isEnvBasedPlatformAdmin` OR ABAC check — same as invitations route

---

## Recommended Next Action

Security & Auth agent (02) should review:

- PII exposure in user list responses (email is PII — confirm it should be in admin list)
- ABAC check sufficiency for user deactivation (is `SECURITY_MANAGE_POLICIES` correct or should it be a user-management-specific action?)
- Whether `deactivatedAt` should be returned in API responses

---

## Follow-Up Update — 2026-04-25

### Task Context

- Task ID: `2026-04-24-admin-user-management`
- Task Objective: Determine the architecturally correct post-login behavior for the boilerplate under `AUTH_PROVIDER=authjs`, with onboarding, bootstrap, `/users`, and `/admin` already implemented.
- Current Run Scope: Design analysis only. No implementation.
- Status: COMPLETED
- Last Updated: 2026-04-25
- Related Control Artifacts: `plan.md`, `intake.md`, `06 - Debug Investigation - Summary.md`

### Scope Handled

- modules / layers reviewed: `src/app/auth/*`, `src/app/users/*`, `src/app/admin/*`, `src/security/middleware/*`, `src/security/core/*`, `src/modules/auth/infrastructure/authjs/*`
- change surface reviewed: post-login destination defaults, bootstrap handoff, onboarding fallback guards, admin-route direct entry behavior
- architecture questions in scope:
  - what the default AuthJS post-login destination should be when no explicit callback exists
  - whether `/users` or `/admin` should own first-run provisioning/onboarding evaluation
  - whether current AuthJS behavior matches the repository auth-flow contract

### Inputs Reviewed

- code paths reviewed:
  - `src/app/auth/signin/sign-in-client.tsx`
  - `src/app/auth/signin/page.tsx`
  - `src/app/auth/signup/sign-up-client.tsx`
  - `src/app/auth/signup/page.tsx`
  - `src/app/auth/bootstrap/start/route.ts`
  - `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`
  - `src/app/users/layout.tsx`
  - `src/app/admin/layout.tsx`
  - `src/app/onboarding/layout.tsx`
  - `src/app/onboarding/actions.ts`
  - `src/security/middleware/with-auth.ts`
  - `src/security/middleware/route-policy.ts`
  - `src/proxy.ts`
  - `src/security/core/node-provisioning-access.ts`
  - `src/security/core/node-provisioning-runtime.ts`
  - `src/modules/auth/infrastructure/authjs/auth.ts`
  - `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts`
  - `src/modules/auth/infrastructure/authjs/AuthJsEdgeIdentitySource.ts`
- docs / ADRs / prompts reviewed:
  - `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
  - `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
  - `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
  - `docs/features/32 - AuthJS Custom Auth Provider.md`
  - `docs/features/DEPLOY-neon.md`
  - `docs/feature-desings/02 - Auth Regression Tests.md`
- earlier task artifacts reviewed:
  - `plan.md`
  - `intake.md`
  - this summary file
  - `06 - Debug Investigation - Summary.md`

### Actions Performed

- repository inspection performed: traced the exact post-login entry points for AuthJS sign-in, AuthJS sign-up, edge auth-route redirect handling, bootstrap route handling, `/users` guard behavior, `/onboarding` guard behavior, and `/admin` guard behavior
- boundary checks performed: verified that bootstrap is the app-owned provisioning boundary, `/users` is the completed-user route, and `/admin` is an authorization-sensitive delivery route layered on top of provisioning readiness
- dependency / DI review performed: confirmed provisioning and readiness decisions are resolved through `getAppContainer()` + request-scoped identity sources, not ad hoc in delivery code
- docs-vs-code checks performed: compared the active code paths to the auth-flow anti-pattern contract, auth regression tests, and older docs still describing AuthJS as placeholder-only

### Current-State Findings

- Confirmed:
  - `src/app/auth/bootstrap/start/route.ts` is the app-owned bootstrap entrypoint and already treats `/users` as the safe default target when no `redirect_url` is supplied.
  - `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts` provisions first, then returns either `onboarding_required` or `ready`; this is the intended first post-auth decision boundary.
  - `src/app/users/layout.tsx` is a DB-backed fallback safety net: it redirects bootstrap-required users to `/auth/bootstrap/start?redirect_url=/users`, redirects incomplete users to `/onboarding`, and allows ready users to remain on `/users`.
  - `src/security/middleware/with-auth.ts` redirects authenticated users away from auth routes to `/auth/bootstrap/start?redirect_url=/users`, which matches the app-owned bootstrap contract for protected-flow entry.
  - `src/app/onboarding/actions.ts` clears the transient onboarding cookie and redirects to a sanitized target defaulting to `/users`, reinforcing `/users` as the ready-state destination.
  - `src/app/admin/layout.tsx` treats `/admin` as a protected authorized route layered after provisioning readiness, but currently redirects bootstrap-required or onboarding-required users to `/auth/bootstrap/start` without preserving `/admin` intent.
  - `src/app/auth/signin/sign-in-client.tsx` and `src/app/auth/signin/page.tsx` currently default AuthJS sign-in success to `/` when no callback is present; this bypasses bootstrap unless the user arrived through a protected-route redirect.
  - `src/app/auth/signup/sign-up-client.tsx` currently sends a newly auto-verified AuthJS user to `/auth/signin` with no bootstrap-aware callback, so the same drift remains after sign-up.
- Risks:
  - successful AuthJS sign-in from the dedicated auth page can land on `/` and defer provisioning/onboarding evaluation until a later private-route navigation, which is inconsistent with the repository bootstrap contract
  - `/admin` currently becomes an accidental first provisioning/onboarding trigger for some paths, despite being an admin-only authorization surface rather than the canonical post-login router
  - lack of redirect preservation in `src/app/admin/layout.tsx` loses the user’s original admin intent during bootstrap/onboarding fallback
- Drift:
  - code drift exists between the general auth-flow architecture and the AuthJS sign-in page defaults: middleware expects auth-route success to continue through `/auth/bootstrap/start?redirect_url=/users`, while the AuthJS sign-in UI hard-codes `/`
  - doc drift exists in older runtime/setup docs that still describe AuthJS identity adapters as placeholder-only, while the current repository code contains working AuthJS edge and node identity sources plus AuthJS admin E2E coverage

### Boundary And Dependency Assessment

- module ownership assessment:
  - post-login destination policy belongs at the auth/bootstrap boundary (`src/app/auth/*` + `src/security/middleware/with-auth.ts`), not inside `/admin` delivery code and not in scattered client components
  - `/users` owns the default authenticated ready-state experience; `/admin` owns an elevated feature area after readiness and authorization checks
- dependency direction assessment:
  - current dependency direction remains valid: `app` routes call security/runtime/bootstrap abstractions; provisioning truth remains in module/core-backed services and repositories
  - the issue is behavioral drift in routing defaults, not a boundary violation in dependency imports
- DI / composition assessment:
  - bootstrap and readiness resolution correctly use request-scoped identity sources and container-resolved provisioning/user services
  - no new service-locator or provider leakage problem was identified in the reviewed paths
- cross-module coupling assessment:
  - the drift is localized to route-target choice and redirect preservation
  - using `/admin` as the first meaningful post-login evaluation surface would increase coupling between generic auth bootstrap concerns and an admin-only route tree

### Architectural Decisions / Constraints

- approved architectural constraints:
  - the correct default AuthJS post-login destination with no explicit callback is `/auth/bootstrap/start?redirect_url=/users`
  - `/auth/bootstrap/start` remains the canonical first app-owned decision point after successful authentication
  - `/users` remains the professional default ready-state destination for the boilerplate after bootstrap/onboarding completes
  - explicit user intent for a private route such as `/users` or `/admin` should remain callback-driven and preserved through bootstrap/onboarding when known
  - `/admin` may enforce provisioning readiness as a fallback guard for direct navigation, but it must not be the canonical first route that decides onboarding/provisioning for a normal sign-in success path
- rejected directions:
  - defaulting successful AuthJS sign-in to `/` is rejected because it bypasses the app-owned bootstrap boundary and produces provider-specific inconsistency
  - defaulting successful AuthJS sign-in directly to `/users` is rejected as the primary default because it skips the explicit bootstrap/provisioning boundary and reintroduces `/users` as the hot-path first decision point
  - defaulting successful AuthJS sign-in to `/admin` is rejected as architectural drift because admin is an authorization-sensitive feature area, not the generic post-login landing contract
- follow-up architectural guardrails:
  - any auth-provider-specific sign-in or sign-up success path must converge on the same app-owned bootstrap boundary when no explicit callback exists
  - admin fallback redirects should preserve the originally requested admin path instead of collapsing to the generic `/users` default
  - readiness evaluation should occur before entering elevated feature routes whenever possible; feature routes should remain fallback guards, not primary post-auth routers

### Artifact Synchronization

- `plan.md` updates: none in this analysis-only run
- `intake.md` updates: none in this analysis-only run
- `implementation-plan.md` updates: none in this analysis-only run
- specialist artifact updates: appended this 2026-04-25 follow-up architectural review to `01 - Architecture Guard - Summary.md`

### Open Questions / Blockers

- unresolved questions:
  - whether the future implementation should preserve `/admin` via `redirect_url=/admin` from `src/app/admin/layout.tsx` during bootstrap fallback, or intentionally collapse post-onboarding to `/users` and require a second admin navigation. Architecture Guard recommendation: preserve `/admin` for direct-entry intent.
- blockers:
  - none for the architectural decision
- evidence still needed:
  - implementation and validation are still needed to align AuthJS sign-in/sign-up defaults with the established bootstrap contract

### Handoff Notes

- what the next agent should rely on:
  - bootstrap is the canonical app-owned post-auth decision point
  - `/users` is the boilerplate’s default completed-user landing route
  - `/admin` is a fallback-guarded elevated route, not the canonical first post-login destination
- what should not be re-decided without new evidence:
  - whether `/` should remain the default AuthJS post-login target: it should not
  - whether admin should be the first route to trigger onboarding/provisioning evaluation: it should not
- recommended next specialist or step:
  - Implementation Agent (04) for a narrow routing-alignment patch, followed by Validation Strategy / focused auth-flow verification against affected matrix scenarios `AF-01`, `AF-02`, `AF-05`, `AF-06`, `AF-07`, `AF-16`, `AF-26`, and `AF-27`

### Update Log

#### Update Entry

- Date: 2026-04-25
- Trigger: User requested a decisive Architecture Guard ruling on the correct professional AuthJS post-login behavior for the boilerplate after the admin-user-management continuation run exposed route-target ambiguity.
- Summary of change: Reviewed the auth/bootstrap/onboarding/admin code paths, confirmed that `/auth/bootstrap/start` is the canonical post-auth boundary and `/users` is the default ready-state route, and classified the current AuthJS sign-in default to `/` plus admin-first fallback behavior as architectural drift.
- Sections refreshed: follow-up update appended with current-state findings, boundary assessment, architectural decisions, and handoff notes
