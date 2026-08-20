> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Claude Code skill that controls behavior is:
> **`.claude/skills/workflow-orchestrator/SKILL.md`**
> (Codex's equivalent: `.agents/skills/workflow-orchestrator/SKILL.md`.)
> All rule changes, orchestration rules, and behavioral updates must be applied to that
> file and the shared authority docs.

## What it does

Real Claude skill file: [`.claude/skills/workflow-orchestrator/SKILL.md`](../../../.claude/skills/workflow-orchestrator/SKILL.md) (Codex equivalent: [`.agents/skills/workflow-orchestrator/SKILL.md`](../../../.agents/skills/workflow-orchestrator/SKILL.md))

- Specializes in coordinating multi-step repository work
- Owns task sequencing, artifact continuity, and specialist handoffs
- Decides when investigation, architecture, security, runtime, validation, E2E, and
  implementation should run
- Keeps `plan.md`, `intake.md`, and `implementation-plan.md` synchronized

## Claude Code Delegation Note

Claude Code can spawn real subagents through its `Agent` tool, with dedicated
`.claude/agents/*.md` identities — a more capable delegation model than Codex's
skill-only approach, in principle. This repository has not yet built those dedicated
subagent identities for these roles (an explicit open question in this task's
`intake.md`), so today delegation means the same thing it does for Codex:

- the repo-local skills under `.claude/skills/` are role definitions and instruction
  surfaces, exactly like Codex's `.agents/skills/`
- until `.claude/agents/*.md` subagent identities exist for these roles, actual
  delegation happens by invoking the relevant skill directly within the current
  session with an explicit, bounded scope — not by spawning a named role-bound
  identity

So `08` is still the right place to decide whether delegation should happen. Until the
subagent layer is built, "delegation" is sequential single-session role-switching, the
same fallback model Codex uses — not a structural limitation of Claude Code itself.

## When to use it

- When one task needs multiple specialist passes in sequence
- When you want one `.copilot/tasks/{task_id}/` workspace to stay authoritative
- When the main problem is sequencing, handoff discipline, or multi-step execution
- When delegation or parallel subagent work needs a process owner

## When not to use it

- When the task is still too vague and needs a professional brief first
- When a single specialist can answer the question directly

## Better than 09 when

Use `08` instead of `09` when the brief is already good enough and the main need is:

- orchestration
- delegation
- checklist state management
- execution sequencing

## Output Shape

For substantial answers, the skill uses:

1. Objective
2. Input Sources
3. Task Classification
4. Planned Specialist Sequence
5. Artifacts To Be Produced
6. Current Status
7. Recommended Next Action
