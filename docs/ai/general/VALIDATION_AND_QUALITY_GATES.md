# Validation and Quality Gates

## Purpose

This document is the neutral cross-tool authority for repository validation and
quality-gate selection. It defines the shared validation contract without
forcing every task to run every available check.

Use the narrowest applicable validation skill or workflow for substantial
validation planning. Load specialist testing, security, auth-flow, runtime, and
deployment documents only when the affected risk requires them.

Live source, tests, package scripts, hooks, and CI workflows are authoritative.
If this document drifts from the executable repository configuration, follow
the live configuration and report the drift.

## Validation Principles

Choose the smallest validation set that can meaningfully falsify the real risk.

Always:

- identify the behavior and failure mode being validated;
- inspect the affected implementation, existing tests, and executable config;
- match the validation level to the affected boundary;
- distinguish required validation, optional additional confidence, and checks
  that are not relevant;
- expand validation when scope, risk, or uncertainty increases;
- treat failures as evidence to investigate rather than obstacles to bypass;
- report exactly what ran, what passed or failed, what was skipped, and why;
- inspect the final diff before completion.

Do not:

- claim success from static inspection when executable evidence is available;
- use client or UI assertions as the only proof of server authorization;
- accept mocked unit tests as the only evidence for a cross-layer or
  persistence-sensitive behavior;
- broaden E2E coverage without naming the additional risk it detects;
- weaken tests, assertions, security controls, or quality gates to obtain a
  passing result;
- hide a failed or unavailable gate;
- mix unrelated cleanup into a behavioral change merely because validation
  exposed it.

## Validation Modes

### Change Validation

Use for a feature, fix, refactor, migration, dependency change, or scanner
remediation.

Start with focused checks covering the changed behavior. Expand to adjacent
integration, runtime, or repository-wide gates only when the change's blast
radius or failure mode justifies them.

### Repository Baseline Validation

Use for repository-wide posture, CI governance, quality-gate coverage, or a
requested full baseline.

Review unit, integration, database, Storybook, E2E, lint, type, architecture,
dependency, environment, build, and CI surfaces as applicable. A baseline audit
may identify gaps without implementing fixes unless implementation is in scope.

## Standard Repository Commands

Verify commands against the current `package.json` before execution.

| Concern | Current command | Notes |
| --- | --- | --- |
| Lint with repository fixes | `pnpm lint --fix` | Preferred interactive/phase-close lint command; report remaining errors and warnings. |
| Type safety | `pnpm typecheck` | Runs Next.js type generation before `tsc --noEmit`. |
| Unit tests | `pnpm test` | Vitest unit configuration with coverage. |
| Integration tests | `pnpm test:integration` | Integration configuration with coverage. |
| Database tests | `pnpm test:db` | Select a more specific DB profile when the task requires it. |
| All Vitest projects | `pnpm test:all` | Broad validation; do not run after every local edit. |
| Storybook tests | `pnpm test:storybook` | Use when component/story behavior is affected. |
| E2E | Repository scenario/package command | Prefer scenario-owned setup over raw Playwright. |
| Production build | `pnpm build` | Use when build/runtime integration risk warrants it. |
| Environment consistency | `pnpm env:check` | Required when env contracts or deployment configuration change. |
| Dependency graph | `pnpm skott:check:only` | Detects circular dependencies through the configured source graph. |
| Unused dependencies | `pnpm depcheck` | Interpret findings against live usage and configuration. |
| Circular imports | `pnpm madge` | Uses the repository's configured source extensions. |

Do not treat this table as permission to run every command automatically. The
active risk and workflow determine the required subset.

## Focused And Phase-Close Validation

During implementation, prefer focused checks with fast, direct signal:

- lint changed JavaScript and TypeScript files when a focused invocation is
  appropriate;
- run the owning unit, integration, or DB test file;
- use focused type or build evidence when supported by repository tooling;
- run the smallest repository-owned E2E scenario that exercises the affected
  user flow.

For substantial phase-based implementation, keep checks focused during the
phase. Before declaring the phase complete, run repository-wide
`pnpm lint --fix` and `pnpm typecheck` unless the active workflow defines a
different exact contract or an observed runtime/tool failure prevents the
command from completing.

