# AI Mode Manifest

## Purpose

This file is the canonical mode registry for the AI operating package in `docs/ai/general`.

Use it to determine:

- which mode to run
- when to run it
- which governing files must be read first
- which specialist authorities apply
- which outputs are required
- whether single-agent sequential fallback is allowed

This manifest does not replace the specialist prompts or workflow files.
It routes work to them.

Repository code remains the source of truth.
If this manifest drifts from the other files or the repository, report the drift explicitly.

---

## Canonical path policy

Always use repo-root-relative paths in prompts and workflow instructions.

Preferred form:

- `docs/ai/general/FILENAME.md`

Avoid as canonical references:

- `./FILENAME.md`
- bare filenames without directory context
- stale root-level paths such as `docs/ai/AGENT_PROTOCOL.md`

Rationale:

- repo-root-relative paths are the most portable across VS Code AI tools
- many tools do not preserve current-file directory as a stable execution context
- absolute repo-relative references are easier to validate automatically

---

## Authority order

When multiple specialist perspectives are involved, authority order is:

1. Architecture Guard Agent
2. Security/Auth Agent
3. Next.js Runtime Agent
4. Validation Strategy Agent
5. Implementation Agent

Conflict handling:

- Architecture Guard decides structure, boundaries, dependency direction, and DI/composition shape.
- Security/Auth decides authentication, authorization, trust boundaries, tenant handling, and sensitive-data enforcement.
- Next.js Runtime decides server/client placement, route/server-action behavior, runtime placement, caching, and deployment/runtime assumptions.
- Validation Strategy decides minimum sensible validation scope once the relevant risks and specialist constraints are known.
- Implementation Agent must follow the above constraints and must not invent new architecture or policy.

---

## Single-agent fallback rule

This package is designed to work with:

- tools that support true multi-agent orchestration
- tools that support only one active agent/prompt at a time

If true multi-agent orchestration is unavailable, run the required specialist roles sequentially in one session, preserving the same authority order and output structure.

Single-agent fallback requirements:

- do not merge specialist conclusions implicitly
- label each specialist section explicitly
- preserve stop/go and blocked decisions from the specialist stage
- do not begin implementation until the required constraint summary is complete

---

## Mode registry

### Mode: `architecture-review`

Purpose:

- validate architecture fit
- identify affected modules/layers
- enforce dependency direction and boundaries
- detect docs/code drift relevant to architecture

Use when:

- structure or ownership is unclear
- a task touches multiple modules or layers
- contracts or DI/composition may change
- a workflow requires Architecture Guard review
- a PR/review asks for architectural assessment

Primary authority:

- Architecture Guard Agent

Required governing files:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/01 - Architecture Guard Agent.md`

Required outputs:

- architecture fit assessment
- affected files/modules/layers
- structural constraints
- docs vs code drift if relevant
- stop/go or blocked recommendation

---

### Mode: `security-review`

Purpose:

- validate authentication, authorization, trust boundaries, tenancy handling, provider isolation, and sensitive-data exposure

Use when:

- auth, session, roles, permissions, policies, tenancy, memberships, or org context are involved
- server actions or route handlers may require permission enforcement
- a workflow requires security review
- a bug or change may create trust-boundary risk

Primary authority:

- Security/Auth Agent

Required governing files:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/02 - Security & Auth Agent.md`

Required outputs:

- security issue or constraint classification
- trust-boundary assessment
- enforcement requirements
- tenant/sensitive-data implications
- stop/go or blocked recommendation

---

### Mode: `runtime-review`

Purpose:

- validate App Router behavior, server/client boundaries, route handlers, server actions, middleware/proxy behavior, caching, and runtime placement

Use when:

- work touches `src/app/*`
- work touches route handlers, server actions, proxy, or middleware
- server/client placement may change
- cache or revalidation behavior may change
- edge vs node runtime behavior may matter

Primary authority:

- Next.js Runtime Agent

Required governing files:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/03 - Next.js Runtime Agent.md`

Required outputs:

- runtime constraints
- placement guidance
- caching/revalidation guidance
- runtime risks or drift notes
- stop/go or blocked recommendation

---

### Mode: `implementation`

Purpose:

- implement already-constrained work with minimal safe edits and low blast radius

Use when:

- the task is sufficiently constrained already
- specialist conclusions are already available
- the change is trivial or qualifies for workflow fast path

Primary authority:

- Implementation Agent, subordinate to specialist constraints

Required governing files:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/04 - Implementation Agents.md`

