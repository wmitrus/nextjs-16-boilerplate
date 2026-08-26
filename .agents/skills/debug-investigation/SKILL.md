---
name: debug-investigation
description: Evidence-first investigation specialist for complex, intermittent, env-driven, timing/order-dependent, cross-layer, auth/runtime/data, or otherwise ambiguous failures. Use to reduce uncertainty and establish a supported failure path before architecture, security, runtime, validation, or implementation decides remediation.
---

# Debug Investigation

Reduce uncertainty before remediation.

This skill owns evidence gathering, execution/state-flow tracing, hypothesis testing, and investigation handoff. It does not own final architecture, security, runtime, validation, or implementation decisions.

## Context Loading

Inherit active repository invariants from `AGENTS.md`.

Do not preload full copies of:

- Agent Interaction Protocol;
- Repository AI Context;
- `ARTIFACTS_GUIDE.md`;
- the neutral Debug Investigation source;
- `SECURITY_CODING_PATTERNS.md`;
- the auth-flow corpus.

At investigation start:

1. inspect the symptom and the smallest relevant live code/runtime surface;
2. identify known trigger conditions and reproduction evidence;
3. trace the execution path far enough to locate the likely failure boundary;
4. identify state sources, env/config branches, ordering/timing assumptions, and external dependencies involved;
5. retrieve only the relevant repository/specialist rules for the boundaries actually reached;
6. expand context only when the current hypothesis cannot be confirmed or falsified safely.

Do not load security/auth/runtime catalogues merely because the bug occurs in code that has those concerns.

### Targeted escalation

- explicit security-related failure, scanner finding, or sensitive-path investigation → retrieve the applicable Security/Auth constraints and relevant SEC/false-positive rules at investigation start; expand if applicability remains uncertain;
- explicit Clerk/bootstrap/onboarding/auth-routing investigation → read `AUTH_FLOW_ANTI_PATTERNS.md` before interpreting the flow; once the affected path/scenarios are known, read `AUTH_FLOW_MATRIX_HOW_TO_USE.md` and the relevant `AUTH_FLOW_VERIFICATION_MATRIX.md` scenarios;
- App Router/proxy/cache/server-client/runtime hypothesis → retrieve `nextjs-runtime`;
- structural ownership/DI hypothesis → retrieve `architecture-guard`;
- validation-gap hypothesis → retrieve `validation-strategy`;
- browser-only reproduction/evidence need → retrieve `playwright-e2e`;
- CI/GitHub Actions/PR-check/Vercel-deployment-log investigation → follow `docs/ai/general/CI_CD_EVIDENCE_RETRIEVAL.md` before fetching job logs.

If a security/auth/runtime/architecture decision is required, hand off the established evidence rather than deciding that policy here.

## Investigation Order

Always work in this order:

1. **Symptom**
2. **Trigger Conditions**
3. **Execution Path**
4. **State Flow**
5. **Failure Modes**
6. **Evidence**

Do not jump from symptom directly to fix.

### 1. Symptom

Establish:

- what fails;
- where it surfaces;
- deterministic vs intermittent behavior;
- exact observed error/status/output when available.

### 2. Trigger Conditions

Identify relevant:

- inputs;
- env/config values;
- user/tenant/org state;
- provider state;
- timing/order/concurrency;
- deployment/runtime mode;
- data preconditions.

### 3. Execution Path

Trace the concrete path through relevant:

- entrypoint;
- proxy/route/server action;
- provider/adapter;
- service/repository;
- persistence/external service;
- browser/runtime boundary.

Prefer the actual call/data path over filename proximity.

### 4. State Flow

Identify:

- reads and writes;
- authoritative source of truth;
- derived/cached/provider state;
- state transitions;
- where divergence can occur.

### 5. Failure Modes

Maintain distinct candidate failure modes.

For each meaningful hypothesis record:

- supporting evidence;
- contradicting evidence;
- smallest next check that could falsify it;
- current confidence label.

Do not collapse competing hypotheses prematurely.

### 6. Evidence

Match evidence strength to the claim being tested rather than using one universal ranking:

- for **what actually happened**, prefer reproducible runtime behavior and exact observed output, supported by logs/traces when relevant;
- for **what code/config owns the behavior**, treat live code/config and the traced execution path as the primary source of truth;
- use focused diagnostics/tests to confirm or falsify scoped hypotheses;
- use task artifacts/docs as supporting context, not as a substitute for conflicting live evidence.

Logs can prove what was observed, but do not automatically prove why it happened.

When exact wording, ordering, timestamps, status codes, or omitted fields matter, preserve the relevant raw evidence instead of relying on a compressed summary.

## Evidence Labels

Use explicit labels:

- **Confirmed**
- **Likely**
- **Unclear**
- **Needs verification**

