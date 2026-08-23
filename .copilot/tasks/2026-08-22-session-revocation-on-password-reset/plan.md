# Task Plan — Session Revocation On Password Reset (SEC-36)

## Status

**✅ REMEDIATION IMPLEMENTED.** Fifth case in the multi-case security-audit
remediation series; commits land on the same branch as Cases 1–4,
`claude/security-audit-multi-tenant-idor-e1y3yr`.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–4** (no
`.env.leantime`/`LEANTIME_URL` in this sandbox; diagnostic trail in Case 1's
`plan.md`, not re-run here per the no-duplication convention).

## Execution Mode

`straight-through`, single session, via the `security-incident-workflow`
skill. Two genuine design decisions were surfaced to the user via
`AskUserQuestion` before any code was written — see `intake.md`'s Decision
Record.

## Workflow Steps (Security Incident Workflow)

1. **Incident intake & classification** — `intake.md`.
2. **Security/Auth review** — the whole case is an auth trust-boundary
   question; analysis lives in `intake.md` and SEC-36.
3. **Next.js Runtime review (ran, informed the design)** — established that
   the Edge gate (`AuthJsEdgeIdentitySource`) has no database and therefore
   cannot be the enforcement point, consistent with PE-03's earlier finding
   that the proxy layer is never authoritative. `sessionIssuedAt` is still
   populated there for contract parity.
4. **Architecture Guard review (ran, changed the design)** — see
   "Architecture Note" below; the identity contract carries an explicit
   anti-scope-creep doctrine that this change had to be reconciled with.
5. **Validation Strategy** — see "Validation".
6. **Implementation**.
7. **Validation & close-out** — gates below.

## Architecture Note

`RequestIdentitySourceData` documents a deliberate "forbidden fields"
doctrine (no roles, no permissions, no tenantId, no metadata) to stop
authorization data leaking into the identity contract. Adding
`sessionIssuedAt` was therefore not a free change and is justified
explicitly in the contract's own doc comment: it is an authentication-
freshness fact about the credential in hand — _when this session was
minted_ — never a statement about what the principal may do. Admitting it
is what makes revoking a stateless JWT possible at all.

The comparison itself was extracted to `src/security/core/session-revocation.ts`
rather than duplicated. Two evaluators independently implementing the same
predicate is how SEC-33's gap happened in the first place; a single shared
function means they cannot drift.

## The Fix

`users.sessions_valid_from` (migration `0017`) is a refusal marker: any
session whose JWT `iat` predates it is rejected. A completed password reset
raises it in the same transaction as the token claim and the password write,
so either the whole reset happened or none of it did.

Enforcement sits in both central evaluators, immediately **after** the
SEC-33 deactivation gate, and reports `UNAUTHENTICATED` — "sign in again" is
the true remedy, every consumer already routes that status to the sign-in
page, and so no consumer needed changing.

`NodeSecurityContextDependencies.requestIdentitySource` is **required**, not
optional. The check fails closed on a missing issue time, so a caller that
quietly omitted it would lock out every user who has ever reset their
password — including the one who just reset it. Making it required turned
that into a compile error, which is exactly what happened: the type change
surfaced four call sites that all needed wiring.

## Validation

- `session-revocation.test.ts` — the predicate directly, including the two
  boundary decisions that carry real product consequences: same-second is
  **allowed** (`iat` is whole seconds; the alternative logs out the person
  who just reset their password), and marker-without-issue-time is
  **revoked** (fail closed).
- Both evaluators tested independently. One is not evidence for the other —
  that is the entire lesson of SEC-33, and re-learning it here would have
  been inexcusable.
- An ordering test: a user both deactivated and revoked still reports
  `ACCOUNT_DISABLED`. **This test caught a real defect during
  implementation** — the revocation gate was initially placed before the
  deactivation gate, which would have told disabled accounts to "sign in
  again" instead of that their account is disabled.
- Real-DB tests that a reset writes the marker, that a pre-reset session is
  refused against the stored value, and that a post-reset one is not.
- Route tests that the marker is raised on success and **not** raised when
  the SEC-35 token claim was lost.

Two further defects were caught by the suite during implementation, both
worth recording because neither was visible by reading the diff:

1. **The identity source was being consulted on every request.** The first
   implementation called `requestIdentitySource.get()` unconditionally in
   `createSecurityContext`. A failing showcase-action test exposed it. It is
   now read only when the user actually carries a marker -- which almost
   nobody does -- so the common path costs nothing and a provider whose
   session lookup is unavailable in some context can no longer turn an
   ordinary request into a failure.
2. **The global test harness had drifted from the real DI graph.**
   `tests/setup.tsx` registered `AUTH.IDENTITY_PROVIDER`,
   `TENANT_RESOLVER` and `USER_REPOSITORY` but not `AUTH.IDENTITY_SOURCE`,
   even though the real container registers all of them together. The
   harness therefore made a correct consumer look broken. Fixed by
   registering the stub alongside the others, with a comment saying why it
   must stay in step.

## Quality Gates (this session)

| Gate                      | Command                 | Result                                          |
| ------------------------- | ----------------------- | ----------------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅ pass                                         |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing unrelated warnings |
| Unit tests                | `pnpm test`             | ✅ pass                                         |
| DB integration tests      | `pnpm test:db`          | ✅ 20 files / 167 tests (+7)                    |
| Circular dependency check | `pnpm skott:check:only` | ✅ no circular dependencies                     |
| Unused dependency check   | `pnpm depcheck`         | ✅ no issues                                    |
| Env consistency           | `pnpm env:check`        | ✅ in sync                                      |

## Residual Risk / Follow-Ups

- **The marker is raised only by password reset.** Any future event meaning
  "this account's sessions should stop working" must raise it too; SEC-36's
  Rule for Agents states this.
- **Deactivation does not raise it** — deliberately. SEC-33 already denies
  those users per request, so it would be redundant. If SEC-33's check were
  ever relaxed, this decision must be revisited.
- **No user-facing "sign out everywhere".** The mechanism now exists to
  build one cheaply; logged as `PE-08`.
- **Requires a migration.** `0017_shiny_starbolt.sql` adds a nullable
  column, so it is backward-compatible and needs no backfill: NULL means
  "nothing ever revoked", which is the correct state for every existing user.
