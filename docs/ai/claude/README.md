# Claude Code Skill Quick Start

> **IMPORTANT — THIS DIRECTORY CONTAINS DESCRIPTION GUIDES, NOT THE REAL SKILLS.**
>
> The files in `docs/ai/claude/` explain what each Claude-facing repository
> skill does and when to use it. They do **not** control behavior by
> themselves.
>
> **The real Claude Code skills are in `.claude/skills/`.**
> All rule changes, security rules, and behavioral updates MUST be applied
> to the real skill files and the shared authority docs — never to this
> guide layer alone.

This directory is the human-facing quick-start guide for the repository's
Claude Code skill layer, mirroring `docs/ai/codex/README.md` for the
Codex-native surface and `docs/ai/copilot/README.md` for the Copilot-native
surface.

Use it when you want to understand which repo-local Claude skill to invoke
before working in the repo — or read `CLAUDE.md` at the repository root
first, which is the actual bridge into `AGENTS.md` and this whole system.

## Current Scope

This Claude Code compatibility layer covers the full numbered specialist
set, the Leantime Integration role, and the current workflow set — the same
catalogue Codex already supports, ported skill-for-skill (see
`.copilot/tasks/2026-08-20-claude-code-agents-skills-setup/` for how and
why).

**One correction versus Codex's own guide layer**: `.agents/README.md`'s
skill inventory omits `leantime-integration`, even though
`.agents/skills/leantime-integration/SKILL.md` exists. This directory
includes it (see `10 - Leantime Integration Agent.md` below) rather than
repeating that omission.

### Specialist Skills

