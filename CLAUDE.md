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
7. `docs/ai/general/NEXTJS_IMPLEMENTATION_PLAYBOOK.md` — when building a new
   API route, page/route segment, or test; it's the concrete "how", cross-
   linked to the `SEC-XX` entries and anti-patterns above rather than
   duplicating them.

For middleware-style behavior, request interception lives in `src/proxy.ts`,
**not** `middleware.ts` — inspect it directly, its absence is not a finding.

## Specialist Skills and Workflows — Use `.claude/skills/`

This repository defines 11 specialist reviewer/implementer roles and 11
workflow shapes, each with a tool-neutral source under `docs/ai/general/` and
a native runtime surface per tool (Zencoder prompt, GitHub Copilot
`.agent.md`, Codex `SKILL.md`, ZenFlow workflow spec, **and now Claude Code
`SKILL.md`**). `.claude/skills/` carries the Claude-native runtime surface
for every role and workflow that has one — invoke the matching skill via the
`Skill` tool rather than reading `docs/ai/general/` by hand. Guide layer:
`docs/ai/claude/README.md`.

| #   | Role                  | Claude Skill                                      | Use when                                                                                                                      |
| --- | --------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 01  | Architecture Guard    | `.claude/skills/architecture-guard/SKILL.md`      | modular-monolith boundaries, DI/composition, dependency direction, docs-vs-code drift                                         |
| 02  | Security & Auth       | `.claude/skills/security-auth/SKILL.md`           | auth, tenancy, trust boundaries, sensitive data                                                                               |
| 03  | Next.js Runtime       | `.claude/skills/nextjs-runtime/SKILL.md`          | App Router, route handlers, proxy, server actions, caching                                                                    |
| 04  | Implementation        | `.claude/skills/implementation-agent/SKILL.md`    | concrete code changes under already-established constraints                                                                   |
| 05  | Validation Strategy   | `.claude/skills/validation-strategy/SKILL.md`     | deciding minimum safe validation scope                                                                                        |
| 06  | Debug Investigation   | `.claude/skills/debug-investigation/SKILL.md`     | ambiguous bugs, evidence gathering before remediation                                                                         |
| 07  | Playwright E2E        | `.claude/skills/playwright-e2e/SKILL.md`          | real-browser verification, scenario-mapped E2E evidence                                                                       |
| 08  | Workflow Orchestrator | `.claude/skills/workflow-orchestrator/SKILL.md`   | multi-step sequencing/delegation with an existing brief                                                                       |
| 09  | Task Brief Authoring  | `.claude/skills/task-brief-authoring/SKILL.md`    | messy requirements needing scope/acceptance criteria first                                                                    |
| 10  | Leantime Integration  | `.claude/skills/leantime-integration/SKILL.md`    | task lifecycle open/close (mandatory, see below)                                                                              |
| 11  | Leantime Strategy     | `docs/ai/general/11 - Leantime Strategy Agent.md` | project structure for large multi-phase tasks — **no Claude (or Codex) skill exists for this role**; read the source directly |

Workflow skills (`.claude/skills/<name>-workflow/SKILL.md`, neutral source
`docs/ai/general/Workflow NN - *.md`): Safe Feature (01), Safe Refactor (02),
Security Incident (03), Incident Investigation (04), Auth Flow Change Review
(05), Playwright E2E Validation (06), Change Validation (07), Repository
Baseline Validation (08), Codacy Security Review (10), Codacy Findings
Review (11). **Architecture Lint (09) has no Claude skill** — matches Codex,
which has none either (`.zenflow/workflows/architecture-lint.md` and the
`docs/ai/general/` source are the only surfaces today); read the source
directly if this workflow shape ever comes up.

Use `Workflow 01 - Safe Feature` as the default for non-trivial feature work
(cross-file behavior changes, anything touching boundaries/auth/runtime/
caching/tests) — skip it for a genuinely small, one-or-two-file, no-security-
impact change.

Claude Code does not yet have dedicated `.claude/agents/*.md` subagent
identities for these roles (a real, more capable delegation mechanism than
Skills, via the `Agent` tool) — that's a deliberately deferred follow-up, not
part of the current skill layer. Until it exists, treat multi-role work as
sequential single-session skill invocation, the same fallback Codex uses.
Detail: `docs/ai/claude/08 - Workflow Orchestrator Agent.md`.

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

