# Possible Enhancements Backlog

A holding pen for ideas that surface during work — especially the ongoing
multi-case security-audit remediation series — that are valuable but were
judged **not required** to close the specific issue at hand, or otherwise
out of scope for the task that surfaced them.

This is **not** a task list and nothing here is authorized work. Entries sit
here until a human (the repo owner) reviews the accumulated list and decides
what actually gets picked up, rejected, or merged into real task/case scope.

## Rules For Agents

- When a task (in this series or any other) surfaces a valuable-but-deferred
  idea, add one entry here. Do **not** also write the full rationale a
  second time in that task's own `plan.md`/summary artifacts — reference the
  entry by ID (e.g. "see `PE-01` in `POSSIBLE_ENHANCEMENTS.md`") instead of
  duplicating the same information in two places.
- Never silently implement an entry from this list on your own initiative —
  it is not a stop/go decision an agent gets to make; it's an "the user
  hasn't triaged this yet" holding pen.
- When the user (or a later session) triages an entry, update its `Status`
  and add a short resolution note — keep the entry rather than deleting it,
  so the backlog also serves as a decision log.
- Assign the next sequential `PE-XX` ID; never reuse or renumber an existing
  one.

## Entry Template

```markdown
## PE-XX — Short Title

- **Source**: task/case that surfaced this (path or name)
- **Date added**: YYYY-MM-DD
- **Status**: Open / Accepted / Rejected / Implemented (default: Open)

**Description**: what the enhancement is.

**Why deferred**: why it wasn't done as part of the task that surfaced it.
```

---

## PE-01 — Real-Browser (Playwright) Cross-Tenant Proof for Admin Users IDOR Fix

- **Source**: `.copilot/tasks/2026-08-22-admin-users-cross-tenant-idor/` (Case 1 of the security-audit series — cross-tenant IDOR/BOLA in `/api/admin/users`)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: Add a dedicated Playwright E2E spec that authenticates two
real sessions in two different `org-db` tenants (mirroring the
`acme`/`globex` DB-test fixtures) and proves, in a real browser against the
real backend, that a tenant-A admin cannot list/read/rename/deactivate a
tenant-B user via the UI or a direct API call from an authenticated session.
Would require new `org-db`-scenario AuthJS/Clerk fixture wiring for a second
stable tenant (see `docs/usage/05 - Playwright E2E Architecture.md` and the
Clerk E2E fixture contract in `AGENTS.md`).

**Why deferred**: The vulnerability lives entirely in the SQL predicate
layer; unit (route-handler) tests plus a real-DB integration test
(`DrizzleAdminUsersService.db.test.ts`, PGlite, real seeded two-tenant
fixtures) already prove the fix at the layer where the bug actually lived,
matching this repo's own established validation depth for the same defect
class (the original SEC-26 fix for feature flags used the same two-layer
proof, no dedicated cross-tenant E2E either). A real-browser two-session
spec is real additional confidence, but is a materially larger investment
(new stable fixture wiring) than this specific fix required — a reasonable
candidate for later hardening once several such ideas accumulate, not a
blocker for closing the reported vulnerability now.
