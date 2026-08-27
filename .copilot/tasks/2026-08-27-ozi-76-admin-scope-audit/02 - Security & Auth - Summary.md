# 02 - Security & Auth - Summary

## Task Context

- Task ID: OZI-76
- Task Objective: audit tenant/resource scope across the complete admin
  surface
- Current Run Scope: post-fix focused re-check of the one CRITICAL finding
  (`src/app/admin/waitlist/page.tsx`), followed by the formal full-matrix
  sign-off across every route/page in scope
- Status: COMPLETED
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

## Full-Matrix Sign-Off — 2026-08-27

Formal Security/Auth sign-off against every OZI-76 acceptance criterion,
covering the complete matrix in `matrix.md`.

### Coverage

Every in-scope route and page appears exactly once in `matrix.md`:

- 9 route files under `src/app/api/admin/**` outside `organizations/**`
  (`users`, `users/[id]`, `feature-flags`, `feature-flags/[id]`,
  `invitations`, `audit-logs`, `audit-log-settings`, `waitlist`,
  `waitlist/[id]`).
- 6 pages under `src/app/admin/**` outside `organizations/**` and
  `invitations/page.tsx` (`page.tsx` dashboard, `feature-flags`,
  `security`, `security/audit-logs`, `users`, `waitlist`).
- `organizations/**` (9 routes + 7 pages) explicitly carried forward as
  already-audited/fixed from OZI-77, cited rather than re-verified line by
  line here.
- Confirmed via `grep -rl "'use server'" src/app/admin src/app/api/admin`:
  no Server Actions exist in either tree, so there is no third surface
  category to cover.

### Verdict per path

Every path in `matrix.md` carries one of the four required verdicts
(safe / fixed with evidence / platform-only by design / blocked
follow-up). No path is unclassified. No verdict was downgraded because a
fix was small — the one CRITICAL finding is recorded as CRITICAL/confirmed
regardless of how small its fix turned out to be.

### Critical/cross-tenant path status

**No confirmed critical cross-tenant or sibling-organization path remains
open.** The single CRITICAL finding found during this audit
(`admin/waitlist/page.tsx` reaching the platform-global `listPending()`
with no gate) is fixed, DB-evidence-backed, and re-checked above. Every
other read/mutation reviewed either:

- derives scope from verified server-side access and enforces it in the
  same SQL predicate as the read/mutation (`users`, `feature-flags`,
  `audit-logs`, `audit-log-settings`, `invitations`, and all of
  `organizations/**` from OZI-77), or
- is correctly platform-admin-only by design for a resource with no
  trustworthy tenant scope (`waitlist` GET and POST, both routes).

No route was found trusting a client-supplied tenant/organization/resource
identifier as authority, and no mutation was found missing server-side
step-up enforcement where the sibling read/mutation pattern in this
codebase requires it.

### DB-backed evidence for the confirmed gap

Required by the acceptance criteria and satisfied: `page.db.test.ts` runs
against real PostgreSQL (`test-db`, port 5433) with two real seeded
organizations, proving the negative (tenant admin gets zero rows) and the
positive (platform admin sees both) directly, not by mocking the database
layer.

### Static guard coverage

Considered and explicitly **not added** in this pass: a structural
lint rule that would generically catch "a Server Component admin page
reaches a platform-scoped service method without the same gate its sibling
route already has" was evaluated and rejected as out of proportion for
Phase 0 — the failure mode here was a single missed call site, not a
repeated structural pattern across this audit, and a rule general enough
to catch it reliably risks a high false-positive rate against the many
already-safe pages that legitimately call already-audited routes instead
of a service directly. Recorded here as a considered-and-deferred item
rather than silently skipped; a narrow follow-up (e.g. an arch-lint check
that every direct service call in `src/app/admin/**/page.tsx` outside
`organizations/**` has a preceding `isEnvBasedPlatformAdmin` or scope
call in the same function) could be picked up separately if this pattern
recurs.

### Sign-off

**Security/Auth signs off on OZI-76 as complete for this environment's
scope**, with the one confirmed CRITICAL finding fixed and evidenced, no
other confirmed gap remaining open, and no blocked follow-up required to
close Phase 0's admin-surface audit. Full-matrix Postgres-backed evidence
for the already-safe paths was not independently re-run here (their SQL
predicates were verified by direct code inspection, consistent with
`Context Loading` guidance to expand evidence only where applicability is
uncertain); this is not a gap, since none of them present a client-facing
change requiring fresh regression proof.

## Update Log

### 2026-08-27 — Post-Fix Focused Re-Check

- Trigger: CRITICAL finding fixed immediately per explicit user direction,
  ahead of the rest of the OZI-76 audit
- Summary of change: verified the fix closes the exposure, introduces no
  new gap, and correctly preserves the platform-global model
- Sections refreshed: all

### 2026-08-27 — Full-Matrix Sign-Off

- Trigger: user requested the formal sign-off after the fix was committed
  and pushed
- Summary of change: signed off on the complete OZI-76 matrix against every
  acceptance criterion; no further confirmed gaps
- Sections refreshed: Full-Matrix Sign-Off (new), Task Context
