# Task Plan — Claude Code Agents & Skills Setup

## Status

**PHASES 2 THROUGH 5 COMPLETE.** Only Phase 6 (cross-check the existing
`docs/ai/codex/README.md`, `docs/ai/copilot/*.md`, `docs/ai/zencoder/*.md`
guides for their own propagation-list enumerations) remains. All 9 specialist-role skills and all 10
workflow skills are ported to `.claude/skills/` (19 total), diff-verified as
mechanical-only against their Codex source. The frontmatter-contract risk
noted below is resolved (confirmed against real on-disk Claude Code skills
at `/mnt/skills/`: `name` + `description` [+ optional `license`], matching
Codex's shape).

**Drift found during the Phase 3 inventory check (see "Docs vs Code Drift"
below): `.agents/skills/` actually contains 20 directories, not 19.** The
20th is `leantime-integration`, which `.agents/README.md`'s own skill
inventory omits, and which `intake.md`'s Out Of Scope section incorrectly
assumed didn't exist for Codex either. **Resolved**: ported
`.claude/skills/leantime-integration/SKILL.md` (diff-clean, same rule set —
rules 2 and 4 correctly no-op since this file has no "Compatibility Notes"
section to begin with). `intake.md` updated to record the correction rather
than pretend it was always in scope. 20 of 20 skills now ported.

## Docs vs Code Drift Found (Not Yet Acted On)

`.agents/skills/` on disk has 20 skill directories. `.agents/README.md`'s
"Skill Types" inventory lists only 19 (9 specialist + 10 workflow) and does
not mention the 20th: `.agents/skills/leantime-integration/SKILL.md`. This
also means `intake.md`'s Out Of Scope section is wrong where it says
"Neither [Leantime Integration nor Leantime Strategy] has a Codex skill
counterpart today either" — that's true for Leantime Strategy (11), not for
Leantime Integration (10).

Per the repo's own rule (trust the code over docs, report drift explicitly,
don't silently reconcile): this is recorded here rather than fixed
unilaterally. Practical effect: Leantime Integration (10) now fits this
task's own stated inclusion principle ("port what already exists for
Codex"), so porting `.claude/skills/leantime-integration/SKILL.md` is
arguably in scope after all — a small, one-file addition using the same
script and rules already validated in Phases 2 and 3. Not done without
sign-off, since it changes `intake.md`'s stated scope after the fact.

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

Specialist-role skills (Phase 2) — **DONE**, ported via
`/tmp/.../scratchpad/port_skill.py` (mechanical: heading rename, Codex
sibling bullet, runtime-surface clause, propagation-checklist entry; no
content drift, diff-verified against source for all 9):

- [x] `.claude/skills/architecture-guard/SKILL.md`
- [x] `.claude/skills/security-auth/SKILL.md`
- [x] `.claude/skills/nextjs-runtime/SKILL.md`
- [x] `.claude/skills/implementation-agent/SKILL.md`
- [x] `.claude/skills/validation-strategy/SKILL.md`
- [x] `.claude/skills/debug-investigation/SKILL.md`
- [x] `.claude/skills/playwright-e2e/SKILL.md`
- [x] `.claude/skills/workflow-orchestrator/SKILL.md`
- [x] `.claude/skills/task-brief-authoring/SKILL.md`
- [x] `.claude/skills/leantime-integration/SKILL.md` (drift correction —
      added after Phase 3's inventory check found it missing from
      `.agents/README.md`'s own inventory; see "Docs vs Code Drift Found")

Workflow skills (Phase 3) — **DONE**, all 10 ported and diff-verified clean
against Codex source (same rule set as Phase 2; only
`safe-refactor-workflow` has a local propagation checklist, matching the
earlier grep confirmation that the other 9 workflow files don't have one):

- [x] `.claude/skills/safe-feature-workflow/SKILL.md`
- [x] `.claude/skills/safe-refactor-workflow/SKILL.md`
- [x] `.claude/skills/security-incident-workflow/SKILL.md`
- [x] `.claude/skills/incident-investigation-workflow/SKILL.md`
- [x] `.claude/skills/auth-flow-change-review-workflow/SKILL.md`
- [x] `.claude/skills/playwright-e2e-validation-workflow/SKILL.md`
- [x] `.claude/skills/change-validation-workflow/SKILL.md`
- [x] `.claude/skills/repository-baseline-validation-workflow/SKILL.md`
- [x] `.claude/skills/codacy-security-review-workflow/SKILL.md`
- [x] `.claude/skills/codacy-findings-review-workflow/SKILL.md`
- [ ] `.claude/skills/safe-refactor-workflow/SKILL.md`
- [ ] `.claude/skills/security-incident-workflow/SKILL.md`
- [ ] `.claude/skills/incident-investigation-workflow/SKILL.md`
- [ ] `.claude/skills/auth-flow-change-review-workflow/SKILL.md`
- [ ] `.claude/skills/playwright-e2e-validation-workflow/SKILL.md`
- [ ] `.claude/skills/change-validation-workflow/SKILL.md`
- [ ] `.claude/skills/repository-baseline-validation-workflow/SKILL.md`
- [ ] `.claude/skills/codacy-security-review-workflow/SKILL.md`
- [ ] `.claude/skills/codacy-findings-review-workflow/SKILL.md`

Guide layer (Phase 4) — **DONE**:

- [x] `docs/ai/claude/README.md` — adapted (not blind-copied) from
      `docs/ai/codex/README.md`'s structure: skill inventory, recommended
      starting points, 08-vs-09, feature-workflow guidance, and a
      Claude Code Delegation Note explaining today's fallback vs. the
      not-yet-built `.claude/agents/` subagent layer
- [x] 19 `docs/ai/claude/<NN or Workflow NN> - *.md` guide files, ported via
      `scripts/port_guide.py` (mechanical: retargets the "real skill file"
      pointer to `.claude/skills/`, adds Codex as sibling; everything else
      byte-identical) plus 3 small, deliberate hand-edits for content that
      was genuinely Codex-specific rather than link paths:
  - `08 - Workflow Orchestrator Agent.md`: replaced "Codex Delegation Note"
    with an accurate "Claude Code Delegation Note" (Claude has a more
    capable native subagent model via the `Agent` tool, but this repo
    hasn't built `.claude/agents/*.md` identities yet, so the practical
    fallback today matches Codex's)
  - `Workflow 01 - Safe Feature Workflow.md`: "for Codex" → "for Claude Code"
  - `Workflow 02 - Safe Refactor Workflow.md`: "inside Codex" → "inside
    Claude Code"
- [x] `10 - Leantime Integration Agent` intentionally has **no** guide file
      — matches `docs/ai/codex/`'s own gap (no guide for that role either),
      documented instead of silently copied
- [x] `Workflow 09 - Architecture Lint` intentionally has **no** guide file
      — matches Codex, which also has no skill/guide for it (pre-existing
      gap, not fixed here, per intake.md's Out Of Scope)

Propagation table updates (Phase 5) — **DONE**:

- [x] `AGENTS.md` → "Agent Infrastructure — Where to Propagate Rules": added
      `.claude/skills/*/SKILL.md`, `CLAUDE.md`, and `docs/ai/claude/*.md`
      rows
- [x] `AGENTS.md` → "Agent Numbering and File Correspondence": added a
      Claude Code Skill column (all 11 rows, `.claude/skills/leantime-integration/SKILL.md`
      included for row 10, `—` for row 11 same as Codex)
- [x] `AGENTS.md` → "Workflow Entry Point Correspondence": added a Claude
      Code Skill column (all 10 rows)
- [x] `docs/ai/general/REPOSITORY_AI_CONTEXT.md` → matching location-map
      table (3 new rows) and both correspondence tables. Note: this file's
      own "Agent Numbering and File Correspondence" table only ever had rows
      01-09 (missing 10 and 11 already, independent of this task) — Claude
      column added to the existing 9 rows as-is, row count not changed, to
      keep this task's footprint to "add a column," not "also backfill a
      separate pre-existing gap."
- [x] `CLAUDE.md` → "Specialist Skills and Workflows" section now points at
      `.claude/skills/` skill-for-skill (Skill tool, not manual `Read`); the
      "Agent Infrastructure — Propagation" section rewritten to say Claude
      Code is in both tables instead of saying it doesn't exist yet

Used mechanical table edits (Python re-parsing each header/row rather than
hand-retyping padded markdown table columns) for the two large
correspondence tables in both files — safer against alignment/whitespace
mismatches than manual retyping, confirmed by re-reading each result.

Cross-check (Phase 6) — not started:

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
- ~~**Frontmatter contract**~~ — **RESOLVED**: confirmed against real
  on-disk Claude Code skills (`/mnt/skills/public/*/SKILL.md`,
  `/mnt/skills/examples/*/SKILL.md`) rather than assumption. Frontmatter is
  `name` + `description` (+ optional `license`), matching Codex's shape
  closely enough that no schema-driven rewrite was needed.
- **Wording variants found during Phase 2**: the "runtime surface" sentence
  in each skill's Compatibility Notes is not verbatim-identical across
  files — some use capitalized "This skill is..." (with trailing period,
  e.g. `architecture-guard`), others use lowercase "this skill is..." (no
  trailing period, bullet-list style, e.g. `security-auth`,
  `nextjs-runtime`, and the rest). The port script (now handling both
  variants) initially missed the lowercase form on the first run across the
  8 remaining specialist skills — caught by the per-rule hit-count log
  (0 hits reported), fixed before anything was committed. Apply the same
  caution in Phase 3: check hit counts before trusting a batch run, don't
  assume Phase 2's fixed patterns cover every workflow file's phrasing.
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
