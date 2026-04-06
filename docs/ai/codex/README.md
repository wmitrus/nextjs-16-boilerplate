# Codex Skill Quick Start

> **IMPORTANT — THIS DIRECTORY CONTAINS DESCRIPTION GUIDES, NOT THE REAL SKILLS.**
>
> The files in `docs/ai/codex/` explain what each Codex-facing repository skill does and when to use it.
> They do NOT control behavior by themselves.
>
> **The real Codex skills are in `.agents/skills/`.**
> All rule changes, security rules, and behavioral updates MUST be applied to the real skill files and the shared authority docs.

This directory is the human-facing quick-start guide for the repository's Codex skill
layer.

Use it when you want to understand which repo-local Codex skill to invoke before
working in the repo.

## Current Scope

This Codex compatibility layer now covers the full numbered specialist set and the
current workflow set that the repository already supports across the other tool
surfaces.

### Agents

- [01 - Architecture Guard Agent.md](./01%20-%20Architecture%20Guard%20Agent.md) → [`.agents/skills/architecture-guard/SKILL.md`](../../../.agents/skills/architecture-guard/SKILL.md)
- [02 - Security & Auth Agent.md](./02%20-%20Security%20%26%20Auth%20Agent.md) → [`.agents/skills/security-auth/SKILL.md`](../../../.agents/skills/security-auth/SKILL.md)
- [03 - Next.js Runtime Agent.md](./03%20-%20Next.js%20Runtime%20Agent.md) → [`.agents/skills/nextjs-runtime/SKILL.md`](../../../.agents/skills/nextjs-runtime/SKILL.md)
- [04 - Implementation Agents.md](./04%20-%20Implementation%20Agents.md) → [`.agents/skills/implementation-agent/SKILL.md`](../../../.agents/skills/implementation-agent/SKILL.md)
- [05 - Validation Strategy Agent.md](./05%20-%20Validation%20Strategy%20Agent.md) → [`.agents/skills/validation-strategy/SKILL.md`](../../../.agents/skills/validation-strategy/SKILL.md)
- [06 - Debug Investigation Agent.md](./06%20-%20Debug%20Investigation%20Agent.md) → [`.agents/skills/debug-investigation/SKILL.md`](../../../.agents/skills/debug-investigation/SKILL.md)
- [07 - Playwright E2E Agent.md](./07%20-%20Playwright%20E2E%20Agent.md) → [`.agents/skills/playwright-e2e/SKILL.md`](../../../.agents/skills/playwright-e2e/SKILL.md)
- [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md) → [`.agents/skills/workflow-orchestrator/SKILL.md`](../../../.agents/skills/workflow-orchestrator/SKILL.md)
- [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md) → [`.agents/skills/task-brief-authoring/SKILL.md`](../../../.agents/skills/task-brief-authoring/SKILL.md)

### Workflows