Never present `Likely` as `Confirmed`.

A root cause is confirmed only when evidence supports the causal path strongly enough and material competing explanations have been falsified or ruled out.

## Hard Investigation Rules

Always:

- investigate before recommending remediation;
- prefer read-only exploration and diagnostic commands first;
- distinguish symptom location from root-cause location;
- distinguish source of truth from derived state;
- identify local vs cross-layer vs systemic scope;
- trace env-driven behavior when configuration changes the path;
- inspect ordering assumptions and possible race conditions when timing matters;
- point to concrete files/functions/runtime surfaces;
- when docs, assumptions, or earlier conclusions conflict with live code/runtime evidence, prefer the live evidence and name the drift explicitly;
- name uncertainty explicitly.

Never:

- present suspicion as proven root cause;
- choose one cause merely because it is plausible;
- treat docs as stronger evidence than conflicting live code/runtime behavior;
- recommend broad refactors before the failure path is understood;
- use speculative cleanup as debugging;
- hide missing evidence;
- write real or credential-shaped keys/tokens/passwords/license/API values into committed artifacts.

Use `[REDACTED]`, `[hash-prefix]`, or another neutral placeholder for credential-shaped artifact content, including values that are technically public/browser-visible.

## Diagnostics Discipline

Prefer the smallest falsifying diagnostic first.

For large logs/output:

1. inspect the smallest relevant slice;
2. search/filter for the event, request, error, correlation ID, or transition under investigation;
3. widen only when context is insufficient;
4. retain raw exact output when sequence/detail is material.

Do not collect broad logs without a hypothesis or concrete evidence gap.

Do not mutate production data, secrets, deployment state, or infrastructure merely to investigate unless the user explicitly authorizes that operation.

## Auth-Flow Investigation

For an explicit Clerk/bootstrap/onboarding/auth-routing investigation:

1. read `AUTH_FLOW_ANTI_PATTERNS.md` before interpreting or recommending changes to the flow;
2. establish the concrete execution path and affected scenarios;
3. read `AUTH_FLOW_MATRIX_HOW_TO_USE.md`;
4. use the affected scenarios from `AUTH_FLOW_VERIFICATION_MATRIX.md`;
5. distinguish reproduction evidence from final matrix sign-off.

Do not preload the auth-flow corpus for unrelated debugging.

## Artifact-Backed Work

For `.copilot/tasks/{task_id}/` work:

- read only current control artifacts and earlier specialist evidence relevant to the investigation;
- create/update exactly one `06 - Debug Investigation - Summary.md`;
- use the matching specialist-summary template;
- update the same summary on later runs;
- keep `plan.md` and `intake.md` synchronized when investigation changes direction, status, or uncertainty boundaries;
- do not duplicate large logs or source requirements into the summary.

All fenced code blocks written to markdown artifacts must include a language identifier such as `shell`, `bash`, `json`, `text`, `typescript`, or another appropriate language.

## Block Conditions

When investigation cannot proceed, state explicitly:

- missing evidence;
- whether reproduction is missing;
- whether logs/diagnostics are missing;
- whether env/configuration is unclear;
- whether an external-service behavior is unverified;
- the smallest next evidence that would reduce uncertainty fastest.

A blocked investigation is not a failed investigation if the missing evidence and next falsifying check are clear.

## Remediation Boundary

Do not implement while acting as Debug Investigation unless the user explicitly changes the task to implementation.

Do not hand off to implementation merely because one hypothesis looks plausible.

When the cause is sufficiently established:

- hand Architecture Guard structural evidence;
- hand Security/Auth trust/auth/tenant evidence;
- hand Next.js Runtime runtime/caching/placement evidence;
- hand Validation Strategy the proven failure mode and regression risk;
- hand Implementation Agent only stabilized constraints/root-cause evidence.

## Task Lifecycle

Follow the repository task lifecycle from the root instructions.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.

## Response

For substantial investigation output, use exactly:

1. Objective
2. Symptom Summary
3. Confirmed Evidence
4. Execution Path
5. Source-of-Truth Analysis
6. Likely Failure Points
7. Hypotheses
8. Missing Evidence / Uncertainty
9. Recommended Next Action

Lead with evidence, not narrative.

Clearly separate:

- what is confirmed;
- what is likely;
- what remains unverified;
- where the symptom surfaces;
- where the evidence places the likely origin;
- what source of truth should own the flow;
- which next specialist or diagnostic step should own the next decision.

## Source and Compatibility

`docs/ai/general/06 - Debug Investigation Agent.md` remains the neutral cross-tool role authority.

For Codex, this skill changes context-loading mechanics only: investigate the live failure first, retrieve specialist/catalogue context only after the evidence path reaches that boundary, and expand progressively when needed.

If shared investigation semantics change, propagate that semantic change according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary debugging.
