# OZI-79 Phase A — Remote Inventory Plumbing

## Objective

Build, test, and review a `RemoteTarget` mechanism for
`scripts/tenancy-inventory/`, fully separate from OZI-75's already-merged
`LocalTarget`. No staging/production query execution is authorized or
possible in this phase -- there is no `scan --target=staging|production`
CLI command yet. Execution requires a separate, explicit authorization
after this plumbing and the exact query subset are reviewed.

## Classification

- Primary workflow: security-sensitive tooling change (credential
  handling, new trust boundary), reviewed via `security-auth` +
  `architecture-guard` before implementation
- Severity: N/A (plumbing/tooling, not an incident)
- Linear issue: OZI-79 (child of OZI-74, blocks OZI-78)
- Execution control: two explicit stages per OZI-79 -- Phase A (this),
  then a separate staging/production execution authorization

## What was built

- `scripts/tenancy-inventory/readonly-db-remote.ts` -- `RemoteTarget`
  (`'staging' | 'production'`), env-var-per-target credential resolution
  (no fallback, never echoes the value on failure), live role-privilege
  verification (`verifyReadOnlyRole` -- hardened twice: Phase A.1 to a
  database-wide application-table least-privilege check (rejects elevated
  role attributes, rejects write privilege on every real table in
  `public`/`drizzle`, not a 4-table sample), Phase A.2 to also reject
  schema `CREATE` effective through `PUBLIC` (not just role-specific
  grants), require `USAGE` on both schemas, require `SELECT` presence on
  every table the frozen OZI-79 query subset reads including
  `drizzle.__drizzle_migrations`, and reject any role membership), and
  `withReadOnlyRemoteDb` (same `READ ONLY` transaction +
  `default_transaction_read_only` + timeouts as `LocalTarget`, with the
  role verification running first, inside the same transaction).
- `evidence-store.ts`'s `EvidenceEnvironment` extended to
  `'local' | 'staging' | 'production'` (structural only -- nothing writes
  to `staging`/`production` yet). Renamed `writeLocalEvidence` ->
  `writeEvidence` since it's no longer local-only.
- No CLI wiring: `cli.ts`'s only change is the `writeLocalEvidence` ->
  `writeEvidence` import rename above -- no remote CLI execution path
  exists. This is deliberate -- Phase A produces tested, reviewed
  plumbing, not a runnable remote command.

## Progress

- [x] Security/Auth pre-implementation review (credential trust boundary,
      role-verification mechanism, no-echo requirement)
- [x] Implementation
- [x] Tests: unit (credential resolution, no-echo proof, target isolation,
      4 tests) + real-DB (10 tests against local `test-db`, no remote
      credential needed: superuser rejection, a real purpose-created
      SELECT-only-with-no-memberships role pass, and rejections for
      INSERT, an untested-table UPDATE, missing required SELECT, explicit
      schema CREATE, ambient PUBLIC-granted CREATE, missing drizzle USAGE,
      missing drizzle SELECT, and role membership)
- [x] Validation: typecheck, targeted lint, `arch:lint` (only the
      pre-existing unrelated `strict-rate-limit.ts` FAIL)
- [ ] User reviews this runbook and the finished mechanism
- [ ] User authorizes which environment(s) to execute against, and
      provides the `SELECT`-only DB-role provisioning
- [ ] `EXPLAIN`/plan review of the exact query subset before production
- [ ] Execution (separate follow-up, not part of this phase)

## Artifacts

- `plan.md` (this file)
- `01 - Architecture Guard - Summary.md`
- `02 - Security & Auth - Summary.md`
- `runbook.md` -- the deliverable requested explicitly: what's built, how
  to provision a credential, what happens next, open decisions
