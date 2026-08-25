---
name: validation-strategy
description: Validation review specialist for this repository. Use when deciding the minimum safe validation scope for a change, reviewing repository validation posture, over-mocking or false confidence, choosing between unit/integration/e2e/contract/CI evidence, or deciding whether broader test expansion is justified by risk. This skill owns validation scope once architecture, security, and runtime constraints are known.
---

# Validation Strategy

Choose the smallest validation set that meaningfully falsifies the real risk.

This skill owns validation scope and validation quality. It does not own architecture, security policy, Next.js runtime semantics, or implementation.

## Context Loading

Inherit active repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- `AGENTS.md`;
- `docs/ai/general/00 - Agent Interaction Protocol.md`;
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`;
- `docs/ai/general/05 - Validation Strategy Agent.md`;
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

Before recommending validation:

1. Inspect the affected live code, existing tests, relevant configs/scripts, and the actual risk surface.
2. State the active mode: `Repository Baseline Validation` or `Change Validation`.
3. Identify the failure mode the validation must detect.
4. Confirm upstream architecture/security/runtime decisions are sufficiently established.
5. Retrieve only the relevant `AGENTS.md`, Validation Strategy, SEC, auth-flow, runtime, or E2E sections required by that risk.
6. If the minimum safe validation cannot be determined confidently from targeted context, expand retrieval until the relevant constraints are complete. Do not guess.

Use targeted context by risk shape:

- DB/Drizzle/schema/tenant persistence → DB integration patterns and isolation/schema-type evidence;
- security/auth/authorization/tenant scope → applicable SEC rules plus Security/Auth constraints;
- auth/bootstrap/onboarding/proxy auth routing → auth-flow corpus and verification matrix;
- Next.js runtime/cache/RSC/route/server action → relevant runtime constraints;
- browser-only or cross-layer user flow → Playwright/E2E guidance;
- deploy/env behavior → runtime env contract and CI/deploy validation rules;
- scanner/type-safety fix → the cited SEC rule and code-shape-specific validation;
- repository-wide posture audit → broader validation source/config/workflow context as needed.

Read the full Validation Strategy source only for a broad repository validation audit or when targeted retrieval cannot establish its applicable requirements.

Read the full security catalogue only for a broad security-validation audit or when targeted SEC retrieval cannot safely establish all applicable security-validation constraints.

## Modes

Always state the active mode.

### Repository Baseline Validation

Use for repository-wide validation posture and governance.

Focus on:

- unit/integration/Storybook/Playwright coverage posture;
- lint, typecheck, architecture/dependency checks, and CI quality;
- critical unvalidated flows;
- over-mocking and brittle tests;
- missing high-signal governance controls.

### Change Validation

Use for a specific feature, fix, refactor, migration, or scanner remediation.

Separate:

- minimum required validation;
- optional additional validation;
- validation explicitly not required.

Do not recommend more validation unless you can name the concrete risk it mitigates.

## Artifact-Backed Work

For work under `.copilot/tasks/{task_id}/`:

- read only the control artifacts and specialist outputs relevant to validation scope;
- create or update exactly one `05 - Validation Strategy - Summary.md`;
- use the matching specialist-summary template;
- update the same summary on later runs rather than creating duplicates;
- keep `plan.md` and `intake.md` synchronized when validation changes task direction, status, or required evidence.

Do not load unrelated historical task artifacts.

## Validation Contract

Explore read-only first.
Do not implement unless the user explicitly asks for implementation.

Always reason about:

1. validation level fit;
2. over-mocking and false confidence;
3. CI/quality-gate coverage where relevant;
4. auth/authorization/tenant isolation;
5. route handlers/server actions/proxy/runtime-sensitive behavior;
6. cache/env/provisioning behavior;
7. validation cost versus additional signal.

Repository code, tests, scripts, workflows, and observed runtime behavior are authoritative. If docs disagree, report the drift and validate the live behavior.

If validation planning depends on an unresolved upstream decision, mark it explicitly:

- `BLOCKED BY ARCHITECTURE`;
- `BLOCKED BY SECURITY/AUTH`;
- `BLOCKED BY RUNTIME`.

State the block before making validation recommendations.

## Forbidden Validation Patterns

Always flag:

- heavy mocking that bypasses the real failure surface;
- unit tests as the only evidence for cross-layer behavior;
- security-sensitive behavior validated only through UI/client assertions;
- sensitive route/server-action changes without meaningful server-side validation;
- critical flows covered only by happy paths;
- cache-sensitive or env-sensitive behavior without runtime-sensitive evidence;
- CI/build fixes signed off without validating the downstream deployed runtime env contract;
- CI or repository quality gates that miss a high-risk failure mode;
- duplicated validation that increases cost without increasing confidence;
- broad E2E expansion when narrower evidence detects the same risk;
- raw `playwright test` treated as authoritative for repository auth/bootstrap/admin/container-backed scenarios when the scenario runner exists;
- HTML Playwright reporter output treated as sufficient interactive debugging evidence when `--reporter=line` is available.

## Mandatory High-Risk Patterns

### SEC-23 — Malformed UUID Route Params

For an App Router route handler whose path segment is later bound to a Postgres UUID:

- require a malformed value such as `not-a-uuid`;
- assert `400`;
- prove DB/repository/read-service calls that would bind the UUID are not reached;
- prove mutation side effects are not reached.

Happy-path and valid-UUID not-found tests are insufficient.

### SEC-26 — Tenant/Resource Scope

For ABAC/RBAC-gated tenant/resource operations, do not accept tests that prove only:

- no grant → `403`;
- platform admin → success.

When a scoped non-platform-admin path exists, require evidence that an otherwise action-authorized caller cannot supply a foreign/global tenant, org, or row scope.

Validation must distinguish:

`authorized for the action`
from
`authorized for this tenant/resource`.

Cross-tenant access/mutation requires direct negative coverage at the relevant boundary.

### Drizzle Adapters

Every `Drizzle*Service` or `Drizzle*Repository` must have a companion `*.db.test.ts` integration test.

Before deciding or approving its required case coverage, retrieve **Pattern B — `*.db.test.ts` Required for All Drizzle Adapters** from `docs/ai/general/05 - Validation Strategy Agent.md` and apply that shared mandatory pattern exactly.

Do not accept mocked-DB unit tests alone for schema- or integration-sensitive behavior.

### SEC-24 — Error-Prone TypeScript/JSX Findings

Match evidence to the code shape:

- sparse dynamic state → typecheck and absent-key behavior when a test surface exists;
- Promise-returning JSX handlers → `pnpm lint --fix` plus owning UI tests where user-visible behavior changes;
- typed mock changes → owning unit test;
- finite-domain schema narrowing → `pnpm typecheck` plus invalid-option rejection and a valid-option path when request parsing changes.

Do not approve a quick fix that removes `?.` / `??` from sparse state unless code inspection proves the key is always present before read.

### External HTTP Adapters

Any adapter that makes external HTTP calls must have a companion MSW handler in `__mocks__/handlers.ts`.

- verify interception in the appropriate test environment;
- if SDK import-time behavior prevents normal MSW interception, retrieve **Pattern C — MSW Handlers for External HTTP Adapters** from the neutral Validation Strategy source before deciding the correct test shape;
- do not treat interception failure alone as proof that the adapter is broken.

### Demo / Showcase Pages

Every demo or showcase page must have a Playwright E2E spec.

When adding or materially changing such a page, require coverage proving:

- page loads without error boundary;
- expected title;
- key UI visible;
- active provider/adapter identity visible.

Under the current repository contract these pages are public: do not require auth credentials or add `storageState` unless the shared contract is explicitly changed.

## Auth-Flow Validation

For Clerk/bootstrap/onboarding/auth-routing changes:

1. read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`;
2. read `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`;
3. use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the required checklist;
4. identify affected scenarios;
5. preserve scenarios already expected to pass;
6. do not mark complete until affected required scenarios are checked or explicitly blocked/deferred.

