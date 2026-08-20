# Task Plan — Claude Code Agents & Skills Setup

## Status

**PLANNED — AWAITING REVIEW.** No implementation has started. This file and
`intake.md` are the only artifacts produced so far.

## Objective

Port the repository's existing specialist-role and workflow catalogue into a
native Claude Code runtime surface (`.claude/skills/`), add the matching
human-facing guide layer (`docs/ai/claude/`), and register Claude Code in
the repo's cross-tool propagation tables — bringing Claude to parity with
Zencoder, GitHub Copilot, Codex, and ZenFlow. Full rationale and scope in
`intake.md`.

## Likely Affected Areas

- `.claude/skills/**` (new, 19 directories)
- `docs/ai/claude/**` (new)
- `AGENTS.md` (propagation tables only)
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md` (propagation tables only)
- `CLAUDE.md` (propagation section)
- `docs/ai/codex/README.md`, `docs/ai/copilot/*.md`, `docs/ai/zencoder/*.md`
  (add the new Claude path wherever they already enumerate cross-tool file
  sets)

## Expected Sequence

1. Direct repository re-verification (confirm the 19 Codex skill sources and
   table shapes haven't changed since intake was written).
2. Port the 9 specialist-role skills.
3. Port the 10 workflow skills.
4. Build the `docs/ai/claude/` guide layer.
5. Update the propagation tables in `AGENTS.md` and
   `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
6. Update `CLAUDE.md`'s propagation section to point at the new surface.
7. Cross-check every "propagate updates to" list in the files touched above
   so none of them omit the new Claude path.
8. Self-review diff for drift from Codex source content (should be
   mechanical adaptation only).

No specialist review agents are needed for this task — it is a documentation
port, not a code or architecture change.

## Task List

Specialist-role skills (Phase 2):

- [ ] `.claude/skills/architecture-guard/SKILL.md`
- [ ] `.claude/skills/security-auth/SKILL.md`
- [ ] `.claude/skills/nextjs-runtime/SKILL.md`
- [ ] `.claude/skills/implementation-agent/SKILL.md`
- [ ] `.claude/skills/validation-strategy/SKILL.md`
- [ ] `.claude/skills/debug-investigation/SKILL.md`
- [ ] `.claude/skills/playwright-e2e/SKILL.md`
- [ ] `.claude/skills/workflow-orchestrator/SKILL.md`
- [ ] `.claude/skills/task-brief-authoring/SKILL.md`

Workflow skills (Phase 3):

- [ ] `.claude/skills/safe-feature-workflow/SKILL.md`
- [ ] `.claude/skills/safe-refactor-workflow/SKILL.md`
- [ ] `.claude/skills/security-incident-workflow/SKILL.md`
- [ ] `.claude/skills/incident-investigation-workflow/SKILL.md`
- [ ] `.claude/skills/auth-flow-change-review-workflow/SKILL.md`
- [ ] `.claude/skills/playwright-e2e-validation-workflow/SKILL.md`
- [ ] `.claude/skills/change-validation-workflow/SKILL.md`
- [ ] `.claude/skills/repository-baseline-validation-workflow/SKILL.md`
- [ ] `.claude/skills/codacy-security-review-workflow/SKILL.md`
- [ ] `.claude/skills/codacy-findings-review-workflow/SKILL.md`

Guide layer (Phase 4):

- [ ] `docs/ai/claude/README.md` (quick start + recommended starting points,
      mirroring `docs/ai/codex/README.md`)
- [ ] One `docs/ai/claude/<NN or Workflow NN> - *.md` guide file per ported
      skill, mirroring the `docs/ai/codex/*.md` per-role guides

Propagation table updates (Phase 5):

- [ ] `AGENTS.md` → "Agent Infrastructure — Where to Propagate Rules": add
      `.claude/skills/*/SKILL.md` row
- [ ] `AGENTS.md` → "Agent Numbering and File Correspondence": add a Claude
      Code column
- [ ] `docs/ai/general/REPOSITORY_AI_CONTEXT.md` → matching two tables
- [ ] `CLAUDE.md` → "Agent Infrastructure — Propagation" section rewritten to
      point at the new surface instead of saying it doesn't exist

Cross-check (Phase 6):

- [ ] `docs/ai/codex/README.md` "Compatibility Notes" per-role propagation
      lists gain the new `.claude/skills/<name>/SKILL.md` path
- [ ] Spot-check `docs/ai/copilot/*.md` and `docs/ai/zencoder/*.md` for the
      same enumeration pattern and update if present

## Known Risks / Unknowns

- **Volume**: 19 skill files plus ~10-20 guide files plus 4 table edits is a
  lot of small, mechanical changes in one pass — the main risk is drift
  (accidentally changing role substance while adapting tool references), not
  design risk. Mitigate with a final diff self-review against the Codex
  source (Phase 6 in Expected Sequence).
- **Frontmatter contract**: Claude Code's `SKILL.md` frontmatter fields
  (`name`, `description`, optionally `allowed-tools`) need to be confirmed
  against current Claude Code docs before Phase 2 starts, in case the schema
  differs from Codex's in a way that isn't just cosmetic.
- **Table format churn**: `AGENTS.md`'s tables are wide already (5-6
  columns); adding a 6th/7th may need reflowing for readability rather than
  a naive column append.
- **Scope creep temptation**: it will be tempting to also fix the
  Leantime-skill and Architecture-Lint-skill gaps noted in `intake.md`'s Out
  Of Scope while in the neighborhood — resist unless the user asks.

## Planned Artifacts

- `intake.md` (done)
- `plan.md` (this file)
- No further artifacts planned for the planning stage. If the user approves
  and implementation proceeds, standard artifacts (e.g.
  `04 - Implementation Agent - Summary.md`) may be added at that point per
  `docs/ai/general/COPILOT_TASK_ARTIFACTS.md` — not created now, kept
  minimal per explicit instruction for this stage.

## Next Action

Hand back to the user for review of this plan and `intake.md` on branch
`claude/claude-code-agents-skills-plan`. No further changes until reviewed.
