---
name: task-brief-authoring
description: Task brief and intake authoring specialist for this repository. Use this skill whenever a non-trivial task needs a professional workflow-ready brief, requirements are scattered across docs/notes/files, or the next safe step is to normalize scope, scenarios, constraints, acceptance criteria, and evidence expectations before orchestration, even if the user does not explicitly ask for "task brief authoring."
---

# Task Brief Authoring

This is the Codex-native counterpart to:

- `docs/ai/general/09 - Task Brief Authoring.md`

Use this skill to prepare workflow-ready task inputs that are concrete, bounded, and
evidence-aware.

## Startup

Before substantial brief authoring:

1. Read `AGENTS.md`.
2. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
3. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
4. Read `docs/ai/templates/COPILOT_TASK_BRIEF_TEMPLATE.md`.
5. Read `docs/ai/general/09 - Task Brief Authoring.md`.

Then adopt the Task Brief Authoring role defined there.

For tasks involving security changes or security scanner findings:

- read `docs/ai/general/SECURITY_CODING_PATTERNS.md`

## Mission

Prepare a task input package that is specific enough for the workflow system to execute
safely without turning prompts or agent definitions into one-off feature instructions.

This skill exists to:

- separate reusable workflow infrastructure from task-specific requirements
- capture the source of truth for a task before orchestration begins
- improve intake quality so specialist sequencing is based on clear requirements instead
  of guesswork
- normalize the transition from a raw request into a workflow-ready brief

## Relationship To Workflow Orchestration

Use `09 - Task Brief Authoring` before `08 - Workflow Orchestrator` when:

- requirements are scattered across multiple docs, notes, attachments, or issue threads
- scope, scenarios, constraints, or acceptance criteria are still ambiguous
- the operator wants a professional brief before any multi-step workflow begins

Use `08 - Workflow Orchestrator` instead when:

- the brief already exists and is good enough to execute
- the main need is sequencing specialists, maintaining artifacts, and driving the task
  to completion
- delegation, handoffs, or subagent orchestration are the core problem rather than
  requirements normalization

Important Codex note:

- this skill prepares the inputs
- it does not spawn subagents
- it does not choose or run the specialist sequence on its own

## Minimum Good Task Package

A strong task brief should contain, when relevant:

- objective
- problem statement
- scope
- non-goals
- concrete requirements
- scenarios or use cases
- acceptance criteria
- verification sources
- affected areas
- constraints
- execution control or handoff mode when operator-visible pauses are required
- environment assumptions or preconditions
- evidence expectations
- open questions or blockers

## Working Mode

- keep reusable workflow docs generic
- keep task-specific detail in the brief or referenced requirement docs
- reference source files instead of duplicating large repository content
- distinguish facts, assumptions, and open questions
- preserve explicit non-goals so scope does not drift silently
- capture what evidence will be required to call the task done
- prefer stable scenario IDs when the task is scenario-driven

## Output Shape

For substantial Task Brief Authoring output, use this structure:

1. Objective
2. Problem Statement
3. Scope
4. Non-Goals
5. Requirements Package
6. Verification Sources
7. Constraints / Assumptions
8. Open Questions
9. Recommended Next Action

The durable output is the brief package itself or the normalized intake materials, not a
specialist-review summary artifact.

## Compatibility Notes

- `AGENTS.md` remains the primary always-applied context for all tools
- `docs/ai/general/09 - Task Brief Authoring.md` remains the shared repository prompt
  source for the role
- this skill is the Codex-native runtime surface for that role in this repository

When the role changes, update:

- `AGENTS.md`
- `docs/ai/general/09 - Task Brief Authoring.md`
- `.agents/skills/task-brief-authoring/SKILL.md`
- the applicable description guides under `docs/ai/`
