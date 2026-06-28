# Plan — Admin Direct Invitation

**Task ID**: `2026-04-24-admin-direct-invitation`
**Task Directory**: `.copilot/tasks/2026-04-24-admin-direct-invitation/`
**Workflow**: Safe Feature Workflow
**Started**: 2026-04-24
**Status**: COMPLETE
**Leantime Task ID**: `81`

## Objective

Enable admins to send direct invitations to users without requiring them to go through the waitlist flow. Activate the `/admin/invitations` page (currently "coming-soon") with full send + list + revoke capabilities.

## Specialist Sequence

- [x] Step 1: Architecture Guard (01) — module boundaries, dependency direction, admin route ownership
- [x] Step 2: Security & Auth (02) — authorization model for admin-only invite, trust boundaries, ABAC permission
- [x] Step 3: Next.js Runtime (03) — server/client placement, route handler patterns, `connection()`, caching
- [x] Step 4: Validation Strategy (05) — minimum safe test scope before implementation
- [x] Step 5: Implementation (04) — only after all three specialists approve
- [x] Step 6: Final validation — typecheck, lint, tests

## Pause Points

- **Pause after Step 1 (Architecture Guard)** — wait for orchestrator to review before proceeding
- **Pause after Step 2 (Security & Auth)** — wait for orchestrator to review before proceeding
- **Pause after Step 3 (Next.js Runtime)** — wait for orchestrator to review before proceeding
- **Pause after Step 4 (Validation Strategy)** — orchestrator to collate constraints then proceed to implementation

## Context

### What Already Exists

- `src/modules/invitations/` — full invitation module: domain, repository, email service, `DefaultInvitationService`
- `src/modules/invitations/ui/InviteMemberForm.tsx` — client form component calling `POST /api/auth/invite`
- `src/app/api/auth/invite/route.ts` — `POST /api/auth/invite` requires authenticated session + USER_INVITE permission
- `src/app/api/auth/invite/[token]/route.ts` — validate + accept token
- `src/app/admin/page.tsx` — admin hub with "Invitations" card marked `coming-soon`
- `src/app/admin/waitlist/` — waitlist admin page (active, reference implementation)
- `src/app/api/admin/waitlist/` — admin waitlist API routes (reference for admin auth pattern)

### What Is Missing

All originally missing surfaces are now implemented and validated.

### Key Architecture Questions for Specialists

- Should the admin invitation use the existing `POST /api/auth/invite` (user-scoped) or a new `POST /api/admin/invitations` (admin-scoped)?
- What ABAC permission governs admin direct invite vs member invite?
- How does role selection work — should admin see all org roles or a subset?
- Does `REGISTRATION_MODE=invite-only` affect whether admins can send direct invites?

## Artifacts To Be Produced

- `plan.md` (this file)
- `intake.md`
- `01 - Architecture Guard - Summary.md`
- `02 - Security & Auth - Summary.md`
- `03 - Next.js Runtime - Summary.md`
- `05 - Validation Strategy - Summary.md`
- `constraints.md` (collated before implementation)
- `implementation-plan.md`
- `04 - Implementation Agent - Summary.md`
- `validation-report.md`

## Completion Notes

- `/admin/invitations` is active and linked from the admin hub.
- Admin invitation GET/POST/DELETE routes are implemented with API-level admin checks.
- Focused unit coverage now includes list, create, and revoke route slices.
- Remaining debt outside this task: existing `src/app/api/admin/waitlist/[id]/route.ts` still has the pre-existing API-level admin authorization gap identified by Security & Auth.
