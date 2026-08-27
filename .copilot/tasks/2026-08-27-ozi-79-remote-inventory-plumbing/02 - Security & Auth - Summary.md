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
   `cli.ts`'s only change is an import rename (`writeLocalEvidence` ->
   `writeEvidence`, needed because `evidence-store.ts` renamed the
   function it re-exports); no remote target, command, or execution
   surface exists in it, so there is no command surface that could run
   this code against a real remote database in this phase.

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
- Still no execution capability: `cli.ts`'s only change is an import
  rename (`writeLocalEvidence` -> `writeEvidence`); no remote CLI execution
  path exists, no `scan --target=staging|production` command exists.
- security status: **GO** (Phase A.1 hardening only — Phase B remote
  preflight/`EXPLAIN` review remains a separate, not-yet-authorized step)
- Sections refreshed: Current-State Findings, Sensitive Data And Exposure
  Notes (unchanged — still N/A), Update Log

### 2026-08-27 — Phase A.2 Correctness Pass

- Trigger: user code review of commit `84e40752` found two further real
  gaps and one wording inaccuracy: (1) the Phase A.1 `CREATE` check
  deliberately excluded `PUBLIC`'s own grants via `aclexplode`, which is
  wrong -- a privilege granted to `PUBLIC` is effective for every role,
  including the connected one, so excluding it lets a database whose
  `public` schema still has `CREATE` granted to `PUBLIC` (the pre-PG15
  default; this repo's own test-db reproduces it) report a false
  "SELECT-only" pass; (2) `REQUIRED_SELECT_TABLES` covered only the 12
  `public` tables, not `drizzle.__drizzle_migrations`, which
  `latestSchemaMigration` actually reads -- the existing "clean pass" test
  never granted `USAGE`/`SELECT` on `drizzle` at all and still passed,
  meaning a real inventory run's metadata query would have failed at
  execution time despite `verifyReadOnlyRole` reporting success; (3)
  "`cli.ts` untouched" was literally false against `main` (the branch
  renamed an import in it) even though the underlying security claim --
  no remote execution capability exists -- remained true.
- Summary of change: (1) reverted the `CREATE` check to
  `has_schema_privilege()`, now deliberately *inclusive* of `PUBLIC`'s
  grants -- correct Postgres semantics, since `PUBLIC`'s grants are
  effective for the connected role exactly like a role-specific grant;
  (2) added an explicit `USAGE` requirement on both `public` and
  `drizzle` (also via `has_schema_privilege()`, also `PUBLIC`-inclusive);
  (3) extended `REQUIRED_SELECT_TABLES` to a schema-qualified list
  including `drizzle.__drizzle_migrations`; (4) added a role-membership
  check (`pg_auth_members`) rejecting any role the connected role is a
  member of, closing a hidden `SET ROLE`/inheritance path to a stronger
  role's privileges for what should be a genuinely minimal, single-purpose
  credential; (5) corrected "`cli.ts` untouched" to "`cli.ts`'s only
  change is an import rename; no remote CLI execution path exists" in
  `plan.md`, `01 - Architecture Guard - Summary.md`, this file, and
  `runbook.md`.
- Test-fixture consequence of (1): since this local test-db's `PUBLIC`
  already holds `CREATE` on `public` (the same ambient condition the fix
  targets), `readonly-db-remote.db.test.ts`'s `beforeAll` now revokes it
  for the duration of the suite (restored in `afterAll`) so the "clean
  pass" test proves what it claims; a dedicated new test proves the
  ambient-`PUBLIC`-`CREATE` rejection path directly by temporarily
  re-granting it against the otherwise-passing baseline role.
- Real-DB tests added: PUBLIC-granted (not role-specific) `CREATE` causes
  rejection; missing `USAGE` on `drizzle` causes rejection; `USAGE` present
  but missing `SELECT` on `__drizzle_migrations` specifically causes
  rejection; role membership causes rejection. 10 tests total now (was 6).
- Still no execution capability: `cli.ts`'s only change remains the import
  rename; no remote CLI execution path exists, no
  `scan --target=staging|production` command exists.
- security status: **GO** (Phase A.2 correctness pass only — Phase B
  remote preflight/`EXPLAIN` review remains a separate, not-yet-authorized
  step, and per the user's explicit note, plain `EXPLAIN` itself will need
  its own authorization distinct from the later inventory-scan
  authorization, since it is still a live query against production
  Postgres even though it never executes the queried `SELECT`)
- Sections refreshed: Current-State Findings, Update Log

### 2026-08-27 — Phase A.3 Least-Privilege Hardening

- Trigger: user code review of commit `6384df56` found the credential was
  still not truly least-privilege: `verifyReadOnlyRole` verified "no
  writes anywhere" and "SELECT present on the required tables," but never
  verified "SELECT absent everywhere else" -- a role that could `SELECT`
  every application table, including e.g. `user_credentials`, still passed
  as long as it held no write privilege. Also flagged: the suite's
  `afterAll` unconditionally re-granted `CREATE ON SCHEMA public TO
  PUBLIC`, which would introduce that ambient grant on a database that
  never had it, rather than restoring the actual pre-suite state.
- Summary of change: (1) extended the existing table-privilege query (the
  one already iterating every discovered table in `public`/`drizzle`) to
  also select `SELECT`, and reject any table where `SELECT` is true but
  the table is outside `REQUIRED_SELECT_TABLES` -- this reused the
  existing single round-trip rather than adding a second query; (2) the
  required-`SELECT`-presence check now reads directly from that same
  result set (a `Map` keyed by qualified table name) instead of issuing
  its own separate query, removing a redundant round-trip; (3) exported
  `REQUIRED_SELECT_TABLES` so the test fixture builds its baseline grants
  from the exact same list the check enforces, instead of a
  independently-maintained duplicate that could silently drift; (4) the
  suite's `beforeAll` now queries `has_schema_privilege('public', 'public',
  'CREATE')` *before* touching anything, stores the result, and `afterAll`
  restores exactly that captured state rather than unconditionally
  granting it back.
- Test-fixture consequence of (1)+(3): `grantBaselineSelectOnly` now
  grants `SELECT` on exactly the 13 tables in `REQUIRED_SELECT_TABLES`
  (was: `SELECT ON ALL TABLES IN SCHEMA public`), so the "clean pass"
  fixture is itself now the least-privilege credential the check demands,
  not a broader one that happens to pass anyway.
- Real-DB test added: a role granted `SELECT` on `user_credentials` (not
  in the required set) is rejected, even though it holds no write
  privilege anywhere -- proves the check verifies SELECT *scope*, not
  just SELECT presence plus write absence. 11 tests total now (was 10).
- Still no execution capability: `cli.ts`'s only change remains the import
  rename; no remote CLI execution path exists, no
  `scan --target=staging|production` command exists.
- security status: **GO** (Phase A.3 least-privilege hardening only —
  Phase B remote preflight/`EXPLAIN` review remains a separate,
  not-yet-authorized step; per the user's direction, Phase B must also
  build a canonical query registry first, so `EXPLAIN` review and the
  later inventory scan consume the exact same 15 data SQL statements plus
  the 1 schema-metadata statement -- no duplicated SQL between what gets
  reviewed and what actually runs remotely)
- Sections refreshed: Current-State Findings, Update Log
