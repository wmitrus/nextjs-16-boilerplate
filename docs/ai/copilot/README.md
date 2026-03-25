# Copilot Agent Quick Start

> **IMPORTANT — THIS DIRECTORY CONTAINS DESCRIPTION GUIDES, NOT AGENTS.**
>
> The files in `docs/ai/copilot/` explain what each agent does and when to use it.
> They do NOT control agent behavior.
>
> **The real Copilot agents are in `.github/agents/`.**
> All rule changes, security rules, and behavioral updates MUST be applied to the `.github/agents/*.agent.md` files.
> Changes made only to `docs/ai/copilot/` files have NO effect on how agents behave.

This directory is the quick-start guide for the repository's Copilot specialist setup.

Use it when you want to understand which specialist to pick before working in the repo.

## Three Different Things

### Agent

An agent is a specialist role.

In this repository, agents live in `.github/agents/` and define:

- what the specialist is responsible for
- which tools it may use
- what it must read first
- what output shape it should return

Use an agent when you need a focused reviewer or implementer, not the default general-purpose assistant.

Real agent files:

- [architecture-guard.agent.md](../../../.github/agents/architecture-guard.agent.md)
- [security-auth.agent.md](../../../.github/agents/security-auth.agent.md)
- [nextjs-runtime.agent.md](../../../.github/agents/nextjs-runtime.agent.md)
- [implementation-agent.agent.md](../../../.github/agents/implementation-agent.agent.md)
- [validation-strategy.agent.md](../../../.github/agents/validation-strategy.agent.md)
- [debug-investigation.agent.md](../../../.github/agents/debug-investigation.agent.md)

### Prompt

A prompt is a reusable slash command.

In this repository, prompts live in `.github/prompts/` and usually route work to a specific agent with a fixed workflow.

Use a prompt when you want a repeatable entrypoint for a common task such as:

- auth-flow review
- change validation
- repository validation audit
- debug investigation
- task orchestration
- browser-level validation

### Instruction

An instruction is always-on guidance for Copilot.

In this repository, instructions live in `.github/instructions/` and shape default behavior such as:

- when to delegate to specialist agents
- when implementation work must request validation review

Use instructions to understand repository-level guardrails rather than task-specific workflows.

## Quick Start: Which File To Read First

Start with one of these guides:

- [01 - Architecture Guard Agent.md](./01%20-%20Architecture%20Guard%20Agent.md) → [architecture-guard.agent.md](../../../.github/agents/architecture-guard.agent.md)
- [02 - Security & Auth Agent.md](./02%20-%20Security%20%26%20Auth%20Agent.md) → [security-auth.agent.md](../../../.github/agents/security-auth.agent.md)
- [03 - Next.js Runtime Agent.md](./03%20-%20Next.js%20Runtime%20Agent.md) → [nextjs-runtime.agent.md](../../../.github/agents/nextjs-runtime.agent.md)
- [04 - Implementation Agents.md](./04%20-%20Implementation%20Agents.md) → [implementation-agent.agent.md](../../../.github/agents/implementation-agent.agent.md)
- [05 - Validation Strategy Agent.md](./05%20-%20Validation%20Strategy%20Agent.md) → [validation-strategy.agent.md](../../../.github/agents/validation-strategy.agent.md)
- [06 - Debug Investigation Agent.md](./06%20-%20Debug%20Investigation%20Agent.md) → [debug-investigation.agent.md](../../../.github/agents/debug-investigation.agent.md)
- [07 - Playwright E2E Agent.md](./07%20-%20Playwright%20E2E%20Agent.md) → [playwright-e2e.agent.md](../../../.github/agents/playwright-e2e.agent.md)
- [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md) → [workflow-orchestrator.agent.md](../../../.github/agents/workflow-orchestrator.agent.md)
- [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md)

Recommended starting points:

- unclear bug or intermittent failure: [06 - Debug Investigation Agent.md](./06%20-%20Debug%20Investigation%20Agent.md)
- architecture or boundary review: [01 - Architecture Guard Agent.md](./01%20-%20Architecture%20Guard%20Agent.md)
- auth, trust boundary, or tenant review: [02 - Security & Auth Agent.md](./02%20-%20Security%20%26%20Auth%20Agent.md)
- App Router, proxy, route handler, server action, or caching review: [03 - Next.js Runtime Agent.md](./03%20-%20Next.js%20Runtime%20Agent.md)
- implementation after constraints are known: [04 - Implementation Agents.md](./04%20-%20Implementation%20Agents.md)
- deciding the minimum safe validation scope: [05 - Validation Strategy Agent.md](./05%20-%20Validation%20Strategy%20Agent.md)
- real-browser verification in Playwright: [07 - Playwright E2E Agent.md](./07%20-%20Playwright%20E2E%20Agent.md)
- multi-step coordination across specialists and artifacts: [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md)
- writing the requirements package that drives the whole workflow: [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md)

## Available Slash Prompts

These prompts currently exist in `.github/prompts/`:

- `/Auth Flow Change Review` → [auth-flow-change-review.prompt.md](../../../.github/prompts/auth-flow-change-review.prompt.md)
- `/Change Validation` → [change-validation.prompt.md](../../../.github/prompts/change-validation.prompt.md)
- `/Debug Investigation` → [debug-investigation.prompt.md](../../../.github/prompts/debug-investigation.prompt.md)
- `/Incident Investigation` → [incident-investigation.prompt.md](../../../.github/prompts/incident-investigation.prompt.md)
- `/Playwright E2E Validation` → [playwright-e2e-validation.prompt.md](../../../.github/prompts/playwright-e2e-validation.prompt.md)
- `/Repository Baseline Validation` → [repository-baseline-validation.prompt.md](../../../.github/prompts/repository-baseline-validation.prompt.md)
- `/Safe Refactor` → [safe-refactor.prompt.md](../../../.github/prompts/safe-refactor.prompt.md)
- `/Security Incident` → [security-incident.prompt.md](../../../.github/prompts/security-incident.prompt.md)
- `/Workflow Task` → [workflow-task.prompt.md](../../../.github/prompts/workflow-task.prompt.md)

Use prompts when you want a ready-made workflow instead of invoking a specialist manually.

## Recommended Universal Flow

For non-trivial work, keep the reusable setup generic and put the task specificity into requirement documents.

Recommended operating model:

1. Write a task brief or requirements doc for the specific task.
2. Reference any scenario matrix, checklist, acceptance criteria, or supporting docs.
3. Start `/Workflow Task` and provide the description plus the relevant files.
4. Let the orchestrator create `.copilot/tasks/{task_id}/plan.md` and `intake.md`.
5. Let the orchestrator route to the right specialists.
6. If browser evidence is required, use `/Playwright E2E Validation` or let the orchestrator invoke `07 - Playwright E2E`.

Keep one-off task rules in the task brief, not in a one-off prompt.

## Repository Guardrails

These instructions currently shape default behavior:

- `.github/instructions/agent-delegation.instructions.md`
- `.github/instructions/agent-artifacts.instructions.md`
- `.github/instructions/implementation-validation.instructions.md`

In practice, this means:

- ambiguous bug hunts should go to Debug Investigation first
- non-trivial design review should go to the relevant specialist
- broad test expansion should be reviewed by Validation Strategy first
- non-trivial Copilot work should create a task workspace under `.copilot/tasks/`
- auth/bootstrap/onboarding work must follow the auth-flow guidance and verification matrix

## Auth-Flow Note

For any Clerk, bootstrap, onboarding, middleware auth-routing, or `/users` access-control change, always use:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

Treat the verification matrix as the mandatory checklist for affected auth-flow scenarios.
