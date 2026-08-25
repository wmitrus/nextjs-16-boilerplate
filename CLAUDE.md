# Claude Code — Repository Entry Point

`AGENTS.md` is the authoritative cross-agent repository knowledge base.
Do not preload it in full by default.

## Core Operating Model

For non-trivial work:

1. Classify the task and invoke the narrowest applicable `.claude/skills/` skill or workflow.
2. Read only the `AGENTS.md` sections and supporting docs required for that task.
3. Inspect live code before concluding; code wins over documentation on drift.
4. Escalate context only when current evidence is insufficient.
5. Do not preload unrelated skills, guides, workflows, historical artifacts, or specialist docs.

Repository-wide invariants:

- Use `pnpm`.
- Preserve unrelated or pre-existing dirty working-tree changes.
- Middleware-style interception lives in `src/proxy.ts`, not `middleware.ts`.
- Do not weaken tests, security controls, authorization, tenancy boundaries, or quality gates to make a change pass.
- Do not commit, push, merge, rebase, force-push, deploy, reset, clean, discard changes, or perform destructive operations unless explicitly requested.

## Skill and Workflow Routing

Use repository-native skills from `.claude/skills/`.

- Prefer the narrowest applicable skill/workflow and rely on its metadata for routing.
- Do not load a skill body or its supporting docs until that skill is relevant.
- For non-trivial feature work, `safe-feature-workflow` is the default unless the change is clearly small, local, and low-risk.
- For ambiguous bugs or regressions, prefer `debug-investigation` before implementation.
- If no Claude-native skill exists for a required role/workflow, use the matching neutral source under `docs/ai/general/`.

## Task Lifecycle

Linear is the canonical active-task state for this repository.

- Ensure a canonical Linear issue exists before starting active work — fetch a known `OZI-NN`, promote an existing inbox entry (preserving its Inbox ID and completing the canonical write-back), or create/triage per the `Linear Task Operating Model`.
- Record material progress checkpoints (a decision, root cause, implementation milestone, important test result, blocker, or material change of direction) as Linear comments — not a transcript, not per command.
- The inbox (`scripts/ai-tooling/`) is pre-task capture only — never a runtime dependency of active work.
- Leantime is not part of the active AI task lifecycle. Do not invoke it automatically. It remains available for explicit, user-requested Leantime operations or historical-task migration — see `docs/ai/general/LEANTIME_AUTOMATION.md` (legacy/manual-use only).

## Evidence, Scope, and Implementation

Repository code and observed runtime behavior are authoritative. Docs, prompts, ADRs, reports, artifacts, summaries, indexes, and compressed output are supporting evidence and may drift or omit detail.

- Inspect live code before implementation decisions.
- Separate confirmed evidence, assumptions, and hypotheses.
- For ambiguous failures, establish root cause before remediation.
- If docs conflict with code, trust the code and report the drift.
- Escalate to exact source, raw logs, or runtime evidence whenever omitted detail could change the conclusion.
- Build the smallest correct production-grade change that satisfies the confirmed requirement.
- Understand the relevant flow before editing.
- Reuse existing patterns, utilities, platform capabilities, and installed dependencies before adding new code.
- Prefer a focused diff over broad cleanup or speculative refactoring.
- Do not add abstractions, flags, configuration, dependencies, or extension points without demonstrated need.
- Do not solve adjacent problems unless required for correctness, security, or requested behavior.
- Do not hide root cause with a workaround when the underlying defect can be corrected safely.
- Do not remove defensive behavior merely because the current happy path does not require it.
- Do not accidentally change public contracts, persistence shape, runtime placement, caching behavior, or dependency boundaries.
- Keep unrelated formatting/cleanup out of scope unless repository tooling requires it.
- Before finishing implementation work, inspect the final diff and verify that only intended changes are included.

## Validation and Definition of Done

Use risk-based validation appropriate to the change.

- Prefer the narrowest validation that can reliably falsify changed behavior during implementation.
- Expand validation as risk, scope, or uncertainty increases.
- Use the repository validation skill/workflow for substantial changes and sign-off.
- Do not run the full repository validation suite after every small edit.
- Do not claim success from static inspection when executable validation exists.
- Do not weaken, skip, delete, or rewrite tests merely to make a change pass.
- Treat failing validation as evidence to investigate.
- For security-, auth-, tenancy-, persistence-, runtime-, caching-, deployment-, or cross-layer changes, validate the actual affected boundary rather than relying only on isolated unit tests.
- When repository-wide phase-close validation applies and the active workflow does not define an exact lint command, run `pnpm lint --fix` (never plain `pnpm lint`) and `pnpm typecheck`; use the validation skill to determine additional gates.
- Report exactly what was validated, what was not, and any remaining uncertainty.

A task is complete only when requested behavior is implemented, intended scope is verified, relevant validation passes, and no unrelated changes were introduced.

## Security and High-Risk Operations

Treat authentication, authorization, tenancy, sensitive data, secrets, redirects, file access, route handlers, scripts, persistence, deployment, and production-facing configuration as high-risk surfaces.

