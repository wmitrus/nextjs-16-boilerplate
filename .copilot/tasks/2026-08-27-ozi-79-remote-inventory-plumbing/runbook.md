# OZI-79 Phase A Runbook

## What exists right now

`scripts/tenancy-inventory/readonly-db-remote.ts` — tested, reviewed
plumbing. Nothing in it is reachable from the CLI — `cli.ts`'s only change
since OZI-75 is an import rename (`writeLocalEvidence` -> `writeEvidence`);
there is no remote CLI execution path, no `pnpm tenancy-inventory -- scan
--target=staging` command. Running `pnpm tenancy-inventory:matrix` or
`:scan:dev`/`:scan:test` today behaves exactly as it did after OZI-75;
this phase added nothing runnable against a remote database.

## What it does, mechanically

1. `describeRemoteTarget('staging' | 'production')` resolves a connection
   URL from one of two fixed environment variables:
   - `OZI79_STAGING_READONLY_DATABASE_URL`
   - `OZI79_PRODUCTION_READONLY_DATABASE_URL`

   Neither has a fallback. If unset, it throws immediately, naming the
   env var — never printing what (if anything) was actually in it.

2. `withReadOnlyRemoteDb(target, fn)` opens the connection and, **before
   `fn` runs**, calls `verifyReadOnlyRole`, which is a database-wide
   application-table least-privilege check (hardened three times already —
   Phase A.1 replaced an earlier version that only sampled 4 representative
   tables and never checked SELECT's *presence*; Phase A.2 and Phase A.3
   each fixed further real gaps a user code review found):
   - checks `pg_roles.rolsuper`/`rolcreatedb`/`rolcreaterole`/
     `rolreplication`/`rolbypassrls` for the connected role — refuses if
     any is true (each one can bypass table grants entirely, so no amount
     of `REVOKE` matters if you're accidentally connected as a role with
     one of these);
   - checks `has_schema_privilege(current_user, schema, 'CREATE')` for the
     `public` and `drizzle` schemas — refuses if true, **inclusive of
     `PUBLIC`'s own grants** (Phase A.2 fix: an earlier version deliberately
     excluded `PUBLIC` via `aclexplode`, which was wrong — if `PUBLIC` holds
     `CREATE` on a schema, as this repo's own test-db and any database that
     predates PG15's hardened default still can, *every* role including a
     correctly provisioned one can actually `CREATE TABLE` there, so the
     tool must refuse rather than report a false "SELECT-only" pass);
   - checks `has_schema_privilege(current_user, schema, 'USAGE')` for both
     schemas — refuses if missing on either (Phase A.2 addition: without
     `USAGE` on `drizzle`, `latestSchemaMigration`'s query would fail at
     execution time, which the old check never caught);
   - checks `pg_auth_members` for any role the connected role is a member
     of — refuses if any exist (Phase A.2 addition: role membership is a
     hidden `SET ROLE`/inheritance path to whatever privileges that other
     role holds; a genuinely minimal OZI-79 credential must have none);
   - checks `has_table_privilege(current_user, table_oid, privilege)` for
     `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER` against
     **every** real table in the `public` and `drizzle` schemas (discovered
     live from `pg_class`/`pg_namespace`, not a hardcoded sample) —
     refuses if the connected role has any of them on any table;
   - checks `has_table_privilege(current_user, table_oid, 'SELECT')` on
     that same full table set, and refuses if it is present on any table
     **outside** `REQUIRED_SELECT_TABLES` (Phase A.3 addition: the
     credential must be scoped to exactly the tables the approved query
     set reads, not "no writes anywhere" — a role that can read
     `user_credentials`, say, is not the least-privilege credential OZI-79
     requires just because it cannot write);
   - checks that `SELECT` is actually **present** on every table in
     `REQUIRED_SELECT_TABLES` — the 12 `public` tables plus
     `drizzle.__drizzle_migrations` (see "Exact query subset" below) —
     refuses if any is missing, since a role with zero grants at all would
     otherwise pass a write-only check while being unable to run any
     approved query.

   Only if all checks pass does `fn` (the actual diagnostic queries) run
   — and it runs inside a real Postgres `READ ONLY` transaction, the same
   mechanism OZI-75 already proved rejects writes with error `25006`.

3. Every query the connection ever runs is also bounded by
   `statement_timeout`/`lock_timeout`/`idle_in_transaction_session_timeout`
   — currently the **same conservative values as local** (5s/2s/10s).
   **These are explicitly placeholders**, not an approved production
   value — see "Before production" below.

## Proven, not asserted

`readonly-db-remote.db.test.ts` creates several real, disposable Postgres
roles on your local `test-db` and proves against them directly (11 tests):

- the local `test-db`'s own `postgres` superuser role is rejected;
- a real role granted `SELECT` on exactly `REQUIRED_SELECT_TABLES`
  (nothing more) and `USAGE` on both schemas, with no memberships, passes
  cleanly;
- a real role granted `SELECT, INSERT` is rejected;
- a real role granted `UPDATE` on `audit_events` specifically — a table
  the old 4-table sample never looked at — is rejected (proves the
  database-wide rewrite, not just the old sample, actually works);
- a real role missing `SELECT` on `feature_flags` (one of the tables the
  approved query set requires) is rejected (proves the check verifies
  SELECT *presence*, not just write-privilege absence);
- a real role granted `SELECT` on `user_credentials` — outside
  `REQUIRED_SELECT_TABLES` — is rejected even though it holds no write
  privilege anywhere (Phase A.3: proves the check verifies SELECT
  *scope*, not just SELECT presence plus write absence);
- a real role explicitly granted `CREATE` on the `public` schema is
  rejected;
