# Implementation Plan

## Purpose

- Capture the execution-ready recommendation once architecture and security constraints are settled.

## Status

- Phase-based implementation complete for Organizations, Roles, RBAC & Policies, and Members slices. Teams remains intentionally deferred.
- Replay-token boundary remediation implemented on 2026-07-21. Security & Auth re-review approved the reviewed slice for production readiness, contingent on normal release gates and production Upstash replay-store env being configured.

## Candidate Delivery Shapes

- [ ] Single merged design and single merged implementation for `Teams` + `Roles` + `RBAC & Policies`
- [x] Single integrated design package with phased implementation
- [ ] Three mostly separate designs with loose coordination

## Decision Checklist

- [x] Architecture dependency order documented
- [x] Trust-boundary and enforcement implications documented
- [x] UX sequencing recommendation documented
- [x] Future implementation phases outlined

## Approved Delivery Strategy

- Design the three surfaces together because they share one authority graph: organizations, memberships, roles, policies, and invitations.
- Implement them in phases so blast radius stays low and each page lands on settled contracts.

## Phase Plan

- [x] Phase 0: terminology and scope note
- [x] Phase 1: organization-scoped admin container and read-only model visibility design
- [x] Phase 2: roles management with system-role guardrails
- [x] Phase 3: RBAC & Policies management with explicit organization and role context
- [ ] Phase 4: separate Teams surface only if a real team domain is designed

## Phase Details

### Phase 0: Terminology And Scope

- Decision made: the current `Teams` card becomes `Organizations` in the near term.
- Record the authoritative scope terms from code: organization-scoped roles, policies, memberships, invitations.
- Resolve docs-vs-code drift around tenant-scoped wording before using the current card copy as a source.

### Phase 1 First Design: Organizations

- Prepare the first Organizations page as the scope anchor for later Roles and RBAC work.
- The first release should be read-only or low-mutation and must establish the active organization context clearly.
- Roles, invitations, memberships, and future policy management should route outward from Organizations rather than duplicating scope pickers on each later page.

## Current Deliverables

- [x] Admin card copy aligned to `Organizations`
- [x] First Organizations design brief prepared
- [x] Full Organizations admin design package completed with API and page-flow detail
- [x] Phase 1 API contracts expanded to handler expectations, response envelopes, and error semantics
- [x] Organizations page implementation started
- [x] `GET /api/admin/organizations` implemented
- [x] `GET /api/admin/organizations/:id` implemented
- [x] Shared organizations admin read service extracted so page and APIs use one query and scope path
- [x] `/admin/organizations/[organizationId]` implemented on the shared read service
- [x] `/admin/organizations/[organizationId]/roles` implemented as the first nested read-only Roles slice
- [x] First Roles mutation slice implemented: custom role creation with reserved-name and duplicate-name guardrails
- [x] `/admin/organizations/[organizationId]/invitations` implemented on the canonical nested route
- [x] Role rename implemented on `PATCH /api/admin/organizations/[organizationId]/roles/[roleId]`
- [x] Guarded custom-role delete implemented on `DELETE /api/admin/organizations/[organizationId]/roles/[roleId]`
- [x] `/admin/organizations/[organizationId]/rbac` implemented as the first organization-scoped RBAC read-only page
- [x] `POST /api/admin/organizations/[organizationId]/policies` implemented as the first constrained RBAC mutation
- [x] `DELETE /api/admin/organizations/[organizationId]/policies/[policyId]` implemented with owner baseline protection
- [x] `PATCH /api/admin/organizations/[organizationId]/policies/[policyId]` implemented for constrained in-place policy edits with fixed role context
- [x] `PATCH /api/admin/organizations/[organizationId]` implemented for organization status mutation under `tenant:update`
- [x] `/admin/organizations/[organizationId]/members` implemented as the first membership-management slice
- [x] `PATCH /api/admin/organizations/[organizationId]/members/[userId]` implemented for constrained member role reassignment under `tenant:manage_members`
- [x] Admin hub Roles and RBAC & Policies cards now route through `/admin/organizations`
- [x] Narrow AuthJS admin E2E assertions added for canonical hub routing
- [x] `/admin/invitations` refactored into a real invitations hub with explicit organization selection

## Phase 1 Design Exit Criteria

- [x] Canonical route model documented
- [x] Phase 1 scope and explicit non-goals documented
- [x] V1 list and detail APIs defined
- [x] ResponseService requirement documented for normal JSON APIs
- [x] Error-code matrix documented
- [x] Page/server responsibility split documented
- [x] Implementation started

### Phase 1: Admin Authorization Overview

- Add a stable organization-scoped landing slice that shows the current relationships between membership, role, invite, and policy ownership.
- Keep this phase read-only if needed; its purpose is to anchor later write paths in the correct scope.
- Production-ready adapter split confirmed: the server page keeps direct service access, while JSON APIs remain separate ResponseService delivery surfaces over the same shared read service.
- Production-ready invitation split decision: `/admin/invitations` becomes a hub/selector surface, while `/admin/organizations/[organizationId]/invitations` remains the canonical operational page.

### Phase 2: Roles

- Allow only lifecycle operations consistent with current invariants.
- Protect canonical system roles and any role currently referenced by memberships or invitations.
- Keep role actions scoped to the active organization.
- Current implementation state: nested Roles page exists, surfaces protection signals (`isSystem`, member count, pending invitation count), and now supports custom role creation, rename, and guarded delete for low-risk custom roles.
- Current implementation state: the first organization-scoped Members page now exists too, and supports constrained role reassignment for existing memberships without introducing separate membership lifecycle operations.

