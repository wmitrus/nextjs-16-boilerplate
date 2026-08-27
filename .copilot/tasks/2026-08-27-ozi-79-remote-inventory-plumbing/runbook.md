# OZI-79 Phase A Runbook

## What exists right now

`scripts/tenancy-inventory/readonly-db-remote.ts` — tested, reviewed
plumbing. Nothing in it is reachable from the CLI (`cli.ts` is unchanged
from OZI-75) — there is no `pnpm tenancy-inventory -- scan
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
   application-table least-privilege check (Phase A.1 hardening — this
   replaced an earlier version that only sampled 4 representative tables
   and never checked for SELECT's *presence*):
   - checks `pg_roles.rolsuper`/`rolcreatedb`/`rolcreaterole`/
     `rolreplication`/`rolbypassrls` for the connected role — refuses if
     any is true (each one can bypass table grants entirely, so no amount
     of `REVOKE` matters if you're accidentally connected as a role with
     one of these);
   - checks, via `aclexplode` (deliberately not `has_schema_privilege()`,
     which folds in whatever `PUBLIC` was granted and would false-positive
     on any database that hasn't run `REVOKE CREATE ON SCHEMA public FROM
     PUBLIC`), whether the role itself — not `PUBLIC` — was granted
     `CREATE` on the `public` or `drizzle` schema — refuses if so;
   - checks `has_table_privilege(current_user, table_oid, privilege)` for
     `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER` against
     **every** real table in the `public` and `drizzle` schemas (discovered
     live from `pg_class`/`pg_namespace`, not a hardcoded sample) —
     refuses if the connected role has any of them on any table;
   - checks `has_table_privilege(current_user, table_oid, 'SELECT')` is
     actually **present** on every table the frozen, approved OZI-79
     query set reads (see "Exact query subset" below) — refuses if any is
     missing, since a role with zero grants at all would otherwise pass a
     write-only check while being unable to run any approved query.

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
roles on your local `test-db` and proves against them directly:

- the local `test-db`'s own `postgres` superuser role is rejected;
- a real role granted `SELECT` only on every table passes cleanly;
- a real role granted `SELECT, INSERT` is rejected;
- a real role granted `UPDATE` on `audit_events` specifically — a table
  the old 4-table sample never looked at — is rejected (proves the
  database-wide rewrite, not just the old sample, actually works);
- a real role missing `SELECT` on `feature_flags` (one of the tables the
  approved query set requires) is rejected (proves the check verifies
  SELECT *presence*, not just write-privilege absence);
- a real role explicitly granted `CREATE` on the `public` schema is
  rejected.

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
   timeouts, not just plan shape in isolation. Not yet done — this is the
   next phase after this hardening pass, still not authorized to execute.

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
automatically. After that review, and only after it, wiring a
`scan --target=staging|production` CLI command (calling
`withReadOnlyRemoteDb`, reusing the approved subset, writing through
`writeEvidence('staging' | 'production', ...)`, which already supports
both) becomes small and mechanical. That command still would not run
anything until execution is separately authorized — per OZI-79's two-stage
execution control, building the command and running it against a real
environment stay two distinct, explicit steps.
