# Task Intake: Codex Debug Investigation Skill

## Request

Implement the next repo-local Codex specialist: `06 - Debug Investigation Agent`, using
the Architecture Guard review style first.

## Constraints

- keep the shared repository prompts authoritative
- keep the Codex skill thin and compatibility-focused
- ensure artifact-backed work keeps the mandatory single-summary-file rule
- update the doc and mapping surfaces needed for cross-tool compatibility

## Acceptance Criteria

- `.agents/skills/debug-investigation/SKILL.md` exists and wraps the shared `06` role
- `docs/ai/codex/06 - Debug Investigation Agent.md` exists as the human-facing guide
- `AGENTS.md` and `docs/ai/general/REPOSITORY_AI_CONTEXT.md` map agent `06` to the new
  Codex skill
- `.agents/README.md` and `docs/ai/codex/README.md` expose the new skill
- the task folder contains `01 - Architecture Guard - Summary.md`,
  `06 - Debug Investigation - Summary.md`, and `validation-report.md`
- any discovered shared-doc drift that directly affects `06` compatibility is fixed or
  explicitly recorded
