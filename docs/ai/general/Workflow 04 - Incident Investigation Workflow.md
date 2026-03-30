Workflow Name: Incident Investigation Workflow

Purpose:
Investigate and remediate production incidents, regressions, and multi-layer failures through a controlled specialist sequence — preserving architecture, security, runtime correctness, and low blast radius throughout.

This workflow is platform-agnostic and may be used in Codex, Zencoder, or similar agent environments.

Mode ID:

- `incident-investigation`

Available agents:

- Debug Investigation Agent
- Next.js Runtime Agent
- Architecture Guard Agent
- Implementation Agent

Before running this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

Repository note:

In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

==================================================
WORKFLOW GOAL
==================================================

Use this workflow when a production incident, regression, or unclear multi-layer failure requires a full investigation-to-remediation sequence.

The workflow must:

- gather evidence before committing to a diagnosis
- reduce ambiguity before specialist decisions
- route to the correct specialist only when evidence justifies it
- produce the smallest safe remediation scope
- preserve modular-monolith integrity during the fix
- keep blast radius low
- validate the fix before closing the incident

Implementation must not begin until the remediation scope is explicit and constraints are clear.

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- treat repository code as the source of truth
- gather evidence before hypothesizing
- prefer the smallest safe fix
- use specialist agents only when their domain is clearly involved
- stop before implementation if ambiguity remains high
- update or propose tests when behavior changes

Never:

- let Implementation Agent invent architecture or security policy
- skip Debug Investigation for ambiguous failures
- diagnose without evidence
- implement before the remediation scope is explicit
- run all specialist agents by default

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- production failures or regressions with unclear root cause
- intermittent or environment-driven failures
- failures spanning multiple layers (routing, auth, caching, boundaries)
- incidents where the correct specialist is not yet obvious
- confirmed bugs where the safe fix scope needs controlled specialist review

Do not use for:

- known bugs with an already-clear, minimal fix (use `implementation` mode directly)
- security vulnerabilities with a known trust-boundary breach (use `security-incident-workflow`)
- read-only architecture audits (use `architecture-lint`)
- ambiguous pre-investigation where no fix is expected yet (use `debug-investigation` mode directly)

==================================================
EXPECTED USER INPUT
==================================================

Minimum expected inputs:

- symptom or failure description
- environment where the failure occurs (dev, staging, production)
- reproduction steps (even partial)
- affected area or affected user flow
- logs, error messages, or screenshots if available

Helpful optional inputs:

- when the failure started or what changed recently
- whether the failure is consistent or intermittent
- whether auth, routing, caching, or specific modules are suspected
- constraints or non-goals for the fix

If inputs are incomplete, the Debug Investigation Agent must gather the missing context before proceeding.

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Incident Intake

- Collect the full incident report.
- Normalize: symptom, environment, reproduction steps, logs, affected areas.
- Determine whether this qualifies as a security incident (if yes, switch to `security-incident-workflow`).
- Identify which layer the failure appears to involve.

Output required from this step:

- normalized symptom description
- environment and reproduction context
- initial affected-area hypothesis
- routing decision: security incident → switch workflow; general incident → continue

---

Step 2. Debug Investigation

Always run Debug Investigation Agent for this workflow.

Ask it to:

- trace the execution path through the affected flow
- gather evidence from logs, code, and observed behavior
- identify state transitions, identity/tenant context, redirect flows, and likely divergence points
- surface ranked hypotheses for root cause
- determine whether the failure is primarily a runtime issue, architecture issue, security issue, or combination

Output required from this step:

- execution path trace
- evidence gathered
- divergence point identification
- ranked hypotheses
- recommended specialist(s) to engage next

---

Step 3. Conditional — Next.js Runtime Behavior Review

Run Next.js Runtime Agent only if Debug Investigation evidence involves:

- App Router behavior
- server vs client placement anomalies
- route handler or server action misbehavior
- middleware or `src/proxy.ts` behavior
- caching or revalidation anomalies
- edge vs node runtime mismatch

Ask it to:

- analyze the relevant runtime surface
- determine whether the failure is a runtime placement or caching issue
- define runtime constraints for the remediation

Output required from this step (when run):