- [Workflow 01 - Safe Feature Workflow.md](./Workflow%2001%20-%20Safe%20Feature%20Workflow.md) → [`.agents/skills/safe-feature-workflow/SKILL.md`](../../../.agents/skills/safe-feature-workflow/SKILL.md)
- [Workflow 02 - Safe Refactor Workflow.md](./Workflow%2002%20-%20Safe%20Refactor%20Workflow.md) → [`.agents/skills/safe-refactor-workflow/SKILL.md`](../../../.agents/skills/safe-refactor-workflow/SKILL.md)
- [Workflow 03 - Security Incident Workflow.md](./Workflow%2003%20-%20Security%20Incident%20Workflow.md) → [`.agents/skills/security-incident-workflow/SKILL.md`](../../../.agents/skills/security-incident-workflow/SKILL.md)
- [Workflow 04 - Incident Investigation Workflow.md](./Workflow%2004%20-%20Incident%20Investigation%20Workflow.md) → [`.agents/skills/incident-investigation-workflow/SKILL.md`](../../../.agents/skills/incident-investigation-workflow/SKILL.md)
- [Workflow 05 - Auth Flow Change Review Workflow.md](./Workflow%2005%20-%20Auth%20Flow%20Change%20Review%20Workflow.md) → [`.agents/skills/auth-flow-change-review-workflow/SKILL.md`](../../../.agents/skills/auth-flow-change-review-workflow/SKILL.md)
- [Workflow 06 - Playwright E2E Validation Workflow.md](./Workflow%2006%20-%20Playwright%20E2E%20Validation%20Workflow.md) → [`.agents/skills/playwright-e2e-validation-workflow/SKILL.md`](../../../.agents/skills/playwright-e2e-validation-workflow/SKILL.md)
- [Workflow 07 - Change Validation Workflow.md](./Workflow%2007%20-%20Change%20Validation%20Workflow.md) → [`.agents/skills/change-validation-workflow/SKILL.md`](../../../.agents/skills/change-validation-workflow/SKILL.md)
- [Workflow 08 - Repository Baseline Validation Workflow.md](./Workflow%2008%20-%20Repository%20Baseline%20Validation%20Workflow.md) → [`.agents/skills/repository-baseline-validation-workflow/SKILL.md`](../../../.agents/skills/repository-baseline-validation-workflow/SKILL.md)
- [Workflow 10 - Codacy Security Review Workflow.md](./Workflow%2010%20-%20Codacy%20Security%20Review%20Workflow.md) → [`.agents/skills/codacy-security-review-workflow/SKILL.md`](../../../.agents/skills/codacy-security-review-workflow/SKILL.md)
- [Workflow 11 - Codacy Findings Review Workflow.md](./Workflow%2011%20-%20Codacy%20Findings%20Review%20Workflow.md) → [`.agents/skills/codacy-findings-review-workflow/SKILL.md`](../../../.agents/skills/codacy-findings-review-workflow/SKILL.md)
- [Workflow Roadmap.md](./Workflow%20Roadmap.md)

## Three Different Things

### Shared Prompt Or Workflow Source

The shared repository sources live in `docs/ai/general/`.

Current shared sources:

- `docs/ai/general/01 - Architecture Guard Agent.md`
- `docs/ai/general/02 - Security & Auth Agent.md`
- `docs/ai/general/03 - Next.js Runtime Agent.md`
- `docs/ai/general/04 - Implementation Agents.md`
- `docs/ai/general/05 - Validation Strategy Agent.md`
- `docs/ai/general/06 - Debug Investigation Agent.md`
- `docs/ai/general/07 - Playwright E2E Agent.md`
- `docs/ai/general/08 - Workflow Orchestrator Agent.md`
- `docs/ai/general/09 - Task Brief Authoring.md`
- `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`
- `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`
- `docs/ai/general/Workflow 03 - Security Incident Workflow.md`
- `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`
- `docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md`
- `docs/ai/general/Workflow 06 - Playwright E2E Validation Workflow.md`
- `docs/ai/general/Workflow 07 - Change Validation Workflow.md`
- `docs/ai/general/Workflow 08 - Repository Baseline Validation Workflow.md`
- `docs/ai/general/Workflow 10 - Codacy Security Review Workflow.md`
- `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`

### Real Codex Skill

The Codex-native runtime skills live in:

- `.agents/skills/architecture-guard/SKILL.md`
- `.agents/skills/security-auth/SKILL.md`
- `.agents/skills/nextjs-runtime/SKILL.md`
- `.agents/skills/implementation-agent/SKILL.md`
- `.agents/skills/validation-strategy/SKILL.md`
- `.agents/skills/debug-investigation/SKILL.md`
- `.agents/skills/playwright-e2e/SKILL.md`
- `.agents/skills/workflow-orchestrator/SKILL.md`
- `.agents/skills/task-brief-authoring/SKILL.md`
- `.agents/skills/safe-feature-workflow/SKILL.md`
- `.agents/skills/safe-refactor-workflow/SKILL.md`
- `.agents/skills/security-incident-workflow/SKILL.md`
- `.agents/skills/incident-investigation-workflow/SKILL.md`
- `.agents/skills/auth-flow-change-review-workflow/SKILL.md`
- `.agents/skills/playwright-e2e-validation-workflow/SKILL.md`
- `.agents/skills/change-validation-workflow/SKILL.md`
- `.agents/skills/repository-baseline-validation-workflow/SKILL.md`
- `.agents/skills/codacy-security-review-workflow/SKILL.md`
- `.agents/skills/codacy-findings-review-workflow/SKILL.md`

