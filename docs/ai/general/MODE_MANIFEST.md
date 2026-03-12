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
4. Implementation Agent

Conflict handling:

- Architecture Guard decides structure, boundaries, dependency direction, and DI/composition shape.
- Security/Auth decides authentication, authorization, trust boundaries, tenant handling, and sensitive-data enforcement.
- Next.js Runtime decides server/client placement, route/server-action behavior, runtime placement, caching, and deployment/runtime assumptions.
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

## Mode selection rules

Choose exactly one primary mode first.

Selection order:

1. If the task is a vulnerability, auth bug, trust-boundary issue, cache leak, or sensitive-data incident, use `security-incident-workflow`.
2. If the task is a behavior-preserving cleanup/refactor, use `safe-refactor-workflow`.
3. If the task is a new feature or non-trivial behavior change, use `safe-feature-workflow`.
4. If the task is a read-only architecture audit/lint request, use `architecture-lint` or `architecture-review` depending on whether lint/rules are the main framing.
5. If the task is already tightly constrained and no workflow is needed, use the narrowest specialist review mode required, or `implementation` if specialist conclusions already exist.

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
