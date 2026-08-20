# Claude Code — Repository Entry Point

> **This file is a bridge, not the source of truth.**
>
> `AGENTS.md` (repository root) is the single authoritative, always-applied
> context for **all** AI agents working in this repository — Zencoder, GitHub
> Copilot, Codex, ZenFlow, and Claude Code alike. Claude Code does not
> auto-load `AGENTS.md`, so this file exists to point at it and to carry the
> Claude-tool-specific operating notes that don't belong in a tool-neutral
> file.
>
> **Read `AGENTS.md` in full before any non-trivial task.** If anything below
> ever conflicts with `AGENTS.md`, `AGENTS.md` wins — treat the conflict as
> drift in this file and fix this file, not the other way around.

---

## Required Reading Sequence

For any non-trivial task, in order:

1. `AGENTS.md` — primary always-applied context.
2. `docs/ai/general/00 - Agent Interaction Protocol.md`.
3. `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
4. `docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md` — for feature, fix,
   refactor, script, or tooling work.
5. The relevant specialist prompt or workflow file for the task (see below).
6. `docs/ai/general/SECURITY_CODING_PATTERNS.md` — whenever the task touches
   redirects, logging, file access, auth, route handlers, scripts, or any
   security-sensitive path.

For middleware-style behavior, request interception lives in `src/proxy.ts`,
**not** `middleware.ts` — inspect it directly, its absence is not a finding.

## Specialist Roles and Workflows — Read, Don't Assume

This repository defines 11 specialist reviewer/implementer roles and 11
workflow shapes, each with a tool-neutral source under `docs/ai/general/` and
a native runtime surface per tool (Zencoder prompt, GitHub Copilot
`.agent.md`, Codex `SKILL.md`, ZenFlow workflow spec). **Claude Code
currently has no dedicated `.claude/agents/` or `.claude/skills/` runtime
surface for these roles** — that infrastructure has not been built yet (see
"Setting Up Claude Code" below).

Until it exists, when a task matches one of these shapes, use the `Read`
tool to load the matching `docs/ai/general/` file directly and adopt that
persona/checklist for the task, the same way Codex falls back to reading a
skill file as instructions when no bound subagent identity exists:

| # | Role | Source | Use when |
| - | --- | --- | --- |
| 01 | Architecture Guard | `docs/ai/general/01 - Architecture Guard Agent.md` | modular-monolith boundaries, DI/composition, dependency direction, docs-vs-code drift |
| 02 | Security & Auth | `docs/ai/general/02 - Security & Auth Agent.md` | auth, tenancy, trust boundaries, sensitive data |
| 03 | Next.js Runtime | `docs/ai/general/03 - Next.js Runtime Agent.md` | App Router, route handlers, proxy, server actions, caching |
| 04 | Implementation | `docs/ai/general/04 - Implementation Agents.md` | concrete code changes under already-established constraints |
| 05 | Validation Strategy | `docs/ai/general/05 - Validation Strategy Agent.md` | deciding minimum safe validation scope |
| 06 | Debug Investigation | `docs/ai/general/06 - Debug Investigation Agent.md` | ambiguous bugs, evidence gathering before remediation |
| 07 | Playwright E2E | `docs/ai/general/07 - Playwright E2E Agent.md` | real-browser verification, scenario-mapped E2E evidence |
| 08 | Workflow Orchestrator | `docs/ai/general/08 - Workflow Orchestrator Agent.md` | multi-step sequencing/delegation with an existing brief |
| 09 | Task Brief Authoring | `docs/ai/general/09 - Task Brief Authoring.md` | messy requirements needing scope/acceptance criteria first |
| 10 | Leantime Integration | `docs/ai/general/10 - Leantime Integration Agent.md` | task lifecycle open/close (mandatory, see below) |
| 11 | Leantime Strategy | `docs/ai/general/11 - Leantime Strategy Agent.md` | project structure for large multi-phase tasks |

Workflow shapes (`docs/ai/general/Workflow NN - *.md`): Safe Feature (01),
Safe Refactor (02), Security Incident (03), Incident Investigation (04),
Auth Flow Change Review (05), Playwright E2E Validation (06), Change
Validation (07), Repository Baseline Validation (08), Architecture Lint
(09), Codacy Security Review (10), Codacy Findings Review (11).

Use `Workflow 01 - Safe Feature` as the default for non-trivial feature work
(cross-file behavior changes, anything touching boundaries/auth/runtime/
caching/tests) — skip it for a genuinely small, one-or-two-file, no-security-
impact change.

## Leantime — Mandatory Agent Protocol

Every non-trivial task **must** include Leantime steps at task open and task
close. Governing reference: `docs/ai/general/LEANTIME_AUTOMATION.md`.

- **Open**: check existing milestones/tasks (no duplicates), create/locate
  milestone, create main task, patch status to `W toku` (4), record the task
  ID in `intake.md`/`plan.md` if the work is artifact-backed.
- **Close**: patch status to `Zrobione` (0), log time via
  `pnpm lt -- run time.log`, update the wiki article if implementation notes
  should persist.
- CLI entrypoint: `pnpm lt -- run <operation-id> --input '{"...": "..."}' --format=json`.
- Before claiming Leantime is blocked: verify the CLI entrypoint in
  `package.json`, verify `.env.leantime`/`.env.leantime-dev` by exact path
  (gitignored files are omitted from default search — absence from search
  results is not evidence of a missing file), verify `LEANTIME_URL` and
  `LEANTIME_API_KEY`, and run the smallest falsifying command available. If
  this session cannot execute commands, say so as a session limitation —
  don't report the integration itself as broken.

## Source of Truth

Repository code is authoritative. Docs, prompts, ADRs, reports, and
summaries are supporting evidence and may drift. If documentation and code
disagree: trust the code, report the drift explicitly, and never silently
reconcile or present a doc claim as fact until it's verified in code.

---

## Testing Conventions

- **Co-location**: all unit tests MUST live next to their source file
  (`src/core/env.ts` → `src/core/env.test.ts`,
  `scripts/setup-env.mjs` → `scripts/setup-env.test.ts`).
- **Naming**: `.test.ts` / `.test.tsx` suffix.
- **Root `tests/` directory**: global setup, polyfills, and shared test
  utilities only — never a home for feature tests.
- DB adapter tests: `*.db.test.ts` is required for DB-adapter code.
- External HTTP adapters: mock with MSW.
- Playwright specs live in `e2e/**/*.spec.ts`; see
  `docs/usage/05 - Playwright E2E Architecture.md` and the Clerk E2E fixture
  contract in `AGENTS.md`.

## Environment Management

- Use `src/core/env.ts` (T3-Env) for **all** environment variable access —
  never read `process.env` directly outside that schema.
- Always update `.env.example` when adding/changing schema variables.
- Run `pnpm env:check` to verify consistency.

## Build & Quality Gates

| Gate | Command |
| --- | --- |
| Type check | `pnpm typecheck` |
| Lint (with fix) | `pnpm lint --fix` |
| Unit tests | `pnpm test` |
| Circular dependency check | `pnpm skott:check:only` |
| Unused dependency check | `pnpm depcheck` |
| Env consistency | `pnpm env:check` |

- **Always** run `pnpm lint --fix`, never plain `pnpm lint` — it auto-fixes
  import ordering/formatting; the non-fix form only reports fixable errors
  and wastes effort. Report any errors that remain after `--fix`.
- **Known blocker (effective 2026-08-14, still in force at last check):**
  `pnpm lint --fix` has been hanging in the agent shell. Until this is
  explicitly lifted, do not run `pnpm lint`, `pnpm lint --fix`, ESLint
  directly, or any script that invokes ESLint — run the other gates and
  report lint as skipped due to this blocker. Re-verify this note against
  `docs/ai/general/REPOSITORY_AI_CONTEXT.md` before trusting it long-term, in
  case the blocker has since been cleared there.
- **Phase-close rule**: use narrower validation mid-phase; run repo-wide
  `pnpm lint --fix` + `pnpm typecheck` before declaring a substantial phase
  complete — not after every small edit.
- Pre-push hook enforces (in order): typecheck → skott → depcheck → madge →
  env consistency.

---

## Agent Infrastructure — Propagation

`AGENTS.md` maintains the authoritative table of every location agent rules
must be propagated to (`docs/ai/general/REPOSITORY_AI_CONTEXT.md` has the
full copy). **Claude Code is not yet a row in that table.** Until Claude Code
gets its own runtime surface (`.claude/agents/`, `.claude/skills/`) and a
`docs/ai/claude/` guide layer, this file is the only Claude-specific
location — so a rule change that would normally fan out to
`.github/agents/*.agent.md`, `.agents/skills/*/SKILL.md`, and
`.zenflow/workflows/*.md` also needs a check against this file.

When the Claude-native surfaces described above are eventually created,
update this section and add Claude Code as a column to the propagation
tables in `AGENTS.md` and `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