Required outputs:

- affected files/modules
- implementation result
- validation performed
- residual risks
- explicit blocked status if constraints are insufficient

---

### Mode: `repository-baseline-validation`

Purpose:

- assess the repository-wide validation strategy and quality-gate sufficiency

Use when:

- auditing whether the current validation stack is production-grade
- evaluating whether CI checks and test layers are sufficient for safe future work
- identifying blind spots, over-mocking, weak checks, or missing critical validation coverage

Primary authority:

- Validation Strategy Agent

Required governing files:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/05 - Validation Strategy Agent.md`

Required outputs:

- repository validation posture
- current-state findings
- validation-risk assessment
- recommended validation-scope improvements
- risks and tradeoffs
- validation commands or checks
- recommended next action

---

### Mode: `change-validation`

Purpose:

- determine the minimum sensible validation scope for a specific feature, fix, or refactor

Use when:

- planning validation for a non-trivial change
- deciding which validation layers are required
- preventing both under-validation and wasteful over-validation

Primary authority:

- Validation Strategy Agent

Required governing files:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/05 - Validation Strategy Agent.md`

Required outputs:

- change risk classification
- current-state findings relevant to validation
- validation-risk assessment
- minimum required validation
- optional additional validation
- validation not required
- validation commands or checks
- recommended next action

---

### Mode: `playwright-e2e-validation`

Purpose:

- execute real-browser verification for task-driven flows that require browser evidence

Use when:

- redirects, cookies, hydration, route transitions, or browser/runtime behavior are part of the risk
- task requirements already define browser scenarios, matrices, or checklists
- auth/bootstrap/onboarding behavior must be proven in a real browser
- narrower validation cannot close the risk safely

Primary authority:

- Playwright E2E Agent

Required governing files:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/ARTIFACTS_GUIDE.md`
- `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`
- `docs/ai/general/07 - Playwright E2E Agent.md`

Required outputs:

- objective
- scenarios under test
- preconditions
- commands run
- observed results
- scenario status mapping
- evidence collected
- gaps / deferred checks
- recommended next action

---

### Mode: `auth-flow-change-review`

Purpose:

- review auth/bootstrap/onboarding changes against anti-patterns and the verification matrix before implementation or sign-off

Use when:

- a change touches Clerk auth, bootstrap routing, onboarding redirects, auth middleware, root auth layout boundaries, or `/users` access control
- auth-routing behavior may change
- trust-boundary or redirect-flow risks are present in the changed path
- the matrix sign-off is required before the change is considered safe

Primary authority:

- Security/Auth Agent

Primary workflow file:

- `docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md`

Required governing files:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- `docs/ai/general/02 - Security & Auth Agent.md`
- `docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md`

Specialist sequence:

- Security/Auth Agent first — map the change to matrix scenarios and identify trust-boundary risks
- Next.js Runtime Agent when routing, server/client placement, or caching is involved in the auth path
- Architecture Guard Agent when the change touches module boundaries or DI/composition
- Playwright E2E Agent when browser-level verification evidence is required

Required outputs:

- changed files considered
- trust-boundary assessment
- affected matrix scenario IDs with reasons
- required verification before sign-off
- conditional runtime summary (if Next.js Runtime ran)
- conditional architecture summary (if Architecture Guard ran)
- matrix verification sign-off (Verified / Deferred / Blocked per scenario)
- conditional Playwright evidence (if Playwright E2E ran)
- risks
- recommended next action

---

### Mode: `workflow-task`

Purpose:

- run a non-trivial task through plan-first orchestration with explicit artifacts and specialist sequencing

Use when:

- the task needs multiple specialist steps
- the task should preserve handoffs and artifacts under `.copilot/tasks/{task_id}/` (GitHub Copilot) or `.zencoder/chats/{chat_id}/` (Zencoder — managed automatically by the active chat session) depending on the active tool
- requirements come from a brief, referenced docs, or attachments and need controlled execution
- implementation must not begin until constraints are explicit

Primary authority:

- Workflow Orchestrator Agent

Required governing files:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`
- `docs/ai/general/08 - Workflow Orchestrator Agent.md`

