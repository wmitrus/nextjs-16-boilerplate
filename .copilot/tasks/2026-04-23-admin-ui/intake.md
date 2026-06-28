# Feature Intake — Admin UI: Avatar Header + Administration Section

## Task ID

`2026-04-23-admin-ui`

## Objective

Build a professional admin interface for this Next.js 16 modular monolith, consisting of:

1. **Avatar + Context Menu in the Header** — replace the bare `email + Sign Out` in `HeaderAuthControlsAuthjs` with a proper Avatar component with a dropdown context menu containing profile actions and an **Administration** entry (admin-only).

2. **Administration Page** (`/admin`) — a hub page listing all admin management areas as navigable cards/sections, with Waitlist Management as the first **fully functional** section and all others as scaffolded placeholders.

## User Request Summary

> "Make it professionally. Create a nice Avatar in Header and put there some context menu, where Admin could see some Administration entry. In this page there should be all things related with Administration, like Roles management, RBAC management, feature flags management, Teams, Users management, Waitlist management, Send invitation, etc."

## Affected Areas

### Header / Auth Controls

- `src/modules/auth/ui/authjs/HeaderAuthControlsAuthjs.tsx` — primary change (AuthJS provider)
- `src/modules/auth/ui/HeaderAuthControls.tsx` — Clerk variant (UserButton already provides avatar; may need Administration link wired)
- `src/shared/components/Header.tsx` — no change expected (accepts `rightContent`)

### New Pages

- `src/app/admin/page.tsx` — Administration hub (RSC)
- `src/app/admin/layout.tsx` — Layout with authorization guard
- `src/app/admin/waitlist/page.tsx` — Waitlist management (fully functional)
- Stubs: `/admin/users`, `/admin/roles`, `/admin/rbac`, `/admin/feature-flags`, `/admin/teams`, `/admin/invitations`

### New Shared UI Components

- `src/shared/components/ui/avatar.tsx` — Avatar primitive
- Dropdown behavior lives in `src/modules/auth/ui/authjs/UserAvatarMenu.tsx` using Tailwind/local state rather than a shared primitive
- May reuse Tailwind + existing `cn` utility

### Existing Backend (already implemented — no changes needed)

- `GET /api/admin/waitlist` — list pending entries
- `POST /api/admin/waitlist/[id]?action=approve|reject` — approve or reject
- `src/modules/waitlist/` — all domain + service + repository layers

## Scope Boundaries

### In Scope

- Avatar with initials/image fallback in Header (AuthJS)
- Dropdown context menu: profile info, Administration link, Sign Out
- `/admin` hub page with cards for all admin areas
- `/admin/waitlist` — functional: list pending entries, approve/reject buttons
- Stub pages or "Coming Soon" cards for: Users, Roles, RBAC, Feature Flags, Teams, Invitations

### Out of Scope (this task)

- Roles/RBAC/Feature Flags/Teams backend implementation (stubs only)
- Password policy enforcement (separate open item)
- E2E tests (deferred — email delivery dependency)
- Clerk `UserButton` context menu customization (Clerk controls its own UI)

## Auth / Security Impact

- The actual security boundary is the `/admin/*` server-side guard; header navigation visibility is UX-only
- `/admin/*` routes must be protected server-side (not just hidden in UI)
- Authorization check: `resolveNodeProvisioningAccess` + ABAC `SECURITY_MANAGE_POLICIES`
- Must not leak admin routes to non-admin users even if they know the URL

## Runtime Placement

- `/admin/layout.tsx` — RSC, runs server-side, enforces auth+role guard
- `/admin/waitlist/page.tsx` — RSC, fetches from existing service, `await connection()` before `getAppContainer()`
- `HeaderAuthControlsAuthjs.tsx` — client component (`'use client'`), uses `useSession()`
- Admin context menu — client component
- Avatar — can be a pure UI client component

## Assumptions

- Admin authorization is resolved server-side through provisioning access plus ABAC, not session role claims
- No new database tables needed
- "Administration" link in header may be visible as a UX hint while the layout guard remains authoritative
- Avatar initials derived from `session.user.name` or `session.user.email`

## Open Questions

1. Resolved: admin authorization is not sourced from AuthJS session role claims in this slice.
2. Resolved: the admin layout guard uses provisioning access plus ABAC `SECURITY_MANAGE_POLICIES`.
3. Resolved: Clerk keeps `UserButton`; the Administration link is added adjacent to it.

## Readiness Checklist

- [x] Existing header/auth UI components identified
- [x] Existing admin API endpoints confirmed working
- [x] Existing waitlist service/repository confirmed
- [x] Server-side admin authorization approach confirmed
- [x] Admin layout guard strategy confirmed
- [x] Tailwind-compatible Avatar+Dropdown approach confirmed (no external UI library assumed)

## Acceptance Criteria

1. Authenticated user sees Avatar (with initials) in the header with a dropdown
2. Dropdown contains profile info and Sign Out; Administration navigation is exposed consistently with the implemented UX while `/admin/*` remains server-guarded
3. `/admin` page loads, displays admin hub cards for all management areas
4. `/admin/waitlist` shows pending entries fetched from the DB, with Approve/Reject buttons
5. Approve/Reject calls existing API and refreshes the list
6. Non-admin users accessing `/admin/*` are redirected (server-side guard)
7. `pnpm typecheck` passes clean
8. `pnpm lint --fix` passes clean

## Implementation Outcome Snapshot

- Code implementation for the header avatar/menu, admin hub, admin layout guard, and waitlist actions is present.
- Static validation was completed successfully (`pnpm typecheck`, `pnpm lint --fix`).
- Focused unit validation is green, including `src/app/admin/waitlist/WaitlistActions.test.tsx`.
- Focused AuthJS browser validation is green.
- Focused admin browser validation is green via the scenario runner with `--workers=1`, and the results are recorded in `validation-report.md`.
