# Workflow 05 - Auth Flow Change Review Workflow

Purpose:
Review auth/bootstrap/onboarding changes against anti-patterns and the verification matrix before implementation or sign-off — ensuring no trust-boundary regression, redirect-flow breakage, or matrix scenario is left unverified.

This workflow is platform-agnostic and may be used in Copilot, Zencoder, or similar agent environments.

Mode ID:

- `auth-flow-change-review`

Available agents:

- Security/Auth Agent
- Next.js Runtime Agent
- Architecture Guard Agent
- Playwright E2E Agent

Before running this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

Repository note:

In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

==================================================
WORKFLOW GOAL
==================================================

Use this workflow when a change touches Clerk auth, bootstrap routing, onboarding redirects, auth middleware, root auth layout boundaries, or `/users` access control.

The workflow must:

- identify all affected auth-flow paths in the changed files
- map the change to specific matrix scenario IDs
- route to the right specialists based on the risk profile
- produce a matrix verification sign-off (Verified / Deferred / Blocked per scenario)
- keep blast radius low
- not mark the work complete unless all affected scenarios are explicitly accounted for

Implementation must not begin until the affected matrix scenarios are mapped and the remediation scope is explicit.

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- read AUTH_FLOW_ANTI_PATTERNS.md before analyzing the change
- use AUTH_FLOW_VERIFICATION_MATRIX.md as the mandatory scenario source
- map every affected auth path to a matrix scenario ID
- state Verified / Deferred / Blocked per scenario
- when the provider is AuthJS, require explicit evidence for both completed-user dashboard entry and incomplete-user onboarding settlement
- treat trust-boundary confusion as a blocker, not a warning
- route to Next.js Runtime when routing, server/client placement, or caching is involved
- route to Architecture Guard when module boundaries or DI/composition is affected

Never:

- sign off without explicitly addressing all affected matrix scenarios
- accept "auth works" as a verification statement — require scenario-level evidence
- route to Playwright E2E when narrower analysis is sufficient
- allow implementation before the matrix sign-off step is complete

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- any change touching Clerk auth configuration, SDK usage, or provider integration
- changes to bootstrap routing, onboarding redirects, or root auth layout
- changes to `src/proxy.ts` that affect auth pre-processing
- changes to auth-gated server actions or route handlers
- changes to `/users` access control or membership logic
- any change where trust-boundary regression is possible

Do not use for:

- general feature changes with no auth path involvement
- pure UI/style changes with no auth-gating logic
- changes already verified through a prior auth-flow-change-review run in the same session

==================================================
EXPECTED USER INPUT
==================================================

Minimum expected inputs:

- description of the change or diff to review
- affected files or modules (or working tree diff)
- any known symptoms, risks, or test failures

Helpful optional inputs:

- specific matrix scenarios already under consideration
- prior review findings that should be built on
- environment constraints (dev/staging/prod divergence)

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Change Intake

- Determine the changed file set from the current working tree or provided diff.
- Identify all auth/bootstrap/onboarding/proxy/route-handler/server-action/layout code paths touched.
- List the trust-boundary, redirect-flow, and runtime-sensitive surfaces at risk.
- State initial scope: which agents will likely be needed.

Step 2. Auth Surface Analysis

- Run Security/Auth Agent.
- The agent must:
  - map the change to specific AUTH_FLOW_VERIFICATION_MATRIX scenario IDs
  - identify trust-boundary risks in the affected path
  - identify redirect-flow risks
  - identify runtime-sensitive risks (server/client placement, caching)
  - state which anti-patterns from AUTH_FLOW_ANTI_PATTERNS.md are relevant
  - recommend whether Runtime Review and/or Architecture Review are needed

Output required from this step:

- changed files considered
- trust-boundary assessment
- affected matrix scenario IDs with reason for each
- required verification before sign-off
- conditional routing recommendation

Step 3. Conditional Runtime Behavior Review

Run Next.js Runtime Agent only if the change touches or may affect:

- routing behavior in `src/proxy.ts` or App Router
- server/client boundary placement for auth-gated components
- caching or revalidation of auth-sensitive data
- edge vs node runtime placement for auth logic

The agent must assess:

- runtime surfaces at risk in the auth path
- whether server/client placement is correct
- whether caching could expose auth-sensitive data
- runtime constraints for the remediation

Output required from this step:

- runtime constraints
- placement/caching guidance
- stop/go recommendation from runtime perspective

Step 4. Conditional Architecture Impact Review

Run Architecture Guard Agent only if the change may affect:

- module boundaries in `src/modules/auth/` or `src/security/`
- DI/composition of auth dependencies
- provider isolation boundaries
- security enforcement layer placement

The agent must assess:

- architecture fit of the change
- whether module boundaries remain intact
- whether DI/composition is correct
- architecture constraints for the remediation

Output required from this step:

- architecture constraints
- boundary and DI assessment
- stop/go recommendation from architecture perspective

Step 5. Matrix Verification Sign-Off

- For each matrix scenario ID identified in Step 2:
  - state the scenario description
  - state the verification status: **Verified** / **Deferred** / **Blocked**
  - provide the reason for each status
  - if Deferred, state what must happen before it can be verified
  - if Blocked, state the blocker explicitly

This step produces the mandatory sign-off artifact. Do not proceed to Step 6 without completing this step.

If any scenario is Blocked:

- stop the workflow
- report the block explicitly
- do not mark the review complete

Step 6. Conditional Playwright E2E Verification

Run Playwright E2E Agent only if browser-level evidence is required to verify matrix scenarios that cannot be confirmed through code review alone.

Triggers:

- redirect-flow scenarios that depend on browser behavior
- cookie or session behavior that requires a real browser
- onboarding/bootstrap flows that span multiple route transitions

The agent must:

- run the minimum Playwright scope that covers the affected scenarios
- prefer `pnpm e2e:authjs:core` first for focused AuthJS regressions before widening further
- map browser evidence to specific matrix scenario IDs
- produce a structured evidence artifact

Output required from this step:

- commands run
- scenario status mapping (Pass/Fail/Blocked)
- evidence collected
- gaps / deferred checks

==================================================
DECISION / BRANCHING RULES
==================================================

Always:

- Security/Auth Agent first
- map to matrix scenarios before any specialist routing

Run Next.js Runtime Agent when:

- routing, server/client placement, or auth-sensitive caching is at risk

Run Architecture Guard Agent when:

- module boundaries, DI/composition, or provider isolation may be affected

Run Playwright E2E Agent when:

- browser-level evidence is required to verify redirect-flow or session scenarios

Stop before sign-off if:

- any matrix scenario is Blocked and the block is unresolved
- trust-boundary confusion remains unresolved
- runtime or architecture constraints are unresolved

==================================================
OUTPUTS PRODUCED BY THE WORKFLOW
==================================================

The workflow must produce:

1. Changed files considered
2. Trust-boundary assessment
3. Affected matrix scenarios (with scenario IDs and reasons)
4. Required verification before sign-off
5. Conditional runtime summary (if Step 3 ran)
6. Conditional architecture summary (if Step 4 ran)
7. Matrix verification sign-off (Verified / Deferred / Blocked per scenario)
8. Conditional Playwright evidence (if Step 6 ran)
9. Risks
10. Recommended next action

==================================================
FAILURE / BLOCK CONDITIONS
==================================================

The workflow must explicitly stop and report a block when:

- any affected matrix scenario cannot be verified or deferred with explicit reason
- trust-boundary confusion is unresolved
- runtime placement of auth-sensitive logic is incorrect
- architecture constraints prevent the proposed change without further redesign
- required auth-flow governing files were not read before analysis

==================================================
EXECUTION STYLE
==================================================

Be:

- scenario-driven
- explicit about matrix mapping
- low-blast-radius
- direct about blocks

Do not:

- hand-wave verification with generic statements
- run all agents if only Security/Auth is needed
- accept Playwright E2E as a substitute for code-level analysis
- mark the review complete without a matrix sign-off artifact

==================================================
SUCCESS CRITERIA
==================================================

A successful run of this workflow:

- maps every affected auth path to at least one matrix scenario ID
- produces a matrix sign-off with Verified / Deferred / Blocked per scenario
- routes to the correct specialists based on actual risk
- keeps blast radius minimal
- calls out any residual risks or deferred items explicitly