- [01 - Architecture Guard Agent.md](./01%20-%20Architecture%20Guard%20Agent.md) → [`.claude/skills/architecture-guard/SKILL.md`](../../../.claude/skills/architecture-guard/SKILL.md)
- [02 - Security & Auth Agent.md](./02%20-%20Security%20%26%20Auth%20Agent.md) → [`.claude/skills/security-auth/SKILL.md`](../../../.claude/skills/security-auth/SKILL.md)
- [03 - Next.js Runtime Agent.md](./03%20-%20Next.js%20Runtime%20Agent.md) → [`.claude/skills/nextjs-runtime/SKILL.md`](../../../.claude/skills/nextjs-runtime/SKILL.md)
- [04 - Implementation Agents.md](./04%20-%20Implementation%20Agents.md) → [`.claude/skills/implementation-agent/SKILL.md`](../../../.claude/skills/implementation-agent/SKILL.md)
- [05 - Validation Strategy Agent.md](./05%20-%20Validation%20Strategy%20Agent.md) → [`.claude/skills/validation-strategy/SKILL.md`](../../../.claude/skills/validation-strategy/SKILL.md)
- [06 - Debug Investigation Agent.md](./06%20-%20Debug%20Investigation%20Agent.md) → [`.claude/skills/debug-investigation/SKILL.md`](../../../.claude/skills/debug-investigation/SKILL.md)
- [07 - Playwright E2E Agent.md](./07%20-%20Playwright%20E2E%20Agent.md) → [`.claude/skills/playwright-e2e/SKILL.md`](../../../.claude/skills/playwright-e2e/SKILL.md)
- [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md) → [`.claude/skills/workflow-orchestrator/SKILL.md`](../../../.claude/skills/workflow-orchestrator/SKILL.md)
- [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md) → [`.claude/skills/task-brief-authoring/SKILL.md`](../../../.claude/skills/task-brief-authoring/SKILL.md)
- `10 - Leantime Integration Agent` → [`.claude/skills/leantime-integration/SKILL.md`](../../../.claude/skills/leantime-integration/SKILL.md) (no dedicated guide file yet — mirrors the fact that `docs/ai/codex/` doesn't have one either; read the skill file directly)

### Workflow Skills

- [Workflow 01 - Safe Feature Workflow.md](./Workflow%2001%20-%20Safe%20Feature%20Workflow.md) → [`.claude/skills/safe-feature-workflow/SKILL.md`](../../../.claude/skills/safe-feature-workflow/SKILL.md)
- [Workflow 02 - Safe Refactor Workflow.md](./Workflow%2002%20-%20Safe%20Refactor%20Workflow.md) → [`.claude/skills/safe-refactor-workflow/SKILL.md`](../../../.claude/skills/safe-refactor-workflow/SKILL.md)
- [Workflow 03 - Security Incident Workflow.md](./Workflow%2003%20-%20Security%20Incident%20Workflow.md) → [`.claude/skills/security-incident-workflow/SKILL.md`](../../../.claude/skills/security-incident-workflow/SKILL.md)
- [Workflow 04 - Incident Investigation Workflow.md](./Workflow%2004%20-%20Incident%20Investigation%20Workflow.md) → [`.claude/skills/incident-investigation-workflow/SKILL.md`](../../../.claude/skills/incident-investigation-workflow/SKILL.md)
- [Workflow 05 - Auth Flow Change Review Workflow.md](./Workflow%2005%20-%20Auth%20Flow%20Change%20Review%20Workflow.md) → [`.claude/skills/auth-flow-change-review-workflow/SKILL.md`](../../../.claude/skills/auth-flow-change-review-workflow/SKILL.md)
- [Workflow 06 - Playwright E2E Validation Workflow.md](./Workflow%2006%20-%20Playwright%20E2E%20Validation%20Workflow.md) → [`.claude/skills/playwright-e2e-validation-workflow/SKILL.md`](../../../.claude/skills/playwright-e2e-validation-workflow/SKILL.md)
- [Workflow 07 - Change Validation Workflow.md](./Workflow%2007%20-%20Change%20Validation%20Workflow.md) → [`.claude/skills/change-validation-workflow/SKILL.md`](../../../.claude/skills/change-validation-workflow/SKILL.md)
- [Workflow 08 - Repository Baseline Validation Workflow.md](./Workflow%2008%20-%20Repository%20Baseline%20Validation%20Workflow.md) → [`.claude/skills/repository-baseline-validation-workflow/SKILL.md`](../../../.claude/skills/repository-baseline-validation-workflow/SKILL.md)
- [Workflow 10 - Codacy Security Review Workflow.md](./Workflow%2010%20-%20Codacy%20Security%20Review%20Workflow.md) → [`.claude/skills/codacy-security-review-workflow/SKILL.md`](../../../.claude/skills/codacy-security-review-workflow/SKILL.md)
- [Workflow 11 - Codacy Findings Review Workflow.md](./Workflow%2011%20-%20Codacy%20Findings%20Review%20Workflow.md) → [`.claude/skills/codacy-findings-review-workflow/SKILL.md`](../../../.claude/skills/codacy-findings-review-workflow/SKILL.md)

**Workflow 09 - Architecture Lint has no Claude skill**, matching Codex,
which also has none — only `.zenflow/workflows/architecture-lint.md` and
`docs/ai/general/Workflow 09 - Architecture Lint Workflow.md` exist for it
today. Not a Claude-specific gap.

## Recommended Starting Points

- unclear bug or intermittent failure: [06 - Debug Investigation Agent.md](./06%20-%20Debug%20Investigation%20Agent.md)
- architecture or boundary review: [01 - Architecture Guard Agent.md](./01%20-%20Architecture%20Guard%20Agent.md)
- auth, trust-boundary, tenant, or sensitive-data review: [02 - Security & Auth Agent.md](./02%20-%20Security%20%26%20Auth%20Agent.md)
- App Router, route-handler, proxy, server-action, or caching review: [03 - Next.js Runtime Agent.md](./03%20-%20Next.js%20Runtime%20Agent.md)
- concrete code changes under established constraints: [04 - Implementation Agents.md](./04%20-%20Implementation%20Agents.md)
- minimum safe validation scope: [05 - Validation Strategy Agent.md](./05%20-%20Validation%20Strategy%20Agent.md)
- real-browser verification and scenario-mapped Playwright evidence: [07 - Playwright E2E Agent.md](./07%20-%20Playwright%20E2E%20Agent.md)
- multi-step sequencing, delegation, and artifact continuity: [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md)
- requirements normalization before orchestration: [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md)
- non-trivial feature delivery with a fast path for small changes: [Workflow 01 - Safe Feature Workflow.md](./Workflow%2001%20-%20Safe%20Feature%20Workflow.md)
- behavior-preserving refactor or cleanup: [Workflow 02 - Safe Refactor Workflow.md](./Workflow%2002%20-%20Safe%20Refactor%20Workflow.md)
- security incident handling: [Workflow 03 - Security Incident Workflow.md](./Workflow%2003%20-%20Security%20Incident%20Workflow.md)
- messy production bug or regression triage: [Workflow 04 - Incident Investigation Workflow.md](./Workflow%2004%20-%20Incident%20Investigation%20Workflow.md)
- auth or onboarding flow changes: [Workflow 05 - Auth Flow Change Review Workflow.md](./Workflow%2005%20-%20Auth%20Flow%20Change%20Review%20Workflow.md)
- browser-first verification as the main deliverable: [Workflow 06 - Playwright E2E Validation Workflow.md](./Workflow%2006%20-%20Playwright%20E2E%20Validation%20Workflow.md)
- validation-only closure after implementation is done: [Workflow 07 - Change Validation Workflow.md](./Workflow%2007%20-%20Change%20Validation%20Workflow.md)
- periodic repository health review: [Workflow 08 - Repository Baseline Validation Workflow.md](./Workflow%2008%20-%20Repository%20Baseline%20Validation%20Workflow.md)
- task lifecycle (canonical, non-trivial work): Linear — see `AGENTS.md` and the `Linear Task Operating Model`; `10 - Leantime Integration Agent` is legacy/explicit-use only

## 08 vs 09

Choose [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md)
when the task already has a usable brief and the main need is sequencing
specialists, maintaining artifacts, and coordinating execution.

Choose [09 - Task Brief Authoring.md](./09%20-%20Task%20Brief%20Authoring.md)
when the task is still messy and needs scope, scenarios, acceptance
criteria, constraints, and evidence expectations normalized before
orchestration starts.

## Claude Code Delegation Note

Claude Code can spawn real subagents through its `Agent` tool, with
dedicated `.claude/agents/*.md` identities — a more capable delegation
model than Codex's skill-only approach, in principle. This repository has
not yet built those dedicated subagent identities for these roles (an
explicit open question in
`.copilot/tasks/2026-08-20-claude-code-agents-skills-setup/intake.md`), so
today delegation means the same thing it does for Codex: invoke the
relevant `.claude/skills/` role directly within the current session with an
explicit, bounded scope, rather than spawning a named role-bound identity.
Full detail in [08 - Workflow Orchestrator Agent.md](./08%20-%20Workflow%20Orchestrator%20Agent.md#claude-code-delegation-note).

## Feature Workflow Guidance

Use `Workflow 01 - Safe Feature` as the default for non-trivial feature
work, not for every tiny change.

Good default for `Workflow 01 - Safe Feature`:

- medium features
- cross-file behavior changes
- anything that may touch boundaries, auth, runtime, caching, or tests

Skip the full feature workflow when the change is clearly small and
low-risk:

- one or two files
- no auth or security impact
- no runtime-placement or caching risk
- no contract or DI changes
- no meaningful public behavior shift

For larger feature work with messy inputs, use `09 - Task Brief Authoring`
first, then `08 - Workflow Orchestrator`, then the relevant specialist
sequence.

## Where Each Skill's Own Propagation List Lives

Every ported `.claude/skills/*/SKILL.md` file carries its own "Compatibility
Notes" section naming exactly which files to update when that role or
workflow changes (mirroring the equivalent section in its Codex source).
This README doesn't duplicate that per-skill detail — for the authoritative,
cross-tool version of the same information, see:

- `AGENTS.md` → "Agent Infrastructure — Where to Propagate Rules" and
  "Agent Numbering and File Correspondence"
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md` → the matching tables
- `docs/ai/codex/README.md` → the Codex-side "Compatibility Notes" section,
  which follows the same per-role/workflow propagation-list pattern

## Compatibility Notes

- `AGENTS.md` remains the primary always-applied context for all tools.
- `docs/ai/general/*.md` remains the shared, neutral prompt/workflow source
  for every role and workflow listed above.
- This directory (`docs/ai/claude/`) is the human-facing guide layer for
  Claude Code, mirroring `docs/ai/codex/`, `docs/ai/copilot/`, and
  `docs/ai/zencoder/` for their respective tools.
- `.claude/skills/*/SKILL.md` is the Claude-native runtime surface;
  `.agents/skills/*/SKILL.md` remains its Codex-native sibling.

When a role or workflow changes, propagate updates to every location listed
in that role's own `.claude/skills/<name>/SKILL.md` "Compatibility Notes"
section, and to this directory's matching guide file.
