---
name: codacy-security-review-workflow
description: Group-by-group Codacy SAST review workflow for CRITICAL/HIGH PR security findings. Use to classify each finding from live code, distinguish Real Risk / Latent Risk / False Positive, prefer real fixes and hardening over suppression, produce the Codacy ignore report, and propagate durable SEC patterns. Requires a user-review pause after intake and after every vulnerability group.
---

# Codacy Security Review Workflow

Triage and remediate Codacy CRITICAL/HIGH security findings one vulnerability class at a time with low blast radius and durable security-pattern learning.

This workflow is specific to Codacy SAST findings. For a known production security incident or trust-boundary breach, use `security-incident-workflow`.

Security/Auth owns finding classification and SEC-pattern semantics. Implementation owns approved code changes/suppressions. Validation Strategy owns validation guidance/evidence. This workflow owns grouping, sequencing, pauses, artifact continuity, scanner-ignore reporting, and final pattern propagation.

## Context Loading

Inherit active repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- `AGENTS.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- the neutral Workflow 10 source;
- the entire `SECURITY_CODING_PATTERNS.md`;
- Security/Auth, Implementation, or Validation source files.

At workflow start:

1. parse the complete Codacy finding list supplied for the review;
2. load the **Pattern Index** from `docs/ai/general/SECURITY_CODING_PATTERNS.md`;
3. group findings by vulnerability class;
4. for each finding, identify plausible matching SEC-ID(s) from the index before classification;
5. load the full section only for the matching/plausible SEC-ID(s);
6. if no existing SEC entry matches, let `security-auth` define the new correct pattern before implementation;
7. expand broader security context only when the index + targeted SEC sections + live code are insufficient.

This preserves the mandatory cross-reference against `SECURITY_CODING_PATTERNS.md` without carrying the entire living catalogue in context.

Repository code is the source of truth, not scanner output or historical line numbers.

## Entry Conditions

Use for:

- Codacy PR comments listing CRITICAL/HIGH security findings;
- Codacy SAST findings requiring individual triage;
- batch false-positive review where findings may mix real and false signals;
- scanner findings requiring low-blast-radius fixes, justified suppressions, and an ignore report.

Do not use for:

- a production security incident with a known trust-boundary breach;
- a single known vulnerability whose secure fix is already fully constrained;
- architecture audits;
- generic Codacy code-quality findings that are not being processed as CRITICAL/HIGH security findings.

Required input is the full finding set for this review, including for each finding:

- file path;
- scanner line number;
- rule/vulnerability name;
- finding text.

PR/branch metadata is helpful but not required if the live working tree is available.

## Non-Negotiable Workflow Principles

Always:

- inspect live code before classification;
- read the **entire affected file** before classifying a finding at a line;
- when several findings in one group reference the same file, read that file once in its current state and reuse that evidence until the file changes;
- cross-reference each finding against the Pattern Index and applicable SEC section before classification;
- process one vulnerability group at a time;
- within a group, keep edits file-scoped and narrow;
- prefer the smallest safe code change that eliminates the risk or scanner signal;
- harden safely where an apparent false positive exposes a weak code shape;
- update/add tests when behavior changes;
- update `SECURITY_CODING_PATTERNS.md` after every completed group;
- persist required workflow artifacts, not chat-only conclusions.

Never:

- classify a finding from scanner text alone;
- classify a finding as false positive without reading its live file/runtime context;
- process multiple vulnerability groups simultaneously;
- suppress before considering a real fix/hardening;
- add `eslint-disable-next-line` without a rationale comment immediately before it;
- add a resolved-by-code finding to the Codacy ignore table;
- weaken correctness, security, validation, or readability merely to remove a scanner signal;
- assume Codacy's original line remains current after edits.

## Mandatory Pause Semantics

This workflow deliberately requires operator review boundaries.

Pause:

1. after Step 1 intake/grouping;
2. after **every** Step 2 vulnerability group.

Do not begin the first group until the intake artifact has been reviewed/continued by the user.

Do not begin group N+1 until group N's artifact, code changes, classification, and SEC-pattern update are complete and the user continues.

Do not silently collapse these pauses into a straight-through batch run.

## Classification Model

For each finding, Security/Auth must classify exactly one:

- **Real Risk**
- **Latent Risk**
- **False Positive**

The classification must be supported by:

- complete affected-file context;
- exact runtime/data-flow context;
- source/trust characteristics of the values reaching the flagged line;
- applicable SEC pattern(s);
- concrete exploitability or lack of exploitability.

Scanner severity is input evidence, not the final security verdict.

### Codacy HIGH `Error prone` TypeScript/JSX

Explicitly separate:

- **security exploit path**; from
- **reliability/type-safety cleanup**.

Apply SEC-24 when live code matches that pattern and no concrete trust-boundary exploit exists.

Do not promote an `Error prone` HIGH to a security vulnerability solely because Codacy labels it HIGH.

Conversely, if live code reveals a real trust-boundary failure, classify from the actual risk and do not hide behind SEC-24.

## Resolution Decision Rules

### Rule 1 — Real fix beats suppress

Prefer a code change that eliminates the vulnerable/flagged pattern over suppression.

### Rule 2 — Suppression is last resort

Use `eslint-disable-next-line` only when:

- Security/Auth confirms the finding is a false positive; and
- no code change can eliminate the scanner signal without degrading correctness or readability.

Every suppression must have a rationale comment immediately before the disable line.

### Rule 3 — Harden before suppressing

If a false positive sits on a weak but hardenable pattern, harden first.

Examples include:

- filesystem path confinement;
- `Map` instead of unsafe/dynamic `Record` access;
- typed dispatch maps;
- other exact patterns already defined by the matching SEC rule.

Suppress only the residual scanner signal that cannot safely be removed.

### Rule 4 — Codacy ignore != ESLint suppression

The Codacy UI ignore report and source-level lint suppression are separate mechanisms.

A finding belongs in the scanner-ignore table only if the scanner-relevant code pattern still exists in the post-fix source.

If a real code fix eliminated the pattern, the finding belongs in **Resolved**, not **Safe to ignore**.

### Rule 5 — Current line numbers for ignore candidates

After all code changes:

- re-open the current post-fix source;
- verify current line numbers for still-present ignore candidates;
- do not copy Codacy's stale original line into the ignore table.

### Rule 6 — Pattern learning after every group

After every group:

- update an existing SEC entry if the group adds durable clarification; or
- add a new SEC entry when the vulnerability/scanner pattern is genuinely new.

Do not defer this work until the final group.

## Ordered Workflow

### 1. Intake — Parse and Group

Parse the complete raw finding list.

Group by vulnerability class, for example:

- Timing Attack;
- Open Redirect;
- Command Injection;
- File Access;
- Weak RNG;
- Authorization;
- SSRF;
- Error prone TypeScript/JSX;
- another scanner class present in the actual finding set.

For every finding:

1. record original scanner file/line/rule/text;
2. cross-reference the Pattern Index;
3. mark matching or plausible SEC-ID(s);
4. mark `No existing SEC match` when genuinely new;
5. do **not** finalize security classification yet.

Count:

- total findings;
- groups;
- findings per group.

For `.copilot/tasks/{task_id}/`, create/update:

```text
intake.md
```

The intake must contain the grouped finding inventory and initial SEC cross-reference.

**Pause for user review before Step 2.**

### 2. Group-by-Group Triage, Fix, Suppress, Learn

Repeat for one group only, then pause.

#### 2A. Security/Auth triage

Invoke `security-auth`.

For the active group:

1. load applicable full SEC section(s);
2. read each affected file in full in its current state;
3. identify exact runtime context and input/trust flow;
4. classify every finding as Real Risk / Latent Risk / False Positive;
5. for HIGH `Error prone`, perform the SEC-24 exploitability split;
6. decide the correct resolution using Rules 1–3;
7. if a known SEC entry applies, use its correct pattern;
8. if no SEC entry applies, define the durable correct pattern **before implementation**;
9. state tests/evidence required if behavior changes;
10. produce a security stop/go decision for the group's implementation.

Do not let Implementation reinterpret the finding's security classification.

#### 2B. Implementation

Invoke `implementation-agent` only after the group is security-constrained.

Require:

- inspect the current affected file before editing;
- minimum safe file-scoped change;
- no unrelated cleanup;
- preserve semantics except for the required security/reliability correction;
- real fix/hardening before suppression;
- rationale immediately before any `eslint-disable-next-line`;
- tests updated/added when behavior changes;
- no weakening merely to silence Codacy.

#### 2C. Security pattern update

Return ownership to `security-auth`.

Update:

```text
docs/ai/general/SECURITY_CODING_PATTERNS.md
```

for any new/changed durable pattern from this group.

The Pattern Index and corresponding detailed SEC section must remain consistent.

Do not add a new SEC entry merely to restate an existing pattern under a different scanner wording.

#### 2D. Group artifact

For `.copilot/tasks/{task_id}/`, create/update exactly one artifact for this group:

```text
group-{N}-{slug}.md
```

Include:

- findings in the group;
- full classification per finding;
- matching SEC entries;
- live-code reasoning;
- resolution decision;
- files changed;
- suppressions with rationale when any;
- tests changed;
- SECURITY_CODING_PATTERNS update;
- residual/open issues;
- group status.

**Pause for user review before any next vulnerability group.**

## Quality Gates — After All Groups

After every group is completed and reviewed, invoke `validation-strategy` to structure the quality-gate evidence and identify any justified additional checks.

The three Workflow 10 gates below are mandatory regardless of any narrower Validation Strategy recommendation and must run in this order:

```shell
pnpm typecheck
pnpm lint
pnpm test
```

Requirements:

- `pnpm typecheck` must exit 0;
- `pnpm lint` must produce 0 errors;
- pre-existing lint warnings may be acceptable globally;
- every file that appeared in the Codacy finding set must end with **0 lint errors and 0 lint warnings**;
- `pnpm test` must introduce no new failures;
- if a new test failure appears, stop before scanner-ignore/final completion;
- never call a failure pre-existing without evidence.

Also honor any stronger repository-wide closure requirement inherited from `CLAUDE.md`; do not replace the Workflow 10 gates with a weaker set.

For `.copilot/tasks/{task_id}/`, write/update:

```text
quality-gates.md
```

with exact commands, exit/result evidence, finding-file lint status, and any proven pre-existing failure evidence.

## Scanner Ignore Report

After fixes and quality gates, produce:

```text
scanner-ignore-report.md
```

### Table 1 — Safe to ignore

Include **only** confirmed false positives whose scanner-relevant pattern still exists in current source.

Columns:

| # | File | Current Line | Rule / Vulnerability Class | Why It Is a False Positive |

Current Line must be verified against post-fix source.

### Table 2 — Resolved

Include findings whose pattern was eliminated by a real code change.

Columns:

| # | File | Original Line | Vulnerability Class | How It Was Fixed |

Do not put resolved findings in Table 1.

If no findings remain safe to ignore, write an empty/none safe-to-ignore section rather than inventing ignore candidates.

## Final Patterns Propagation — Mandatory

The workflow is not complete until this step passes.

For every new SEC entry added during the run, propagate the new durable rule to the surfaces required by neutral Workflow 10:

1. `AGENTS.md` — SEC table;
2. `docs/ai/general/02 - Security & Auth Agent.md` — mandatory security guidance where applicable;
3. `docs/ai/general/04 - Implementation Agents.md` — when the SEC category affects implementation patterns;
4. `.github/agents/security-auth.agent.md`;
5. `.github/agents/implementation-agent.agent.md`;
6. when the pattern affects E2E code:
   - `docs/ai/general/07 - Playwright E2E Agent.md`;
   - `.github/agents/playwright-e2e.agent.md`.

After those Workflow 10 surfaces, update additional AI/runtime surfaces only when the active repository agent-infrastructure rules explicitly require propagation for that specific SEC semantic change. Do not infer or mass-update unrelated surfaces by default.

If no new SEC entry was added:

- list the existing SEC entries matched during the review;
- state that no new-pattern propagation is required;
- still produce the propagation artifact.

If an **existing** SEC entry's shared semantics changed materially, treat that as shared security-guidance change and propagate according to repository agent-infrastructure rules instead of assuming that “no new ID” means “no propagation.”

For `.copilot/tasks/{task_id}/`, produce:

```text
patterns-propagation-report.md
```

## Artifact Ownership

For `.copilot/tasks/{task_id}/`:

- when `workflow-orchestrator` owns the parent task, it owns the top-level lifecycle/control artifacts;
- when `workflow-orchestrator` owns the parent task, Workflow 10 updates the existing `intake.md` only with its Codacy-specific grouped finding inventory; it must not replace or recreate the parent control artifact;
- when Workflow 10 runs standalone, it may create and own `intake.md` as defined by its workflow contract;
- this workflow owns its Workflow 10 phase artifacts;
- standalone runs create/update the normal task control artifacts required by repository artifact authority;
- retrieve targeted artifact guidance if a destination/format is unclear rather than inventing parallel conventions.

Canonical Workflow 10 artifacts:

```text
intake.md
group-{N}-{slug}.md
quality-gates.md
scanner-ignore-report.md
patterns-propagation-report.md
```

Specialist persistent summaries are maintained by the invoked specialist skills according to their own artifact contracts. Do not create duplicate role summaries.

## Completion Checklist

Do not close until all are true:

- all supplied Codacy findings are classified and addressed;
- every group was processed separately and received its required review pause;
- all Real/Latent Risks received an approved resolution or explicit block;
- every source suppression has an immediately preceding rationale;
- `pnpm typecheck` passed;
- `pnpm lint` has 0 errors;
- every finding file has 0 lint errors/warnings;
- `pnpm test` has no new failures;
- scanner ignore report contains only still-present confirmed false-positive patterns;
- ignore-table line numbers are current;
- resolved findings are not in the ignore table;
- `SECURITY_CODING_PATTERNS.md` is current and index/detail sections agree;
- final pattern propagation is complete or explicitly confirmed unnecessary;
- all required artifacts are current.

## Task Lifecycle

Follow the repository task lifecycle from the root instructions; mark the
tracked Linear issue Done only after this workflow's own completion criteria
pass — not during the required between-group pauses.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.

## Response

### Intake output

Use:

1. Objective
2. Finding Count
3. Grouped Findings
4. Initial SEC Cross-Reference
5. Group Order
6. Open Questions / Evidence Gaps
7. Current Workflow Status
8. Required User Review Before Group 1

### Per-group output

Use:

1. Active Group
2. Findings and Classification
3. Live-Code / Trust Analysis
4. SEC Pattern Mapping
5. Resolution Applied
6. Tests / Validation Changes
7. Pattern Update
8. Residual Risk
9. Group Status
10. Required User Review Before Next Group

### Final output

Use:

1. Objective
2. Group Summary
3. Quality Gates
4. Scanner Ignore Summary
5. Pattern Propagation
6. Residual Risks / Blocks
7. Recommended Next Action

## Source and Compatibility

`docs/ai/general/Workflow 10 - Codacy Security Review Workflow.md` remains the neutral cross-tool workflow authority.

`docs/ai/general/SECURITY_CODING_PATTERNS.md` remains the living security-pattern authority. Claude Code may use its Pattern Index plus targeted SEC sections instead of loading the full catalogue, but every finding must still be cross-referenced before classification.

For Claude Code, this skill changes context-loading mechanics only. It preserves group-by-group processing, mandatory pauses, full-file inspection, Real Risk / Latent Risk / False Positive classification, real-fix-before-suppress rules, post-group pattern updates, exact Workflow 10 quality gates, scanner-ignore semantics, and mandatory final propagation.

If shared Workflow 10 semantics change, propagate them according to repository agent-infrastructure rules.
