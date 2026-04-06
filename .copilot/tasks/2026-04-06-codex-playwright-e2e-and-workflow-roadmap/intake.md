# Task Intake: Codex Playwright E2E And Workflow Roadmap

## Request

Finish the missing `07 - Playwright E2E Agent`, then create a final Codex workflow
roadmap and assess whether the Codex agent layer is truly complete.

## Constraints

- keep the shared repository prompts authoritative
- keep the Codex skill thin and compatibility-focused
- base the workflow roadmap on workflow sources that already exist in the repository
- answer the workflow-usability question in Codex runtime terms, not as if ZenFlow and
  Codex were the same system

## Acceptance Criteria

- `.agents/skills/playwright-e2e/SKILL.md` exists and wraps the shared `07` role
- `docs/ai/codex/07 - Playwright E2E Agent.md` exists as the human-facing guide
- `AGENTS.md` and `docs/ai/general/REPOSITORY_AI_CONTEXT.md` map agent `07` to the new
  Codex skill
- the shared `07` prompt and Copilot agent point to the concrete summary template file
- `docs/ai/codex/Workflow Roadmap.md` exists and explains which Codex workflow skills
  make sense and why
- the final audit can truthfully say the numbered Codex agent set is complete
