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
   `fn` runs**, calls `verifyReadOnlyRole`, which:
   - checks `pg_roles.rolsuper` for the connected role — refuses if true
     (a superuser bypasses every grant, so no amount of `REVOKE` matters
     if you're accidentally connected as one);
   - checks `has_table_privilege(current_user, table, privilege)` for
     `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER` against
     four representative tables (`tenants`, `organizations`, `users`,
     `memberships`) — refuses if the connected role has any of them.

   Only if both checks pass does `fn` (the actual diagnostic queries) run
   — and it runs inside a real Postgres `READ ONLY` transaction, the same
   mechanism OZI-75 already proved rejects writes with error `25006`.

3. Every query the connection ever runs is also bounded by
   `statement_timeout`/`lock_timeout`/`idle_in_transaction_session_timeout`
   — currently the **same conservative values as local** (5s/2s/10s).
   **These are explicitly placeholders**, not an approved production
   value — see "Before production" below.

## Proven, not asserted

`readonly-db-remote.db.test.ts` creates two real, disposable Postgres
roles on your local `test-db` and proves against them directly:

- the local `test-db`'s own `postgres` superuser role is rejected;
- a real role granted `SELECT` only on every table passes cleanly;
- a real role granted `SELECT, INSERT` is rejected.

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

## Decision points — none of these are made for you

Before staging or production execution can happen, someone (you) has to
answer:

1. **Which environment(s)?** Staging only, production only, or both.
   OZI-79's own text: staging only makes sense if a *representative,
   isolated* staging database actually exists — if it doesn't, skipping
   straight to a carefully reviewed production run may be more honest
   than running against an unrepresentative staging DB and treating that
   as evidence.

2. **Who provisions the `SELECT`-only role, and how?** This tool cannot
   create that role for you — it can only verify, live, that whatever
   role you hand it is actually scoped the way you intended. The
   provisioning process (who runs the `CREATE ROLE`/`GRANT SELECT`, how
   the resulting credential reaches this tool as an env var, how it's
   rotated/revoked afterward) is an operational decision outside this
   repo's code.

3. **`EXPLAIN`/plan review**, before production specifically. The 8
   queries from OZI-75 are aggregate-only and were designed to be cheap
   against a small local database — that does not by itself prove they're
   cheap against a production-sized one. This should happen against
   production-shaped data (or a production snapshot) before the
   placeholder timeouts above are replaced with real, reviewed values.

4. **Exact query subset.** Nothing currently restricts *which* of the 8
   `topology-queries.ts` functions would run remotely — because nothing
   runs them remotely yet. When you're ready, the recommended shape
   (per Architecture Guard's review) is a small, hardcoded array of
   approved query names, not a free-form flag.

## What happens after you decide

Once you tell me which environment(s) are authorized and how the
credential will be provisioned, the remaining work is small and
mechanical: wire a `scan --target=staging|production` CLI command that
calls `withReadOnlyRemoteDb`, reuses the already-reviewed
`topology-queries.ts` functions from the approved subset, and writes
through `writeEvidence('staging' | 'production', ...)` (already supports
both). That command still would not run anything until you separately say
"execute" — per OZI-79's two-stage execution control, building the
command and running it against a real environment stay two distinct,
explicit steps.
