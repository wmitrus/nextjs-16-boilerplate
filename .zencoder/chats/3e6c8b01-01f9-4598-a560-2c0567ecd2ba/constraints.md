# Constraints Summary — Leantime AI Agent Integration Redesign

**Task**: Leantime AI Agent Integration Redesign  
**Date**: 2026-04-07  
**Based on**: Architecture Review (Step 2); Security Review: Skipped; Runtime Review: Skipped

---

## Task

Redesign the Leantime automation layer as a mandatory first-class concern in
every AI agent workflow: new `10 - Leantime Integration Agent`, unified governing
document, `retrospectives.*` CLI alias, production seeding, HTML description
template, and full propagation to all three agent extension systems.

---

## Scope

- New `10 - Leantime Integration Agent` definition in all three extension systems.
- Updated `LEANTIME_AUTOMATION.md` as the single governing flow doc.
- New `docs/ai/general/10 - Leantime Integration Agent.md` prompt file.
- `retrospectives.*` CLI alias in `scripts/leantime/catalog.ts`.
- Leantime step additions to all workflow files (`.zenflow/`, `.github/prompts/`, `.agents/skills/`).
- `AGENTS.md` update (agent table, Leantime reference section).
- HTML description template/helper for task authoring.
- Time tracking policy.
- Production board seeding.
- Deferred canvas families task update in Leantime.
- Secondary area documentation (file upload, project assignment, delete flows).

---

## Out of Scope

- Implementing hidden canvas families (`lbm`, `dbm`, `cp`, `sm`, `sq`, `em`).
- Changes to `src/` application code.
- Changes to auth, security, or runtime layers.
- Browser-session fallback automation.
- New Relic, Sentry, or Clerk integration changes.

---

## Architecture Constraints

1. **Do not import Leantime concerns into `src/`** — Leantime is a `scripts/` concern only.
2. **`retrospectives.*` must delegate to `blueprints.*`** with `boardType=retros` injected — no duplicate canvas logic.
3. **`LEANTIME_AUTOMATION.md` must remain the single governing agent reference** — do not scatter guidance across multiple docs.
4. **`10 - Leantime Integration Agent.md`** must follow the format of existing agent prompt files (`docs/ai/general/0x - *.md`).
5. **All three extension systems must be updated together** — never update only one (`docs/ai/general/`, `.github/agents/`, `.agents/skills/`).
6. **`AGENTS.md` must be updated first** — agent extensions reference it.
7. **Time logging must use `pnpm lt -- run time.log`** — not `pnpm lt:rpc`.
8. **Existing-task check**: The Leantime agent must always run `tasks.list` before creating new tasks to prevent duplicates.
9. **ZenFlow workflow files** must also be updated: every `.zenflow/workflows/*.md` should include Leantime Open and Close steps.

---

## Security/Auth Constraints

- No auth surface changes in this task.
- Leantime credentials remain in `.env.leantime` and `.env.leantime-dev`.
- Do not include real credential values in any markdown artifact (replace with `[REDACTED]`).
- Leantime API key and URL are already correctly scoped; do not move them.

---

## Runtime Constraints

- No Next.js application runtime changes.
- No App Router, route handler, server action, or proxy changes.
- CLI scripts in `scripts/leantime/` run in Node.js script context, not Next.js runtime.

---

## Validation Constraints

- **Minimum required**: `pnpm lt -- run retrospectives.board.create` smoke test against local Podman stack.
- **Minimum required**: `pnpm typecheck` and `pnpm lint --fix` after any TS changes in `scripts/leantime/`.
- **Minimum required**: Verify at least one production Blueprint board and one Retrospective board created successfully.
- **Optional**: Unit tests for the new `retrospectives.*` catalog entries (following existing `catalog.test.ts` pattern).

---

## Explicitly Allowed Changes

- Create `docs/ai/general/10 - Leantime Integration Agent.md`.
- Update `docs/ai/general/LEANTIME_AUTOMATION.md` with governing flow content.
- Update `AGENTS.md` to add agent 10 and Leantime flow doc reference.
- Add `retrospectives.*` operations to `scripts/leantime/catalog.ts`.
- Add `leantime-integration` agent to `.github/agents/`, `.agents/skills/`, `.zenflow/`.
- Update all existing agent/workflow/skill files to add Leantime step references.
- Add HTML description template to `docs/ai/templates/` or as a section in the governing doc.
- Seed production boards via `pnpm lt` commands.
- Update Leantime tracking tasks via `pnpm lt`.

---

## Explicitly Forbidden Changes

- Do not modify `src/` application code.
- Do not modify test files in `tests/`, `e2e/`, or `src/**/*.test.*`.
- Do not add real credentials to any markdown file.
- Do not introduce a new `LEANTIME_AGENT_FLOW.md` — update existing `LEANTIME_AUTOMATION.md`.
- Do not duplicate `retrospectives.*` canvas logic — delegate to `blueprints.*`.
- Do not implement hidden canvas families (`lbm`, `dbm`, `cp`, `sm`, `sq`, `em`).
- Do not use `pnpm lt:rpc` for time logging — use `pnpm lt -- run time.log`.

---

## Protected Invariants

- The `pnpm lt` CLI interface and existing operations must remain backward-compatible.
- Existing agent prompt formats must not be structurally broken by additions.
- `LEANTIME_AUTOMATION.md` must remain usable as a standalone reference.
- Existing `blueprints.*` operations must not change behavior.
- The `boardType=retros` delegation must not be lost if `retrospectives.*` is added.

---

## Open Questions / Blocks

- OQ-1 (LOW): Should the HTML description template be in `docs/ai/templates/` or
  as a section in `LEANTIME_AUTOMATION.md`? **Decision: add as a section in
  `LEANTIME_AUTOMATION.md` for discoverability, plus a standalone template file.**
- OQ-2 (LOW): Should time logging happen at every workflow handoff or only at
  final task closure? **Decision: only at final task closure** (Architecture Review).
- OQ-3 (LOW): Should `retrospectives.*` expose all `blueprints.*` operations or
  a curated subset? **Decision: curated subset matching the Retrospectives box
  model** (`well`, `notwell`, `startdoing`), not the full generic canvas surface.
