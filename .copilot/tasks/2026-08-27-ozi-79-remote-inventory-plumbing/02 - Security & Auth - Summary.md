# 02 - Security & Auth - Summary

## Task Context

- Task ID: OZI-79 Phase A
- Task Objective: `RemoteTarget` plumbing for `scripts/tenancy-inventory/`
- Current Run Scope: credential trust boundary, live role verification,
  no-echo/no-leak requirements
- Status: COMPLETED
- Last Updated: 2026-08-27
- Related Control Artifacts: `plan.md`, `01 - Architecture Guard - Summary.md`

## Pre-Implementation Decisions

1. **Credential resolution**: one fixed, named env var per target
   (`OZI79_STAGING_READONLY_DATABASE_URL` /
   `OZI79_PRODUCTION_READONLY_DATABASE_URL`), matching
   `scripts/lib/db-guard.mjs`'s established direct-named-env-var pattern
   for scripts (not `src/core/env.ts`, which is Next.js-app-scoped). No
   fallback default for either target -- an unset credential must fail
   loudly.
2. **Role verification, strengthened during review**: a naive
   `information_schema.role_table_grants` query filtered by
   `grantee = current_user` can miss a privilege the role holds only
   through group/role membership. Switched to Postgres's own
   `has_table_privilege()`, which resolves the role's real, effective
   privilege including inheritance -- verified live against the actual
   connected role, not trusted from how it was provisioned.
3. **Real finding from this review, fixed before implementation**:
   `scripts/lib/db-guard.mjs`'s `parsePostgresUrl` (reused by `LocalTarget`)
   echoes the raw URL on a malformed-input error path -- harmless for
   `LocalTarget`'s always-valid hardcoded constants, but would have leaked
   a real, externally supplied, potentially secret-bearing credential if
   reused for `RemoteTarget`. Built a dedicated remote credential resolver
   that never echoes the value on any failure path -- only the env var
   *name* is ever included in an error message.
4. **No execution capability yet**: confirmed and enforced structurally --
   `cli.ts` was not touched, so there is no command surface that could
   run this code against a real remote database in this phase.

## Current-State Findings (post-implementation)

- Confirmed: `resolveRemoteUrl` never appears in any log/error output
  with its resolved value -- traced every throw site in
  `readonly-db-remote.ts`; each either names the env var only, or is a
  generic "(value not shown -- it may contain credentials)" message.
- Confirmed: `describeRemoteTarget` (the only place a remote URL is ever
  turned into printable output) extracts host/port/database via the
  platform `URL` parser and explicitly never touches `username`/
  `password` -- proven by `readonly-db-remote.test.ts`'s assertion that a
  URL containing `readonly_user`/`s3cr3t-password` produces a description
  containing neither substring.
- Confirmed: `verifyReadOnlyRole` runs *inside* the same transaction as
  every subsequent query, before `fn` is ever invoked -- a misconfigured
  role is caught before any diagnostic query can run against it, not
  after.
- Confirmed via real-DB test (not asserted): the local Postgres superuser
  role is correctly rejected (`rolsuper` check); a real, purpose-created
  `SELECT`-only role correctly passes; a real role additionally holding
  `INSERT` is correctly rejected. All three proven against actual
  Postgres role/grant state, not mocked.
- Documented, not silently assumed: `verifyReadOnlyRole` does not defend
  against a writable view or a `SECURITY DEFINER` function the role might
  have execute privilege on -- this is stated explicitly in the function's
  doc comment so a future reader does not treat this check as a complete
  guarantee. The human query-allowlist review remains responsible for
  that class of risk.

## Trust Boundary Assessment

- where identity is established: the externally provisioned Postgres role
  itself -- this tool trusts nothing about its own authority; it verifies
  the role's actual grants live, every time, before use
- where authorization is enforced: two independent layers -- the
  DB-role's `SELECT`-only grant (verified live) AND the `READ ONLY`
  transaction (`accessMode: 'read only'` + `default_transaction_read_only`)
- what claims are trusted: the connection string's identity claim (which
  role it connects as) is trusted only as far as `verifyReadOnlyRole`
  independently confirms; nothing else about the environment variable's
  content is trusted beyond "starts with postgres://" until Postgres
  itself answers the privilege queries

## Sensitive Data And Exposure Notes

- logging/telemetry: host:port/database only, everywhere, including every
  error path -- verified by direct test assertions, not just code reading
- committed-artifact exposure: N/A this phase -- no evidence is written to
  `staging`/`production` yet (no code path calls `writeEvidence` with
  those environments)
