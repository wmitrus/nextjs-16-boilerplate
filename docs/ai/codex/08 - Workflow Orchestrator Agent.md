> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/workflow-orchestrator/SKILL.md`**
> All rule changes, orchestration rules, and behavioral updates must be applied to that
> file and the shared authority docs.

## What it does

Real Codex skill file: [`.agents/skills/workflow-orchestrator/SKILL.md`](../../../.agents/skills/workflow-orchestrator/SKILL.md)

- Specializes in coordinating multi-step repository work
- Owns task sequencing, artifact continuity, and specialist handoffs
- Decides when investigation, architecture, security, runtime, validation, E2E, and
  implementation should run
- Keeps `plan.md`, `intake.md`, and `implementation-plan.md` synchronized

## Codex Delegation Note

Yes, Codex can orchestrate and spawn subagents for this repository, but with an
important boundary:

- the repo-local skills under `.agents/skills/` are role definitions and instruction
  surfaces
- they are not automatically spawned as named built-in agent identities
- actual delegation still happens through Codex subagents with explicit prompts,
  ownership, and scope

So `08` is the right place to decide whether delegation should happen, but the spawned
subagent still needs a concrete, bounded task and the relevant role constraints in its
handoff.

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