Required outputs:

- objective
- input sources
- task classification
- planned specialist sequence
- artifacts to be produced
- current status
- recommended next action

---

### Mode: `task-brief-authoring`

Purpose:

- prepare a workflow-ready requirements package before orchestration begins

Use when:

- a non-trivial task needs a proper brief
- requirements are spread across multiple sources and need normalization
- orchestration quality depends on explicit scenarios, constraints, and evidence expectations
- the user needs a reusable task brief rather than a one-off prompt

Primary authority:

- Task Brief / Intake Authoring guidance

Required governing files:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/09 - Task Brief Authoring.md`
- `docs/ai/templates/COPILOT_TASK_BRIEF_TEMPLATE.md`

Required outputs:

- objective
- problem statement
- scope
- non-goals
- requirements package
- verification sources
- constraints / assumptions
- open questions
- recommended next action

---

### Mode: `safe-feature-workflow`

Purpose:

- implement a new feature or non-trivial behavior change with the required specialist reviews in the correct order

Use when:

- delivering new behavior
- changing public behavior
- changing multiple files with possible architecture, security, or runtime implications

Primary workflow file:

- `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`

Required governing files:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`

Specialist sequence:

- Architecture Guard first for non-trivial work
- Security/Auth when relevant
- Next.js Runtime when relevant
- Implementation only after constraint summary is complete

Required outputs:

- architecture fit summary
- conditional security summary
- conditional runtime summary
- consolidated implementation constraints
- affected files/modules
- implementation result
- validation result
- residual risks/follow-ups

---

### Mode: `safe-refactor-workflow`

Purpose:

- perform behavior-preserving refactors, cleanup, and structural improvements safely

Use when:

- the intent is refactor/cleanup, not feature delivery
- behavior should remain unchanged
- ownership, boundaries, or DI cleanup may be involved

Primary workflow file:

- `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`

Required governing files:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`

Specialist sequence:

- Architecture Guard first
- Security/Auth when relevant
- Next.js Runtime when relevant
- Implementation only after protected invariants and constraints are clear

Required outputs:

- refactor classification
- architecture fit summary
- conditional security summary
- conditional runtime summary
- protected invariants
- implementation result
- validation result
- residual risks/follow-ups

---

### Mode: `security-incident-workflow`

Purpose:

- investigate and remediate security incidents, auth bugs, trust-boundary failures, data exposure, and cache leaks

Use when:

- there is a vulnerability, auth bug, authorization gap, tenant leak, sensitive-data exposure, or security-relevant runtime flaw

Primary workflow file:

- `docs/ai/general/Workflow 03 - Security Incident Workflow.md`

Required governing files:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/Workflow 03 - Security Incident Workflow.md`

Specialist sequence:

- Security/Auth first
- Next.js Runtime when relevant
- Architecture Guard when structural remediation risk exists
- Implementation only after remediation constraints are clear

Required outputs:

- incident classification
- trust-boundary assessment
- conditional runtime summary
- conditional architecture summary
- consolidated remediation constraints
- implementation result
- validation result
- residual risks/follow-ups

---

### Mode: `architecture-lint`

Purpose:

- run architecture-focused audit/lint review without implementing fixes

Use when:

- reviewing the repo before a refactor
- checking for dependency/boundary drift after a larger change
- performing architectural PR review

Primary authority:

- Architecture Guard Agent in lint-oriented review mode

Required governing files:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/ARCHITECTURE_LINT_RULES.md`
- `docs/ai/general/README-ARCHITECTURE_LINT.md`

Required outputs:

- objective
- lint results
- confirmed violations
- suspicious patterns
- acceptable exceptions
- recommended next action

Forbidden in this mode:

- implementing fixes
- redesigning architecture during lint review

---

### Mode: `prompt-system-validation`

Purpose:

- validate the AI operating package itself as a governed prompt system

Use when:

- auditing `docs/ai/general`
- validating prompt-package changes
- checking mode/workflow/authority consistency
- verifying portability across VS Code AI tools

Primary validation harness:

- `docs/ai/general/PROMPT_SYSTEM_VALIDATION.md`

Required governing files:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/PROMPT_SYSTEM_VALIDATION.md`

Required outputs:

