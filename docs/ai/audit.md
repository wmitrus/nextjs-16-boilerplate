# Agent Setup Audit

## 1. Objective

Audit `docs/ai/general` as a reusable, professional, tool-agnostic AI operating package for VS Code integrations, with focus on:

- agent authority model
- workflow completeness
- portability across AI tools
- validation readiness
- documentation drift risk

This audit is document-based. It does not claim repository-code validation; it evaluates whether the prompt system itself is coherent, enforceable, and reusable.

Note: the canonical file-path inconsistency identified in this audit was later normalized to repo-root-relative `docs/ai/general/*` paths.

## 2. Current-State Findings

### Must-fix

1. Broken canonical file references reduce portability and reliability.

- `docs/ai/general/04 - Implementation Agents.md` required root-level files that were not present at audit time.
- `docs/ai/general/README-ARCHITECTURE_LINT.md` also referenced root-level canonical paths.
- In the current tree, the canonical files live under `docs/ai/general/`.
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md` already documented stale naming, which confirmed the drift.

Impact:

- any AI tool following the prompts literally can fail before analysis starts
- the package is not yet universal because path assumptions are inconsistent

2. The package defines specialist agents, but not a universal orchestration contract for tools that do not support real multi-agent handoff.

- The documents are written as if an orchestrator can invoke `Architecture Guard Agent`, `Security/Auth Agent`, `Next.js Runtime Agent`, and `Implementation Agent` as separate roles.
- Many VS Code AI integrations only support one active prompt/persona at a time.
- There is no canonical fallback rule such as: "If multi-agent execution is unavailable, emulate the agents sequentially in one response while preserving authority order."

Impact:

- the system is not reliably portable across "any AI tool integrated in VS Code"
- different tools will improvise different orchestration behavior

3. There is no single validation prompt that tests the prompt system itself end-to-end.

- The directory contains role prompts and workflows.
- It does not contain a universal validator prompt for checking:
  - authority precedence
  - workflow branching
  - conflict resolution
  - output schema consistency
  - portability gaps
  - stale references

Impact:

- the package has governance content, but lacks prompt-level QA for the governance package itself

### Should-fix

4. "Mode" terminology is underspecified.

- The package clearly defines agent roles and workflows.
- It does not define a formal mode registry such as `architecture-review`, `security-review`, `runtime-review`, `implementation`, `feature-workflow`, `refactor-workflow`, `incident-workflow`, `lint-mode`.
- `README-ARCHITECTURE_LINT.md` introduces "Architecture Lint Mode", but this is not integrated into the main protocol as a first-class mode.

Impact:

- tool integrators cannot infer a stable trigger matrix for selecting the right operating mode

5. Output contracts are good locally, but not normalized globally.

- Each workflow defines outputs.
- Severity and status vocabularies are partially specialized by document.
- There is no single cross-package schema covering:
  - input assumptions
  - authority consulted
  - blocked-by classification
  - severity taxonomy
  - required evidence
  - final disposition

Impact:

- results will vary more across tools than necessary
- automated validation or benchmark comparison will be harder

6. Tool-agnostic claims are stronger than the actual operating instructions.

- Several files state the workflows are platform-agnostic.
- In practice, they still assume role invocation, ordered specialist review, and persistent instruction-following across steps.
- That is feasible, but only if a single-agent fallback contract is explicit.

Impact:

- the package is close to tool-agnostic in content, but not yet in execution model

### Nice-to-have

7. The package lacks a concise top-level manifest for human and AI consumers.

Recommended missing artifact:

- one file enumerating all roles, all workflows, their triggers, required inputs, outputs, and precedence rules

8. The package lacks explicit validation scenarios.

Recommended missing artifact:

- a compact scenario suite covering:
  - safe feature touching UI only
  - feature touching auth and server actions
  - behavior-preserving refactor across modules
  - cache leak incident in route handler
  - docs/code drift case
  - blocked case due to unclear ownership

## 3. Architectural Assessment

The package is strong in substance. The authority layering is coherent:

- Architecture Guard owns structure and boundaries
- Security/Auth owns trust and enforcement
- Next.js Runtime owns placement and framework behavior
- Implementation is intentionally subordinate

That part is professional and production-oriented.

The main weakness is not conceptual quality. The weakness is operational packaging:

- [x] inconsistent file paths
- no single-agent fallback model
- [x] no canonical validation harness for the prompt system itself
- [x] no formal mode manifest

So the current system is suitable as an internal high-discipline prompt library, but not yet a fully universal VS Code AI setup.

Note: the formal mode manifest gap identified here was later addressed by adding `docs/ai/general/MODE_MANIFEST.md`.
Note: the canonical prompt-system validation harness gap identified here was later addressed by adding `docs/ai/general/PROMPT_SYSTEM_VALIDATION.md`.

## 4. Recommendation

Keep the authority model and workflows. Do not redesign them.

Add a universal validation prompt that any AI tool can run against `docs/ai/general` in read-only audit mode. That validator should:

- treat the prompt package as the subject under test
- verify consistency, portability, and enforceability
- simulate missing multi-agent support by checking whether sequential single-agent execution is possible
- report pass/fail by category
- identify stale references and conflicting instructions
- propose only minimal documentation changes

## 5. Universal Validation Prompt

Use the following prompt as the canonical validator for the agent setup.

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

- Be strict and evidence-based.
- Quote exact file paths when identifying issues.
- Distinguish confirmed issues from informed inference.
- Do not implement fixes.
- Do not rewrite the entire system.
- Optimize for production-grade maintainability and low blast radius.
```

## 6. Risks and Tradeoffs

- Keeping the current multi-agent language preserves rigor, but without a single-agent fallback it will remain uneven across tools.
- Introducing a universal validator improves governance with low blast radius, but it does not by itself fix broken canonical paths.
- A fully normalized mode registry would improve automation, but that is a follow-up improvement, not required before using the validator.

## 7. Validation / Verification

This audit was based on the documents currently present in `docs/ai/general`:

- `00 - Agent Interaction Protocol.md`
- `01 - Architecture Guard Agent.md`
- `02 - Security & Auth Agent.md`
- `03 - Next.js Runtime Agent.md`
- `04 - Implementation Agents.md`
- `Workflow 01 - Safe Feature Workflow.md`
- `Workflow 02 - Safe Refactor Workflow.md`
- `Workflow 03 - Security Incident Workflow.md`
- `REPOSITORY_AI_CONTEXT.md`
- `README-ARCHITECTURE_LINT.md`
- `ARCHITECTURE_LINT_RULES.md`

Confirmed file/path issue observed during audit:

- `docs/ai/general/04 - Implementation Agents.md`
- `docs/ai/general/README-ARCHITECTURE_LINT.md`

Both were examples of files that referenced root-level canonical files not present in the current `docs/ai` tree at audit time.

## 8. Recommended Next Action

Adopt the validation prompt above as the canonical audit prompt for the package, then fix the broken canonical file references before treating this setup as universal across VS Code AI tools.
