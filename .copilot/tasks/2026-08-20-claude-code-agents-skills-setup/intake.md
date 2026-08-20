# Intake — Claude Code Agents & Skills Setup

## Title

Give Claude Code its own native runtime surface in the repo's multi-tool AI
governance system.

## Objective

Bring Claude Code to parity with the other tools already onboarded into this
repository's agent infrastructure (Zencoder, GitHub Copilot, Codex, ZenFlow)
by porting the existing 9 specialist roles and 10 workflow shapes into
Claude Code's native `Skill` mechanism, adding the human-facing guide layer,
and registering Claude Code in the repo's propagation tables — without
redesigning the roles, workflows, or authority model that already exist.

## Problem Statement

`CLAUDE.md` (updated in the prior session, see
`claude/claude-md-setup-docs-bcgg96`) bridges Claude Code to `AGENTS.md` and
tells Claude to `Read` the relevant `docs/ai/general/*.md` file by hand for
each specialist role or workflow. That works, but it's the manual fallback,
not real parity:

- Every other tool has a native, directly invocable runtime surface for
  these roles (`.github/agents/*.agent.md` for Copilot,
  `.agents/skills/*/SKILL.md` for Codex, `.zenflow/workflows/*.md` for
  ZenFlow). Claude Code has none — no `.claude/` directory exists.
- Claude Code's own `Skill` tool uses the same `SKILL.md` frontmatter +
  markdown format Codex already uses under `.agents/skills/`, so the port is
  close to mechanical, not new authoring.
- `AGENTS.md`'s "Agent Infrastructure — Where to Propagate Rules" table and
  the matching table in `docs/ai/general/REPOSITORY_AI_CONTEXT.md` have no
  Claude Code column, so future rule changes can silently skip Claude.
- There is no `docs/ai/claude/` human-facing guide layer, unlike
  `docs/ai/codex/`, `docs/ai/copilot/`, `docs/ai/zencoder/`.

## Scope

- Port the 9 specialist-role skills and 10 workflow skills already defined
  under `.agents/skills/*/SKILL.md` (Codex) into `.claude/skills/*/SKILL.md`,
  adapted only where the tool name/paths differ (e.g. "Codex-native
  counterpart" → "Claude-native counterpart", updated Compatibility Notes).
- Add `docs/ai/claude/` as a human-facing guide layer mirroring
  `docs/ai/codex/README.md` and its per-role/workflow guide files.
- Add a Claude Code column/row to:
  - `AGENTS.md` → "Agent Infrastructure — Where to Propagate Rules" and
    "Agent Numbering and File Correspondence"
  - `docs/ai/general/REPOSITORY_AI_CONTEXT.md` → the matching tables
- Update `CLAUDE.md`'s "Setting Up Claude Code" / propagation section once
  the surface exists, so it stops saying "not yet built."

## Out Of Scope

- Redesigning any specialist role, workflow, severity model, or output
  contract. Content is ported, not reinvented.
- Building `.claude/agents/*.md` subagents (isolated-context, spawned via
  the `Agent` tool). Claude's `Skill` mechanism (loaded into the current
  context, closer to how Codex actually operates) is the direct analog to
  what already exists; whether isolated-context subagents add value on top
  is a follow-up decision, not part of this task (see Open Questions).
