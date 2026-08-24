# Case 17 (SEC-47) — Password Policy: Argon2id, Legacy Bcrypt, Rehash-on-Login

**Branch**: `claude/password-policy-audit-miz994` (phase 2, new PR)
**Date**: 2026-08-24
**Finding as reported**: "16. Password policy — bcrypt 12 jest OK, ale nowy
boilerplate może być lepszy" — signup/reset used `password: z.string().min(8)`,
`BCRYPT_COST = 12`; not a currently-critical gap, but a list of hardening
items for the boilerplate: Argon2id default, bcrypt compat-only, explicit
72-byte bcrypt limit, longer max (>=64), no archaic composition rules,
optional breached-password check, rehash-on-login.

## Cause

Every password-accepting entry point (signup, reset-password, AuthJS
`authorize()`, the E2E provisioning fixture route, `bootstrap-admin.ts`)
defined its own `z.string().min(8)` schema and called `bcryptjs` directly,
duplicated five times. bcrypt cost 12 was not itself weak (OWASP still lists
10 as an acceptable legacy-bcrypt floor), but structurally:

- no upper bound on password length (unbounded input into an intentionally
  expensive KDF on unauthenticated routes)
- bcrypt's 72-UTF-8-byte silent truncation was never surfaced anywhere
- no Unicode normalization
- no upgrade path off bcrypt without a coordinated flag day
- 8 characters is below NIST SP 800-63B-4's 15-character single-factor floor
  (this Credentials provider has no second factor)

## Decisions (user, 2026-08-24)

The user pushed back on doing this piecemeal and gave a scoped, reasoned
recommendation rather than picking from the original checkbox list verbatim:

| Question                                             | Decision                                                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Argon2id as default + bcrypt compat-only              | **Yes, now.** `@node-rs/argon2`, params pinned explicitly in code (memoryCost=19456, timeCost=2, parallelism=1, outputLen=32 — OWASP's current baseline), not left to library defaults               |
| Rehash-on-login                                       | **Yes, together with the above** — without it, "bcrypt compatibility" becomes a permanent second algorithm instead of a migration path                                                              |
| "Explicit 72-byte bcrypt limit" (as originally listed) | **Rejected in that literal form.** A blanket 72-byte cap on *all* new passwords would defeat the point of moving to Argon2id and contradicts NIST's "verify the whole password" requirement. Reformulated as: centralize password policy in one module, and give the *legacy bcrypt path specifically* explicit, narrow handling of its own 72-byte semantics (see truncation handling below) |
| Length policy                                         | **15–128 Unicode code points**, NFC-normalized, no composition rules — NIST SP 800-63B-4's single-factor minimum, not the 8-char/2-factor floor                                                      |
| Breached-password check (HIBP or local corpus)        | **Deferred.** New outbound trust boundary / vendor decision, out of scope for this PR → **PE-25**                                                                                                    |
| Legacy bcrypt hash >72 bytes on successful login       | **Do not auto-rehash.** The stored hash may accept several different passwords sharing only the first 72 bytes; rehashing the one candidate that happened to log in would narrow the account's real password down to a guess. Leave it on bcrypt, log distinctly, require an actual password reset to migrate |

## Solution

- **`src/modules/auth/infrastructure/credentials/password-policy.ts`** (new)
  — `passwordSchema` (15–128 Unicode code points via `Array.from().length`,
  not `.length`; NFC-normalized), `normalizePassword()`,
  `PASSWORD_MIN_LENGTH`/`PASSWORD_MAX_LENGTH`.
- **`src/modules/auth/infrastructure/credentials/password-hasher.ts`** (new)
  — `hashPassword()` (Argon2id, explicit params), `verifyPassword()`
  (self-describing-prefix dispatch via `Map#get()` — not `Record` + bracket
  access, which trips the repo's static object-injection guard regardless of
  key-type narrowness; SEC-01 pattern). Returns `{ valid, rehash,
  legacyBcryptTruncated }`; unrecognized format fails closed.
- **`src/app/api/auth/signup/route.ts`**,
  **`src/app/api/auth/reset-password/route.ts`**,
  **`src/app/api/internal/e2e/authjs-user/route.ts`** — schema now
  `passwordSchema`; hash creation now `hashPassword()`. `BCRYPT_COST`
  constants removed.
- **`scripts/bootstrap-admin.ts`** — replaced the hand-rolled
  `password.length < 8` check with `passwordSchema.safeParse()`; hashing via
  `hashPassword()`.
- **`src/modules/auth/infrastructure/authjs/auth.ts`** (`authorize()`) —
  `compare()` replaced with `verifyPassword()`. On a successful legacy-bcrypt
  verification: if `legacyBcryptTruncated`, log
  `auth:legacy_bcrypt_truncated_skip_rehash` and do nothing; otherwise
  best-effort `hashPassword()` + `UPDATE user_credentials` in the same
  request, never failing the login on a rehash error.
- **`e2e/authjs-auth.ts`** — fixture schema's `min(8)` raised to `min(15)` to
  match; the actual fixture password (`E2E-Password-123!`, 18 chars) already
  satisfied the new floor.

No DB migration: `user_credentials.hashed_password` is already `text`, and
both bcrypt and Argon2id hash strings are self-describing (PHC format), so no
separate algorithm/version column is needed.

## Why a `Map`, not `Record`, for the format dispatch

SEC-04 calls for "explicit `Record<AllowedKeys, fn>` dispatch maps" instead
of dynamic bracket dispatch. In practice the repo's `security/detect-object-
injection` + local `no-restricted-syntax` guard still flags `obj[key]()`
call syntax on sight, regardless of how narrow `key`'s type is. Switched to
`Map<HashFormat, fn>` + `.get()` — the SEC-01 pattern for the same reason —
which keeps the dispatch explicit and type-safe without the lint warning.

## Why raw numeric literals for Argon2 `algorithm`/`version`

`@node-rs/argon2` exposes `Algorithm`/`Version` as an ambient `declare const
enum`. This repo's `isolatedModules` TypeScript setting raises `TS2748` on
any cross-module reference to a const enum. `ARGON2ID_ALGORITHM = 2` /
`ARGON2_VERSION_0X13 = 1` are napi-rs's own public numeric API (from the
package's `index.d.ts`), not an assumption about an implementation detail.

## Falsification

Every new/changed assertion was confirmed to fail when the code it guards
was deliberately broken, then restored:

- `password-policy.test.ts` — code-point-vs-UTF-16 counting (an 8-emoji
  string is 16 UTF-16 units but only 8 code points; naive `.length` would
  wrongly accept it).
- `password-hasher.test.ts` — disabling the truncation guard, defaulting
  unrecognized formats to `'bcrypt-legacy'` instead of failing closed: both
  break the corresponding assertions.
- `auth.test.ts` — commenting out the rehash branch, the truncation branch,
  and the inner try/catch around the rehash persistence each broke exactly
  the test written for that behavior (the truncation-branch removal in
  particular required also asserting the distinct WARN log, since without
  that assertion the "skip" outcome was indistinguishable from "no rehash
  needed").

## Validation

`pnpm typecheck`, `pnpm lint --fix` (0 errors), `pnpm test` (244 files /
1931 tests, incl. the new/changed suites above), `pnpm test:db` (22 files /
179 tests, pglite — `reset-password/route.db.test.ts` untouched by this
change), `pnpm skott:check:only` (no circular deps), `pnpm depcheck` (clean),
`pnpm env:check` (no new env vars — Argon2 params are hardcoded, not
env-driven).

## Not done here (deferred)

- **PE-25** — breached/common-password blocklist check (HIBP k-anonymity or
  a local corpus). New outbound trust boundary / vendor decision.

## Documentation updated

- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — SEC-47 entry (also backfilled
  missing SEC-45/SEC-46 index-table rows, a gap from phase 1).
- `docs/features/32 - AuthJS Custom Auth Provider.md` — "Password Policy &
  Hashing (SEC-47)" section; the "Password hashing: bcrypt" bullet updated.
- `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` — PE-25.
- `CLAUDE.md` — PE count pointer updated (was stale at PE-21 from before
  phase 1's PE-22–24 were added).