- a role that is otherwise exactly the passing baseline is rejected when
  `PUBLIC` itself is granted `CREATE` on `public` (proves the check
  catches the ambient case, not just a role-specific grant);
- a role missing `USAGE` on `drizzle` is rejected;
- a role with `USAGE` on `drizzle` but missing `SELECT` on
  `__drizzle_migrations` specifically is rejected;
- a role that is a member of another role is rejected.

The suite's own fixture setup practices what it checks: `beforeAll`
records whether `PUBLIC` held `CREATE` on `public` *before* touching
anything, and `afterAll` restores exactly that state (not an
unconditional re-grant) — a database that never had the ambient grant
wouldn't gain it as a side effect of running these tests.

This is the strongest evidence available without a real remote credential
— it proves the *detection mechanism* itself works against genuine
Postgres role/grant state, not a mock.

## What this does NOT protect against

Stated plainly, not glossed over: `verifyReadOnlyRole` cannot see a
writable view or a `SECURITY DEFINER` function the role might have
execute privilege on. If the SELECT-only role you provision also happens
to have execute privilege on some function that performs writes
internally, this check will not catch that. That's exactly why the
"approved query subset" review below still has to happen — a human
confirming exactly what the approved queries touch, not just what grants
the role has.

## Decision points — resolved 2026-08-27

Four questions had to be answered before staging or production execution
could be planned. All four are now resolved:

1. **Which environment(s)?** Production is the real target. Staging only
   counts as evidence if a *genuinely separate, representative* staging
   database exists — otherwise it is marked "N/A: non-representative"
   rather than running against an unrepresentative staging DB and treating
   that as security theater.

2. **Who provisions the `SELECT`-only role, and how?** Entirely outside
   this tooling, by a DB administrator. This tool must never gain
   `CREATE ROLE`/`ALTER ROLE` capability — it only verifies, live, that
   whatever role it's handed is actually scoped the way it should be
   (`verifyReadOnlyRole`, above). Preferred shape: a dedicated, temporary
   "OZI-79" role per environment, revoked/dropped after use.

3. **`EXPLAIN`/plan review**, before production specifically. Plain
   `EXPLAIN` only — never `EXPLAIN ANALYZE`, which would actually execute
   the query mid-"plan review". Scrutinize
   `tenantIdShapeCounts('audit_events')` and `quotaEnforcementSignal`'s
   `maxUsers` join especially closely. A sequential scan alone is not
   automatically disqualifying for a small table — look at estimated
   rows/cost/relation size/join shape before setting real production
   timeouts, not just plan shape in isolation. **Its own explicit
   authorization, separate from the later inventory scan**: plain
   `EXPLAIN` doesn't execute the queried `SELECT`, but it is still a live
   remote query against production Postgres — connecting at all is the
   thing that needs its own sign-off, distinct from "run the real inventory
   scan." Not yet done — this is the next phase after this hardening pass,
   still not authorized to execute.

4. **Exact query subset.** Frozen as design-approved (not yet
   execution-approved) — the 12 named checks below, plus
   `latestSchemaMigration` as evidence metadata (not a finding). This list
   is also what `verifyReadOnlyRole`'s required-`SELECT` check enforces:

   - `tenantOrganizationCounts`
   - `usersInMultipleOrganizationsCount`
   - `usersInMultipleTenantsCount`
   - `organizationsMissingTenantAttributesCount`
   - `providerOrganizationMappingAnomalies`
   - `userProviderMappingAnomalies`
   - `tenantIdShapeCounts('feature_flags')`
   - `tenantIdShapeCounts('audit_log_settings')`
   - `tenantIdShapeCounts('audit_events')`
   - `waitlistEntriesWithTenantIdCount`
   - `policiesWithNullOrganizationCount`
   - `quotaEnforcementSignal`
   - `latestSchemaMigration` (metadata, not a finding)

   Per Architecture Guard's original review, the recommended shape for
   restricting *which* of these actually run remotely is a small,
   hardcoded array of approved query names, not a free-form flag — nothing
   currently runs them remotely, because there is still no
   `scan --target=staging|production` CLI command (deliberately).

## What happens next

Next up: plain-`EXPLAIN` plan review of the 12 checks above against
production-shaped data (or a production snapshot), per point 3. That is a
separate, not-yet-authorized phase — nothing in this repo runs it
automatically.

**Phase B should start with a canonical query registry**, before any
`EXPLAIN` or scan wiring: the 12 named checks above compile down to **15
distinct data SQL statements** (`providerOrganizationMappingAnomalies`,
`userProviderMappingAnomalies`, and `quotaEnforcementSignal` each issue 2
statements; every other check issues 1) **plus the 1 schema-metadata
statement** (`latestSchemaMigration`, evidence not a finding) — 16 SQL
statements total. Both the plain-`EXPLAIN` preflight and the later
inventory scan must consume this *exact same* registry — the same 16
statements, defined once — so there is no duplicated SQL between what got
reviewed and what actually runs remotely, and no way for the two to drift
apart. This is a structural precondition for Phase B, not a nice-to-have:
`EXPLAIN`-reviewing one copy of a query while a second, textually
different copy runs against production defeats the entire point of the
preflight review.

After the registry exists and the `EXPLAIN` review is complete, wiring a
`scan --target=staging|production` CLI command (calling
`withReadOnlyRemoteDb`, running the registry's approved subset through
it, writing through `writeEvidence('staging' | 'production', ...)`, which
already supports both) becomes small and mechanical. That command still
would not run anything until execution is separately authorized — per
OZI-79's two-stage execution control, building the command and running it
against a real environment stay two distinct, explicit steps.
