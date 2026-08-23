# Task Plan — Cross-Tenant IDOR/BOLA in Admin Users

## Status

**✅ REMEDIATION IMPLEMENTED.** All quality gates green. First case in a
multi-case security-audit remediation series requested by the user; branch
`claude/security-audit-multi-tenant-idor-e1y3yr` will be pushed for the user
to open a PR and run full CI (unit, DB, typecheck, lint, e2e).

## Leantime (mandatory protocol)

**BLOCKED — session/environment limitation, not a repository integration
defect.** Per the diagnostic rule in `AGENTS.md` / `docs/ai/general/LEANTIME_AUTOMATION.md`:

1. CLI entrypoint verified present: `package.json` → `"lt": "node
--env-file-if-exists=.env.leantime --import tsx scripts/leantime/cli.ts"`.
2. `.env.leantime` / `.env.leantime-dev` checked by exact path (not just
   default search) — **neither file exists** in this session's working tree.
3. Ran the smallest falsifying command:
   `pnpm lt -- run project.getAll --format=json` →
   `Fatal error: Error: LEANTIME_URL is required for Leantime automation scripts.`
4. This session cannot supply `LEANTIME_URL` / `LEANTIME_API_KEY` (no
   credentials available in this sandboxed environment) — recorded here as a
   session tooling limitation, not a claim that the Leantime integration
   itself is broken.

No milestone/task was created or status-patched in Leantime for this case.
If the user has real Leantime credentials available in their own
environment, task open (`W toku`) and close (`Zrobione` + `time.log`) should
be run manually or by a session with those credentials configured.

## Execution Mode

`straight-through` (single Claude Code session, sequential specialist
skill invocation per `docs/ai/general/MODE_MANIFEST.md`'s single-agent
fallback rule) — no per-step operator approval requested; the user asked to
proceed autonomously ("Jeśli jest do podjęcia jakaś decyzja... musisz mnie
zapytać" — no such decision arose; the fix followed the repo's own
established SEC-26 precedent directly).

## Workflow Steps (Security Incident Workflow)

1. **Incident intake & classification** — see `intake.md`. P1/CRITICAL,
   authorization/tenancy category.
2. **Security/Auth review** — see `02 - Security & Auth - Summary.md`.
3. **Next.js Runtime review (conditional, ran)** — route handlers touched;
   see `03 - Next.js Runtime - Summary.md`.
4. **Architecture Guard review (conditional, ran)** — new cross-module join
   reference table; see `01 - Architecture Guard - Summary.md`.
5. **Constraint summary** — consolidated in the Security & Auth summary's
   "Security Decisions / Constraints" section (single source, per workflow
   step 5 dedup guidance).
6. **Validation Strategy** — see `05 - Validation Strategy - Summary.md`.
7. **Implementation** — see `04 - Implementation Agent - Summary.md`.
8. **Validation & close-out** — all gates green (below).

## Quality Gates (this session)

| Gate                      | Command                 | Result                                          |
| ------------------------- | ----------------------- | ----------------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅ pass                                         |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing unrelated warnings |
| Unit tests                | `pnpm test`             | ✅ 218 files / 1571 tests pass                  |
| DB integration tests      | `pnpm test:db`          | ✅ 19 files / 160 tests pass                    |
| Circular dependency check | `pnpm skott:check:only` | ✅ no circular dependencies                     |
| Unused dependency check   | `pnpm depcheck`         | ✅ no issues                                    |
| Env consistency           | `pnpm env:check`        | ✅ in sync                                      |

**Not run in this session**: Playwright E2E (`e2e/admin-users.spec.ts` mocks
API responses and is unaffected by this backend-only change; no new E2E was
added — see Validation Strategy summary for the explicit reasoning). The
user's process is to open a PR after this first fix so CI can run the full
suite including E2E.

## Residual Risk / Follow-Ups

- The other 2 admin routes named in the audit's SEC-23 regression finding
  are unfixed (out of scope for this case — see `intake.md`).
- `AGENTS.md`'s "Key rules currently in effect" table stops at SEC-25; SEC-26
  through SEC-32 already exist in `docs/ai/general/SECURITY_CODING_PATTERNS.md`
  but were never propagated there. Pre-existing drift, out of this task's
  blast radius — flagged to the user, not silently fixed or left unmentioned.
- No real-browser (Playwright) cross-tenant proof was added; unit + real-DB
  integration tests close the vulnerability at the layer where it lives,
  matching the validation depth of the original SEC-26 fix. Logged as
  `PE-01` in `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` for the user to
  triage later, rather than duplicated here in full.