- Use the relevant security skill/workflow before non-trivial security-sensitive changes.
- Do not preload the full security catalogue unless the active task requires it.
- Preserve trust boundaries, authorization checks, tenant isolation, validation, audit behavior, and defensive controls unless the requirement explicitly changes them.
- Never expose, log, copy, or commit secrets/credentials.
- Do not read `.env*` files unless exact environment evidence is required.
- Do not bypass hooks, validation, safeguards, or security controls.
- Do not use `--no-verify`, disable tests, suppress findings, or weaken assertions instead of fixing the issue.
- Do not perform destructive data operations, production migrations, deployments, secret changes, or irreversible infrastructure actions without explicit authorization.
- When exact security behavior depends on wording, ordering, identifiers, runtime state, or raw output, inspect original evidence before concluding.

## Next.js and Runtime Invariants

- This repository uses Next.js 16 App Router. Check live `next.config.ts` before reasoning about Cache Components: the current build config enables `cacheComponents` for cache-compatible/default builds and disables it for `CSP_SCRIPT_MODE=nonce-dynamic`.

- Request interception lives in `src/proxy.ts`; absence of `middleware.ts` is not a finding.
- Do not add `export const dynamic` or `export const runtime` to App Router route segments while `cacheComponents: true` is enabled.
- In async RSC paths calling `getAppContainer()`, establish request-time access first. Use `await connection()` when no request-bound API such as `headers()`, `cookies()`, or `searchParams` is otherwise required.
- Before changing App Router runtime placement, caching, route handlers, server actions, RSC behavior, or interception, use `nextjs-runtime` and inspect the live implementation.
- For version-sensitive or unclear Next.js behavior, verify current repository configuration and authoritative docs rather than relying on framework memory.

## Package Manager, Environment, and Tooling

- Use `pnpm` for project dependency operations and repository scripts; do not use npm/yarn for them.
- Use `src/core/env.ts` and existing env conventions; do not introduce direct `process.env` access outside approved infrastructure.
- When adding/changing env vars, update the repository schema/template and validate consistency with existing tooling.
- Do not add, remove, or upgrade dependencies unless required and justified.
- Do not modify lockfiles incidentally.
- Prefer existing repository scripts over ad-hoc replacements that perform the same operation.
- Treat generated artifacts, caches, build output, and tool indexes as non-authoritative unless the task concerns them.
- Do not assume a CLI, local service, MCP server, or integration is unavailable because a broad search missed it; verify the configured entrypoint/path first.

## Context and Usage Discipline

Minimize context consumption without reducing correctness.

- Use progressive disclosure: start with the smallest sufficient context and expand only when evidence is insufficient.
- Do not read large repository documents in full by default.
- Prefer targeted sections, exact files, focused searches, and the narrowest applicable skill.
- Avoid re-reading information already available and still reliable in the current session.
- When a skill references shared docs, read only the portions required for the task unless the skill explicitly depends on the whole document.
- For source-code discovery, topology, callers/callees, and impact analysis,
  prefer project CodeGraph first when available.
- Use targeted search/find for exact text, documentation, instructions, task
  artifacts, and content not represented well by the code graph.
- Treat CodeGraph as discovery evidence; live source remains authoritative.
  If CodeGraph reports stale/pending files or conflicts with live evidence,
  read the affected source directly.
- Rely on CodeGraph auto-sync during normal work. Do not run `codegraph sync`
  before every task or edit; use manual sync only as a recovery fallback.
- For large logs/command output, inspect the smallest relevant slice first and escalate to raw/full output only when needed.
- Start a fresh session for a materially different task instead of carrying unrelated context forward.
- Do not save usage by omitting evidence required for correctness, security, or validation.

## Deferred Ideas, Alerts, and Reporting

`docs/ai/general/POSSIBLE_ENHANCEMENTS.md` holds valuable ideas outside current scope.

- Do not implement deferred/untriaged ideas on your own initiative.
- Reuse an existing backlog entry when one already covers the idea.
- Read the backlog only when the task surfaces a deferred idea, requires triage, or explicitly concerns an enhancement.

Current alert:

- For security-adjacent work on or after **2026-08-26**, check `AGENTS.md` → `Pending Scheduled Security Follow-Ups` before completion.
- Do not assume the current Next.js version contains the announced fix without repository evidence or authoritative release information.
- Remove this pointer when that authoritative follow-up is retired.

Response/session rules:

- Lead with the result, finding, or decision; keep output proportional to the task.
- For implementation, report what changed, why, what was validated, and what remains uncertain.
- For investigations, separate evidence, hypotheses, and conclusions.
- Never omit a material risk, failed validation, unresolved uncertainty, or security concern merely to stay brief.
- Keep each session focused on one coherent task or tightly related task group.
- If the objective changes materially, re-evaluate active skills/workflows/context.
- When manual `/compact` is useful, use it at logical boundaries and preserve confirmed requirements, accepted decisions, confirmed root cause, intentionally changed files, validation results, and unresolved risks—not rejected hypotheses, duplicated output, superseded plans, or unrelated history.
- Do not escalate a small local task into a full workflow merely because one exists; escalate if scope/risk grows.

## Agent Infrastructure Maintenance

Agent-rule propagation is maintenance context, not normal task context.

- Load propagation docs only when changing shared AI instructions, skills, workflows, or agent infrastructure.
- `AGENTS.md` remains authoritative for cross-tool propagation requirements.
- When modifying a role/workflow, update required tool-specific runtime surfaces according to its compatibility notes.
- Do not duplicate propagation tables or full agent inventories here.
- Do not create `.claude/agents/*.md` identities unless the task explicitly covers the deferred subagent architecture.
