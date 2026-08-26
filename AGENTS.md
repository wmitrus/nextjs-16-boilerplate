# Codex Repository Entry Point

This file is the Codex-native root instruction surface for this repository.
Shared repository semantics live in focused neutral authorities under
`docs/ai/general/` and in domain documentation. Load them only when the active
task requires them.

## Core Operating Model

For non-trivial work:

1. Classify the task and use the narrowest applicable repository skill or
   workflow under `.agents/skills/`.
2. Inspect live code, tests, configuration, and runtime evidence relevant to
   the task.
3. Load only the focused neutral documents and catalogue sections required for
   the current risk or decision.
4. Expand context when existing evidence is incomplete or contradictory.
5. Validate at the narrowest level that can meaningfully falsify the changed
   behavior, then expand according to risk.

Do not preload unrelated skills, catalogues, workflow documents, historical
artifacts, or large repository guides.

## Always-On Invariants

- Use `pnpm` for repository scripts and dependency operations.
- Preserve unrelated and pre-existing working-tree changes.
- Inspect surrounding code and existing patterns before proposing or making a
  change.
- Prefer the smallest production-grade change that satisfies the confirmed
  requirement.
- Preserve module ownership, dependency direction, runtime placement, and low
  blast radius.
- Live code, executable configuration, tests, and observed runtime behavior are
  authoritative. Documentation may drift; report conflicts explicitly.
- Distinguish confirmed evidence, assumptions, hypotheses, and unresolved
  uncertainty.
- Do not weaken tests, security controls, authorization, tenant isolation, or
  quality gates to make a change pass.
- Do not expose, log, copy, or commit secrets or credential-shaped values.
- Do not commit, push, merge, rebase, force-push, deploy, reset, clean, discard
  changes, or perform destructive operations unless the user explicitly asks.

When a requested approach conflicts with architecture, security, runtime, or
data-integrity constraints, explain the conflict and propose the minimum safe
alternative.

## Skill And Workflow Routing

Repository runtime skills are under `.agents/skills/`. Their metadata controls
routing; do not load a skill body until it is relevant.

Common routes:

- architecture, module boundaries, DI, provider isolation:
  `architecture-guard`;
- auth, authorization, tenancy, secrets, file/URL trust boundaries:
  `security-auth`;
- App Router, RSC, caching, route handlers, server actions, proxy/runtime:
  `nextjs-runtime`;
- focused production implementation: `implementation-agent`;
- minimum safe validation scope: `validation-strategy`;
- ambiguous failures and root-cause analysis: `debug-investigation`;
- browser and cross-layer E2E evidence: `playwright-e2e`;
- multi-step sequencing: `workflow-orchestrator`;
- task normalization and acceptance criteria: `task-brief-authoring`.

For non-trivial feature work, prefer `safe-feature-workflow`. For
behavior-preserving refactors, prefer `safe-refactor-workflow`. Use the more
specific incident, auth-flow, validation, or Codacy workflow when its task shape
matches.

If no Codex-native skill covers the required role, load the matching neutral
authority under `docs/ai/general/` directly.

## Task Lifecycle

Linear is the canonical active-task state for this repository.

- Ensure a canonical Linear issue exists before active non-trivial work: fetch
  a known `OZI-NN`, promote an existing inbox entry while preserving its ID and
  reconciliation contract, or create and triage the issue.
- Record material decisions, root causes, implementation milestones, important
  test results, blockers, and material direction changes as Linear comments.
  Do not record a command-by-command transcript.
- Parent workflows own lifecycle when invoking child specialists; do not
  duplicate lifecycle handling in every child skill.
- Resume the existing Linear state for continued work.
- `scripts/ai-tooling/` inbox capture is pre-task only and never a parallel
  active-task state.

Leantime is legacy and explicit-use only. Do not invoke it unless the user asks
for a Leantime operation or historical-task migration.

## Evidence And Scope

- Establish root cause before remediation for ambiguous bugs or failures.
- Use the exact source, raw logs, runtime output, or authoritative external
  documentation when omitted detail could change the conclusion.
- Reuse existing helpers, patterns, platform capabilities, and dependencies
  before adding new abstractions.
- Do not add flags, dependencies, extension points, or configuration without a
  demonstrated need.
- Keep unrelated formatting and cleanup out of scope unless repository tooling
  requires it.
- Inspect the final diff before completing implementation work.

For CI, pull-request checks, GitHub Actions, artifacts, or deployment evidence,
use `docs/ai/general/CI_CD_EVIDENCE_RETRIEVAL.md`. Retrieve metadata first and
keep full logs out of model context unless focused extraction is insufficient.

## Security And High-Risk Work

Treat authentication, authorization, tenancy, sensitive data, secrets,
redirects, dynamic file access, configurable outbound URLs, route handlers,
scripts, persistence, migrations, deployment, and production configuration as
high-risk surfaces.