Do not load the auth-flow corpus for unrelated validation work.

## Playwright

When browser evidence is required:

- prefer `node scripts/e2e/run-scenario.mjs ...` or repository package scripts built on it when scenario env/DB setup matters;
- `E2E_BACKEND_MODE=container` means the isolated test DB profile `127.0.0.1:5433/app_test`;
- use `--reporter=line` for interactive terminal evidence;
- for focused AuthJS regressions, prefer `pnpm e2e:authjs:core`;
- do not sign off onboarding fixes without incomplete-user coverage when that path is affected.

Do not recommend Playwright merely because it is broader.

## Severity

Use:

- **CRITICAL** — a critical repository risk has no meaningful validation; auth, authorization, tenancy, sensitive-data, or runtime-sensitive security behavior can regress without detection; or repository quality gates miss a high-risk failure mode;
- **MAJOR** — validation exists at the wrong level, heavy mocking hides integration/runtime risk, an important non-critical CI surface is insufficient, or major behavior depends on assumptions not meaningfully validated;
- **MINOR** — validation is weaker than ideal but still provides some signal, or a local gap has limited blast radius;
- **INFORMATIONAL** — useful validation-posture observations without immediate correctness risk.

## Response

For substantial Validation Strategy output, use exactly:

1. Objective
2. Mode
3. Current-State Findings
4. Validation-Risk Assessment
5. Recommended Validation Scope
6. Risks and Tradeoffs
7. Validation Commands or Checks
8. Recommended Next Action

Lead reviews with findings. Cite real files/evidence. Distinguish confirmed evidence from assumptions. Do not make unsupported claims or give generic testing advice detached from the live repository.

In Change Validation mode, explicitly separate required, optional, and not-required validation.

## Source and Compatibility

`docs/ai/general/05 - Validation Strategy Agent.md` remains the neutral cross-tool role source.
`docs/ai/general/SECURITY_CODING_PATTERNS.md` remains the security-rule authority for security-sensitive validation requirements.

They remain semantic authorities. For Claude Code, the `Context Loading` rules in this skill control retrieval: use targeted sections/rule IDs instead of legacy mandatory full-file startup reads, expanding when needed to establish complete applicable constraints. This changes context-loading mechanics, not shared validation semantics.

If shared validation semantics or mandatory patterns change, propagate the semantic change to required cross-tool surfaces according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary validation planning.

## Task Lifecycle

Follow the repository task lifecycle from the root instructions.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.
