Workflow Name: Safe Refactor Workflow

Purpose:
Safely perform refactors, cleanup, module moves, dependency cleanup, and structural improvements that are intended to preserve behavior.

This workflow is platform-agnostic and compatible with Codex, Zencoder, or similar agent environments.

Available agents:

- Architecture Guard Agent
- Security/Auth Agent
- Next.js Runtime Agent
- Implementation Agent

==================================================
WORKFLOW GOAL
==================================================

Use this workflow for structural or code-quality improvements that are intended to preserve behavior.

The workflow must:

- preserve modular-monolith integrity
- preserve DI/composition discipline
- preserve auth/security correctness when relevant
- preserve runtime correctness when relevant
- keep blast radius low
- avoid accidental behavior changes
- remain practical for real engineering work

Assumptions:

- refactor does not mean rewrite
- cleanup does not justify architecture drift
- implementation happens only after constraints are clear

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- treat repository code as the source of truth
- preserve observable behavior unless an intentional behavior change is explicitly approved
- prefer narrow refactors over broad rewrites
- identify affected layers and boundaries before editing
- use specialist agents only when relevant
- update tests if refactor changes test surface or contract surface
- stop if the refactor is not actually safe without broader decisions

Never:

- mix opportunistic behavioral changes into refactor work
- let Implementation Agent redesign architecture
- run full specialist reviews if clearly irrelevant
- hide architecture changes inside “cleanup”
- widen coupling in the name of simplification
- change public contracts unless that change is explicitly intended and reviewed

Before specialist review or implementation, agents must read and follow:

- docs/ai/general/00 - Agent Interaction Protocol.md
- docs/ai/general/REPOSITORY_AI_CONTEXT.md

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- cleanup
- dependency cleanup
- file/module moves
- code organization improvements
- DI cleanup
- boundary cleanup
- extraction or consolidation intended to preserve behavior
- replacing weak patterns with safer equivalents without changing intended outcomes

Do not use for:

- new features
- intended behavior changes
- vulnerability remediation under active risk
- auth bug fixes with unclear impact
- runtime bug fixes where behavior must change
- incident response
- broad redesign disguised as refactor

==================================================
EXPECTED USER INPUT
==================================================

Minimum expected inputs:

- the refactor goal
- the behavior that must remain unchanged
- known affected files/modules if available
- any explicit constraints

Helpful optional inputs:

- current pain point
- target module ownership
- known architecture smell
- tests that should continue to pass

If inputs are incomplete, make only low-risk assumptions.
If safe refactoring depends on unresolved invariants, stop and surface them.

==================================================
FAST PATH
==================================================

If the refactor clearly satisfies all of the following:

- affects only a small number of files
- does not touch contracts
- does not touch DI/composition
- does not touch auth/security-sensitive paths
- does not affect runtime placement or caching
- does not cross module boundaries
- is intended to preserve behavior

Then the workflow may use a fast path:

- Step 1. Intake and Refactor Classification
- Step 2. Architecture Guard Review
- Step 6. Implementation
- Step 7. Validation

Security/Auth Agent and Next.js Runtime Agent should be skipped unless new evidence shows they are relevant.

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Intake and Refactor Classification

- Parse the request.
- Confirm the intent is refactor/cleanup, not feature delivery.
- Identify the expected invariant behavior.
- Identify likely affected modules/layers.
- Determine whether the refactor may touch:
  - boundaries
  - DI/composition
  - auth/security-sensitive paths
  - runtime placement
  - public contracts
  - tests

Output from this step:

- refactor classification
- expected unchanged behavior
- likely affected areas

Step 2. Architecture Guard Review

- Always run Architecture Guard Agent first.
- Ask it to:
  - validate whether the proposed refactor fits the architecture
  - identify ownership boundaries
  - identify whether the refactor crosses modules/layers
  - identify docs/code drift if relevant
  - define what must remain unchanged structurally
  - state whether the refactor is safe, risky, or blocked

Required output:

- architecture fit
- affected files/modules/layers
- structural constraints
- explicitly protected invariants
- stop/go recommendation

Step 3. Conditional Security/Auth Review
Run Security/Auth Agent only if the refactor touches or may affect:

- auth flows
- authorization enforcement
- tenancy/org context
- provider isolation
- sensitive data handling
- trust boundaries
- server actions / route handlers with security significance

Ask it to:

- identify security/auth invariants that must remain unchanged
- identify trust-boundary risks introduced by the refactor
- state whether the refactor is safe, risky, or blocked from the security perspective

Required output:

- auth/security invariants
- trust-boundary constraints
- stop/go recommendation