- Enforce authorization server-side.
- Do not trust client input as tenant, organization, permission, or resource
  authority.
- Identify where identity is established, scope is derived, policy is enforced,
  and failure paths are handled.
- Keep tenant/resource scope in the database statement that accesses or mutates
  the row.
- Do not move sensitive logic into client code or treat UI visibility as
  authorization.
- Do not read `.env*` files unless exact environment evidence is required.
- Do not bypass hooks, safeguards, scanners, tests, or assertions instead of
  correcting the underlying issue.
- Do not perform destructive data operations, production migrations,
  deployments, or secret changes without explicit authorization.

Use `security-auth` and retrieve only applicable entries from
`docs/ai/general/SECURITY_CODING_PATTERNS.md`. Do not preload the full catalogue
for unrelated work.

## Next.js And Runtime

This repository uses Next.js 16 App Router. Verify live `next.config.ts` before
reasoning about version-sensitive behavior or Cache Components.

- Request interception lives in `src/proxy.ts`, not `middleware.ts`.
- Do not use route-segment `dynamic` or `runtime` exports when the active build
  configuration enables `cacheComponents`.
- In async RSC paths calling `getAppContainer()`, establish request-time access
  first; use `await connection()` when no request-bound API is otherwise needed.
- Preserve server/client boundaries and do not place server-only code in client
  bundles.
- Verify caching and revalidation behavior for user-, auth-, or tenant-sensitive
  data.

Use `nextjs-runtime` and targeted sections of
`docs/ai/general/NEXTJS_IMPLEMENTATION_PLAYBOOK.md` for implementation details.

## Database, Scripts, And Environment

- Use `docs/ai/general/DATABASE_AND_SCHEMA_PATTERNS.md` for Drizzle schemas,
  UUID-backed route parameters, migrations, constraints, and DB adapter tests.
- Use `docs/ai/general/SCRIPT_IMPLEMENTATION_PATTERNS.md` for environment
  loading, import-safe script entry points, filesystem confinement, dynamic
  environment access, and configurable outbound URLs.
- Use `src/core/env.ts` and existing environment conventions; do not introduce
  ad-hoc runtime environment access outside approved infrastructure.
- When changing environment variables, update the schema and templates and
  validate build-time and deployed-runtime requirements separately.
- Do not add, remove, or upgrade dependencies unless required and justified.
- Do not modify lockfiles incidentally.

## Validation And Completion

Use risk-based validation defined by
`docs/ai/general/VALIDATION_AND_QUALITY_GATES.md`.

- Prefer focused checks during implementation.
- Expand validation as risk, scope, or uncertainty increases.
- Do not claim success from static inspection when executable validation exists.
- Treat failing validation as evidence to investigate.
- Validate the real server, persistence, runtime, caching, deployment, or
  cross-layer boundary for high-risk changes.
- For substantial phase close, run repository-wide `pnpm lint --fix` and
  `pnpm typecheck` unless the active workflow specifies a different exact
  contract or an observed runtime failure prevents completion.
- Report exactly what ran, what passed or failed, what was not run, and why.

A task is complete only when the requested behavior is implemented, intended
scope is verified, applicable validation passes, no unrelated changes were
introduced, and residual risk is disclosed.

## Context And Usage Discipline

- Start with the smallest sufficient context and expand only when evidence is
  insufficient.
- Prefer targeted sections, exact files, focused searches, and the narrowest
  applicable skill.
- Do not reread information already available and still reliable in the current
  session.
- Treat indexes, generated artifacts, caches, compressed output, and code-graph
  results as discovery evidence; live source remains authoritative.
- For large output, inspect the smallest causal slice first and retain a path to
  raw evidence.
- Do not save context by omitting evidence required for correctness, security,
  or validation.

## Deferred Ideas And Reporting

`docs/ai/general/POSSIBLE_ENHANCEMENTS.md` is the holding area for valuable
ideas outside current scope. Do not load it merely because work started, and do
not implement deferred ideas without explicit scope or user approval.

Lead responses with the result, finding, or decision. Keep output proportional
to the task while disclosing material risks, failed validation, and unresolved
uncertainty. Review findings should be ordered by severity and separate
must-fix issues from follow-up work.

All fenced code blocks in committed markdown must include a language
identifier.

## Agent Infrastructure Maintenance

Instruction propagation is maintenance context, not normal task context.

When changing roots, skills, workflows, prompts, or neutral authorities, use
`docs/ai/general/AGENT_INSTRUCTION_ARCHITECTURE.md`. Keep Codex and Claude
runtime surfaces independent, update only applicable consumers, and do not
restore deprecated `.zencoder/rules/` files as active authorities.
