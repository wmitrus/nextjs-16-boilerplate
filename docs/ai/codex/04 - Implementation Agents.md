> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/implementation-agent/SKILL.md`**
> All rule changes, implementation rules, and behavioral updates must be applied to that
> file and the shared authority docs.

## What it does

Real Codex skill file: [`.agents/skills/implementation-agent/SKILL.md`](../../../.agents/skills/implementation-agent/SKILL.md)

- Specializes in making code changes after design and constraint decisions are already
  known
- Focuses on minimal safe implementation, test updates, focused validation, and small
  supporting-file wiring
- Defers to Architecture Guard, Security & Auth, Next.js Runtime, and Validation
  Strategy instead of re-deciding those areas
- Produces the concrete implementation pass and implementation summary artifact

## When to use it

- When architecture, security, runtime, and validation constraints are already clear
- When code and tests need to be updated under already-approved guardrails
- When the task is to make the smallest safe patch rather than redesign the solution

## Startup Note

The skill reads the shared authority docs first:

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/04 - Implementation Agents.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`

Implementation work must also inherit the repository rules that duplicate-sensitive writes need DB-backed uniqueness and that invitation/reset/waitlist logging or mail fallbacks must not expose raw emails or token-bearing URLs (SEC-21, SEC-22).

## Output Shape

For close-out output, the skill reports:

1. Solution
2. Files Changed
3. Behavior Change Summary
4. Validation Performed
5. Residual Risks Or Follow-Up

## Artifact Discipline

For artifact-backed work, the skill must create or update exactly one persistent
summary artifact:

- `.copilot/tasks/{task_id}/04 - Implementation Agent - Summary.md`

It updates that same file on later runs instead of creating duplicates.

## Example prompts to try

- "Implement the approved auth bootstrap landing-route fix."
- "Apply the runtime-safe cookie handoff change and update the relevant tests."
- "Make the smallest safe patch for this reviewed PR feedback."
- "Implement this design without changing architecture."
