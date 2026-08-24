---
name: security-incident-workflow
description: Security-first remediation workflow for vulnerabilities, auth/authorization bugs, tenant or trust-boundary failures, sensitive-data exposure, provider-isolation issues, cache leaks, and runtime-sensitive security flaws. Use when a security issue requires structured constraints before implementation. Security/Auth is always first; Runtime and Architecture are conditional; Validation Strategy is mandatory before implementation.
---

# Security Incident Workflow

Safely investigate and remediate repository security issues with the minimum effective change and explicit trust-boundary constraints.

This is a code/security remediation workflow, not a general forensic incident-response or infrastructure-containment playbook. It owns workflow sequencing, consolidated remediation constraints, validation handoff, and incident status. Security/Auth owns security policy and trust-boundary authority.

## Context Loading

Inherit active repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- `AGENTS.md`;
- `MODE_MANIFEST.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- the neutral Security Incident Workflow source;
- the full `SECURITY_CODING_PATTERNS.md`;
- Runtime, Architecture, Validation, or Implementation source files.

At workflow start:

1. inspect the reported issue, relevant live code, and available reproduction/evidence;
2. classify the likely security category and affected trust boundary;
3. invoke `security-auth` first;
4. let Security/Auth retrieve the applicable SEC rules/catalogue sections;
5. invoke Runtime/Architecture only when their actual trigger conditions are present;
6. invoke `validation-strategy` after remediation constraints are consolidated and before implementation;
7. let each specialist perform its own targeted context loading.

Expand broader security documentation only when targeted rules are insufficient or the incident scope is genuinely broad/uncertain.

Repository code/runtime evidence remains the source of truth. Report docs/code drift instead of silently reconciling it.

## Entry Conditions

Use for:

- vulnerability remediation;
- authentication bugs with security impact;
- authorization bypass/gaps;
- tenant or organization isolation failures;
- trust-boundary failures;
- sensitive-data exposure;
- provider-isolation breaches;
- cache leaks;
- missing enforcement on sensitive mutations;
- runtime-sensitive security flaws.

Do not use for:

- ordinary feature work;
- generic cleanup;
- cosmetic or behavior-preserving refactors;
- read-only architecture/security audits without remediation intent;
- general operational incident response whose primary work is infrastructure containment rather than repository remediation.

If the issue is still too unclear to establish the failure path, stop before remediation constraints or implementation and state the evidence gap. When `workflow-orchestrator` owns the task, it may route a `debug-investigation` preflight and then re-enter this workflow with the resulting evidence.

## Execution Control

Support the shared execution modes:

- **straight-through** — run required phases sequentially when explicit operator handoff is not requested;
- **manual-handoff** — stop after each specialist artifact or major phase when the operator explicitly requests visible per-step review/switching.

Artifact creation proves that a phase produced output; it does not by itself prove a UI-level agent switch.

Do not introduce manual handoffs unless explicitly requested.

## Security Priority and Severity

Classify the incident consistently as:

- **CRITICAL**
- **HIGH**
- **MEDIUM**
- **LOW**

Use the neutral severity semantics:

### CRITICAL

Examples:

- active data leak;
- authorization bypass;
- cross-tenant exposure;
- credential/token exposure;
- exploitable trust-boundary failure affecting real users/tenants.

### HIGH

Examples:

- significant auth/security flaw without confirmed active leak;
- cache leak with realistic exposure risk;
- provider-isolation breach with meaningful security implications;
- missing enforcement on sensitive mutation paths.

### MEDIUM

Examples:

- incomplete hardening;
- security-sensitive inconsistency with limited exploitability;
- trust-boundary weakness without a clear exploit path yet.

### LOW

Examples:

- defensive improvement;
- low-risk hardening;
- non-critical drift with security relevance.

Do not downgrade severity merely because remediation is small.

## Core Rules

Always:

- Security/Auth first;
- server-side enforcement for server-side security issues;
- explicit trust-boundary and source-of-truth analysis;
- minimum effective remediation;
- low blast radius;
- preserve evidence of what was fixed and why;
- include Runtime when runtime/cache/server-client/proxy/App Router behavior is involved;
- include Architecture when the remediation risks structural shortcuts or drift;
- use Validation Strategy before implementation;
- test the incident path whenever feasible;
- surface unresolved uncertainty before code changes.

Never:

- let Implementation invent the security model;
- rely on client-only fixes for server-side security issues;
- treat proxy/routing gating as sufficient protection for sensitive mutations unless Security/Auth explicitly proves that model;
- disable or weaken validation, authorization, logging, or checks to make the fix easier;
- bypass contracts/module boundaries for a quick patch;
- introduce new provider coupling as remediation;
- hide trust-boundary ambiguity inside implementation;
- mix unrelated cleanup/refactors into incident remediation;
- broaden into redesign without a specialist-approved reason.

## Standard Sequence

### 1. Incident Intake and Risk Classification

Establish:

- reported issue/failure mode;
- known reproduction or exploit path;
- security category;
- affected user/tenant/resource scope when known;
- likely affected files/modules/layers;
- initial severity/urgency;
- likely Runtime/Architecture involvement;
- open evidence gaps.

Make only low-risk assumptions.

If the failure path is materially unclear, do not claim a confirmed root cause and do not proceed to remediation constraints. Report the missing evidence; an owning Orchestrator may route a Debug Investigation preflight before this workflow resumes.

Required workflow output:

- incident classification;
- likely affected areas;
- initial severity;
- evidence status;
- specialist routing expectation.

### 2. Security/Auth Review — Always First

Invoke `security-auth`.

Required handoff:

- security issue classification;
- trust-boundary assessment;
- authoritative source(s) of identity/scope/data truth;
- likely enforcement failure;
- auth/tenant/provider/sensitive-data implications;
- applicable SEC/security constraints;
- minimum secure remediation requirements;
- forbidden remediation shortcuts;
- whether Runtime and/or Architecture decisions are required;
- security stop/go/block state.

Do not let this workflow independently recreate Security/Auth policy.

Do not implement until the security constraints are clear.

### Auth/bootstrap/onboarding incidents

When the incident actually involves auth/bootstrap/onboarding flow:

- ensure `AUTH_FLOW_ANTI_PATTERNS.md` is read before flow decisions;
- ensure `AUTH_FLOW_MATRIX_HOW_TO_USE.md` and the live `AUTH_FLOW_VERIFICATION_MATRIX.md` are available;
- reuse the current corpus already loaded by `security-auth` in the active context when available;
- otherwise read the required current sources before proceeding;
- before implementation, map the changed auth paths to the affected matrix scenario IDs and preserve scenarios already expected to pass;
- include the live matrix's current minimum-required scenario set in the post-fix verification plan, plus any additional scenarios affected by the incident/remediation.

Do not nest `auth-flow-change-review-workflow` merely to replay the same Security/Runtime/Architecture sequence. Apply its governing auth-flow corpus and matrix obligations inside this incident workflow without creating a second competing orchestration owner.

### 3. Conditional Next.js Runtime Review

Invoke `nextjs-runtime` when the incident touches or may depend on:

- route handlers;
- server actions;
- `src/proxy.ts`;
- caching/revalidation;
- Server/Client placement;
- request-time/build-time behavior;
- env exposure;
- App Router rendering/runtime behavior;
- deployment/runtime assumptions relevant to the security path.

Required handoff:

- runtime mechanism relevant to the incident;
- live config/runtime facts;
- runtime-safe remediation constraints;
- cache/revalidation/placement hazards;
- runtime stop/go/block state.

Do not carry stale framework assumptions from old docs into remediation.

### 4. Conditional Architecture Guard Review

Invoke `architecture-guard` when remediation may affect:

- module boundaries;
- dependency direction;
- DI/composition;
- contracts/public seams;
- provider-isolation shape;
- security-enforcement layer placement;
- structural tenant/resource-scope boundaries.

Required handoff:

- architecture constraints;
- approved structural remediation shape;
- boundary/DI/contract implications;
- architecture stop/go/block state.

Skip Architecture only when the remediation is clearly local and structurally contained.

### 5. Security Remediation Constraint Summary

Consolidate, without weakening:

- Security/Auth constraints;
- Runtime constraints when applicable;
- Architecture constraints when applicable;
- incident severity;
- affected files/modules;
- explicitly allowed remediation scope;
- explicitly forbidden shortcuts;
- required source-of-truth/enforcement boundaries;
- required incident-path verification.

Remove duplication but preserve ownership and stop/go states.

If any security/runtime/architecture constraint remains unresolved:

- stop;
- do not implement;
- state the blocker and owning specialist.

### 6. Validation Strategy — Mandatory

Invoke `validation-strategy` after remediation constraints are stable and before implementation.

Require:

- minimum required validation for the incident path;
- optional additional validation justified by blast radius;
- validation explicitly not required;
- concrete commands/checks;
- expected secure evidence;
- negative/regression cases where applicable;
- unresolved validation preconditions/blockers.

The implementation phase receives this validation plan.

Do not let Implementation redefine the required security validation downward.

### 7. Implementation

Invoke `implementation-agent` with:

- incident objective;
- affected scope;
- severity;
- approved Security/Auth constraints;
- Runtime constraints when applicable;
- Architecture constraints when applicable;
- allowed/forbidden remediation moves;
- required validation plan.

Require:

- minimum effective safe fix;
- server-side enforcement at the approved authority boundary;
- no unrelated refactors;
- no weakened guards/tests/logging;
- explicit uncertainty instead of guessing;
- incident-focused test updates/additions where feasible.

Implementation must not broaden the security model beyond approved constraints.

### 8. Validation and Security Close-Out

Follow `05 - Validation Strategy - Summary.md` / the current validation-strategy output.

At minimum, execute the required risk-proportional plan. The neutral workflow prioritizes:

- targeted incident-path tests;
- typecheck;
- architecture lint when boundaries were touched;
- broader tests when blast radius justifies them.

Also honor repository-wide closure gates inherited from `CLAUDE.md`.

Validation must explicitly establish, where applicable:

- the incident/exploit path tested;
- expected secure post-fix behavior;
- vulnerable path is closed;
- relevant negative path remains denied/safe;
- no obvious security regression was introduced;
- runtime/cache behavior is safe;
- whether the issue is fully closed or only mitigated.

For auth-flow incidents:

- map browser/runtime evidence back to matrix scenario IDs;
- reverify the live matrix's current minimum-required scenario set before considering the auth-flow remediation fully verified;
- verify any additional scenarios affected by the incident/remediation;
- record any allowed deferred/blocked scenario explicitly according to the live matrix rules rather than assuming success.

If a validation check fails, classify its origin only as:

- newly introduced;
- confirmed pre-existing;
- uncertain origin.

Never call a failure pre-existing without evidence.

### 9. Optional Post-Fix Specialist Recheck

Re-run the relevant specialist(s) when the fix touched:

- auth/authorization;
- tenancy/resource scope;
- runtime-sensitive security surfaces;
- architecture boundaries.

Strongly prefer focused post-fix rechecks when multiple sensitive surfaces changed or when specialist assumptions could have drifted during implementation.

When a specialist re-runs, update its existing persistent summary rather than creating a second role-specific summary.

## Artifact-Backed Work

For `.copilot/tasks/{task_id}/` work:

- read only current control artifacts and prior specialist outputs relevant to the active phase;
- when `workflow-orchestrator` owns the task, let it own top-level control-artifact lifecycle and update only the phase state this workflow is responsible for;
- when this workflow runs standalone, create/update the normal task control artifacts required by repository artifact authority and keep their workflow state synchronized;
- if the exact control-artifact destination/format is unclear, retrieve the relevant artifact-authority section instead of inventing a parallel convention;
- each invoked specialist maintains exactly one persistent summary using its matching template;
- canonical specialist summaries for this workflow are:
  - `01 - Architecture Guard - Summary.md` when Architecture runs;
  - `02 - Security & Auth - Summary.md` for initial and post-fix Security/Auth review;
  - `03 - Next.js Runtime - Summary.md` when Runtime runs;
  - `04 - Implementation Agent - Summary.md` when implementation runs;
  - `05 - Validation Strategy - Summary.md` for validation guidance;
- update the same summary on later runs;
- create/update `validation-report.md` with actual validation evidence;
- keep plan/intake/constraints/implementation state synchronized when phase decisions change;
- do not duplicate large evidence/logs into specialist summaries.

Do not invent a second `security-final.md` or parallel security summary for close-out.

## Block Conditions

Stop before implementation when:

- security requirements are unclear;
- trust-boundary ownership is unclear;
- enforcement failure is unclear enough that remediation would be guesswork;
- runtime behavior affecting the incident is unresolved;
- architecture-safe remediation cannot be determined;
- validation preconditions are unresolved;
- the requested fix requires an unapproved broad redesign;
- the requested scope cannot close the issue safely.

In a blocked state:

- do not implement;
- state the exact blocker;
- state the evidence/decision needed next;
- state the owning specialist.

## Incident Status

For non-trivial runs, explicitly state exactly one:

- **INCIDENT CONFIRMED**
- **SAFE TO REMEDIATE**
- **REMEDIATION IMPLEMENTED**
- **PARTIALLY REMEDIATED**
- **BLOCKED**
- **NOT SAFE TO IMPLEMENT YET**

Use the status consistently in workflow output.

Do not use `REMEDIATION IMPLEMENTED` as a synonym for “code changed” when required validation or security close-out is still incomplete.

## Leantime

This workflow participates in the mandatory Leantime lifecycle.

- when `workflow-orchestrator` owns the task, do not duplicate its logical open/close calls;
- when this workflow runs standalone on a fresh non-trivial task, use `leantime-integration` for one logical open;
- on resumed/re-entered standalone work, reuse existing tracked state instead of creating another logical open;
- perform one logical close only after remediation/validation closure conditions are satisfied;
- do not duplicate time logging;
- do not preload the full Leantime guide.

## Response

For substantial workflow output, use:

1. Objective
2. Incident Classification and Severity
3. Evidence / Affected Scope
4. Trust-Boundary Assessment
5. Conditional Runtime Assessment
6. Conditional Architecture Assessment
7. Remediation Constraints
8. Validation Strategy
9. Implementation / Validation Result
10. Residual Risk / Follow-Ups
11. Incident Status
12. Recommended Next Action

Omit conditional specialist details only when that specialist was correctly not required; state that it was not required rather than fabricating analysis.

## Source and Compatibility

`docs/ai/general/Workflow 03 - Security Incident Workflow.md` remains the neutral cross-tool workflow authority.

For Claude Code, this skill changes context-loading mechanics and delegates specialist detail to the relevant skills. It preserves Security/Auth-first sequencing, mandatory Validation Strategy before implementation, conditional Runtime/Architecture review, low-blast-radius remediation, canonical specialist artifacts, post-fix recheck semantics, severity, and incident statuses.

If shared workflow semantics change, propagate that semantic change according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary incident remediation.