### Description Guide

This directory is a guide layer only.

It points humans to:

- the shared prompt source
- the real Codex skill path
- the intended use cases

## Recommended Starting Points

- architecture or boundary review: [01 - Architecture Guard Agent.md](./01%20-%20Architecture%20Guard%20Agent.md)
- auth, trust-boundary, tenant, or sensitive-data review: [02 - Security & Auth Agent.md](./02%20-%20Security%20%26%20Auth%20Agent.md)
- App Router, route-handler, proxy, server-action, or caching review: [03 - Next.js Runtime Agent.md](./03%20-%20Next.js%20Runtime%20Agent.md)
- concrete code changes under established constraints: [04 - Implementation Agents.md](./04%20-%20Implementation%20Agents.md)
- minimum safe validation scope or repository validation posture: [05 - Validation Strategy Agent.md](./05%20-%20Validation%20Strategy%20Agent.md)
- ambiguous bugs, unstable flows, or evidence gathering before remediation: [06 - Debug Investigation Agent.md](./06%20-%20Debug%20Investigation%20Agent.md)
- real-browser verification and scenario-mapped Playwright evidence: [07 - Playwright E2E Agent.md](./07%20-%20Playwright%20E2E%20Agent.md)
- multi-step sequencing, delegation, and artifact continuity: [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md)
- requirements normalization and professional brief preparation before orchestration: [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md)
- non-trivial feature delivery with built-in fast-path handling for small changes: [Workflow 01 - Safe Feature Workflow.md](./Workflow%2001%20-%20Safe%20Feature%20Workflow.md)
- behavior-preserving refactor or cleanup: [Workflow 02 - Safe Refactor Workflow.md](./Workflow%2002%20-%20Safe%20Refactor%20Workflow.md)
- security incident handling and containment-oriented response: [Workflow 03 - Security Incident Workflow.md](./Workflow%2003%20-%20Security%20Incident%20Workflow.md)
- messy production bug or regression triage: [Workflow 04 - Incident Investigation Workflow.md](./Workflow%2004%20-%20Incident%20Investigation%20Workflow.md)
- auth or onboarding flow changes with explicit trust-boundary review: [Workflow 05 - Auth Flow Change Review Workflow.md](./Workflow%2005%20-%20Auth%20Flow%20Change%20Review%20Workflow.md)
- browser-first verification when the main task is Playwright evidence: [Workflow 06 - Playwright E2E Validation Workflow.md](./Workflow%2006%20-%20Playwright%20E2E%20Validation%20Workflow.md)
- validation-only closure work after implementation is already done: [Workflow 07 - Change Validation Workflow.md](./Workflow%2007%20-%20Change%20Validation%20Workflow.md)
- periodic repository validation and baseline health review: [Workflow 08 - Repository Baseline Validation Workflow.md](./Workflow%2008%20-%20Repository%20Baseline%20Validation%20Workflow.md)

## 08 vs 09

Choose [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md) when the task already has a usable brief and the main need is sequencing specialists, maintaining artifacts, and coordinating execution.

Choose [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md) when the task is still messy and needs scope, scenarios, acceptance criteria, constraints, and evidence expectations normalized before orchestration starts.

For Codex specifically: orchestration and subagent spawning are possible, but the repo-local skills are role-definition files, not auto-bound spawned-agent identities. The orchestrator decides when to delegate; the spawned subagent still needs an explicit bounded handoff.

## Feature Workflow Guidance

Use `Workflow 01 - Safe Feature` as the default for non-trivial feature work, not for
every tiny change.

Good default for `Workflow 01 - Safe Feature`:

- medium features
- cross-file behavior changes
- anything that may touch boundaries, auth, runtime, caching, or tests

Skip the full feature workflow when the change is clearly small and low-risk:

- one or two files
- no auth or security impact
- no runtime-placement or caching risk
- no contract or DI changes
- no meaningful public behavior shift

For larger feature work with messy inputs, use `09 - Task Brief Authoring` first, then
`08 - Workflow Orchestrator`, then the relevant specialist sequence.

