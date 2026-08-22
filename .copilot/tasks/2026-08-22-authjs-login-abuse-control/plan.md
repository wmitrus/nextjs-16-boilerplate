# Task Plan — AuthJS Login Abuse Control (SEC-34)

## Status

**✅ REMEDIATION IMPLEMENTED.** All quality gates green. Third case in the
multi-case security-audit remediation series; commits land on the same
branch as Cases 1–2, `claude/security-audit-multi-tenant-idor-e1y3yr`.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–2** (no
`.env.leantime`/`LEANTIME_URL` available in this sandbox; see Case 1's
`plan.md` for the full diagnostic trail). Not re-diagnosed here per the
no-duplication convention in `docs/ai/general/POSSIBLE_ENHANCEMENTS.md`.

## Execution Mode

`straight-through`, single session. A genuine product/vendor decision (which
CAPTCHA provider, scope for this case, escalation thresholds) was surfaced to
the user via `AskUserQuestion` before implementation — see `intake.md`'s
Decision Record — rather than picked unilaterally, per the user's own
instruction to ask before any real decision point.

## Workflow Steps (Security Incident Workflow)

1. **Incident intake & classification** — see `intake.md`.
2. **Security/Auth review** — see `02 - Security & Auth - Summary.md`.
3. **Next.js Runtime review (conditional, ran)** — route handler + Server
   Component/client wiring touched; see `03 - Next.js Runtime - Summary.md`.
4. **Architecture Guard review (conditional, ran)** — new `shared/lib` and
   `shared/components` modules; see `01 - Architecture Guard - Summary.md`.
5. **Constraint summary** — consolidated in the Security & Auth summary.
6. **Validation Strategy** — see `05 - Validation Strategy - Summary.md`.
7. **Implementation** — see `04 - Implementation Agent - Summary.md`.
8. **Validation & close-out** — all gates green (below).

## Quality Gates (this session)

| Gate                      | Command                 | Result                                               |
| ------------------------- | ----------------------- | ---------------------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅ pass                                              |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing unrelated warnings      |
| Unit tests                | `pnpm test`             | ✅ 222 files / 1628 tests pass (+4 files, +50 tests) |
| DB integration tests      | `pnpm test:db`          | ✅ 19 files / 160 tests pass (unchanged)             |
| Circular dependency check | `pnpm skott:check:only` | ✅ no circular dependencies                          |
| Unused dependency check   | `pnpm depcheck`         | ✅ no issues                                         |
| Env consistency           | `pnpm env:check`        | ✅ in sync                                           |

**Not run in this session**: Playwright E2E, and no real Cloudflare
Turnstile account/keys were used (no such credentials available in this
session) — the implementation was validated against unit-level mocks of
the `siteverify` HTTP call, not a real Cloudflare round trip. The user must
provision real `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
(Turnstile's official always-pass test keys work for local/CI smoke
verification) and confirm the widget renders/verifies end-to-end in a real
browser before treating the CAPTCHA layer itself as production-verified —
the abuse-control logic (buckets, thresholds, lock/delay) is fully
verified independent of that.

## Residual Risk / Follow-Ups

- No dedicated demo/showcase page was added for the CAPTCHA flow.
- The dual-bucket pattern is specific to this one login endpoint; if a
  future feature adds another password-verification endpoint, it needs its
  own instance of the same pattern (the module is reusable — `normalizeLoginAccountKey`,
  `getLoginAbuseState`, `recordFailedLoginAttempt`, `recordSuccessfulLogin`
  all take an arbitrary account key, not something AuthJS-Credentials-specific).
- Real end-to-end Turnstile verification (real keys, real browser) has not
  been performed in this session — see Quality Gates note above.
