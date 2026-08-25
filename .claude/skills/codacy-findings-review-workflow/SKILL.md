---
name: codacy-findings-review-workflow
description: Review a local Codacy findings JSON artifact severity-first, deduplicate findings, separate production risk from tests/scripts/tooling noise, classify each finding from live code, decide keep/scope/disable for repeated rules, plan or implement minimum-safe remediation, propagate durable patterns, and validate applied changes. Use Workflow 10 instead for PR CRITICAL/HIGH security-only review.
---

# Codacy Findings Review Workflow

Review local Codacy findings artifacts as a repository-quality signal, not as scanner truth.

This workflow owns normalization, severity-first ordering, scope/noise analysis, rule-necessity decisions, remediation orchestration, durable-pattern propagation, and final review artifacts.

Security/Auth owns security/trust verdicts and SEC-pattern semantics when those are actually involved. Architecture Guard owns structural implications. Implementation owns approved edits. Validation Strategy owns minimum sensible validation when code changes are applied.

## Context Loading

Inherit active repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- `AGENTS.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- the neutral Workflow 11 source;
- the entire `SECURITY_CODING_PATTERNS.md`;
- the full Implementation Agent source;
- Security/Auth, Architecture, or Validation source files.

At start:

1. read the local Codacy findings JSON artifact directly;
2. validate and normalize its shape;
3. load the **Pattern Index** from `docs/ai/general/SECURITY_CODING_PATTERNS.md`;
4. cross-reference findings to plausible SEC-ID(s);
5. load full SEC sections only for plausible matches or when Security/Auth needs them;
6. inspect live files before classification;
7. invoke specialist skills only for the concern they own.

If the Pattern Index + targeted SEC sections + live code are insufficient, expand relevant security context. Do not load the entire catalogue merely because the artifact contains scanner findings.

Repository code is the source of truth for behavior. The local JSON artifact is the source of truth for the reported finding set.

## Entry Conditions

Use for local Codacy findings artifacts such as:

```text
.codacy/reports/codacy-findings.json
.codacy/reports/codacy-findings-preview.json
```

or an equivalent local normalized Codacy JSON artifact.

Use when the goal includes one or more of:

- severity-first findings triage;
- false-positive verification;
- production-vs-tooling prioritization;
- rule quality review;
- Codacy scope/exclusion decisions;
- remediation planning;
- code remediation;
- durable SEC/prompt pattern propagation.

Do not use for:

- Codacy PR comments focused only on CRITICAL/HIGH security findings — use `codacy-security-review-workflow`;
- a single known vulnerability with an already-clear secure fix;
- production incident response;
- architecture-only review without scanner findings.

Required input:

- path to the local Codacy findings JSON artifact.

Optional:

- source SARIF path;
- prior findings baseline;
- whether the task is review-only or implementation;
- whether Codacy rule/scope tuning is desired.

If review-only vs implementation is not explicitly stated, do not make code changes merely because a finding exists; complete triage/rule review and produce the remediation plan.

## Core Principles

Always:

- validate the findings artifact before trusting it;
- deduplicate identical findings before triage;
- group by severity first;
- group by rule/type within severity;
- use repository runtime/layer priority within equal severity;
- inspect live code before classification;
- distinguish production, security/auth, tests, scripts/CLI, and local tooling;
- cross-reference every finding against the Pattern Index and applicable SEC rule when present;
- decide whether repeated noisy rules should stay enabled, be narrowed, be documented, or be disabled/demoted;
- distinguish code remediation from scanner/rule configuration;
- preserve durable confirmed patterns outside one-off reports.

Never:

- treat Codacy output as proof that a defect exists;
- “fix” scanner text without understanding the code/runtime context;
- apply a security label solely from scanner severity;
- suppress/ignore before considering a better code pattern;
- churn production code repeatedly for structurally noisy rules when proper rule scoping is the better answer;
- spend equal remediation effort on dev-only tooling and production runtime code without a risk reason;
- mix real production risk and local-tooling noise into one undifferentiated queue.

Unlike Workflow 10, this workflow has **no mandatory per-group user pause semantics**. Do not invent them.

## Finding Normalization

Normalize each finding to:

- severity/level;
- ruleId/type;
- message;
- file path;
- line;
- column.

Deduplicate by exactly:

```text
level + ruleId + file + line + message
```

Record:

- total before dedupe;
- total after dedupe;
- duplicate count;
- malformed/unsupported entries when any.

If the artifact shape is malformed enough that reliable normalization is impossible, stop and report the exact shape problem rather than guessing.

## Severity and Repository Priority

Process severity in descending scanner severity:

1. error/highest severity;
2. warning/lower severity;
3. any additional levels in descending risk order supported by the actual artifact.

Within equal severity:

1. `src/security`, `src/core`, `src/modules`, `src/app`;
2. production runtime-supporting shared code;
3. tests and E2E;
4. scripts/CLI tooling;
5. `.vscode/*`, editor extensions, local/dev-only tooling.

This is review priority, not automatic security severity.

A lower-priority tooling finding may still be real; it simply should not displace production-risk analysis of equal scanner severity.

## SEC Cross-Reference

For every finding:

1. consult the Pattern Index;
2. mark matching/plausible SEC-ID(s), if any;
3. load the full applicable section before relying on that SEC pattern;
4. state whether the current finding:
   - confirms the existing SEC pattern;
   - extends it;
   - conflicts with it;
   - is unrelated.

If no SEC rule matches, state `No existing SEC match`.

Do not create a new SEC entry simply because a scanner rule has a new name. A durable new entry requires a genuinely new reusable repository pattern.

## Specialist Routing

### Security/Auth — conditional authority

Invoke `security-auth` when a finding or rule group involves:

- authentication/authorization;
- tenancy/resource scope;
- trust boundaries;
- sensitive-data handling;
- secrets/credentials;
- security-relevant redirects;
- SSRF/file access/command injection/crypto or another actual security sink;
- uncertain exploitability;
- creation/update of a SEC pattern;
- Codacy HIGH `Error prone` where live code suggests a possible trust-boundary exploit.

Security/Auth decides the security verdict and SEC semantics.

Do not invoke Security/Auth for every ordinary style/reliability/tooling finding when no security question exists.

### Architecture Guard — conditional

Invoke `architecture-guard` when:

- a proposed remediation crosses module/layer boundaries;
- dependency direction/DI/contracts would change;
- scanner-driven cleanup risks architectural drift;
- a new mechanical guardrail touches architecture enforcement.

### Validation Strategy — conditional

If code/config/guardrail changes are going to be applied and the minimum safe validation scope is not already clear from repository rules plus Workflow 11, invoke `validation-strategy`.

If the required validation is already explicit, execute that scope directly rather than adding a redundant specialist pass.

For review-only work with no edits, do not manufacture command execution; record that no validation commands were required.

## Classification Model

Every normalized finding must end in exactly one classification:

- **Real Risk**
- **Latent Risk**
- **False Positive**
- **Tooling Noise / Out-of-Scope**

Support the classification with:

- live-file context;
- runtime/layer classification;
- reachable inputs/trust context when relevant;
- matching SEC rule when any;
- concrete rationale.

### Codacy HIGH `Error prone` TypeScript/JSX

Explicitly separate:

- security exploit path;
- reliability/type-safety cleanup.

Apply SEC-24 when live code matches that pattern and no concrete trust-boundary failure exists.

Do not convert a reliability finding into a security incident merely because Codacy labels it HIGH.

If live code reveals an actual trust-boundary/security failure, route to Security/Auth and classify from the real risk.

## Ordered Workflow

### 1. Intake — Read and Normalize Findings JSON

Read the JSON artifact.

Validate its shape.

Normalize and deduplicate findings.

Cross-reference the Pattern Index.

Assign initial severity + repository-priority ordering.

For `.copilot/tasks/{task_id}/`, create/update:

```text
intake.md
```

Include:

- source artifact path;
- optional SARIF/baseline references;
- total before dedupe;
- total after dedupe;
- duplicates removed;
- malformed entries/gaps;
- findings grouped by severity;
- within severity, grouped by rule/type;
- initial SEC-ID matches;
- initial repository review order.

### 2. Scope and Noise Review

Tag each finding/group as:

- production app/runtime;
- security/auth;
- tests;
- scripts/CLI;
- local tooling/editor/dev-only.

Identify:

- directories/files causing disproportionate noise;
- scanner coverage that appears low-signal;
- generated/dev-only content that may warrant exclusion;
- path-scope changes worth considering;
- groups that should not be in the normal remediation queue.

For `.copilot/tasks/{task_id}/`, create/update:

```text
scope-review.md
```

Include:

- count by code area;
- noisy files/directories;
- recommended exclusions/path scoping;
- repository-priority order.

Scope/exclusion is a recommendation until the actual scanner configuration and consequences are verified. Do not disable coverage blindly.

### 3. Severity-First Triage

Process one severity at a time.

Within severity, process rule/type groups in repository-priority order.

For every finding:

1. read the affected live file, starting with the relevant region and expanding until the owning code path, surrounding data flow, and runtime context are clear;
2. if the classification depends on file-wide state or the local context is insufficient, read the full file before deciding;
3. if multiple findings reference the same unchanged file, reuse the already-sufficient file context until that file changes;
4. identify runtime context and reachable inputs;
5. invoke Security/Auth only when security/trust analysis is required;
6. classify exactly one of:
   - Real Risk;
   - Latent Risk;
   - False Positive;
   - Tooling Noise / Out-of-Scope;
7. map/apply the SEC pattern when relevant;
8. choose an action:
   - code fix;
   - documentation/pattern update;
   - rule scope change;
   - Codacy ignore/suppress as last resort;
   - no action.

If line numbers drift from the artifact, use the current live code for reasoning and record the drift.

For `.copilot/tasks/{task_id}/`, create/update one artifact per severity:

```text
triage-{severity}.md
```

Include:

- rule/type groups;
- per-finding classification;
- rationale;
- file/runtime area;
- SEC mapping;
- exact files needing change;
- proposed action.

## 4. Rule Necessity Review — Mandatory

Aggregate by repeated rule.

For each repeated rule:

- count findings;
- identify dominant file types/layers;
- calculate or report the proportion classified as false-positive/tooling-noise when the data permits;
- identify whether real risks were also found;
- decide exactly one primary rule posture:
  - **keep**
  - **keep with narrower scope**
  - **keep but document known pattern**
  - **disable/demote for repository or justified path scope**

Tie the decision to repository evidence, not annoyance.

A rule with some false positives may still be valuable if it catches meaningful production risk.

A rule that is structurally mismatched to tests/dev tooling may deserve path narrowing instead of global disable.

For `.copilot/tasks/{task_id}/`, create/update:

```text
rule-review.md
```

Include:

- section per repeated rule;
- counts/classification mix;
- keep/adjust/disable decision;
- rationale;
- Codacy configuration follow-up;
- AI/security pattern implications.

## 5. Remediation Plan or Implementation

### Review-only

If implementation was not requested:

- do not edit code/config merely to produce a green scanner;
- produce a prioritized remediation plan.

### Implementation requested

Invoke `implementation-agent` with:

- classified findings;
- approved action per finding/rule;
- Security/Auth constraints when any;
- Architecture constraints when any;
- allowed rule/scope changes;
- required durable-pattern changes.

Require:

- minimum safe edits;
- no unrelated refactors;
- real fix before suppression where appropriate;
- no scanner-only correctness degradation;
- tests changed only where behavior/hardening requires proof.

For `.copilot/tasks/{task_id}/`, create/update:

```text
remediation.md
```

Include:

- must-fix findings;
- follow-ups;
- rule-tuning actions;
- code/config/guardrail changes applied or deferred;
- residual blockers.

## 6. Patterns, Prompt, and Guardrail Propagation

For every durable confirmed false-positive or remediation pattern:

1. update `docs/ai/general/SECURITY_CODING_PATTERNS.md` so the finding is not rediscovered/rehandled from scratch later;
2. reuse or extend an existing SEC entry when it already covers the pattern; add a new entry only for a genuinely new reusable pattern;
3. keep Pattern Index and detailed SEC section aligned;
4. if the pattern changes broad implementation/security behavior, propagate to the repository AI surfaces explicitly required by current agent-infrastructure rules.

Do not mass-update unrelated instruction surfaces.

### Mechanical production-risk guardrail

When a confirmed **real-risk** pattern is:

- mechanically detectable; and
- low false-positive risk;

add/update an appropriate local guardrail, for example:

- architecture lint;
- ESLint;
- focused static validation script;
- another established repository guard mechanism.

Do not leave a safely automatable production-risk rule only in agent memory/documentation.

Before introducing a new guard mechanism, inspect existing repository enforcement and prefer extending the established mechanism.

For `.copilot/tasks/{task_id}/`, create/update:

```text
patterns-propagation-report.md
```

Include:

- SEC entries added/updated;
- AI surfaces propagated;
- mechanical guardrail added/updated, if any;
- why automation is or is not appropriate.

## 7. Validation

### If edits were applied

Execute validation proportional to the actual changes using repository rules and the explicit Workflow 11 requirements below. Use `validation-strategy` when the minimum safe scope was not already clear; do not invoke it redundantly when the required scope is already established.

The neutral Workflow 11 explicitly requires:

- prefer `pnpm lint --fix` over plain `pnpm lint` where linting is required by repository rules;
- run `pnpm typecheck`;
- run targeted tests for changed areas;
- run broader tests only when justified.

Also honor stronger closure gates inherited from `CLAUDE.md`.

Validate rule/scanner configuration changes at the level necessary to prove they reduce noise without hiding intended production findings.

Never label a failure pre-existing without evidence.

### Review-only

If no edits were made:

- do not run commands merely for ceremony;
- state that no validation commands were required;
- record any validation that would be required if remediation is later implemented.

For `.copilot/tasks/{task_id}/`, create/update:

```text
validation.md
```

## 8. Final Review Summary

For `.copilot/tasks/{task_id}/`, create/update:

```text
final-summary.md
```

Organize exactly:

1. Severity summary
2. Type/rule summary
3. Real risks
4. Confirmed false positives
5. Tooling noise / out-of-scope findings
6. Rules to keep
7. Rules to scope or disable
8. AI instruction updates made
9. Recommended next actions

## Baseline and Line-Drift Checks

Before completion, explicitly report:

- whether the findings artifact contained duplicates;
- whether dev-only/editor tooling is causing low-signal volume;
- whether repeated false positives map to reusable SEC patterns;
- whether rule tuning is better than code churn;
- whether test/script findings received appropriately lower priority;
- whether any artifact line numbers drifted from live code;
- whether a previous findings baseline was available;
- when a baseline exists, which findings appear new vs historical;
- whether a compact findings JSON is the better human-review artifact than raw SARIF for this task.

Do not claim “new finding” vs “historical noise” without an actual baseline comparison.

## Artifact Ownership

For `.copilot/tasks/{task_id}/`:

- when `workflow-orchestrator` owns the task, it owns top-level task lifecycle/control artifacts;
- when `workflow-orchestrator` owns the task, Workflow 11 updates the existing `intake.md` only with its Codacy-specific intake section; it must not replace or recreate the parent control artifact;
- when Workflow 11 runs standalone, it may create and own `intake.md` as defined by its workflow contract;
- this workflow owns Workflow 11 phase artifacts;
- standalone runs create/update the normal task controls required by repository artifact authority;
- retrieve targeted artifact guidance only if exact destination/format is unclear.

Canonical Workflow 11 artifacts:

```text
intake.md
scope-review.md
triage-{severity}.md
rule-review.md
remediation.md
patterns-propagation-report.md
validation.md
final-summary.md
```

Specialist persistent summaries remain owned by their specialist skills. Do not create duplicate role summaries.

## Completion Checklist

Do not close until:

- findings JSON was successfully read and normalized;
- duplicates were checked/removed;
- findings were grouped severity-first then by rule/type;
- repository priority ordering was applied;
- every finding was checked against live code;
- every finding has exactly one final classification;
- repeated rules have explicit keep/scope/document/disable decisions;
- production risk and tooling noise are separated;
- remediation plan/implementation state is explicit;
- confirmed durable patterns were propagated where required;
- mechanically detectable low-FP production-risk patterns were guarded or explicitly justified as unsuitable for automation;
- validation was recorded when edits were made;
- review-only runs explicitly state that no commands were required;
- baseline/new-vs-historical status is honest;
- final summary artifact is current.

## Task Lifecycle

Follow the repository task lifecycle from the root instructions; mark the
tracked Linear issue Done only after this workflow's own completion criteria
pass.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.

## Response

For substantial review output, use:

1. Objective
2. Artifact / Normalization Summary
3. Scope and Noise Summary
4. Severity-First Triage Summary
5. Rule Necessity Decisions
6. Remediation / Implementation State
7. Pattern / Guardrail Propagation
8. Validation State
9. Residual Risks / Baseline Gaps
10. Recommended Next Action

## Source and Compatibility

`docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md` remains the neutral cross-tool workflow authority.

`docs/ai/general/SECURITY_CODING_PATTERNS.md` remains the living SEC-pattern authority. Claude Code may use the Pattern Index plus targeted SEC sections instead of loading the full catalogue, but every finding still requires cross-reference before final classification.

For Claude Code, this skill changes context-loading mechanics only. It preserves JSON normalization/dedupe, severity-first ordering, repository layer priority, mandatory live-code triage, four-way classification, scope/noise review, rule necessity review, review-only vs implementation branching, durable pattern/guardrail propagation, validation semantics, baseline checks, and final artifact structure.

If shared Workflow 11 semantics change, propagate them according to repository agent-infrastructure rules.
