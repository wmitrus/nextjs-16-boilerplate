# Task Intake: Codex Workflow Orchestrator And Task Brief Skills

## Request

Implement the next Codex roles:

- `08 - Workflow Orchestrator Agent`
- `09 - Task Brief Authoring`

Also answer, in Codex terms, whether orchestration and subagent spawning are possible
with the already configured repository roles, and document when `08` is the better
entry point versus when `09` is better.

## Constraints

- keep the shared repository prompts authoritative
- keep the Codex skills thin and compatibility-focused
- do not claim repo-local skills are automatically spawned agent identities if that is
  not true in Codex
- make the `08` versus `09` boundary explicit in the docs

## Acceptance Criteria

- `.agents/skills/workflow-orchestrator/SKILL.md` exists and wraps the shared `08` role
- `.agents/skills/task-brief-authoring/SKILL.md` exists and wraps the shared `09` role
- `docs/ai/codex/08 - Workflow Orchestrator Agent.md` and
  `docs/ai/codex/09 - Task Brief Authoring.md` exist
- `AGENTS.md` and `docs/ai/general/REPOSITORY_AI_CONTEXT.md` map agents `08` and `09`
  to the new Codex skills
- `.agents/README.md` and `docs/ai/codex/README.md` explain when `08` is better and
  when `09` is better
- the docs answer the Codex subagent-orchestration question precisely