Step 4. Conditional Next.js Runtime Review
Run Next.js Runtime Agent only if the refactor touches or may affect:

- src/app/\*
- App Router boundaries
- server/client placement
- server actions
- route handlers
- middleware/proxy
- caching/revalidation
- edge vs node runtime
- env exposure/runtime assumptions

Ask it to:

- identify runtime invariants that must remain unchanged
- identify placement/caching/runtime risks introduced by the refactor
- state whether the refactor is safe, risky, or blocked from the runtime perspective

Required output:

- runtime invariants
- placement/caching constraints
- stop/go recommendation

Step 5. Refactor Constraint Summary

- Consolidate outputs from previous steps.
- Remove duplication.
- Produce one implementation-ready refactor brief.

Constraint summary must include:

- architecture constraints
- security/auth constraints if any
- runtime constraints if any
- explicitly protected behavior/invariants
- explicitly forbidden refactor moves
- allowed implementation scope
- whether public contracts must remain unchanged

If unresolved risks remain:

- stop here
- do not implement
- report what is blocking safe refactor

Step 6. Implementation

- Invoke Implementation Agent with:
  - refactor goal
  - protected invariants
  - affected files/modules
  - approved constraints from prior steps
- Require it to:
  - make the minimum safe refactor
  - preserve behavior
  - avoid opportunistic redesign
  - update tests if needed
  - report uncertainty instead of guessing

Step 7. Validation

- Require validation proportional to refactor scope:
  - targeted tests first
  - typecheck
  - architecture lint when relevant
  - broader tests when refactor crosses boundaries

Validation should confirm:

- behavior remains intact
- boundaries remain intact
- no new runtime/security issues were introduced

Optional Step 8. Post-Refactor Architecture Check
If the refactor affects:

- multiple modules
- contracts
- DI/composition
- structural boundaries

then run Architecture Guard Agent again to verify:

- no dependency drift occurred
- boundaries remain intact
- the refactor respected the approved constraints

==================================================
DECISION / BRANCHING RULES
==================================================

Always:

- Architecture Guard Agent first

Run Security/Auth Agent only when auth/security/trust boundaries may be affected.
Run Next.js Runtime Agent only when runtime behavior may be affected.

Stop before implementation if:

- the refactor would change behavior unintentionally
- module ownership becomes unclear
- DI/composition changes are unresolved
- auth/security invariants are unclear
- runtime placement/caching invariants are unclear
- the refactor is actually a disguised redesign or feature change

If the refactor is local and clearly does not affect auth/security or runtime-sensitive concerns:

- skip those specialist reviews

If the refactor crosses multiple layers or contracts:

- strongly prefer the post-refactor Architecture Guard check

==================================================
OUTPUTS PRODUCED BY THE WORKFLOW
==================================================

The workflow must produce:

1. Refactor classification
2. Architecture fit summary
3. Conditional auth/security summary when relevant
4. Conditional runtime summary when relevant
5. Consolidated refactor constraints
6. Protected invariants / expected unchanged behavior
7. Implementation result
8. Validation result
9. Residual risks / follow-ups

==================================================
FAILURE / BLOCK CONDITIONS
==================================================

The workflow must stop and report a block when:

- the refactor cannot be performed safely without changing behavior
- required invariants are unclear
- module ownership or dependency direction would become weaker
- auth/security or runtime-sensitive paths would be changed without clear constraints
- the requested “cleanup” is actually a broad redesign
- structural drift would be introduced in the name of simplification

In a blocked state:

- do not implement
- explain exactly what is blocking
- state which specialist decision is needed next

==================================================
EXECUTION STYLE
==================================================

Be:

- practical
- strict about invariants
- low-blast-radius
- explicit about what must not change
- conservative about hidden behavior changes

Do not:

- over-process trivial cleanup
- run irrelevant specialist reviews
- allow “cleanup” to become architecture drift
- bury behavioral change inside refactor implementation

==================================================
REFACTOR STATUS
==================================================

For non-trivial runs, explicitly state one of:

- SAFE TO REFACTOR
- REFACTOR IMPLEMENTED
- PARTIALLY IMPLEMENTED
- BLOCKED
- NOT SAFE TO REFACTOR YET

Use this status consistently in the workflow output.

==================================================
SUCCESS CRITERIA
==================================================

A successful run of this workflow:

- preserves intended behavior
- keeps refactor blast radius low
- preserves architecture/security/runtime constraints
- uses specialist agents only when needed
- updates tests and validation proportionally
- clearly states residual risks and unchanged invariants