For the longer-term workflow plan, see [Workflow Roadmap.md](./Workflow%20Roadmap.md).

## Compatibility Notes

When the Architecture Guard role changes, propagate updates to:

- `AGENTS.md`
- `docs/ai/general/01 - Architecture Guard Agent.md`
- `.github/agents/architecture-guard.agent.md`
- `.agents/skills/architecture-guard/SKILL.md`
- the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, and `docs/ai/codex/`

When the Security & Auth role changes, propagate updates to:

- `AGENTS.md`
- `docs/ai/general/02 - Security & Auth Agent.md`
- `.github/agents/security-auth.agent.md`
- `.agents/skills/security-auth/SKILL.md`
- the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, and `docs/ai/codex/`

When the Next.js Runtime role changes, propagate updates to:

- `AGENTS.md`
- `docs/ai/general/03 - Next.js Runtime Agent.md`
- `.github/agents/nextjs-runtime.agent.md`
- `.agents/skills/nextjs-runtime/SKILL.md`
- the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, and `docs/ai/codex/`

When the Implementation role changes, propagate updates to:

- `AGENTS.md`
- `docs/ai/general/04 - Implementation Agents.md`
- `.github/agents/implementation-agent.agent.md`
- `.agents/skills/implementation-agent/SKILL.md`
- the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, and `docs/ai/codex/`

When the Validation Strategy role changes, propagate updates to:

- `AGENTS.md`
- `docs/ai/general/05 - Validation Strategy Agent.md`
- `.github/agents/validation-strategy.agent.md`
- `.agents/skills/validation-strategy/SKILL.md`
- the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, and `docs/ai/codex/`

When the Debug Investigation role changes, propagate updates to:

- `AGENTS.md`
- `docs/ai/general/06 - Debug Investigation Agent.md`
- `.github/agents/debug-investigation.agent.md`
- `.agents/skills/debug-investigation/SKILL.md`
- the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, and `docs/ai/codex/`

When the Playwright E2E role changes, propagate updates to:

- `AGENTS.md`
- `docs/ai/general/07 - Playwright E2E Agent.md`
- `.github/agents/playwright-e2e.agent.md`
- `.agents/skills/playwright-e2e/SKILL.md`
- the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, and `docs/ai/codex/`

When the Workflow Orchestrator role changes, propagate updates to:

- `AGENTS.md`
- `docs/ai/general/08 - Workflow Orchestrator Agent.md`
- `.github/agents/workflow-orchestrator.agent.md`
- `.agents/skills/workflow-orchestrator/SKILL.md`
- the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, and `docs/ai/codex/`

When the Task Brief Authoring role changes, propagate updates to:

- `AGENTS.md`
- `docs/ai/general/09 - Task Brief Authoring.md`
- `.agents/skills/task-brief-authoring/SKILL.md`
- `docs/ai/zencoder/09 - Task Brief Authoring.md`
- the non-authoritative guides under `docs/ai/codex/`

When the Safe Refactor workflow changes, propagate updates to:

- `AGENTS.md`
- `docs/ai/general/MODE_MANIFEST.md` when mode behavior or required files change
- `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`
- `.github/prompts/safe-refactor.prompt.md`
- `.agents/skills/safe-refactor-workflow/SKILL.md`
- `.zenflow/workflows/safe-refactor.md`
- the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, and `docs/ai/codex/`

When the Codex workflow layer changes more broadly, also keep these workflow surfaces
in sync when applicable:

- `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`
- `docs/ai/general/Workflow 03 - Security Incident Workflow.md`
- `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`
- `docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md`
- `docs/ai/general/Workflow 06 - Playwright E2E Validation Workflow.md`
- `docs/ai/general/Workflow 07 - Change Validation Workflow.md`
- `docs/ai/general/Workflow 08 - Repository Baseline Validation Workflow.md`
- `docs/ai/general/Workflow 10 - Codacy Security Review Workflow.md`
- `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`
- the matching `.github/prompts/*.prompt.md` files when they exist
- the matching `.agents/skills/*-workflow/SKILL.md` files
- the matching `.zenflow/workflows/*.md` files
