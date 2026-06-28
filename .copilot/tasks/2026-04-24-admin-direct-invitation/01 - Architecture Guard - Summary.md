# 01 - Architecture Guard - Summary

## Task Context

- **Task ID**: `2026-04-24-admin-direct-invitation`
- **Task Objective**: Activate `/admin/invitations` page — admin direct invitation without waitlist
- **Current Run Scope**: Architectural review of new admin invitation feature
- **Status**: COMPLETED
- **Last Updated**: 2026-04-24
- **Related Control Artifacts**: `plan.md`, `intake.md`

## Scope Handled

- `src/modules/invitations/` — domain, repository, email service, public API
- `src/app/admin/` — admin page patterns, layout guard
- `src/app/api/admin/` — admin API route patterns
- `src/app/api/auth/invite/route.ts` — existing user-scoped invite route
- `src/security/api/with-node-provisioning.ts` — auth wrapper
- `src/security/core/platform-admin.ts` — admin guard logic
- `src/app/admin/layout.tsx` — admin auth enforcement

## Inputs Reviewed

- `src/modules/invitations/index.ts` — public module exports
- `src/modules/invitations/domain/InvitationService.ts` — interface already has `createInvitation`, `revokeInvitation`, `listByOrganization`
- `src/modules/invitations/infrastructure/DefaultInvitationService.ts` — implementation complete
- `src/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository.ts` — repository complete with `listByOrganization` and `markRevoked`
- `src/modules/invitations/ui/InviteMemberForm.tsx` — client form component
- `src/app/admin/waitlist/` — reference admin page
- `src/app/api/admin/waitlist/[id]/route.ts` — reference admin API route
- `src/app/admin/page.tsx` — admin hub with "Invitations" card (coming-soon)

## Current-State Findings

**Confirmed — All needed domain capability already exists:**

- `InvitationService.createInvitation()` — already implemented
- `InvitationService.listByOrganization()` — already implemented in repository
- `InvitationService.revokeInvitation()` — already implemented
- `InviteMemberForm` component — already implemented, calls `POST /api/auth/invite`
- Admin layout guard (`src/app/admin/layout.tsx`) — properly enforces admin check via `isEnvBasedPlatformAdmin` + ABAC `SECURITY_MANAGE_POLICIES`

**Security Gap Identified (pre-existing, not introduced by this task):**

- `src/app/api/admin/waitlist/[id]/route.ts` uses only `withNodeProvisioning` — it checks authentication + provisioning but NOT admin role
- Any authenticated+provisioned user can call `/api/admin/waitlist/[id]` directly (not just admins)
- The admin check is layout-only (page-level RSC), not API-level
- **New admin invitation routes MUST add API-level admin check** — do not repeat this gap

## Boundary And Dependency Assessment

**Module ownership**: `src/modules/invitations/` owns invitation domain + infra. Admin pages/routes are delivery layers only.

**Dependency direction (correct):**

```
src/app/admin/invitations/ → src/modules/invitations/ (domain types + service)
src/app/api/admin/invitations/ → src/modules/invitations/ (service via DI + direct instantiation)
src/app/api/admin/invitations/ → src/modules/authorization/ (rolesTable for role lookup)
```

**What must NOT happen:**

- `/admin/invitations` page must not import directly from `src/modules/invitations/infrastructure/` — go through the service
- Admin invitation route must not reuse `POST /api/auth/invite` internally (that is user-scoped with different auth model)
- Role selection must validate that `roleId` belongs to the organization (cross-table check)

**Correct route placement:**

- Page: `src/app/admin/invitations/page.tsx`
- API list: `src/app/api/admin/invitations/route.ts` (`GET` list, `POST` create)
- API revoke: `src/app/api/admin/invitations/[id]/route.ts` (`DELETE` revoke)

**Admin hub card:** Change status from `coming-soon` → `active` in `src/app/admin/page.tsx`

## Architectural Decisions / Constraints

**Approved:**

1. New page at `src/app/admin/invitations/page.tsx` — RSC, fetches data server-side
2. New API routes at `src/app/api/admin/invitations/route.ts` (GET + POST) and `[id]/route.ts` (DELETE)
3. Reuse `InviteMemberForm` or create a new `AdminInviteForm` in `src/modules/invitations/ui/` — the form calls the new admin API, not `/api/auth/invite`
4. API routes: use `withNodeProvisioning` + inline admin check (see Security Guard decision on exact pattern)
5. Role list for admin form: query `rolesTable WHERE organizationId = orgId` — show all org roles
6. `resolveSingleTenancyInviteTarget()` pattern from waitlist route: reusable helper to resolve org + default role; admin should be able to override role selection

**Rejected:**

- Do NOT reuse `POST /api/auth/invite` for admin invitations — it is user-scoped, has `USER_INVITE` permission guard, and gets org from access.tenant (correct for members but semantically wrong for admin bypass flow)
- Do NOT put domain logic in `src/app/` layers
- Do NOT add admin invitation UI directly to `src/app/admin/page.tsx` as an inline form

**Follow-up (not in scope, record as debt):**

- Add API-level admin check to existing `src/app/api/admin/waitlist/[id]/route.ts` (pre-existing gap)
- Consider a shared `withAdminProvisioning` wrapper to avoid repeated inline admin check in future admin routes

## Status

✅ **ARCHITECTURE APPROVED** — proceed to Security & Auth review
