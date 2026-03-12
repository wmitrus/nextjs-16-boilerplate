# Prompt System Validation

## Purpose

This file is the canonical validation harness for the AI operating package in `docs/ai/general`.

Use this mode to audit the prompt system itself.

Do not use it to:

- implement repository code changes
- run feature workflows
- run refactor workflows
- remediate incidents
- perform ordinary architecture lint of application code

This is a read-only governance audit of the prompt package.

---

## Validation target

The validation target is the AI operating package contained in:

- `docs/ai/general`

Treat these documents as the system under test.

Repository code may be consulted only when needed to confirm whether prompt claims are grounded in live repository reality.

If prompt files and repository code differ:

- trust repository code as the final source of truth
- report the drift explicitly
- do not silently reconcile the difference

---

## When to use this harness

Use this harness when:

- auditing whether the AI package is coherent and portable
- validating a change to the prompt package itself
- checking whether modes, workflows, and authority boundaries remain internally consistent
- checking whether the package is suitable for VS Code AI integrations
- performing periodic governance review of the AI setup

Do not use this harness when:

- implementing application code
- reviewing an ordinary feature diff
- performing a repository architecture lint pass
- running a security incident remediation workflow

---

## Governing files

Always read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/PROMPT_SYSTEM_VALIDATION.md`

Read any additional files inside `docs/ai/general` that are required to validate the package fully.

---

## Single-agent compatibility rule

This validation harness must work in:

- tools with true multi-agent orchestration
- tools with only a single active prompt/session

If multi-agent execution is unavailable, perform the validation sequentially in a single session.

Single-agent validation requirements:

- preserve explicit sectioning by validation category
- do not invent hidden sub-results
- state when a conclusion is confirmed versus inferred
- keep the final verdict evidence-based

---

## Validation rules

### 1. Inventory completeness

Identify:

- all specialist prompt files
- all workflow files
- all governance/manifest files
- all validation/lint-related files

Flag:

- orphaned documents
- duplicate files with overlapping canonical purpose
- missing expected routing artifacts

---

### 2. Canonical-path integrity

Verify:

- referenced files actually exist
- canonical files are named consistently
- repo-root-relative path policy is followed

Classify drift as:

- minor naming drift
- stale path drift
- execution-blocking path drift

---

### 3. Authority model integrity

Verify:

- agent authority is explicit
- conflict resolution is defined
- implementation is subordinate to specialist constraints
- ownership between architecture, security, and runtime is sufficiently separated

Flag:

- overlapping ownership without tie-break rule
- implicit authority assumptions
- implementation instructions that bypass specialist ownership

---

### 4. Mode integrity

Verify:

- each formal mode has a clear purpose
- trigger conditions are explicit
- governing files are declared
- required outputs are defined
- mode-selection rules are coherent

Flag:

- undocumented modes
- overlapping modes without routing guidance
- workflows that are not represented in the mode registry

---

### 5. Workflow integrity

Verify:

- workflow entry criteria are explicit
- specialist review ordering is coherent
- stop/block conditions exist
- implementation starts only after constraints are clear
- outputs are defined

Flag:

- missing branching rules
- speculative implementation paths
- workflow steps that depend on undocumented assumptions

---

### 6. Portability across AI tools

Assess whether the package is portable across VS Code AI integrations by checking:

- dependence on multi-agent orchestration
- dependence on cwd-relative paths
- dependence on platform-specific control flow
- dependence on unstated tool memory or state persistence

Flag:

- assumptions tied to one AI runtime
- missing single-agent fallback guidance
- hidden execution model assumptions

---

### 7. Output contract consistency

Verify consistency of:

- severity language
- blocked-status language
- required output sections
- evidence expectations
- implementation gating language

Flag:

- inconsistent status vocabularies without rationale
- missing required output structures
- materially different evidence standards across comparable modes

---

### 8. Validation readiness

Verify whether the package contains:

- a canonical self-audit harness
- a discoverable entrypoint for that harness
- enough rules to reproduce audits consistently

Flag:

- missing validation entrypoint
- self-audit instructions existing only inside ad hoc reports
- no clear distinction between prompt-system validation and repository-code lint

---

## Severity model

Use:

- `CRITICAL`
- `MAJOR`
- `MINOR`
- `INFORMATIONAL`

Guidance:

`CRITICAL`

- the package cannot be executed reliably due to contradictory or missing core routing/governance instructions

`MAJOR`

- the package is usable but materially non-portable, ambiguous, or missing a required governance mechanism

`MINOR`

- the package is coherent overall but has gaps that may cause drift or inconsistent execution

`INFORMATIONAL`

- useful observations without immediate governance failure

---

## Required response format

Every run of this harness must produce:

1. Objective
2. Inventory
3. Validation Scope
4. Pass/Fail Summary
5. Critical Gaps
6. Major Gaps
7. Minor Gaps
8. Informational Notes
9. Architectural Assessment
10. Portability Assessment
11. Recommended Minimal Changes
12. Verdict

Requirements:

- quote exact file paths when identifying evidence
- distinguish confirmed issues from inference
- do not implement fixes during the validation run
- do not redesign the whole system in the audit response

---

## Validation prompt

Use the following prompt as the canonical self-audit prompt for this package.

```md
Validate the AI operating package in `docs/ai/general` using Prompt System Validation mode.

Read at minimum:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/PROMPT_SYSTEM_VALIDATION.md`

Then inspect the remaining files in `docs/ai/general` as needed.

Audit goal:

- determine whether the prompt system is internally coherent
- determine whether the mode/workflow system is complete enough for reuse
- determine whether the package is portable across VS Code AI tools
- identify governance drift, stale references, missing routing, or missing validation structure

Constraints:

- this is a read-only audit of the prompt package
- do not implement fixes
- do not review unrelated repository code unless needed to validate prompt claims
- be explicit about confirmed evidence versus inference

Use the required response format defined in `docs/ai/general/PROMPT_SYSTEM_VALIDATION.md`.
```

---

## Drift handling

If this file conflicts with `MODE_MANIFEST.md` or the protocol/context files:

- trust repository code first
- then trust the more specific validation-harness file for self-audit behavior
- report the drift explicitly
- do not silently combine contradictory rules