## Pending Scheduled Security Follow-Ups — Check Every Session

**Any Claude Code session working in this repository on or after
2026-08-26 must read `AGENTS.md`'s "Pending Scheduled Security
Follow-Ups" section before finishing a security-adjacent task** — Next.js
has announced a Critical security release targeted for that date, and
this repo's current `next@16.3.2` is NOT confirmed to already contain the
embargoed fix (its public release notes as of 2026-08-22 describe only
unrelated changes). `AGENTS.md` carries the full check/upgrade/verify
procedure; this file does not duplicate it per this repo's own
bridge-file convention (see top of this file). Delete this pointer only
once that section is deleted from `AGENTS.md` (i.e. once the follow-up is
actually completed or confirmed not applicable).

---

## Possible Enhancements Backlog — Living File, Check Every Task

`docs/ai/general/POSSIBLE_ENHANCEMENTS.md` **exists, is tracked, and is
actively maintained** — currently `PE-01` … `PE-25`. Most are untriaged;
`PE-24` is accepted (deferred to its own small PR), the rest await the
user's review. It is the single holding pen for valuable-but-deferred
ideas.

This pointer exists because `AGENTS.md` (which carries the authoritative rule,
under "Possible Enhancements Backlog — Check Every Task") is **not**
auto-loaded by Claude Code, while this file is. A session that starts fresh
must not have to rediscover the backlog.

Every task obligation, in short:

- Surfaced a worthwhile idea outside the current task's scope? Add one entry
  there with the next sequential `PE-XX` ID, and reference it by ID from the
  task artifact — never write the rationale twice.
- Never implement an entry on your own initiative. Untriaged is not "go".
- When the user triages one, update its `Status` with a resolution note and
  keep the entry — the backlog doubles as a decision log.

Full rules and entry format live in the file itself.

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

| Gate                      | Command                 |
| ------------------------- | ----------------------- |
| Type check                | `pnpm typecheck`        |
| Lint (with fix)           | `pnpm lint --fix`       |
| Unit tests                | `pnpm test`             |
| Circular dependency check | `pnpm skott:check:only` |
| Unused dependency check   | `pnpm depcheck`         |
| Env consistency           | `pnpm env:check`        |

- **Always** run `pnpm lint --fix`, never plain `pnpm lint` — it auto-fixes
  import ordering/formatting; the non-fix form only reports fixable errors
  and wastes effort. Report any errors that remain after `--fix`.
- **Known blocker — Codex-specific, does not apply to Claude Code (narrowed 2026-08-20):**
  `pnpm lint --fix` was reported hanging in "the agent shell" (effective
  2026-08-14). Confirmed 2026-08-20: this is Codex-specific — it does not
  reproduce in Claude Code's shell (`pnpm lint --fix` runs to completion
  normally, correct exit code). **Claude Code sessions must run
  `pnpm lint --fix` as a normal quality gate, not skip it.** If a future
  Claude Code run does hit a genuine hang, treat that as new evidence
  (report it, don't just silently skip) rather than assuming this note
  still applies. Full detail: `AGENTS.md` and
  `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
- **Phase-close rule**: use narrower validation mid-phase; run repo-wide
  `pnpm lint --fix` + `pnpm typecheck` before declaring a substantial phase
  complete — not after every small edit.
- Pre-push hook enforces (in order): typecheck → skott → depcheck → madge →
  env consistency.

---

## Agent Infrastructure — Propagation

`AGENTS.md` maintains the authoritative table of every location agent rules
must be propagated to (`docs/ai/general/REPOSITORY_AI_CONTEXT.md` has the
full copy). **Claude Code is now a column in both tables**
("Agent Numbering and File Correspondence" and "Workflow Entry Point
Correspondence"), alongside `.claude/skills/*/SKILL.md` and `CLAUDE.md`
itself as propagation locations in the main location-map table.

When a role or workflow changes, propagate updates to `.claude/skills/<name>/SKILL.md`
and its matching `docs/ai/claude/` guide file, same as every other tool
surface — each ported skill's own "Compatibility Notes" section names the
exact locations for that role. `.claude/agents/*.md` subagent identities do
not exist yet (see above) — there is nothing to propagate to there until
that follow-up phase happens.

Full build history and rationale:
`.copilot/tasks/2026-08-20-claude-code-agents-skills-setup/`.
