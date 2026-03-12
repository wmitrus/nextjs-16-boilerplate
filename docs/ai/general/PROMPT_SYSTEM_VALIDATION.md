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
3. Pass/Fail Summary
4. Critical Gaps
5. Major Gaps
6. Minor Gaps
7. Architectural Assessment
8. Portability Assessment
9. Recommended Minimal Changes
10. Verdict

Requirements:

- `Pass/Fail Summary` must report pass/fail explicitly for each validation category:
  - source of truth and drift
  - authority model
  - mode and workflow completeness
  - single-agent portability
  - output contract quality
  - enforcement quality
  - reusability for VS Code AI integrations
  - validation readiness
- quote exact file paths when identifying evidence
- distinguish confirmed issues from inference
- do not implement fixes during the validation run
- do not redesign the whole system in the audit response

---

## Validation prompt

Use the following prompt as the canonical self-audit prompt for this package.

```md
You are auditing an AI operating package intended to work across VS Code-integrated AI tools.

Your task is to validate the prompt system itself, not to implement code changes.

Scope:

- Read all files inside `docs/ai/general`
- Treat those files as the source material under audit
- Do not assume missing files exist
- Do not infer undocumented capabilities from a specific AI platform

Validation objective:
Determine whether this package provides a professional, reusable, tool-agnostic setup for agent modes and workflows, with clear authority boundaries, reliable workflow branching, and practical portability across AI tools that may support either:

- true multi-agent orchestration
- or only a single active agent/prompt at a time

Required validation rules:

1. Source of truth and drift

- Verify whether referenced files actually exist.
- Flag stale paths, duplicate canonicals, or contradictory file naming.
- Distinguish minor naming drift from execution-blocking drift.

2. Authority model

- Validate whether agent authority is explicit, non-overlapping, and conflict-resolvable.
- Verify whether the implementation role is subordinate and constrained.
- Identify any ambiguity in ownership across architecture, security, and runtime.

3. Mode and workflow completeness

- Identify all operating modes or equivalent constructs present in the docs.
- Identify all workflows and their trigger conditions.
- Check whether mode selection is explicit enough for a generic AI tool.
- Flag missing mode registry, trigger matrix, or branching rules.

4. Single-agent portability

- Assess whether the package can be executed by a tool that cannot spawn specialist sub-agents.
- Check whether the docs define a fallback sequential execution model inside one agent/session.
- If missing, classify as a portability gap.

5. Output contract quality

- Check whether workflows produce consistent outputs across:
  - findings
  - constraints
  - blocked states
  - validation results
  - residual risks
- Flag missing shared schema or inconsistent status/severity taxonomies.

6. Enforcement quality

- Determine whether the package gives enough instruction to prevent:
  - architecture drift
  - security-review omission when relevant
  - runtime-review omission when relevant
  - speculative implementation before constraints are clear
- Identify where enforcement is strong versus aspirational.

7. Reusability for VS Code AI integrations

- Evaluate whether the package is sufficiently editor/tool agnostic.
- Flag assumptions that depend on a specific AI runtime, agent framework, or orchestration capability.
- Prefer minimal fixes, not redesign.

8. Validation readiness

- Determine whether the package includes a built-in way to audit itself.
- If not, state that gap explicitly.

Required response format:

1. Objective
2. Inventory
3. Pass/Fail Summary
4. Critical Gaps
5. Major Gaps
6. Minor Gaps
7. Architectural Assessment
8. Portability Assessment
9. Recommended Minimal Changes
10. Verdict

Additional requirements:

- `Pass/Fail Summary` must report pass/fail explicitly for each validation category.
- Be strict and evidence-based.
- Quote exact file paths when identifying issues.
- Distinguish confirmed issues from informed inference.
- Do not implement fixes.
- Do not rewrite the entire system.
- Optimize for production-grade maintainability and low blast radius.
```

---

## Drift handling

If this file conflicts with `MODE_MANIFEST.md` or the protocol/context files:

- trust repository code first
- then trust the more specific validation-harness file for self-audit behavior
- report the drift explicitly
- do not silently combine contradictory rules
