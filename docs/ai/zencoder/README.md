# Zencoder Agent Quick Start

> **IMPORTANT — THIS DIRECTORY CONTAINS DESCRIPTION GUIDES, NOT AGENT PROMPTS.**
>
> The files in `docs/ai/zencoder/` explain what each agent does and when to use it.
> They do NOT control agent behavior.
>
> **The real Zencoder prompt sources are in `docs/ai/general/`.**
> All rule changes, security rules, and behavioral updates MUST be applied to the `docs/ai/general/*.md` files.
> Changes made only to `docs/ai/zencoder/` files have NO effect on how agents behave.

This directory is the quick-start guide for the repository's Zencoder setup.

Use it when you want to understand which repo-hosted prompt source or ZenFlow workflow to use before working in the repo.

This is the Zencoder counterpart to `docs/ai/copilot/`:

- a thin, human-facing reference layer
- not the extension's runtime registration source of truth
- a map from repository docs to the extension-level setup that lives outside the repo

## Three Different Things

### Agent Prompt Source

In this repository, the repo-hosted prompt sources used by Zencoder live in:

- `docs/ai/general/01 - Architecture Guard Agent.md`
- `docs/ai/general/02 - Security & Auth Agent.md`
- `docs/ai/general/03 - Next.js Runtime Agent.md`
- `docs/ai/general/04 - Implementation Agents.md`
- `docs/ai/general/05 - Validation Strategy Agent.md`
- `docs/ai/general/06 - Debug Investigation Agent.md`
- `docs/ai/general/07 - Playwright E2E Agent.md`
- `docs/ai/general/08 - Workflow Orchestrator Agent.md`
- `docs/ai/general/09 - Task Brief Authoring.md`

Zencoder keeps the extension-level agent configuration outside the repository.

This directory documents the mapping, but the repo-hosted prompt content itself lives in `docs/ai/general/`.

### Workflow

ZenFlow workflows currently live in:

- `.zenflow/workflows/feature-development.md`
- `.zenflow/workflows/safe-refactor.md`
- `.zenflow/workflows/incident-investigation.md`
- `.zenflow/workflows/security-incident-workflow.md`

Use workflows when you want step-by-step execution, artifact creation, and sequencing rules rather than a single specialist pass.

Important execution note:

- workflow steps may still run sequentially inside one active session when the tool does not support true UI-level agent switching
- visible UI agent changes are tool-dependent, not guaranteed by artifact filenames alone
- if you want to review each specialist output and switch agents manually between steps, state `Execution Control: manual-handoff` in the task brief or workflow input

### Neutral Workflow Spec

Repository-neutral workflow specs currently live in:

- `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`
- `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`
- `docs/ai/general/Workflow 03 - Security Incident Workflow.md`
- `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`
- `docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md`
- `docs/ai/general/Workflow 06 - Playwright E2E Validation Workflow.md`
- `docs/ai/general/Workflow 07 - Change Validation Workflow.md`
- `docs/ai/general/Workflow 08 - Repository Baseline Validation Workflow.md`
- `docs/ai/general/Workflow 09 - Architecture Lint Workflow.md`

Treat `docs/ai/general/Workflow 01-09` as the neutral workflow design layer and `.zenflow/workflows/` as the Zencoder-oriented execution layer.

### Task Artifacts

Task artifacts are produced by the active workflow.

All ZenFlow workflows write artifacts to the active Zencoder chat directory:

- `.zencoder/chats/{chat_id}/`

Zencoder resolves this path automatically from the active chat session. The `{@artifacts_path}` template variable in ZenFlow workflows expands to this location.

Default scripts used by ZenFlow are documented in:

- `.zenflow/settings.json`

## Quick Start: Which File To Read First

Start with one of these guides:

- [01 - Architecture Guard Agent.md](./01%20-%20Architecture%20Guard%20Agent.md) -> [docs/ai/general/01 - Architecture Guard Agent.md](../general/01%20-%20Architecture%20Guard%20Agent.md)
- [02 - Security & Auth Agent.md](./02%20-%20Security%20%26%20Auth%20Agent.md) -> [docs/ai/general/02 - Security & Auth Agent.md](../general/02%20-%20Security%20%26%20Auth%20Agent.md)
- [03 - Next.js Runtime Agent.md](./03%20-%20Next.js%20Runtime%20Agent.md) -> [docs/ai/general/03 - Next.js Runtime Agent.md](../general/03%20-%20Next.js%20Runtime%20Agent.md)
- [04 - Implementation Agents.md](./04%20-%20Implementation%20Agents.md) -> [docs/ai/general/04 - Implementation Agents.md](../general/04%20-%20Implementation%20Agents.md)
- [05 - Validation Strategy Agent.md](./05%20-%20Validation%20Strategy%20Agent.md) -> [docs/ai/general/05 - Validation Strategy Agent.md](../general/05%20-%20Validation%20Strategy%20Agent.md)
- [06 - Debug Investigation Agent.md](./06%20-%20Debug%20Investigation%20Agent.md) -> [docs/ai/general/06 - Debug Investigation Agent.md](../general/06%20-%20Debug%20Investigation%20Agent.md)
- [07 - Playwright E2E Agent.md](./07%20-%20Playwright%20E2E%20Agent.md) -> [docs/ai/general/07 - Playwright E2E Agent.md](../general/07%20-%20Playwright%20E2E%20Agent.md)
- [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md) -> [docs/ai/general/08 - Workflow Orchestrator Agent.md](../general/08%20-%20Workflow%20Orchestrator%20Agent.md)
- [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md) -> [docs/ai/general/09 - Task Brief Authoring.md](../general/09%20-%20Task%20Brief%20Authoring.md)

Recommended starting points:

- unclear bug or intermittent failure: [06 - Debug Investigation Agent.md](./06%20-%20Debug%20Investigation%20Agent.md)
- architecture or boundary review: [01 - Architecture Guard Agent.md](./01%20-%20Architecture%20Guard%20Agent.md)
- auth, trust boundary, or tenant review: [02 - Security & Auth Agent.md](./02%20-%20Security%20%26%20Auth%20Agent.md)
- App Router, proxy, route handler, server action, or caching review: [03 - Next.js Runtime Agent.md](./03%20-%20Next.js%20Runtime%20Agent.md)
- implementation after constraints are known: [04 - Implementation Agents.md](./04%20-%20Implementation%20Agents.md)
- deciding the minimum safe validation scope: [05 - Validation Strategy Agent.md](./05%20-%20Validation%20Strategy%20Agent.md)
- real-browser verification in Playwright: [07 - Playwright E2E Agent.md](./07%20-%20Playwright%20E2E%20Agent.md)
- orchestrating a multi-step task with durable artifacts: [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md)
- preparing the requirements package that feeds the workflow: [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md)

## Available ZenFlow Workflows

- feature work: [feature-development.md](../../../.zenflow/workflows/feature-development.md)
- behavior-preserving refactor work: [safe-refactor.md](../../../.zenflow/workflows/safe-refactor.md)
- general incident debugging (full orchestrated flow): [incident-investigation.md](../../../.zenflow/workflows/incident-investigation.md)
- security-sensitive incident remediation: [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)
- auth/bootstrap/onboarding change review (matrix sign-off required): [auth-flow-change-review.md](../../../.zenflow/workflows/auth-flow-change-review.md)
- real-browser Playwright verification: [playwright-e2e-validation.md](../../../.zenflow/workflows/playwright-e2e-validation.md)
- minimum safe validation scope for a specific change: [change-validation.md](../../../.zenflow/workflows/change-validation.md)
- repository-wide validation posture audit: [repository-baseline-validation.md](../../../.zenflow/workflows/repository-baseline-validation.md)
- read-only architecture boundary lint: [architecture-lint.md](../../../.zenflow/workflows/architecture-lint.md)

Use workflows when you want repeatable task sequencing instead of manually invoking each specialist.

## Recommended Universal Flow

For non-trivial work, keep the reusable setup generic and put task-specific detail into requirement documents.

Recommended operating model:

1. Write or refine the task brief with [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md).
2. Reference scenario matrices, checklists, acceptance criteria, or supporting docs.
3. Choose the relevant ZenFlow workflow under `.zenflow/workflows/`.
4. Let the workflow create the task artifacts at the configured artifacts path.
5. Route to the right specialist prompt sources from `docs/ai/general/01-09`.
6. If browser evidence is required, use [07 - Playwright E2E Agent.md](./07%20-%20Playwright%20E2E%20Agent.md) as the verification specialist.

Keep one-off task rules in the task brief or workflow inputs, not in a one-off agent prompt.

## Auth-Flow Note

For any Clerk, bootstrap, onboarding, middleware auth-routing, or `/users` access-control change, always use:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

Treat the verification matrix as the mandatory checklist for affected auth-flow scenarios.

For a structured multi-step auth change review with matrix sign-off, use the dedicated workflow:

- [auth-flow-change-review.md](../../../.zenflow/workflows/auth-flow-change-review.md)
