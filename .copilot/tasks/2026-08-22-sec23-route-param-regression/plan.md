# Task Plan — SEC-23 Regression: Raw Route Params Bound To UUID Columns (Case 6)

## Status

**✅ REMEDIATION IMPLEMENTED.** Sixth case in the multi-case security-audit
remediation series; same branch as Cases 1–5.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–5.**

## What The Report Said, And What Was Actually True

The report named three routes. Verifying against current code rather than
accepting the list:

| Route                         | Reported    | Actual                                                                                              |
| ----------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `/api/admin/users/[id]`       | unvalidated | **Already fixed** — Case 1 added `z.object({ id: z.uuid() })`. The report predates that fix.        |
| `/api/admin/invitations/[id]` | unvalidated | **Confirmed** — `const id = params['id']` → `revokeInvitation(id)` → `invitationsTable.id` (`uuid`) |
| `/api/admin/waitlist/[id]`    | unvalidated | **Confirmed** — same shape → `waitlistEntriesTable.id` (`uuid`)                                     |

A full sweep of all eleven dynamic API routes found no others: the eight
`organizations/**` routes validate correctly, `feature-flags/[id]` validates
correctly, and `/api/auth/invite/[token]` is not a UUID sink at all
(`invitations.token` is `text()`).

Both broken routes _did_ have `if (!id || Array.isArray(id))` — the exact
check SEC-23 already calls insufficient, because it proves a string exists,
not that it is valid for a `uuid` column.

Impact is not SQL injection (Drizzle parameterises). It is that a malformed
segment reaches the driver and raises Postgres `22P02`, turning
caller-controlled input into a 500 and bypassing the route's own 400/404
handling.

## Why It Came Back — The Part That Mattered

SEC-23 was marked "Real risk → fixed" while these two routes still did the
forbidden thing. The entry's own Dangerous Pattern example is written against
the invitations route: **the pattern document quoted the vulnerable code from
a route that was never fixed.**

The cause is structural, not carelessness: SEC-23 was written as advice to
follow per route. Advice does not survive the next route — it depends on
whoever writes it having read the document and remembered it at the right
moment. Fixing three files by hand would have restored the same fragile
state.

So the remediation is two artefacts instead:

1. **`parseUuidRouteParam(params, name)`** — one place the decision is made.
   Returns a discriminated result rather than throwing, so a caller cannot
   let a rejected value through by ignoring an exception. Rejects repeated
   segments explicitly rather than silently taking the first.
2. **A static guard test** that walks every `route.ts` under `src/app/api`,
   extracts each dynamic segment from the path, and fails if the raw value
   reaches the handler without passing through a validator. Non-UUID
   segments sit in an allowlist requiring a written reason. The default is
   "guard it", so a route nobody thought about fails rather than passes.

## Designing The Guard — One Thing Worth Recording

The first version asked _"is there a schema keyed by the segment name?"_ and
flagged eight `organizations/**` routes as broken. They were not: they parse
`params.organizationId` through `organizationIdSchema`, whose key is `id`.
Correct code, wrong question.

The guard now asks the only question that matters: **does the raw value reach
anything other than a validator?** It collapses whitespace so a `safeParse({`
opened on a previous line still covers the value beneath it, and refuses to
let a validation in one statement excuse a raw use in the next.

## Validation

- `uuid-route-param.test.ts` — the helper: valid, malformed, missing,
  repeated segment, uppercase (Postgres accepts it, so over-tightening would
  be a bug), and error-key naming.
- `uuid-route-param.guard.test.ts` — **the guard's own classifier is unit
  tested** against the four shapes it must tell apart, including a route that
  validates a value but also uses it raw. A guard that cannot fail proves
  nothing.
- The guard was additionally verified end-to-end by reverting one of the two
  fixes and confirming the suite went red with the correct message, then
  restoring it.
- Negative route tests on both fixed routes, as SEC-23 itself requires: 400
  for `not-a-uuid`, and the service/mutation mocks never called. A mocked DB
  never raises `22P02`, so only an explicit assertion proves the rejection.

## Quality Gates (this session)

| Gate                      | Command                 | Result                                          |
| ------------------------- | ----------------------- | ----------------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅ pass                                         |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing warnings (no new)  |
| Unit tests                | `pnpm test`             | ✅ 226 files / 1678 tests                       |
| DB integration tests      | `pnpm test:db`          | ✅ unchanged                                    |
| Circular dependency check | `pnpm skott:check:only` | ✅ no circular dependencies                     |
| Unused dependency check   | `pnpm depcheck`         | ✅ no issues (guard uses `node:fs`, no new dep) |

Three new lint warnings appeared in the new files (`detect-object-injection`
on the helper's `params[name]`, `detect-non-literal-fs-filename` on the
guard's directory walk) and were resolved with scoped disables carrying
reasons, following the repository's existing convention — not left as
warnings, since this is a security helper and a future reader would have to
re-triage them.

## Residual Risk / Follow-Ups

- The guard covers `src/app/api/**`. Dynamic **page** routes (`src/app/**`
  outside `api`) that bind UUID params are not yet covered; none currently
  do, but the guard would not catch it if one appeared. Logged as `PE-09`.
- Routes that predate the helper still use their own `z.uuid()` schemas. The
  guard accepts both, so there is no forced migration — but a single style
  would be easier to review. Not worth churning eight working routes for.
