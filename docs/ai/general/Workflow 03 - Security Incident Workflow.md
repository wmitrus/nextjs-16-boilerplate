Workflow Name: Security Incident Workflow

Purpose:
Safely investigate and remediate security incidents, vulnerabilities, auth bugs, trust-boundary issues, data exposure risks, and cache leaks while preserving repository integrity and minimizing blast radius.

This workflow is platform-agnostic and compatible with Codex, Zencoder, or similar agent environments.

Available agents:

- Architecture Guard Agent
- Security/Auth Agent
- Next.js Runtime Agent
- Implementation Agent

==================================================
WORKFLOW GOAL
==================================================

Use this workflow for security-sensitive issues such as:

- vulnerability fixes
- auth bugs
- authorization gaps
- tenant/trust-boundary issues
- sensitive data exposure
- provider isolation breaches
- cache leaks
- runtime-sensitive security flaws

This workflow must prioritize:

- immediate security correctness
- accurate trust-boundary analysis
- low blast radius remediation
- safe server-side enforcement
- correct runtime behavior when relevant
- structural integrity after the fix

Implementation must happen only after the relevant security constraints are clear.

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- treat repository code as the source of truth
- start with Security/Auth analysis first
- assume security-sensitive changes deserve elevated scrutiny
- prefer minimal effective remediation over broad redesign
- preserve evidence of what was fixed and why
- include runtime review when cache/server-client/middleware/runtime behavior is involved
- include architecture review when the fix risks boundary drift or structural shortcuts
- update tests for the incident path whenever feasible

Never:

- let Implementation Agent invent a security model
- rely on client-side fixes for server-side security issues
- treat middleware as sufficient protection for sensitive mutations unless explicitly proven
- widen architecture damage while fixing a security issue
- skip runtime review when cache, server actions, route handlers, or middleware are involved
- bury open security uncertainty inside implementation

Before specialist review or implementation, agents must read and follow:

- docs/ai/general/00 - Agent Interaction Protocol.md
- docs/ai/general/REPOSITORY_AI_CONTEXT.md

==================================================
FORBIDDEN REMEDIATION PATTERNS
==================================================

Never allow the following remediation patterns:

- client-side-only fixes for server-side security issues
- disabling features or checks silently without stating the tradeoff
- broad refactors disguised as security fixes
- weakening validation, authorization, or logging to make the fix easier
- bypassing contracts or boundaries for a quick patch
- introducing new provider coupling while fixing provider-related issues
- hiding unresolved trust-boundary ambiguity inside implementation
- mixing unrelated cleanup into security remediation

If a proposed fix depends on one of these patterns, stop and escalate for specialist review.

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- vulnerability remediation
- auth bug fixes
- authorization bypass fixes
- tenant isolation fixes
- sensitive data exposure fixes
- cache leak remediation
- trust-boundary corrections
- provider isolation corrections

Do not use for:

- ordinary feature work
- generic cleanup
- cosmetic refactors
- behavior-preserving cleanup
- read-only architecture audits without incident remediation intent

==================================================
EXPECTED USER INPUT
==================================================

Minimum expected inputs:

- description of the security issue or incident
- observed risk or failure mode
- known affected files/paths if available
- severity or urgency if known

Helpful optional inputs:

- reproduction steps
- exploit path
- affected user/tenant scope
- whether this is an active leak, auth bug, cache bug, or provider isolation issue
- known constraints on the fix

If inputs are incomplete, make only low-risk assumptions.
If safe remediation depends on unresolved trust or runtime constraints, stop and surface them.

==================================================
INCIDENT SEVERITY / PRIORITY
==================================================

Classify the incident using one of:

- CRITICAL
- HIGH
- MEDIUM
- LOW

Guidance:

CRITICAL

- active data leak
- authorization bypass
- cross-tenant exposure
- credential/token exposure
- exploitable trust-boundary failure affecting real users or tenants

HIGH

- significant auth/security flaw without confirmed active leak
- cache leak with realistic exposure risk
- provider isolation breach with meaningful security implications
- missing enforcement on sensitive mutation paths

MEDIUM

- incomplete hardening
- security-sensitive inconsistency with limited exploitability
- trust-boundary weakness without clear exploit path yet

LOW

- defensive improvement
- low-risk hardening
- non-critical drift with security relevance

Use this severity consistently throughout the workflow.

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Incident Intake and Risk Classification

- Parse the incident/fix request.
- Identify the likely security category:
  - authentication
  - authorization
  - tenancy
  - trust boundary
  - sensitive data exposure
  - provider isolation
  - cache leak
  - runtime-sensitive security flaw
- Identify likely affected files/modules/layers.
- Determine urgency and whether safe implementation requires specialist constraints first.

Output from this step:

- incident classification
- likely affected areas
- initial severity/urgency framing
- likely specialist involvement

Step 2. Security/Auth Review (always first)

- Always run Security/Auth Agent first.
- Ask it to:
  - identify the trust boundary
  - identify the likely enforcement failure
  - identify affected auth/tenant/provider/sensitive-data surfaces
  - define the minimum secure remediation constraints
  - state whether the issue appears blocked by runtime or architecture decisions

Required output:

- security issue classification
- trust-boundary assessment
- enforcement requirements
- sensitive-data / tenant implications
- stop/go recommendation from security perspective