### Phase 3: RBAC And Policies

- Expose policy management only after role lifecycle rules are settled.
- Avoid tenant-wide free-form editing language or UX.
- Prefer constrained or preset operations first if raw policy authoring is not yet architecturally settled.
- Current implementation state: the first RBAC slice is organization-scoped and now supports constrained policy creation for existing roles using known resources/actions only; free-form conditions and role reassignment remain deferred.
- Current implementation state: the same RBAC slice now also supports constrained policy update and deletion, but protects the owner baseline policy that grants `security:manage_policies`.
- Current implementation state: the next real protected capability now exists outside policy CRUD as well; organization status can be toggled via the canonical organization detail route, with the page action and API both bound to `tenant:update` authority.
- Current implementation state: member-role reassignment now exists as a second operational capability on the same authority graph, guarded by `tenant:manage_members`, same-organization role checks, archived-organization blocking, and last-owner protection.

### Phase 4: Teams

- Only build a distinct Teams page if the repository adds a real team model separate from organizations.
- If no such model is introduced, keep the surface as organization management rather than inventing new semantics in the UI.

## Focused Implementation-Agent Closeout Plan

- Step 1: Completed. `pnpm arch:lint` was rerun after `src/modules/auth/ui/authjs/UserAvatarMenu.tsx` stopped importing from `src/app/auth/post-auth-redirect.ts`.
- Step 2: Completed. The lint passed, so the last architecture release gate for this slice is closed in the task artifacts.
- Step 3: If the lint reports another violation, inspect the new failing edge and fix it at the owning abstraction boundary rather than duplicating literals or pushing shared concerns upward into `src/app`.
- Step 4: Only if follow-up lint output points to the same redirect contract area, normalize remaining direct `DEFAULT_APP_ENTRY_URL` consumers to `src/shared/lib/routing/default-app-entry.ts`; do not widen that extraction without a concrete failing edge.

## Replay Token Boundary Remediation Plan

### Objective

- Fix the production blocker where `src/features/security-showcase/components/SettingsFormExample.tsx` imports `createReplayToken()` from `src/security/actions/action-replay.ts`.
- Preserve the secure server-action replay contract without allowing client components to import server env, Upstash Redis, or replay-store implementation details.

### Architecture Decision

- Keep replay-token validation and nonce persistence in `src/security/actions/action-replay.ts`.
- Move replay-token creation into a new client-safe security leaf module, for example `src/security/actions/replay-token.ts`.
- The new client-safe module must not import `@/core/env`, `@upstash/redis`, `server-only`, Node-only modules, DI, repositories, or server request helpers.
- Add `import 'server-only';` to the server replay-store module after the split so future client imports fail loudly.

### Implementation Steps

- Step 1: Create a client-safe token factory module under `src/security/actions/`.
  - Export `createReplayToken()`.
  - Use only Web Crypto-compatible APIs available in browsers and Node test environments.
  - Keep the existing token format unless Security & Auth explicitly changes it: `${timestamp}|${nonce}`.
- Step 2: Update client and test callers.
  - `src/features/security-showcase/components/SettingsFormExample.tsx` imports `createReplayToken()` from the new client-safe module.
  - `src/testing/integration/server-actions.test.ts` and `src/features/security-showcase/actions/showcase-actions.test.ts` import the token factory from the new module.
  - `src/security/actions/action-replay.test.ts` may import token creation from the new module while keeping validation imports from `action-replay.ts`.
- Step 3: Harden the server-only replay-store module.
  - Add `import 'server-only';` to `src/security/actions/action-replay.ts`.
  - Keep `validateReplayToken()`, `resetReplayProtectionStoreForTests()`, Redis setup, production fail-closed behavior, and local test/development nonce store there.
  - Do not expose Redis or env-derived config through any client-importable barrel.
- Step 4: Verify no client component imports server replay modules.
  - Search for imports of `@/security/actions/action-replay` and `./action-replay`.
  - The only remaining production import should be server-side secure-action validation; tests may import server validation with existing test `server-only` mocking where needed.
- Step 5: Keep the log hygiene issue separate.
  - Do not change invitation logging unless fresh code inspection finds raw email fields again.
  - Ensure generated logs containing real emails are absent from the commit and are not used as release evidence.

### Validation Commands

- `pnpm exec vitest run --config vitest.unit.config.ts --coverage.enabled=false "src/security/actions/action-replay.test.ts" "src/security/actions/secure-action.test.ts" "src/features/security-showcase/actions/showcase-actions.test.ts"`
- `pnpm exec vitest run --config vitest.integration.config.ts --coverage.enabled=false "src/testing/integration/server-actions.test.ts"`
- `pnpm lint --fix`
- `pnpm typecheck`
- `pnpm build`
- `pnpm arch:lint`
- `rg -n "from '@/security/actions/action-replay'|from './action-replay'|createReplayToken" src tests e2e -S`
- `rg -n "wmitrus@gmail\\.com|\"email\":\"[^\"]+@[^\"]+\"" logs .copilot/tasks/2026-07-06-admin-roles-rbac-teams-design -S`

### Release Criteria

- [x] No client component imports `src/security/actions/action-replay.ts`.
- [x] `src/security/actions/action-replay.ts` is explicitly server-only.
- [x] Replay-token validation still rejects missing, expired, invalid, and reused tokens.
- [x] The showcase server-action caller still supplies replay tokens through a client-safe import.
- [x] No raw email, token, one-time URL, or credential-shaped value is present in generated task/log artifacts.
- [x] Security & Auth re-review updates `02 - Security & Auth - Summary.md` back to production-ready only after the boundary fix and validation evidence are complete.