When a required command cannot run or hangs:

1. stop or contain it safely;
2. record the exact runtime, command, and observed behavior;
3. run other independent required checks where useful;
4. report the gate as not completed, never as passed;
5. keep runtime-specific workarounds in the affected runtime surface, not in
   this neutral contract;
6. revalidate temporary blockers periodically and remove them when they no
   longer reproduce.

Do not infer that a command is broken for one runtime because another runtime
previously reproduced a problem.

## Git Hook Gates

The live files under `.husky/` are authoritative.

Current hook responsibilities are:

- pre-commit: block direct commits to protected branches and run
  `pnpm exec lint-staged`;
- commit message: run Commitlint;
- pre-push: run `pnpm typecheck`, `pnpm skott:check:only`, `pnpm depcheck`,
  `pnpm madge`, and `pnpm env:check`.

Do not use `--no-verify` or bypass hooks unless the user explicitly authorizes
that operation and the residual risk is reported. A hook passing does not prove
that change-specific behavioral validation ran.

## Pull-Request CI Baseline

The live workflows under `.github/workflows/` are authoritative. At the time of
this document's creation, `pr-validation.yml` covers:

- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm env:check`;
- `pnpm skott:check:only`;
- `pnpm madge`;
- `pnpm depcheck`.

CI coverage does not replace focused local validation of the changed behavior.
Conversely, local focused tests do not replace required repository or CI gates
at phase or change completion.

Use `docs/ai/general/CI_CD_EVIDENCE_RETRIEVAL.md` when inspecting CI failures or
deployment evidence.

## Risk-Based Expansion

### Security, Auth, Authorization, And Tenancy

Retrieve the applicable rules from
`docs/ai/general/SECURITY_CODING_PATTERNS.md` and use the security validation
skill or workflow.

Require server-side evidence for authorization and tenant/resource scope.
Action-level permission tests do not prove authorization for a client-supplied
tenant, organization, or resource identifier.

### Auth, Bootstrap, And Onboarding Flows

Use the targeted auth-flow corpus:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`;
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`;
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`.

Do not load this corpus for unrelated work.

### Next.js Runtime And Caching

Use the runtime skill and targeted sections of
`docs/ai/general/NEXTJS_IMPLEMENTATION_PLAYBOOK.md`. Validate the actual affected
RSC, route-handler, server-action, proxy, caching, or deployment boundary.

### Database And Persistence

Use real database evidence when schema types, constraints, transactions,
tenant isolation, or Drizzle adapter behavior are involved. Mocked DB tests
alone cannot establish those properties.

Every `Drizzle*Service` or `Drizzle*Repository` remains subject to the companion
`*.db.test.ts` contract defined by the Validation Strategy authority.

### Browser And Cross-Layer Flows

Use repository-owned scenario runners when they own environment, database, or
provider setup. Raw `playwright test` is not authoritative sign-off for
auth/bootstrap/admin/container-backed scenarios when the scenario runner is
required.

Use `--reporter=line` for focused terminal evidence where the repository command
supports it.

### Environment, Build, And Deployment

Distinguish build-time and runtime configuration. A build passing with a
synthesized value does not prove that the deployed runtime receives its required
configuration.

Validate the downstream deployment/runtime contract whenever the changed value
is required after build completion.

## Completion Contract

Implementation work is complete only when:

1. the requested behavior is implemented;
2. the intended scope and final diff are verified;
3. the minimum validation capable of falsifying the affected risk passes;
4. applicable phase-close, hook, or CI gates are satisfied or explicitly
   reported as incomplete;
5. no test, security control, authorization boundary, or quality gate was
   weakened to make the change pass;
6. residual risk and unresolved uncertainty are disclosed.

Report command names and outcomes precisely. Do not say that all tests or all
gates passed when only a focused subset ran.

## Ownership And Propagation

`docs/ai/general/05 - Validation Strategy Agent.md` remains the neutral role
authority for specialist validation behavior. This document owns the shared
repository quality-gate contract and live command map.

Runtime-specific loading behavior belongs in the corresponding
`.agents/skills/**` or `.claude/skills/**` surface. Propagate changes according
to `docs/ai/general/AGENT_INSTRUCTION_ARCHITECTURE.md`.
