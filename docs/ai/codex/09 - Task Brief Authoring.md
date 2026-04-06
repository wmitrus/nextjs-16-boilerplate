> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/task-brief-authoring/SKILL.md`**
> All rule changes, brief-authoring rules, and behavioral updates must be applied to
> that file and the shared authority docs.

## What it does

Real Codex skill file: [`.agents/skills/task-brief-authoring/SKILL.md`](../../../.agents/skills/task-brief-authoring/SKILL.md)

- Specializes in turning rough requests into workflow-ready task inputs
- Normalizes scope, non-goals, requirements, scenarios, constraints, and evidence
  expectations
- Prepares the brief package that `08 - Workflow Orchestrator` can execute safely
- Keeps reusable prompts and workflows generic by moving task-specific detail into the
  brief

## When to use it

- When requirements are scattered across multiple docs, notes, attachments, or issue
  threads
- When scope, scenarios, or acceptance criteria are still ambiguous
- When you want a professional brief before starting orchestration
- When the next safe step is normalization rather than execution

## Better than 08 when

Use `09` instead of `08` when the main problem is:

- unclear requirements
- missing acceptance criteria
- missing scenario list
- missing constraints or evidence expectations

If the brief is already stable and the task now needs sequencing and execution, switch
to `08`.

## Output Shape

For substantial answers, the skill uses:

1. Objective
2. Problem Statement
3. Scope
4. Non-Goals
5. Requirements Package
6. Verification Sources
7. Constraints / Assumptions
8. Open Questions
9. Recommended Next Action

## Artifact Note

Unlike the numbered specialist review agents, `09` primarily produces the task brief or
normalized intake package itself. Its durable output is the brief, not a specialist
summary artifact.
