Workflow Name: Safe Feature Workflow

Purpose:
Safely introduce a new feature or non-trivial change while preserving architecture, security, runtime correctness, and low blast radius.

This workflow is platform-agnostic and may be used in Codex, Zencoder, or similar agent environments.

Mode ID:

- `safe-feature-workflow`

Available agents:

- Architecture Guard Agent
- Security/Auth Agent
- Next.js Runtime Agent
- Implementation Agent

Before running this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

==================================================
WORKFLOW GOAL
==================================================

Use this workflow to implement a feature or non-trivial change only after constraints are clarified.

The workflow must:

- preserve modular-monolith integrity
- preserve DI/composition discipline
- preserve auth/security correctness when relevant
- preserve Next.js runtime correctness when relevant
- keep blast radius low
- avoid unnecessary overlap between agents
- remain practical for real engineering work

Implementation must happen only after the relevant constraints are clear.

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- treat repository code as the source of truth
- prefer minimal safe changes
- inspect affected files before editing
- use specialist agents only when relevant
- avoid duplicated agent work
- stop before implementation if structural/security/runtime ambiguity is too high
- update or propose tests when behavior changes

Never:

- let Implementation Agent invent architecture
- let specialist agents overlap unnecessarily
- run full security review when the task is clearly unrelated
- run full runtime review when the task is clearly unrelated
- implement speculative structural changes without approval

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- new features
- non-trivial behavior changes
- cross-file changes
- changes that may affect boundaries, auth, tenancy, runtime, caching, or request handling
- changes likely to require tests

Do not use for:

- trivial copy or formatting edits
- simple isolated changes with no architecture/security/runtime implications
- purely read-only audits
- obviously mechanical refactors already proven safe

==================================================
EXPECTED USER INPUT
==================================================

Minimum expected inputs:

- requested feature or change
- expected behavior / acceptance criteria
- any known affected area
- any explicit constraints or non-goals

Helpful optional inputs:

- relevant files, diff, or branch context
- security sensitivity
- runtime expectations
- testing expectations

If inputs are incomplete, make reasonable low-risk assumptions when possible.
If safe implementation depends on unresolved constraints, stop and surface them.

==================================================
FAST PATH
==================================================

If the change clearly satisfies ALL of the following:

- affects only a small number of files
- does not touch architecture boundaries
- does not touch auth/security flows
- does not affect runtime placement or caching
- does not modify contracts or DI/composition
- does not change public behavior significantly

Then the workflow may skip Steps 2–4 and proceed directly to:

Step 6. Implementation
Step 7. Validation

The Implementation Agent must still:

- identify affected files
- keep blast radius low
- update tests if behavior changes
- report any unexpected architectural/security/runtime concerns.

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Intake and Scope

- Parse the user request.
- Determine whether the change is trivial or non-trivial.
- Identify likely affected modules/layers.
- Determine whether the task potentially touches:
  - architecture boundaries
  - DI/composition
  - auth/security
  - tenancy
  - server/client placement
  - route handlers or server actions
  - caching/revalidation
  - tests

Step 2. Architecture Guard Review

- Always run Architecture Guard Agent first for non-trivial work.
- Ask it to:
  - validate architecture fit
  - identify affected modules and ownership boundaries
  - identify docs/code drift if relevant
  - call out structural risks
  - recommend the minimum safe implementation shape

Output required from this step:

- architecture fit assessment
- affected files/modules/layers
- structural constraints
- stop/go recommendation for implementation

Step 3. Conditional Security/Auth Review
Run Security/Auth Agent only if the change touches or may affect:

- authentication
- authorization
- roles/permissions/policies
- tenancy/org context
- membership checks
- provider isolation
- middleware/route/server-action enforcement
- sensitive data exposure
- trust boundaries

Ask it to:

- review auth/security implications
- identify enforcement points
- identify trust-boundary risks
- define auth/tenant/sensitive-data constraints for implementation

Output required from this step:

- auth/security constraints
- enforcement requirements
- stop/go recommendation from security perspective

Step 4. Conditional Next.js Runtime Review
Run Next.js Runtime Agent only if the change touches or may affect:

