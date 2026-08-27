# 02 - Security & Auth - Summary

## Task Context

- Task ID: OZI-76
- Task Objective: audit tenant/resource scope across the complete admin
  surface
- Current Run Scope: post-fix focused re-check of the one CRITICAL finding
  confirmed and fixed so far (`src/app/admin/waitlist/page.tsx`) — not the
  full audit sign-off
- Status: COMPLETED (for this finding only)
- Last Updated: 2026-08-27
- Related Control Artifacts: `intake.md`, `matrix.md`

## Scope Handled

- `src/app/admin/waitlist/page.tsx` (fixed)
- `src/app/admin/layout.tsx` (verified as the reason the fail-closed branch
  is unreachable on the happy path, not a new gap)
- `src/app/api/admin/waitlist/route.ts` / `.../[id]/route.ts` (verified
  unchanged, still the reference-safe implementation this fix mirrors)

## Current-State Findings

- Confirmed CRITICAL: pre-fix, `WaitlistAdminPage` called the
  platform-global `listPending()` with no gate at all, reachable by any
  tenant/organization admin via the generic `SECURITY_MANAGE_POLICIES`
  layout check.
- Confirmed fix closes it: `loadPendingEntriesForPlatformAdmin()` now
  requires `isEnvBasedPlatformAdmin(access.identity.email)` before the
  service is even constructed, using the exact same server-verified check
  as the already-safe API route — no second, divergent authorization
  mechanism was introduced.
- Confirmed no redesign occurred: `DefaultWaitlistService` /
  `DrizzleWaitlistRepository` / `listPending()` are byte-for-byte unchanged.
  The waitlist stays platform-global; every admin call site (2 routes + this
  page) is now explicit platform-admin-only. This is the correct, minimal
  containment shape — adding a tenant scope to the service itself would
  have been an unrequested architecture decision Phase 0 should not guess.

## Trust Boundary Assessment

- where identity is established: `resolveNodeProvisioningAccess(container)`,
  same call used by `src/app/admin/layout.tsx` and every other OZI-77-fixed
  admin page loader
- where authorization is enforced: the loader itself, before
  `resolveWaitlistService()`/`listPending()` — not the layout, not the
  client, not a separate check-then-act step
- where tenant/resource scope is derived: N/A by design — this resource has
  no trustworthy tenant scope; the correct control is caller identity
  (platform-admin or not), not a scope value
- what claims are trusted: `access.identity.email`, sourced from the same
  server-verified identity resolution the layout and every sibling admin
  page already rely on; nothing client-supplied

## Docs vs Code Drift

- None found. The route's own doc comment already explained the SEC-41
  rationale correctly; the page simply never implemented it. No documentation
  needed correction — the code needed to catch up to the reasoning already
  written down elsewhere in the same directory.

## Risks

- Checked specifically per the fix-review request: does returning `[]` for
  a non-`ALLOWED` `resolveNodeProvisioningAccess` outcome silently swallow
  an error state that should redirect/404 instead? **No.**
  `src/app/admin/layout.tsx`'s `AdminLayoutGuard` calls the identical
  `resolveNodeProvisioningAccess` at the top of every `/admin/**` request
  and unconditionally `redirect()`s (to sign-in, bootstrap, or `/`) for
  every status other than `ALLOWED` — Next.js `redirect()` throws and halts
  the subtree, so `WaitlistAdminPage` cannot execute at all with a
  non-`ALLOWED` outcome in production. The `!== 'ALLOWED'` branch in the new
  loader is defense-in-depth only, identical in shape and identical in
  triviality to the pre-existing `organizations/page.tsx` loader's own
  `access.status !== 'ALLOWED'` handling — not a new or inconsistent
  pattern.
- No residual risk identified for this one finding. Full-surface residual
  risk remains open until the rest of `matrix.md` gets formal sign-off.

## Security Decisions / Constraints

- approved: reuse `isEnvBasedPlatformAdmin` directly at every admin call
  site for a platform-global resource; never derive or accept a tenant
  scope for it
- rejected: adding `tenantId` to `WaitlistService`/`listPending()` (would
  be an unrequested, unreviewed architecture change to a resource that is
  legitimately platform-global)
- rejected: gating via a UI-only check or via the generic admin layout
  permission alone

## Artifact Synchronization

- `matrix.md`: finding recorded as CRITICAL/confirmed with full trace, fix,
  and evidence; verdict not downgraded for fix simplicity
- `intake.md`: readiness checkbox for "first CRITICAL finding fixed"
  checked

## Open Questions / Blockers

- None for this finding. Blockers, if any, belong to the remaining
  full-matrix sign-off, tracked separately in `matrix.md`.

## Handoff Notes

- what the next agent should rely on: this finding is closed; do not
  re-open or re-litigate it without new evidence
- recommended next step: resume the OZI-76 audit sequence (remaining
  formal sign-off across the full matrix, then Linear closure)

## Update Log

### 2026-08-27 — Post-Fix Focused Re-Check

- Trigger: CRITICAL finding fixed immediately per explicit user direction,
  ahead of the rest of the OZI-76 audit
- Summary of change: verified the fix closes the exposure, introduces no
  new gap, and correctly preserves the platform-global model
- Sections refreshed: all
