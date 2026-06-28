# Implementation Plan — Admin UI: Avatar Header + Administration Section

## Status

Implementation applied and validation completed.

## Phase 1: Shared UI Primitives

- [x] `src/shared/components/ui/avatar.tsx` — Avatar circle, initials from string, optional image

## Phase 2: AuthJS Header Avatar + Dropdown

- [x] `src/modules/auth/ui/authjs/UserAvatarMenu.tsx` — client component: avatar + dropdown menu with profile info, "Administration" link, "Sign Out"
- [x] `src/modules/auth/ui/authjs/HeaderAuthControlsAuthjs.tsx` — replace existing email+signout with UserAvatarMenu when session active

## Phase 3: Admin Layout Guard

- [x] `src/app/admin/layout.tsx` — RSC layout, `await connection()`, `resolveNodeProvisioningAccess`, ABAC `SECURITY_MANAGE_POLICIES` check, redirect on fail

## Phase 4: Admin Hub Page

- [x] `src/app/admin/page.tsx` — RSC, management cards grid: Waitlist (active), Users/Roles/RBAC/Feature Flags/Teams/Invitations (stubs)

## Phase 5: Waitlist Management Page

- [x] `src/app/admin/waitlist/page.tsx` — RSC, fetches pending entries via DefaultWaitlistService
- [x] `src/app/admin/waitlist/WaitlistActions.tsx` — client component, Approve/Reject buttons calling existing API

## Phase 6: Clerk Variant Update (minimal)

- [x] `src/modules/auth/ui/HeaderAuthControls.tsx` — add "Administration" link visible in `<SignedIn>` state

## Validation

- [x] `pnpm typecheck` — clean
- [x] `pnpm lint --fix` — clean
- [x] Focused unit tests
- [x] Focused AuthJS browser tests
- [x] Focused admin browser tests

## Closeout

- Validation evidence is captured in `validation-report.md`.
- No remaining task-local blockers are recorded for this slice.