- runtime surface classification
- runtime constraints for the fix
- stop/go from runtime perspective

---

Step 4. Conditional — Architecture Impact Review

Run Architecture Guard Agent only if the proposed remediation:

- touches module boundaries or ownership
- affects DI/composition
- introduces new cross-module dependencies
- risks architectural regression during the fix

Ask it to:

- verify that the proposed fix does not violate module boundaries
- verify DI usage remains correct
- check for hidden coupling introduced by the fix
- define architecture constraints for the remediation

Output required from this step (when run):

- architecture fit assessment for the fix
- architecture constraints
- stop/go from architecture perspective

---

Step 5. Remediation Plan

Produce the smallest safe remediation plan.

Combine outputs from Debug Investigation, Runtime Review (if run), and Architecture Review (if run).

The remediation plan must include:

- confirmed root cause
- change scope (specific files and logic changes)
- expected behavior change
- risks introduced by the fix
- explicitly allowed changes
- explicitly forbidden changes
- protected invariants

Do not proceed to implementation if:

- root cause is not yet confirmed
- fix scope is still ambiguous
- architecture or runtime constraints are unresolved

---

Step 6. Implementation

Invoke Implementation Agent with:

- confirmed remediation plan
- architecture constraints (if any)
- runtime constraints (if any)
- affected files/modules

Require the Implementation Agent to:

- read required repository protocol/context files
- identify affected files before editing
- make the minimum safe change matching the remediation plan
- update tests when behavior changes
- avoid redesigning architecture
- report uncertainty instead of guessing

---

Step 7. Validation

Validate proportionally to fix risk:

- run targeted tests for the affected area first
- run typecheck and lint
- run architecture lint if boundaries were touched
- run broader test suite if the fix spans multiple files or modules

Summarize:

- what was validated
- validation results
- residual risks
- follow-ups if needed

==================================================
DECISION / BRANCHING RULES
==================================================

Always:

- Debug Investigation Agent runs first — never skip for ambiguous multi-layer failures
- Remediation Plan must be produced before Implementation starts

Run Next.js Runtime Agent only when:

- Debug Investigation evidence points to routing, caching, server/client, or proxy behavior

Run Architecture Guard Agent only when:

- the proposed fix touches module boundaries, DI, or creates cross-module coupling risk

Stop before implementation if any of the following occur:

- root cause is still ambiguous after Debug Investigation
- fix scope would require broad changes not approved
- runtime or architecture constraints are unresolved
- the incident is reclassified as a security incident (switch to `security-incident-workflow`)

==================================================
OUTPUTS PRODUCED BY THE WORKFLOW
==================================================

The workflow must produce:

1. Incident intake summary
2. Debug investigation result (execution path, evidence, hypotheses)
3. Conditional runtime behavior review
4. Conditional architecture impact review
5. Remediation plan (confirmed root cause, change scope, constraints)
6. Implementation result
7. Validation result
8. Residual risks / follow-ups

==================================================
FAILURE / BLOCK CONDITIONS
==================================================

The workflow must explicitly stop and report a block when:

- safe remediation requires unresolved root cause
- safe remediation requires unresolved architecture decisions
- safe remediation requires unresolved runtime/caching decisions
- the incident is reclassified as a security incident requiring `security-incident-workflow`
- the fix scope exceeds a low-blast-radius change without approval

In a blocked state:

- do not implement
- state exactly what is blocking
- state which specialist decision is needed next

==================================================
EXECUTION STYLE
==================================================

Be:

- evidence-first
- low-speculation before data is gathered
- low-blast-radius during remediation
- explicit about constraints
- explicit about uncertainty

Do not:

- diagnose before evidence is gathered
- run all agents by default
- duplicate the same review across agents
- let implementation start before the remediation plan is explicit
- hide unresolved ambiguity inside code changes

==================================================
SUCCESS CRITERIA
==================================================

A successful run of this workflow:

- gathers evidence before any specialist commits to a diagnosis
- routes to the correct specialist(s) only when evidence justifies it
- produces a clear remediation plan before implementation starts
- keeps the fix narrow and low-blast-radius
- updates or proposes tests appropriately
- produces a clear final result with residual risks called out
- closes the incident or explicitly documents what remains open