- src/app/\*
- App Router behavior
- server/client boundaries
- server actions
- route handlers
- middleware/proxy behavior
- caching/revalidation
- edge vs node runtime
- deployment/runtime assumptions

Ask it to:

- review runtime placement
- review route/server-action/middleware responsibilities
- review cache/revalidation implications
- define runtime constraints for implementation

Output required from this step:

- runtime constraints
- placement/caching guidance
- stop/go recommendation from runtime perspective

Step 5. Constraint Summary and Implementation Decision

- Combine outputs from prior steps.
- Remove duplicate constraints.
- Produce one implementation-ready constraint summary.

If unresolved issues remain in architecture, security, or runtime:

- stop here
- report the blocking questions or decisions
- do not implement

If constraints are sufficiently clear:

- proceed to Implementation Agent

Constraint summary must include:

- Architecture constraints
- Security/Auth constraints (if any)
- Runtime constraints (if any)
- Explicitly allowed implementation scope
- Explicitly forbidden changes

Step 6. Implementation

- Invoke Implementation Agent with:
  - user request
  - affected files/modules
  - approved constraints from Architecture Guard
  - approved constraints from Security/Auth if used
  - approved constraints from Next.js Runtime if used
- Require the Implementation Agent to:
  - read required repository protocol/context files
  - identify affected files before editing
  - make the minimum safe change
  - update tests when behavior changes
  - avoid redesigning architecture
  - report uncertainty instead of guessing

Step 7. Validation and Close-Out

- Require validation proportional to risk:
  - targeted tests first
  - typecheck and broader tests when justified
- Summarize:
  - what changed
  - what was validated
  - residual risks
  - follow-ups if needed

Optional Step 8. Post-Implementation Architecture Check

If the change affects:

- multiple modules
- contracts
- DI/composition
- security enforcement points
- runtime placement

Then optionally run Architecture Guard Agent again to verify:

- boundaries remain intact
- no unintended dependency drift occurred
- implementation respected constraints.

==================================================
DECISION / BRANCHING RULES
==================================================

Always:

- Architecture Guard Agent first for non-trivial work

Run Security/Auth Agent only when relevant.
Run Next.js Runtime Agent only when relevant.

Skip Security/Auth Agent when:

- no auth, authorization, tenancy, trust-boundary, or sensitive-data concerns are involved

Skip Next.js Runtime Agent when:

- no App Router/runtime/server-client/cache/middleware concerns are involved

Stop before implementation if any of the following occur:

- architecture fit is unclear
- module ownership is unclear
- DI/composition decision is unresolved
- auth/trust-boundary decision is unresolved
- runtime placement or caching decision is unresolved
- the change requires a broad refactor not yet approved
- the change request is too ambiguous to implement safely

==================================================
OUTPUTS PRODUCED BY THE WORKFLOW
==================================================

The workflow must produce:

1. Architecture fit summary
2. Conditional auth/security summary when relevant
3. Conditional runtime summary when relevant
4. Consolidated implementation constraints
5. Affected files/modules list
6. Implementation result
7. Validation result
8. Residual risks / follow-ups

==================================================
FAILURE / BLOCK CONDITIONS
==================================================

The workflow must explicitly stop and report a block when:

- safe implementation requires unresolved architectural decisions
- safe implementation requires unresolved auth/security decisions
- safe implementation requires unresolved runtime/caching decisions
- repository context is contradictory
- requested behavior is under-specified in a risky way
- the implementation would exceed a low-blast-radius change without approval

In a blocked state:

- do not implement
- state exactly what is blocking
- state which specialist decision is needed next

==================================================
EXECUTION STYLE
==================================================

Be:

- practical
- low-duplication
- low-blast-radius
- explicit about constraints
- explicit about uncertainty

Do not:

- run all agents by default if not needed
- duplicate the same review across agents
- let implementation start before constraints are clear
- hide open decisions inside code changes

==================================================
SUCCESS CRITERIA
==================================================

A successful run of this workflow:

- uses the right agents in the right order
- avoids unnecessary overlap
- clarifies constraints before implementation
- implements only after structural/security/runtime fit is established
- keeps changes narrow
- updates or proposes tests appropriately
- produces a clear final result with residual risks called out
