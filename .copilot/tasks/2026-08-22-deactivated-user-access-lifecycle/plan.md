# Task Plan — Deactivated Users Retain Access (SEC-33)

## Status

**✅ REMEDIATION IMPLEMENTED.** All quality gates green. Second case in the
multi-case security-audit remediation series requested by the user; commits
land on the same branch as Case 1,
`claude/security-audit-multi-tenant-idor-e1y3yr`.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Case 1** (see that
case's `plan.md` for the full diagnostic trail: CLI entrypoint verified
present, `.env.leantime`/`.env.leantime-dev` confirmed absent by exact path,
`pnpm lt -- run project.getAll --format=json` fails with `LEANTIME_URL is
required`). Not re-run for this case since nothing about the environment
changed; recorded here rather than duplicated in full per
`docs/ai/general/POSSIBLE_ENHANCEMENTS.md`'s no-duplication convention.

## Execution Mode

`straight-through`, single session, per `docs/ai/general/MODE_MANIFEST.md`'s
single-agent fallback rule.

## Workflow Steps (Security Incident Workflow)

1. **Incident intake & classification** — see `intake.md`. P1, authorization/
   lifecycle category.
2. **Security/Auth review** — see `02 - Security & Auth - Summary.md`.
3. **Next.js Runtime review (conditional, ran)** — route handlers and Server
   Actions touched; see `03 - Next.js Runtime - Summary.md`.
4. **Architecture Guard review (conditional, skipped)** — no module
   boundary, dependency-direction, or DI/composition changes: both fixed
   functions already live in `src/security/core/` and gained only new
   branches on data (`user.deactivatedAt`) they already had in scope; no new
   imports across module boundaries. Consistent with the workflow's own
   branching rule ("skip irrelevant specialist reviews" when the fix is
   clearly local and doesn't affect runtime or structure beyond what
   Security/Auth and Runtime already cover).
5. **Constraint summary** — consolidated in the Security & Auth summary.
6. **Validation Strategy** — see `05 - Validation Strategy - Summary.md`.
7. **Implementation** — see `04 - Implementation Agent - Summary.md`.
8. **Validation & close-out** — all gates green (below).

## Quality Gates (this session)

| Gate                      | Command                 | Result                                          |
| ------------------------- | ----------------------- | ----------------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅ pass                                         |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing unrelated warnings |
| Unit tests                | `pnpm test`             | ✅ 218 files / 1578 tests pass (+7 new)         |
| DB integration tests      | `pnpm test:db`          | ✅ 19 files / 160 tests pass (unchanged)        |
| Circular dependency check | `pnpm skott:check:only` | ✅ no circular dependencies                     |
| Unused dependency check   | `pnpm depcheck`         | ✅ no issues                                    |
| Env consistency           | `pnpm env:check`        | ✅ in sync                                      |

**Not run in this session**: Playwright E2E. Logged as `PE-04` in
`docs/ai/general/POSSIBLE_ENHANCEMENTS.md` — see the Validation Strategy
summary for the reasoning.

## Residual Risk / Follow-Ups

All logged in `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` rather than
duplicated here in full:

- `PE-02` — IdP-side session revocation (Clerk API, AuthJS equivalent) +
  dedicated revocation-outcome audit event.
- `PE-03` — edge-level proxy gate (`with-auth.ts`) fail-fast consistency
  polish (not a security requirement).
- `PE-04` — real-browser Playwright proof of the full "login → deactivate →
  same cookie → deny" scenario across a page, an API route, and a Server
  Action.