- objective
- inventory
- validation scope
- pass/fail summary
- critical/major/minor gaps
- architectural assessment
- portability assessment
- recommended minimal changes
- verdict

Forbidden in this mode:

- implementing fixes during the validation run
- treating repository architecture lint as equivalent to prompt-system validation

---

### Mode: `debug-investigation`

Purpose:

- gather evidence, trace execution paths, reduce ambiguity, and identify the right specialist before committing to a fix

Use when:

- the bug is unclear, intermittent, or multi-layer
- the correct specialist (architecture, security, runtime) is not yet obvious
- env-driven divergence, race conditions, ordering bugs, or non-deterministic failures are suspected
- the user cannot reproduce reliably or does not know which layer owns the problem

Primary authority:

- Debug Investigation Agent

Required governing files:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/06 - Debug Investigation Agent.md`

Required outputs:

- symptom summary
- execution path trace
- evidence gathered
- hypotheses ranked by likelihood
- recommended next specialist or action

Note:

This mode does NOT produce a remediation plan or implementation.
Its output feeds `incident-investigation`, `architecture-review`, `security-review`, `runtime-review`, or `implementation` depending on findings.

---

### Mode: `incident-investigation`

Purpose:

- investigate and remediate production incidents, unclear bugs, and multi-layer failures through a controlled specialist sequence

Use when:

- there is a production failure, regression, or reproducible bug requiring full investigation
- the failure is confirmed but root cause or safe fix scope is unclear
- the fix may touch architecture, runtime, or security concerns
- a controlled specialist handoff sequence is needed rather than ad hoc debugging

Primary workflow file:

- `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`

Required governing files:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`
- `docs/ai/general/06 - Debug Investigation Agent.md`

Specialist sequence:

- Debug Investigation Agent first — always, for ambiguous or multi-layer failures
- Next.js Runtime Agent when runtime behavior (routing, caching, server/client placement) is involved
- Architecture Guard Agent when the proposed fix risks architectural regression
- Implementation Agent only after the remediation scope is explicit and constraints are clear

Required outputs:

- incident intake and symptom summary
- execution path trace and evidence
- conditional runtime behavior review
- conditional architecture impact review
- remediation plan (smallest safe fix scope)
- implementation result
- validation result
- residual risks / follow-ups

---

## Mode selection rules

Choose exactly one primary mode first.

Selection order:

1. If the task is a change to Clerk auth, bootstrap routing, onboarding, auth middleware, root auth layout, or `/users` access control, use `auth-flow-change-review`.
2. If the task is a vulnerability, auth bug, trust-boundary issue, cache leak, or sensitive-data incident, use `security-incident-workflow`.
3. If the task is a confirmed production failure or regression requiring full specialist sequencing, use `incident-investigation`.
4. If the task is an unclear, ambiguous, or intermittent bug where the correct specialist is not yet known, use `debug-investigation` first.
5. If the task is a behavior-preserving cleanup/refactor, use `safe-refactor-workflow`.
6. If the task is a new feature or non-trivial behavior change, use `safe-feature-workflow`.
7. If the task is a repository-wide audit of testing, CI checks, or validation sufficiency, use `repository-baseline-validation`.
8. If the task is to determine the minimum sensible validation plan for a specific change, use `change-validation`.
9. If the task is a read-only audit of the AI package itself, use `prompt-system-validation`.
10. If the task is a read-only architecture audit/lint request, use `architecture-lint` or `architecture-review` depending on whether lint/rules are the main framing.
11. If the task is already tightly constrained and no workflow is needed, use the narrowest specialist review mode required, or `implementation` if specialist conclusions already exist.

Do not start in `implementation` if architecture, security, or runtime constraints are unresolved.

---

## Required minimum output schema

All non-trivial modes should produce, in mode-appropriate form:

1. Objective
2. Mode selected
3. Affected files/modules/layers
4. Constraints or findings
5. Blocked/stop-go status
6. Validation performed or required
7. Residual risks/follow-ups

Workflow modes should additionally include the specialist summaries required by their workflow file.

---

## Drift handling

If this manifest conflicts with specialist or workflow files:

- trust repository code first
- then trust the more specific workflow or specialist file for mode-local behavior
- report the drift explicitly
- do not silently invent a hybrid rule
