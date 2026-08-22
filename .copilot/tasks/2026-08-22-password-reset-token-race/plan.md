# Task Plan — Password Reset Token Atomic Claim (SEC-35)

## Status

**✅ REMEDIATION IMPLEMENTED.** Fourth case in the multi-case security-audit
remediation series; commits land on the same branch as Cases 1–3,
`claude/security-audit-multi-tenant-idor-e1y3yr`.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–3** (no
`.env.leantime`/`LEANTIME_URL` in this sandbox; full diagnostic trail in
Case 1's `plan.md`, not re-run here per the no-duplication convention).

## Execution Mode

`straight-through`, single session, via the `security-incident-workflow`
skill. No product/vendor decision arose that needed the user — the correct
pattern was already established twice in this repository, so the fix mirrors
existing code rather than choosing an approach.

## Workflow Steps (Security Incident Workflow)

1. **Incident intake & classification** — see `intake.md`.
2. **Security/Auth review** — the finding is squarely an auth trust-boundary
   issue; analysis is consolidated in `intake.md` (Problem Statement +
   "Confirmed By Investigation") and in SEC-35 rather than split across a
   separate summary file for a single-route change.
3. **Next.js Runtime review** — not required: no App Router semantics,
   caching, or server/client boundary changed. The route already used
   `connection()` and remains fully dynamic.
4. **Architecture Guard review** — not required: no new module, no
   dependency-direction change; the edit is confined to one existing route
   handler.
5. **Validation Strategy** — see "Validation" below; the decisive call was
   that a mocked test _cannot_ prove this fix, so a real-DB test is
   mandatory, not optional.
6. **Implementation** — atomic claim replacing check-then-act.
7. **Validation & close-out** — gates below.

## The Fix

The `SELECT`-then-`UPDATE` split is replaced by a single claiming statement
inside the transaction:

```sql
UPDATE password_reset_tokens
   SET used_at = now
 WHERE token_hash = ?
   AND expires_at > NOW()
   AND used_at IS NULL
RETURNING user_id;
```

No returned row → the token belongs to whoever claimed it → 410, worded and
shaped identically to an invalid token. Only a returned row authorises the
password write, and both happen in the same transaction, so a failure
anywhere rolls the claim back rather than burning the user's token.

The original `SELECT` is kept, deliberately, as a **pre-check only**: it
short-circuits obviously invalid tokens before the ~300 ms bcrypt hash so an
attacker cannot burn CPU spraying junk tokens. Its comment states in the
imperative that it decides nothing and that the claim is the authority —
without that, the next reader would reasonably mistake it for the security
check and the bug would grow back.

## Validation

The decisive judgement for this case: **a mocked test cannot prove this
fix.** The guarantee is a property of one SQL statement under concurrency;
mocking the query builder proves only that the code calls the functions the
test expects. Both layers were therefore written:

- `route.db.test.ts` (real DB, PGlite) — fires **10 concurrent claims at one
  token and asserts exactly one wins**, the test the audit explicitly
  demanded. Also asserts a losing claim does not overwrite the winner's
  `used_at` (the precise damage the old `WHERE id = ?` did), that an
  expired-but-unused token is rejected by the claim itself, and that a
  contested reset never leaves duplicate credential rows.
- `route.test.ts` (unit) — the pre-check passing is not permission to
  proceed: a claim returning no row yields 410, byte-identical to an invalid
  token, and is logged as `auth:password_reset_token_claim_lost` so a
  contested reset is visible in production.

## Quality Gates (this session)

| Gate                      | Command                 | Result                                          |
| ------------------------- | ----------------------- | ----------------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅ pass                                         |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing unrelated warnings |
| Unit tests                | `pnpm test`             | ✅ pass (+1 file, +7 tests)                     |
| DB integration tests      | `pnpm test:db`          | ✅ 20 files / 165 tests (+1 file, +5 tests)     |
| Circular dependency check | `pnpm skott:check:only` | ✅ no circular dependencies                     |
| Unused dependency check   | `pnpm depcheck`         | ✅ no issues                                    |

## Residual Risk / Follow-Ups

- **Concurrency is proven on PGlite, not on a multi-connection Postgres.**
  PGlite serialises, so the test proves the SQL guard rejects the second
  claim but does not exercise genuine simultaneous transactions. The
  guarantee relied upon (a single `UPDATE ... WHERE ... RETURNING` matching
  at most one row) is standard Postgres behaviour under both `READ
COMMITTED` and higher, and the same suite runs against real Postgres in
  container mode — but a dedicated container-mode run of this spec would be
  stronger evidence. Logged as `PE-06`.
- A successful reset does **not** invalidate the user's other outstanding
  reset tokens. OWASP recommends it; it is a behaviour change beyond closing
  this race. Logged as `PE-07`.
- The same pattern should be applied to any future one-time-token flow;
  SEC-35's "Rule for Agents" states this, and names the two existing correct
  implementations to copy.