- test fixtures: `readonly-db-remote.db.test.ts` creates and drops real,
  disposable Postgres roles against local `test-db` only; no credential
  used in tests is a real remote secret

## Security Decisions / Constraints

- approved: env-var-per-target, no fallback, hard-fail
- approved: live `has_table_privilege()` + `rolsuper` verification as a
  genuine, tested control -- not a substitute for the separate,
  still-required human query-allowlist/EXPLAIN review before production
- approved: dedicated no-echo credential resolver for `RemoteTarget`
  (distinct from `LocalTarget`'s reused `parsePostgresUrl`)
- rejected: reusing `db-guard.mjs`'s `parsePostgresUrl` for the remote
  credential (echoes raw value on failure -- unsafe for an external secret)
- rejected: any query-execution capability in this phase
- security status: **GO**

## Artifact Synchronization

- `plan.md`: Security/Auth phase marked complete

## Open Questions / Blockers

- None for Phase A. Staging/production execution remains blocked on the
  user's environment authorization, DB-role provisioning process, and
  (for production) the `EXPLAIN`/plan review -- all explicitly deferred,
  not implicitly assumed resolved.

## Handoff Notes

- what the next agent should rely on: the no-echo credential resolver and
  live role verification are both load-bearing; do not relax either
  without a new Security/Auth review
- what should not be re-decided without new evidence: no query-execution
  CLI command until the user separately authorizes it

## Update Log

### 2026-08-27 — Initial Review

- Trigger: OZI-79 Phase A design and implementation
- Summary of change: approved the credential-resolution and role-
  verification mechanisms; found and fixed a real credential-echo risk in
  the originally proposed reuse of `db-guard.mjs`'s `parsePostgresUrl`;
  confirmed all controls in the finished, tested implementation
- Sections refreshed: all

### 2026-08-27 — Phase A.1 Hardening

- Trigger: user code review of commit `95f374c1` found `verifyReadOnlyRole`
  insufficient — it sampled only 4 representative tables for write
  privilege and never checked for `SELECT`'s *presence*, so a write grant
  on any unsampled table (e.g. `audit_events`) or a role with zero grants
  at all would incorrectly pass.
- Summary of change: rewrote `verifyReadOnlyRole` as a database-wide
  application-table least-privilege check: (1) rejects `rolsuper`,
  `rolcreatedb`, `rolcreaterole`, `rolreplication`, `rolbypassrls`; (2)
  rejects schema-level `CREATE` on `public`/`drizzle`, via `aclexplode`
  filtered to exclude the `PUBLIC` pseudo-grantee (oid 0) rather than
  `has_schema_privilege()`, which folds in `PUBLIC`'s grants and would
  false-positive on any database — this local test-db included — that
  still has `PUBLIC` holding `CREATE` on `public` (the pre-PG15 default,
  still common); (3) rejects any write privilege
  (`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER`) on
  *every* real table in `public`/`drizzle`, discovered live via
  `pg_class`/`pg_namespace`, not a hardcoded sample; (4) requires `SELECT`
  presence on every table the frozen OZI-79 12-check query subset reads.
- Real bug found and fixed during implementation, not just design: the
  first draft resolved tables via `pg_catalog.pg_tables` +
  `has_table_privilege(current_user, 'schema.table', priv)` (text form).
  Postgres's text-to-`regclass` resolution for that call requires `USAGE`
  on the containing schema — a role legitimately never granted `USAGE` on
  `drizzle` (a real, minimal provisioning shape) made that call throw
  `permission denied for schema drizzle` instead of returning `false`,
  crashing the check for a role that should have passed. Fixed by
  resolving tables via `pg_class`/`pg_namespace` and calling
  `has_table_privilege` with the table's **oid**, which needs no such
  resolution. Caught by the real-Postgres test suite (test-db), not by
  design review — this is exactly why Phase A.1 required this repository's
  actual DB test coverage before being called done, not just a reasoned
  design.
- Real-DB tests added, proving both new failure modes the user named: a
  role with `UPDATE` on `audit_events` (never in the old 4-table sample)
  is rejected; a role missing `SELECT` on `feature_flags` (in the required
  set) is rejected. Also added: explicit-`CREATE`-on-schema rejection.
- Still no execution capability: `cli.ts` untouched, no
  `scan --target=staging|production` command exists.
- security status: **GO** (Phase A.1 hardening only — Phase B remote
  preflight/`EXPLAIN` review remains a separate, not-yet-authorized step)
- Sections refreshed: Current-State Findings, Sensitive Data And Exposure
  Notes (unchanged — still N/A), Update Log
