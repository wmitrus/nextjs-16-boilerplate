# Agent Instruction Architecture

## Purpose

This document is the neutral maintenance authority for repository AI
instruction surfaces. It defines which files are runtime entry points, which
files contain shared on-demand knowledge, and how durable instruction changes
must be propagated.

Load this document only when changing AI instructions, skills, workflows,
prompt infrastructure, or propagation rules. It is not normal implementation
context and must not be preloaded for unrelated tasks.

## Authority Boundaries

The repository has independent native runtime entry points:

- `AGENTS.md` is the Codex root entry point;
- `CLAUDE.md` is the Claude Code root entry point.

Neither root file is the semantic authority for the other runtime. Do not make
`CLAUDE.md` import, retrieve, or depend on `AGENTS.md`, and do not make
`AGENTS.md` depend on `CLAUDE.md`.

Shared repository knowledge belongs in focused neutral documents under
`docs/ai/general/` or in an existing domain/feature authority document. Runtime
entry points and skills route to those sources only when the active task needs
them.

Small invariants that both runtimes must know in every session may be
deliberately duplicated in `AGENTS.md` and `CLAUDE.md`. Keep such duplication
short, explicit, and semantically equivalent. Examples include package-manager
choice, preservation of unrelated working-tree changes, destructive-operation
safety, and live code taking precedence over stale documentation.

## Context Layers

Use the following ownership model:

| Layer                                                                 | Purpose                                                           | Loading model                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `AGENTS.md`                                                           | Codex-native operating model, core invariants, and skill routing  | Codex always-on                   |
| `CLAUDE.md`                                                           | Claude-native operating model, core invariants, and skill routing | Claude always-on                  |
| `.agents/skills/*/SKILL.md`                                           | Codex specialist and workflow behavior                            | On demand by task                 |
| `.claude/skills/*/SKILL.md`                                           | Claude specialist and workflow behavior                           | On demand by task                 |
| `docs/ai/general/*.md`                                                | Neutral cross-tool semantic authorities                           | Targeted on demand                |
| Domain, feature, usage, and architecture docs                         | Human and agent implementation evidence                           | Targeted on demand                |
| Tool-specific guides under `docs/ai/{codex,claude,copilot,zencoder}/` | Human-facing discovery and compatibility guidance                 | Maintenance or explicit reference |

Do not use a large shared root document as a hidden startup knowledge base.
Semantic authority and always-on runtime context are separate concerns.

## Role Correspondence

| Role                  | Neutral authority                                     | Codex runtime                                   | Claude Code runtime                             |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Architecture Guard    | `docs/ai/general/01 - Architecture Guard Agent.md`    | `.agents/skills/architecture-guard/SKILL.md`    | `.claude/skills/architecture-guard/SKILL.md`    |
| Security & Auth       | `docs/ai/general/02 - Security & Auth Agent.md`       | `.agents/skills/security-auth/SKILL.md`         | `.claude/skills/security-auth/SKILL.md`         |
| Next.js Runtime       | `docs/ai/general/03 - Next.js Runtime Agent.md`       | `.agents/skills/nextjs-runtime/SKILL.md`        | `.claude/skills/nextjs-runtime/SKILL.md`        |
| Implementation        | `docs/ai/general/04 - Implementation Agents.md`       | `.agents/skills/implementation-agent/SKILL.md`  | `.claude/skills/implementation-agent/SKILL.md`  |
| Validation Strategy   | `docs/ai/general/05 - Validation Strategy Agent.md`   | `.agents/skills/validation-strategy/SKILL.md`   | `.claude/skills/validation-strategy/SKILL.md`   |
| Debug Investigation   | `docs/ai/general/06 - Debug Investigation Agent.md`   | `.agents/skills/debug-investigation/SKILL.md`   | `.claude/skills/debug-investigation/SKILL.md`   |
| Playwright E2E        | `docs/ai/general/07 - Playwright E2E Agent.md`        | `.agents/skills/playwright-e2e/SKILL.md`        | `.claude/skills/playwright-e2e/SKILL.md`        |
| Workflow Orchestrator | `docs/ai/general/08 - Workflow Orchestrator Agent.md` | `.agents/skills/workflow-orchestrator/SKILL.md` | `.claude/skills/workflow-orchestrator/SKILL.md` |
| Task Brief Authoring  | `docs/ai/general/09 - Task Brief Authoring.md`        | `.agents/skills/task-brief-authoring/SKILL.md`  | `.claude/skills/task-brief-authoring/SKILL.md`  |
| Leantime Integration  | `docs/ai/general/10 - Leantime Integration Agent.md`  | `.agents/skills/leantime-integration/SKILL.md`  | `.claude/skills/leantime-integration/SKILL.md`  |