- ~~Adding Leantime Integration (10) or Leantime Strategy (11) as a Claude
  skill. Neither has a Codex skill counterpart today either~~ — **corrected
  during Phase 3**: `.agents/skills/leantime-integration/SKILL.md` does
  exist (it's simply missing from `.agents/README.md`'s own inventory,
  which is docs-vs-code drift in that file, not this task's doing). Leantime
  Integration (10) was therefore ported in-scope after all, consistent with
  this task's own inclusion rule ("port what already exists for Codex"). See
  `plan.md`'s "Docs vs Code Drift Found" section. Leantime Strategy (11)
  genuinely has no Codex skill and remains out of scope.
- Adding a Claude entry point for Workflow 09 (Architecture Lint). It has no
  Codex skill and no Copilot prompt today; carrying that same gap forward is
  consistent with "port what exists," not "fix pre-existing gaps in other
  tools' coverage."
- Any product/application code change. This task only touches AI-governance
  documentation and configuration.

## Requirements

1. One `.claude/skills/<name>/SKILL.md` per existing `.agents/skills/<name>/SKILL.md`
   (20 total — see the Phase 3 drift correction above), each declaring
   `name` + `description` frontmatter so Claude's
   `Skill` tool can select it, and each pointing back at the shared
   `docs/ai/general/` source as the authoritative content.
2. Each ported skill's "Compatibility Notes" section lists all locations to
   keep in sync going forward, adding `.claude/skills/<name>/SKILL.md` next
   to the existing Codex/Copilot/ZenFlow entries.
3. `docs/ai/claude/README.md` quick-start guide, plus one guide file per
   role/workflow, mirroring `docs/ai/codex/README.md`'s structure and
   "Recommended Starting Points" section.
4. `AGENTS.md` and `docs/ai/general/REPOSITORY_AI_CONTEXT.md` propagation
   tables gain a Claude Code column/row consistent with the existing
   Zencoder/Copilot/Codex/ZenFlow entries.
5. No change to `docs/ai/general/*.md` shared sources' actual guidance
   content — only the propagation/compatibility bookkeeping sections that
   already enumerate "when this role changes, update ..." locations.

## Scenarios / Use Cases

- S1: A developer asks Claude Code to review a change for module-boundary
  correctness → the `architecture-guard` skill is available natively
  instead of requiring a manual `Read` of `docs/ai/general/01 - ...md`.
- S2: A developer asks Claude Code to run a safe feature workflow →
  `safe-feature-workflow` skill is available and follows the same shape as
  Codex's.
- S3: A future contributor changes the Security & Auth role's forbidden-
  pattern list → the propagation table now correctly lists
  `.claude/skills/security-auth/SKILL.md` as a location to update, and they
  don't miss Claude Code by omission.
- S4: A human wants a one-page orientation to "which Claude skill do I use
  for X" → `docs/ai/claude/README.md` answers it, same as the Codex guide
  does today.

## Acceptance Criteria

- [ ] 20 `.claude/skills/*/SKILL.md` files exist, one per existing Codex
      skill, each valid per Claude Code's `SKILL.md` frontmatter contract.
- [ ] `docs/ai/claude/README.md` exists and lists every ported skill with a
      one-line "use when" description and a link to its shared source.
- [ ] `AGENTS.md`'s two propagation tables include Claude Code.
- [ ] `docs/ai/general/REPOSITORY_AI_CONTEXT.md`'s two propagation tables
      include Claude Code.
- [ ] `CLAUDE.md` no longer says the Claude-native surface "does not exist
      yet"; it points at `.claude/skills/` and `docs/ai/claude/` instead.
- [ ] Every ported skill's Compatibility Notes section names
      `.claude/skills/<name>/SKILL.md` as a propagation location.
- [ ] `pnpm lint --fix` / `pnpm typecheck` are not required for a docs-only
      change, but run `pnpm env:check` only if any script assumes a fixed
      directory listing (not expected) — otherwise no code quality gates
      apply to this task.

## Verification Sources

- `AGENTS.md` (root) — "Agent Infrastructure — Where to Propagate Rules",
  "Agent Numbering and File Correspondence".
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md` — matching tables.
- `.agents/skills/*/SKILL.md` (Codex) — direct porting source.
- `.agents/README.md` — Codex skill inventory and compatibility notes
  pattern to mirror.
- `docs/ai/codex/README.md` — guide-layer structure to mirror for
  `docs/ai/claude/README.md`.
- `docs/ai/general/COPILOT_TASK_ARTIFACTS.md` — task-workspace convention
  used for this intake/plan pair.

## Affected Areas

- New: `.claude/skills/**` (19 directories)
- New: `docs/ai/claude/**`
- Edit: `AGENTS.md` (propagation tables only)
- Edit: `docs/ai/general/REPOSITORY_AI_CONTEXT.md` (propagation tables only)
- Edit: `CLAUDE.md` ("Agent Infrastructure — Propagation" section)
- Edit: each ported skill's own "Compatibility Notes" section, and — where
  they list "propagate updates to" locations — the existing
  `docs/ai/codex/README.md`, `docs/ai/copilot/*.md`, `docs/ai/zencoder/*.md`
  guides that already enumerate the cross-tool file set, so they gain the
  new Claude path too.

## Constraints

- Do not alter the substance of any specialist role or workflow — Claude's
  version must say the same thing Codex's does, adapted only for tool name
  and file paths.
- Preserve the existing authority model and severity taxonomies verbatim.
- Keep `AGENTS.md` as the single authoritative always-applied context;
  `.claude/skills/` remains a native runtime surface for it, not a
  competing source of truth (same relationship Codex's skills already have).
- Low blast radius: this is a docs/config-only task. No `src/`, `e2e/`, or
  `scripts/` changes are in scope.

## Execution Control

`straight-through` — one session may create all 19 skill ports, the guide
layer, and the table updates without stopping for manual handoff, since each
step is mechanical porting against an existing, already-approved source.

## Environment / Preconditions

- Work happens on branch `claude/claude-code-agents-skills-plan`, branched
  from `claude/claude-md-setup-docs-bcgg96` (which already carries the
  updated `CLAUDE.md` bridge this task builds on).
- No Leantime task-open/close is required for this planning-only intake and
  task-list pair; Leantime open/close applies once implementation begins
  (see `plan.md`).

## Evidence Expectations

- The 19 ported `SKILL.md` files, diffable against their Codex source to
  confirm only tool-name/path adaptation occurred.
- The updated propagation tables in `AGENTS.md` and
  `docs/ai/general/REPOSITORY_AI_CONTEXT.md`, diffable to confirm only a
  Claude Code column/row was added.
- `docs/ai/claude/README.md` reviewed against `docs/ai/codex/README.md` for
  structural parity.

## Open Questions

- Should Claude Code also get `.claude/agents/*.md` subagents (isolated
  context, spawned via the `Agent` tool) as a Phase 2, mirroring
  `.github/agents/`? Deferred — recommend deciding after the skill port is
  reviewed and in use, since it's an additive enhancement, not required for
  baseline parity.
- Should this task also fill Codex's own gaps (no skill for Leantime
  Integration/Strategy, no skill for Architecture Lint) while porting? Out
  of scope here — flagged but not fixed, to keep this task's blast radius to
  "give Claude what already exists elsewhere."