Step 3. Conditional Next.js Runtime Review
Run Next.js Runtime Agent if the incident touches or may affect:

- route handlers
- server actions
- middleware/proxy
- caching/revalidation
- server/client placement
- edge vs node runtime
- env exposure
- App Router rendering/runtime assumptions

Ask it to:

- identify runtime mechanisms contributing to the incident
- define runtime-safe remediation constraints
- identify cache/revalidation or placement hazards
- state whether the issue is safe, risky, or blocked from runtime perspective

Required output:

- runtime incident assessment
- runtime constraints for remediation
- stop/go recommendation

Step 4. Conditional Architecture Guard Review
Run Architecture Guard Agent if the proposed remediation may affect:

- module boundaries
- dependency direction
- DI/composition
- contracts
- provider isolation shape
- structural layering

Ask it to:

- verify the remediation does not introduce architecture drift
- define structural constraints for the fix
- identify whether a shortcut fix would create long-term damage
- state whether the proposed remediation is safe, risky, or blocked structurally

Required output:

- architecture constraints
- approved/remediation-safe structure
- stop/go recommendation

Step 5. Security Remediation Constraint Summary

- Consolidate all prior outputs.
- Remove duplication.
- Produce one implementation-ready incident remediation brief.

Constraint summary must include:

- security constraints
- runtime constraints if any
- architecture constraints if any
- explicitly allowed remediation scope
- explicitly forbidden shortcuts
- required tests/verification for the incident path

If unresolved issues remain:

- stop here
- do not implement
- report what is blocking safe remediation

Step 6. Implementation

- Invoke Implementation Agent with:
  - incident/fix objective
  - affected files/modules
  - approved remediation constraints
  - explicit security requirements
  - explicit runtime requirements if any
  - explicit architecture requirements if any
- Require it to:
  - make the minimum effective safe fix
  - avoid unrelated refactors
  - preserve trust-boundary clarity
  - update/add tests where feasible
  - report uncertainty instead of guessing

Step 7. Validation and Security Close-Out

- Require validation proportional to risk, prioritizing:
  - targeted tests for the incident path
  - typecheck
  - architecture lint if boundaries were touched
  - broader tests where the blast radius justifies them

Validation should explicitly confirm:

- the vulnerability or bug path is closed
- no obvious security regression was introduced
- runtime/caching behavior is safe where relevant

Validation must also include, where feasible:

- the incident symptom or exploit path that was tested
- the expected secure behavior after the fix
- whether the issue is fully closed or only mitigated

Optional Step 8. Post-Fix Specialist Recheck
If the fix touched:

- auth/authorization logic
- tenancy logic
- runtime-sensitive security surfaces
- architecture boundaries

then re-run the relevant specialist agent(s) for focused confirmation.

==================================================
DECISION / BRANCHING RULES
==================================================

Always:

- Security/Auth Agent first

Run Next.js Runtime Agent when runtime/cache/server-client/middleware concerns are involved.
Run Architecture Guard Agent when the fix risks boundary, DI, contract, or structure drift.

Stop before implementation if:

- the trust boundary is unclear
- the enforcement failure is unclear
- runtime placement/caching implications are unresolved
- the remediation would introduce structural damage not yet approved
- the fix request is too ambiguous to perform safely

If the incident is clearly local and does not affect runtime or structure:

- skip irrelevant specialist reviews

If the fix touches multiple sensitive surfaces:

- strongly prefer post-fix specialist rechecks

==================================================
OUTPUTS PRODUCED BY THE WORKFLOW
==================================================

The workflow must produce:

1. Security incident classification
2. Trust-boundary assessment
3. Conditional runtime incident summary when relevant
4. Conditional architecture summary when relevant
5. Consolidated remediation constraints
6. Affected files/modules list
7. Implementation result
8. Validation result
9. Residual risks / follow-ups

==================================================
FAILURE / BLOCK CONDITIONS
==================================================

The workflow must explicitly stop and report a block when:

- security requirements are unclear
- trust-boundary ownership is unclear
- runtime behavior affecting the incident is unclear
- architecture-safe remediation cannot be determined
- the requested fix would require an unapproved broad redesign

In a blocked state:

- do not implement
- state exactly what is blocking
- state which specialist decision is needed next

==================================================
EXECUTION STYLE
==================================================

Be:

- security-first
- low-blast-radius
- explicit about trust boundaries
- conservative about shortcuts
- practical about remediation scope

Do not:

- over-generalize into redesign
- ignore runtime implications
- mix cleanup with incident remediation
- bury uncertainty inside code changes

==================================================
INCIDENT STATUS
==================================================

For non-trivial runs, explicitly state one of:

- INCIDENT CONFIRMED
- SAFE TO REMEDIATE
- REMEDIATION IMPLEMENTED
- PARTIALLY REMEDIATED
- BLOCKED
- NOT SAFE TO IMPLEMENT YET

Use this status consistently in workflow outputs.

==================================================
SUCCESS CRITERIA
==================================================

A successful run of this workflow:

- prioritizes security analysis first
- closes the security issue with minimal safe change
- uses runtime and architecture specialists only when relevant
- avoids structural shortcuts that create new risk
- updates or proposes incident-focused tests
- clearly states residual risk and follow-up work
