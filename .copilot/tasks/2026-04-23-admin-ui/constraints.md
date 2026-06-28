# Constraints — Admin UI: Avatar Header + Administration Section

## Architecture Constraints

- New pages must live in `src/app/admin/` (App Router delivery layer)
- New shared UI components (Avatar, dropdown) go in `src/shared/components/ui/`
- Waitlist management page is RSC; approve/reject actions are client components calling existing API
- Admin layout guard follows the `src/app/users/layout.tsx` pattern exactly
- Authorization uses `resolveNodeProvisioningAccess` + `AUTHORIZATION.SERVICE.can()` with `ACTIONS.SECURITY_MANAGE_POLICIES`
- No cross-module imports: admin pages may import from `src/modules/waitlist/` domain types but use the service directly (not via feature boundary violations)
- `HeaderAuthControlsAuthjs.tsx` is a client component — stays client component; avatar+dropdown logic stays client-side using `useSession()`
- `HeaderWithAuth.tsx` is a server component — no changes to its server nature
- `UserAvatarMenu.tsx` — new client component in `src/modules/auth/ui/authjs/`

## Security Constraints

- `/admin/layout.tsx` MUST enforce server-side authorization (not UI-only)
- Authorization enforcement: `resolveNodeProvisioningAccess` (provisioning guard) + ABAC `SECURITY_MANAGE_POLICIES` check
- If either check fails → redirect (not error, not 403 page)
- The header "Administration" link is UX-only; the layout guard is the real enforcement
- No session role fields exist in AuthJS session — admin determination is via ABAC, not session claims
- Clerk variant: `UserButton` handles avatar natively; an "Administration" link can be added adjacent to it conditionally

## Runtime Constraints

- `cacheComponents: true` is active — **NO** `export const dynamic` or `export const runtime` in any file
- Use `await connection()` before `getAppContainer()` in every RSC page and layout
- Admin waitlist page: RSC fetches data server-side → passes to client table component
- Approve/reject: client component calls `fetch('/api/admin/waitlist/[id]?action=approve|reject', { method: 'POST' })`; `router.refresh()` after success to revalidate RSC data
- No `revalidatePath` server actions needed — `router.refresh()` from the client is sufficient

## UI Constraints

- No external UI library (Radix, shadcn, Headless UI) — not installed
- Use Tailwind CSS only for all new components
- Avatar: circle with initials derived from `session.user.name ?? session.user.email`
- Dropdown: CSS-based with `group` + `group-focus-within` or `useState` open/close

## Explicitly Allowed Changes

- Modify `HeaderAuthControlsAuthjs.tsx` — replace existing session/signout UI with Avatar+menu
- Create new files in `src/app/admin/`, `src/shared/components/ui/`, `src/modules/auth/ui/authjs/`
- Update `HeaderAuthControls.tsx` (Clerk) minimally — add Administration link next to `UserButton`

## Explicitly Forbidden Changes

- No `export const dynamic` / `export const runtime` anywhere
- No client-side-only authorization checks treated as security boundaries
- No mixing of the two role systems (security-layer `user|admin` vs tenant DB `owner|member`)
- No new database tables or schema changes
- Do not touch `src/proxy.ts`, `src/core/`, or `src/security/` — read-only references only

## Protected Invariants

- `resolveNodeProvisioningAccess` remains the canonical server-side auth gate
- Admin layout guard must redirect (not throw) on unauthorized access
- `await connection()` before `getAppContainer()` invariant must be preserved
- `pnpm lint --fix` (never bare lint), `pnpm typecheck` must pass clean
