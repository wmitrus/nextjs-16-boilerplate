# Task Plan — API Response Discipline (SEC-38)

## Status

**✅ IMPLEMENTED.** Eighth case in the multi-case remediation series; same
branch as Cases 1–7.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–7.**

## Finding

`AGENTS.md` has carried an "API Response Discipline" section naming
`response-service.ts` for a long time. A survey of all 36 API routes found
**12 bypassing it** with ~56 hand-rolled `Response.json(...)` calls,
including five live auth endpoints.

Two causes, both structural:

1. **The instruction said "prefer"**, with "unless the endpoint has a
   deliberate protocol-specific reason" as an unbounded escape hatch. The
   repo owner considers this mandatory; the wording did not.
2. **Nothing checked** — the same failure mode as SEC-23, two cases earlier.

Worth stating plainly: I contributed to this. Cases 4 and 5 both edited
`reset-password/route.ts` without noticing it open-codes seven responses.
Reading a file for one purpose does not make its other problems visible,
which is the argument for the guard rather than for more care.

## Scope Decision

Put to the user rather than assumed, because converting the auth routes is a
client-visible change. They chose full conversion, and invited concrete
proposals for the response service itself.

**Proposal considered and rejected, with reasoning:** adding a `client_error`
status for 4xx (today a 403/404/429 returns `status: 'server_error'`, which
is semantically loose). Cost check: `status === 'server_error'` is read by 5
admin client components and 10 test files, and a second error channel would
force every future client to branch twice. The client/server distinction is
already carried by the HTTP status code, so the gain is naming only. Left
alone; logged as `PE-12` for the owner's triage rather than decided
unilaterally.

## Changes

**Converted (7):** the five auth routes, the SSRF showcase, and the internal
E2E provisioning route.

**Exempted (5), each with a written reason in the guard:** the NextAuth
protocol handler, the uptime-monitor health probe, the deploy-script
diagnostics endpoint, the log-ingest acknowledgement, and Sentry's verbatim
example route.

**Two new shared pieces, both extracted because the conversion exposed the
need rather than invented it:**

- `getFieldErrors` moved from `app/api/admin/organizations/_lib.ts` to
  `shared/lib/api/field-errors.ts`. It is a generic Zod→envelope adapter; a
  second copy is how two API families drift into two error shapes.
- `extractApiErrorMessage` (new). The envelope has **two** error channels —
  `server_error` carries `error`, `form_errors` carries `errors` — so a
  client reading only `.error` silently shows its fallback for every
  validation failure. That is a quiet mistake each caller would make
  separately.

**The one genuine behaviour trap.** `sign-up-client.tsx` branched on the
exact success message:

```typescript
const isAutoVerified =
  responseData.message === 'Account created. You can now sign in.';
```

Wrapping the payload would have moved `message` under `data` and flipped this
to `false` silently — wrong UI, no error, no failing test. The route now
returns an explicit `autoVerified` boolean and the client reads that. The
anti-pattern is recorded in `AGENTS.md` and SEC-38.

## Enforcement

`response-service.guard.test.ts` walks every `route.ts` under `src/app/api`
and fails on any hand-rolled envelope. It also fails if an exemption points
at a route that no longer exists, so the list cannot rot.

Verified by reverting one conversion and confirming the suite went red with
the correct message, then restoring it.

## Instructions Updated

- `AGENTS.md` — "prefer" → requirement, with the enforcement named, the
  count that motivated it, client-side guidance (`extractApiErrorMessage`,
  `body.data`), and the message-branching anti-pattern.
- `docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md` — both entries updated.
- `docs/ai/general/04 - Implementation Agents.md` — divergence now means an
  `EXEMPT_ROUTES` entry, i.e. a recorded decision rather than a silent one.

## Quality Gates

| Gate            | Command                 | Result                                |
| --------------- | ----------------------- | ------------------------------------- |
| Typecheck       | `pnpm typecheck`        | ✅ pass                               |
| Lint (with fix) | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing warnings |
| Unit tests      | `pnpm test`             | ✅ 229 files / 1700 tests             |
| DB integration  | `pnpm test:db`          | ✅ 167 tests                          |
| Circular deps   | `pnpm skott:check:only` | ✅ none                               |
| Unused deps     | `pnpm depcheck`         | ✅ none                               |
| Env consistency | `pnpm env:check`        | ✅ in sync                            |

## Residual Risk / Follow-Ups

- `PE-12` — the `server_error` naming for 4xx, described above.
- `PE-11` (from Case 7) is now more attractive: `with-error-handler.ts` is
  the remaining piece of the response path that has not been brought onto
  the shared mechanism.
- The guard covers `src/app/api/**` only, matching the SEC-23 guard's blast
  radius (`PE-09`).
