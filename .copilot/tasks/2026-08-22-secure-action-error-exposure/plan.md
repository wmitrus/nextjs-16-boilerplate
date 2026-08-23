# Task Plan — Server Action Error Exposure (SEC-37)

## Status

**✅ REMEDIATION IMPLEMENTED.** Seventh case in the multi-case security-audit
remediation series; same branch as Cases 1–6.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–6.**

## Problem, Confirmed In Code

`createSecureAction`'s catch block returned the caught exception's own
message to the client for every error it did not specifically classify,
filtered by a single substring match on `'Failed query:'`.

The report's framing is right and worth restating precisely: the defect is
not the set of missing cases, it is **the direction of the default**.
Exposure was opt-out, so anything nobody thought to filter shipped to the
browser. The one filter that existed is also fragile in a particular way —
it keys on another project's error text, so it stops working silently the
day that project rewords its message.

Verified the report's second claim too: `with-error-handler.ts` really does
handle this correctly for API routes (`'Internal Server Error'` in
production, correlation id logged). Two boundaries in one repository with
opposite defaults.

## The Fix

Exposure is now a property of the error **type**, decided when the error is
written: `PublicError` (`src/core/error/public-error.ts`) carries an
`exposeToClient` discriminant. The boundary has one rule and a safe default —
a `PublicError` message is returned; everything else yields
`Something went wrong. Reference: <correlationId>` in production, with the
full detail logged under that same id.

Four decisions worth recording:

- **The correlation id is returned to the client, not just logged.** A
  generic message on its own trades a leak for an unsupportable failure; the
  id gives a user one string to quote that leads straight to the record.
- **Outside production the real message is still returned.** There is no
  untrusted client locally, and a reference id would make debugging worse.
  This matches what `with-error-handler.ts` already does, so the two
  boundaries now agree rather than merely both being defensible.
- **`AuthorizationError` stays exposed** — a reasoned exemption, not an
  oversight. Checked the call site: its message is always supplied by
  `authorize()` in this repository (defaulting to `'Unauthorized'`), never
  library text.
- **`isPublicError` accepts a structural `exposeToClient === true`** as well
  as `instanceof`, so the guard survives realm and duplicated-module
  boundaries where `instanceof` quietly fails. Tested both ways, including
  that a falsy or non-boolean discriminant is rejected.

Also corrected while here: the first implementation read
`process.env.NODE_ENV` directly, which this repository explicitly forbids
outside the T3-Env schema. Switched to `env.NODE_ENV`, which is also what
makes the production-mode tests possible via `mockEnv`.

## Validation

The important judgement: testing only the case that _used_ to be filtered
would re-encode the original mistake, since the bug was the default, not the
one missing case. So there is a production-mode test per **shape** of leak
the old default allowed — driver message, provider SDK message with a key
prefix, filesystem path, connection `TypeError`, and a non-`Error` throw —
each asserting the raw text does not appear in what the client receives.

Plus: the returned `correlationId` is asserted to be the same id the server
log was written under (a reference the log cannot be searched by is
worthless), a `PublicError` message _is_ returned in production (so the safe
default cannot silently become "hide everything"), and `AuthorizationError`
still reaches the user.

## Quality Gates (this session)

| Gate                      | Command                 | Result                                         |
| ------------------------- | ----------------------- | ---------------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅ pass                                        |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing warnings (no new) |
| Unit tests                | `pnpm test`             | ✅ 227 files / 1692 tests (+1 file, +14)       |
| DB integration tests      | `pnpm test:db`          | ✅ unchanged                                   |
| Circular dependency check | `pnpm skott:check:only` | ✅ no circular dependencies                    |
| Unused dependency check   | `pnpm depcheck`         | ✅ no issues                                   |

## Residual Risk / Follow-Ups

- **The result shape changed**: `{ status: 'error' }` now carries a
  `correlationId`. Additive, so existing consumers still compile; no caller
  currently reads it, but the UI could surface it in an error state to make
  support reports actionable. Logged as `PE-10`.
- **`with-error-handler.ts` still uses `process.env.NODE_ENV` directly** and
  does not know about `PublicError` — it predates both. Converging the two
  boundaries on one mechanism is worthwhile but is a refactor of a working
  path, not part of closing this. Logged as `PE-11`.
- **No `PublicError` is thrown anywhere yet.** The type exists and the
  boundary honours it; the first genuine use will come from whichever action
  next needs to tell a user something specific.
