---
name: auth-flow-change-review-workflow
description: Mandatory scenario-driven review workflow for changes touching Clerk/AuthJS auth, bootstrap routing, onboarding redirects/actions, auth preprocessing in `src/proxy.ts`, root auth/provider boundaries, auth-gated handlers/actions, `/users` access control, membership logic, or another path where auth-flow trust/routing regression is possible. Use before implementation or final sign-off.
---

# Auth Flow Change Review Workflow

Review auth/bootstrap/onboarding changes against the repository's normative auth-flow contract and live verification matrix.

This workflow owns scenario mapping, specialist routing, matrix sign-off, and review completion. Security/Auth owns trust/auth policy; Runtime, Architecture, and Playwright own their specialist decisions/evidence.

## Mandatory Auth-Flow Context

Inherit active repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- `AGENTS.md`;
- `MODE_MANIFEST.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- the neutral Workflow 05 source;
- Architecture Guard, Runtime, or Playwright source files.

For **every** run of this workflow, before auth-flow analysis, read in this order:

1. `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`;
2. `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`;
3. `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`.

These are not optional progressive context. The workflow is specifically about this auth-flow contract.

Then:

1. inspect the changed files/diff and relevant live auth-flow code;
2. invoke `security-auth` first;
3. invoke `nextjs-runtime`, `architecture-guard`, or `playwright-e2e` only when their trigger conditions are met;
4. let those skills perform their own targeted context loading.

If the auth-flow documents conflict with live code/config or current framework behavior, do not silently reconcile them. Record the drift and let the owning specialist resolve the affected policy/runtime question.

In particular, do not carry historical middleware/runtime assumptions from auth-flow documentation over live Next.js 16 `src/proxy.ts` behavior; `nextjs-runtime` owns exact current framework/runtime semantics.

## Entry Conditions

Use when a change touches or may affect:

- Clerk configuration, SDK usage, or provider integration;
- AuthJS auth/bootstrap/onboarding behavior;
- post-auth redirect targets;
- bootstrap/start/recovery routes;
- onboarding routing or actions;
- auth preprocessing in `src/proxy.ts`;
- root layout/provider auth boundaries;
- auth-gated server actions or route handlers;
- `/users` access control;
- membership or onboarding-state routing;
- auth-related environment defaults;
- any path with plausible trust-boundary or auth-routing regression.

Do not use for unrelated feature work or pure UI/style changes without auth-gating behavior.

Do not repeat a completed auth-flow review in the same task/session unless the changed scope or evidence materially changed.

## Core Rules

Always:

- Security/Auth first;
- read the anti-pattern contract before analyzing the change;
- use the current matrix as the mandatory scenario source;
- map every affected auth path to specific matrix scenario IDs;
- preserve scenarios already expected to pass;
- include the matrix's current minimum-required scenario set for any auth-flow change, plus any additional affected scenarios;
- distinguish trust-boundary analysis from runtime/architecture/browser evidence;
- keep blast radius low;
- account explicitly for every required/affected scenario before completion.

Never:

- accept “auth works” as evidence;
- sign off based on a partial happy path;
- treat Playwright as a substitute for code-level Security/Auth analysis;
- run all specialists by default;
- let implementation begin before scenario mapping and the workflow-level matrix sign-off step are complete;
- mark the review complete while a required/affected scenario is unaccounted for.

Trust-boundary confusion is a blocker, not a warning.

## Working Sequence

### 1. Change Intake

Determine the actual changed file set from the working tree/provided diff.

Identify every touched:

- auth/bootstrap/onboarding path;
- proxy/auth preprocessing path;
- redirect path;
- route handler/server action;
- root/provider/layout boundary;
- membership/access-control path;
- DB/provider/routing-state transition relevant to auth.

Record:

- changed files considered;
- trust-boundary surfaces;
- redirect-flow surfaces;
- runtime-sensitive surfaces;
- initial specialist routing expectation.

Do not infer affected scenarios from filenames alone; inspect the changed behavior/path.

### 2. Security/Auth Analysis — Always First

Invoke `security-auth`.

Required handoff:

- changed files/code paths considered;
- trust-boundary assessment;
- relevant anti-patterns;
- affected matrix scenario IDs and reason for each;
- required verification before sign-off;
- redirect-flow risks;
- auth/tenant/membership/source-of-truth constraints;
- recommendation whether Runtime and/or Architecture review is required;
- security stop/go/block state.

Security/Auth must map the change to the live matrix before downstream specialist routing.

Do not let this workflow independently recreate Security/Auth policy reasoning.

### 3. Conditional Next.js Runtime Review

Invoke `nextjs-runtime` when the auth-flow change touches or may affect:

- routing behavior in `src/proxy.ts` or App Router;
- Server/Client placement for auth-gated code;
- route-handler/server-action runtime behavior;
- caching/revalidation of auth-sensitive data;
- request-time/build-time behavior;
- Node/runtime/deployment assumptions;
- cookie mutation legality or another version-sensitive Next.js behavior.

Required handoff:

- runtime surfaces at risk;
- current live runtime/config facts;
- placement/cache/request-time constraints;
- runtime stop/go/block state;
- docs-vs-live-runtime drift when present.

Live code/config and current version-appropriate framework evidence override stale runtime wording in auth-flow docs.

### 4. Conditional Architecture Guard Review

Invoke `architecture-guard` when the change touches or may affect:

- module boundaries in auth/security/application areas;
- DI/composition of auth dependencies;
- provider isolation;
- security-enforcement layer placement;
- contract ownership;
- structural tenant/membership boundaries.

Required handoff:

- architecture fit;
- boundary/ownership constraints;
- DI/composition assessment;
- provider-isolation constraints;
- architecture stop/go/block state.

Do not run Architecture Guard merely because auth code exists; run it when structure is actually at risk.

### 5. Matrix Verification Sign-Off — Mandatory

Before implementation, establish a scenario-level sign-off plan for:

1. every scenario ID identified by Security/Auth as affected by the change; and
2. the current matrix's minimum-required scenario set, because those scenarios must be reverified before final completion of any auth-flow change.

Pre-implementation evidence does not need to execute every scenario. Scenarios whose proof necessarily depends on the implemented change may be explicitly `Deferred`, with the exact post-implementation evidence required.

For each scenario, record:

- scenario ID;
- scenario description;
- why it is in scope;
- current evidence;
- workflow sign-off status:
  - **Verified**
  - **Deferred**
  - **Blocked**
- reason;
- for Deferred: exact evidence/action still required;
- for Blocked: exact blocker and owning next step.

Do not proceed while any required scenario is simply omitted.

If any scenario is **Blocked**, stop the workflow until the blocker is resolved.

### Status Vocabulary Discipline

The live matrix currently uses its own evidence/result vocabulary:

- `PASS`
- `FAIL`
- `DEFERRED`
- `BLOCKED`
- `N/A`

Preserve those values when recording or updating matrix-native evidence.

The Workflow 05 review-level sign-off uses:

- `Verified`
- `Deferred`
- `Blocked`

Do not silently conflate the two vocabularies.

A matrix/evidence `FAIL` cannot produce a workflow-level `Verified` or `Deferred` final sign-off; the failing scenario blocks completion until resolved and reverified.

`N/A` is valid only when the current matrix semantics genuinely make that scenario inapplicable; it must not be used to bypass a minimum-required or actually affected scenario without an explicit source-supported reason.

### 6. Conditional Playwright E2E Verification

Invoke `playwright-e2e` only when real-browser evidence is required, for example:

- redirect-flow settlement;
- cookie/session behavior;
- onboarding/bootstrap across route transitions;
- hydration/client route commit;
- provider behavior requiring a browser.

Require the minimum browser scope covering the relevant matrix scenarios.

Browser evidence must map back to scenario IDs.

After browser evidence, refresh the affected matrix evidence/status and workflow-level sign-off. Do not close using pre-E2E statuses that no longer reflect the evidence.

## AuthJS Required Proof

When the affected provider is AuthJS and browser sign-off is required:

- run/prefer `pnpm e2e:authjs:core` before broader E2E;
- require evidence for `/api/auth/session` and `/api/auth/providers` JSON health;
- require unauthenticated dashboard redirect to `/auth/signin`;
- require completed-user landing on `/dashboard`;
- require incomplete-user settlement through `/onboarding` and then `/dashboard`.

Completed-user evidence alone is insufficient for auth/bootstrap/onboarding regression sign-off.

## Source-of-Truth and Auth-Flow Invariants

The mandatory anti-pattern document is normative for auth/bootstrap/onboarding flow decisions unless superseded by a newer architecture decision.

Preserve its application-level invariants, including:

- application DB remains authoritative for onboarding/provisioning/tenant/membership truth;
- provider/client/cookie signals are not authorization or onboarding truth;
- transient routing signals remain routing hints only;
- server-side safety/enforcement must remain even when routing is moved earlier;
- cookie mutation occurs only in runtime-legal mutation boundaries;
- raw one-off auth redirect policy must not be scattered into `src/proxy.ts`;
- shared provider/root auth boundaries remain stable;
- observability remains sufficient to classify the affected route decision/settlement path when regression risk requires it.

When a specific invariant contains framework/runtime wording that has drifted, preserve the intent and require `nextjs-runtime` to establish the current legal implementation shape.

## Pre-Implementation vs Final Sign-Off

This workflow may be used before implementation or for final review.

### Pre-implementation review

Before implementation:

- complete Security/Auth analysis;
- map all required/affected scenarios;
- complete conditional Runtime/Architecture review;
- complete the matrix sign-off step;
- mark scenarios requiring post-change execution evidence as Deferred with exact required verification;
- ensure no unresolved Blocked scenario or trust-boundary ambiguity remains;
- make the remediation/implementation scope explicit.

Only then may implementation begin through the appropriate implementation workflow/skill.

### Final sign-off

After implementation:

- revisit the live matrix;
- execute the required evidence plan;
- run Playwright only where browser evidence is required;
- update scenario evidence;
- reverify the matrix's current minimum-required scenario set;
- resolve Deferred scenarios required for completion;
- update the same workflow-level matrix sign-off artifact with final evidence/status;
- do not complete the review while a required/affected scenario remains failed, unexplained, or blocked.

A scenario may remain Deferred only when the workflow/repository explicitly permits deferral and the reason plus required future evidence are recorded. The matrix's minimum-required scenarios must satisfy the live matrix's completion rule before the auth-flow change is considered fully verified.

## Artifact-Backed Work

For `.copilot/tasks/{task_id}/` work:

- read current control artifacts and relevant prior specialist summaries;
- keep `plan.md`/`intake.md` synchronized when review scope or block state changes;
- each invoked specialist maintains exactly one matching persistent summary artifact;
- create or update exactly one workflow-level `matrix-verification.md` for the mandatory matrix sign-off;
- keep the same `matrix-verification.md` across pre-implementation and final sign-off instead of creating separate versions;
- include the scenario table, workflow sign-off status, evidence/deferred requirements, and residual risks;
- do not create duplicate specialist summaries or duplicate matrix-sign-off artifacts;
- when Playwright runs, map its evidence back to scenario IDs in its persistent E2E summary/evidence artifact and then update `matrix-verification.md`.

If an existing task already has an explicitly established equivalent matrix-sign-off artifact for this workflow, update that file rather than creating a duplicate.

Use existing repository artifact guidance/template when an exact destination or format is already defined; do not invent additional parallel artifacts.

## Block Conditions

Stop and report a block when:

- a required/affected matrix scenario cannot be accounted for with an explicit status/reason;
- any scenario is Blocked and unresolved;
- a required scenario has failing evidence;
- trust-boundary confusion remains unresolved;
- required Security/Auth constraints are unresolved;
- runtime placement of auth-sensitive logic is invalid or unresolved;
- architecture constraints prevent the change without a further decision/redesign;
- the mandatory auth-flow governing files were not read before analysis;
- implementation scope is not explicit enough to preserve auth-flow invariants.

State the exact blocker, affected scenario(s), and owning next step.

## Completion Criteria

A review is complete only when:

- every affected auth path is mapped to at least one scenario ID;
- the current matrix minimum-required scenarios are accounted for;
- all additional affected scenarios are accounted for;
- mandatory anti-pattern/matrix context was read;
- required specialists were run;
- trust-boundary questions are resolved;
- matrix sign-off is present;
- browser evidence is present where required;
- residual risks/deferred items are explicit.

Do not mark the work complete merely because the currently changed code looks locally correct.

## Leantime

This workflow participates in the mandatory Leantime lifecycle.

- when `workflow-orchestrator` owns the task, do not duplicate its logical open/close calls;
- when this workflow runs standalone on a fresh non-trivial task, use `leantime-integration` for one logical open;
- on resumed/re-entered standalone work, reuse the existing tracked task state rather than creating another logical open;
- perform one logical close only after completion/closure conditions are satisfied;
- do not preload the full Leantime automation guide.

## Response

For substantial review output, use:

1. Objective
2. Changed Files Considered
3. Trust-Boundary Assessment
4. Affected Matrix Scenarios
5. Required Verification Before Sign-Off
6. Conditional Runtime Summary
7. Conditional Architecture Summary
8. Matrix Verification Sign-Off
9. Conditional Playwright Evidence
10. Risks
11. Recommended Next Action

Omit a conditional specialist section only when that specialist was correctly not required; state that it was not required rather than fabricating analysis.

## Source and Compatibility

`docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md` remains the neutral cross-tool workflow authority.

`AUTH_FLOW_ANTI_PATTERNS.md`, `AUTH_FLOW_MATRIX_HOW_TO_USE.md`, and `AUTH_FLOW_VERIFICATION_MATRIX.md` remain mandatory live auth-flow governing sources for this workflow.

For Claude Code, this skill optimizes only general-context and specialist loading. It deliberately does **not** remove the mandatory auth-flow corpus.

If shared workflow semantics change, propagate the semantic change according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary auth-flow review.