Leantime remains legacy and explicit-use only. Linear is the canonical active
task lifecycle.

## Workflow Correspondence

For workflow `NN`, the neutral authority is
`docs/ai/general/Workflow NN - <Name>.md`. When a runtime implementation exists,
it uses the matching directory name under both `.agents/skills/` and
`.claude/skills/`.

The current paired workflow entry points are:

- `safe-feature-workflow`;
- `safe-refactor-workflow`;
- `security-incident-workflow`;
- `incident-investigation-workflow`;
- `auth-flow-change-review-workflow`;
- `playwright-e2e-validation-workflow`;
- `change-validation-workflow`;
- `repository-baseline-validation-workflow`;
- `codacy-security-review-workflow`;
- `codacy-findings-review-workflow`.

The complete inventory and wider Copilot, Zencoder, and ZenFlow correspondence
remain in `docs/ai/general/REPOSITORY_AI_CONTEXT.md` until that document is
reconciled with this architecture.

## Propagation Rules

When a durable rule changes:

1. Identify its semantic owner before editing runtime surfaces.
2. Update the focused neutral authority or domain authority first.
3. Update only the skills and workflows whose behavior or retrieval routing is
   affected.
4. Update `AGENTS.md` only when the change is required in every Codex session.
5. Update `CLAUDE.md` only when the change is required in every Claude Code
   session.
6. If the same small invariant is required by both runtimes, update both roots
   in the same change and verify semantic equivalence.
7. Update human-facing tool guides when their discovery, compatibility, or
   maintenance description changed.
8. Do not propagate a rule to every surface merely because it is
   repository-wide; task-specific repository-wide rules still belong in
   neutral on-demand authorities and applicable skills.

Security rules remain authoritative in
`docs/ai/general/SECURITY_CODING_PATTERNS.md`. Implementation anti-patterns
remain authoritative in
`docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md`. Runtime entry points and
skills should link to targeted sections rather than duplicate either catalogue.

Time-bound unresolved security maintenance belongs in
`docs/ai/general/SECURITY_FOLLOW_UPS.md` and the canonical Linear issue, not in
runtime roots.

## Runtime Isolation Invariants

- Claude runtime surfaces (`CLAUDE.md` and `.claude/skills/**`) must not depend
  on `AGENTS.md`.
- Codex runtime surfaces (`AGENTS.md` and `.agents/skills/**`) must not depend
  on `CLAUDE.md`.
- A runtime skill inherits its own native root entry point; it must not instruct
  the agent to reload that root.
- Runtime skills may differ where tool behavior differs. Do not mechanically
  copy tool permissions, invocation metadata, model selection, shell behavior,
  or temporary runtime-specific blockers between Claude and Codex.
- Neutral documents describe repository semantics, not tool-specific startup
  behavior.

## Maintenance Validation

An instruction-architecture change is not complete until all applicable checks
pass:

1. Every expected role and workflow has the intended neutral and runtime entry
   points.
2. Claude runtime surfaces contain no `AGENTS.md` dependency.
3. Codex runtime surfaces contain no `CLAUDE.md` dependency.
4. Root entry points remain intentionally small and contain only always-on
   instructions and routing.
5. Skills use progressive disclosure and do not preload unrelated catalogues or
   specialist documents.
6. Links and referenced paths resolve.
7. Human-facing tool guides describe the actual runtime architecture.
8. Deprecated `.zencoder/rules/` files are not restored as active authorities.

Run `pnpm ai:instructions:check` for the automated runtime-isolation, root-size,
skill-pairing, and `SKILL.md` presence guards. The check is part of pull-request
validation and is also invoked by the repository architecture lint.

When a temporary compatibility rule or runtime blocker is introduced, name the
affected runtime, record how it will be revalidated, and remove it once the
underlying condition no longer reproduces.
