# Security Incident Workflow

## Configuration

- **Artifacts Path**: /home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444 → `.zenflow/tasks/{task_id}`

## Workflow Steps

### [x] Step: Incident Intake

Understand the incident before remediation.

Document:

- incident description
- suspected severity
- affected surface
- known symptoms
- known constraints
- initial unknowns

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/incident-intake.md

### [x] Step: Security Review

Run **Security/Auth Agent**.

Use this template as the output structure guide:

`docs/ai/templates/security-review-template.md`

The agent must assess:

- incident classification
- trust boundaries
- auth and authorization surface
- tenancy / organization isolation
- provider isolation
- sensitive data handling
- cache / runtime security risks
- security constraints
- recommended safe remediation direction

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/security-review.md

### [x] Step: Runtime Review (Conditional)

If the incident touches or may affect:

- route handlers
- server actions
- middleware / proxy
- App Router runtime behavior
- server/client boundaries
- caching / revalidation
- edge vs node runtime
- env exposure

Run **Next.js Runtime Agent**.

Use this template as the output structure guide:

`docs/ai/templates/runtime-review-template.md`

The agent must assess:

- runtime classification
- affected runtime surfaces
- server vs client placement
- route handlers / server actions
- middleware / proxy behavior
- caching / revalidation
- edge vs node runtime
- environment exposure
- runtime constraints
- recommended safe runtime direction

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/runtime-review.md

### [x] Step: Architecture Review (Conditional)

If the proposed remediation may affect:

- module boundaries
- dependency direction
- DI/composition
- contracts
- provider isolation shape
- structural layering

Run **Architecture Guard Agent**.

Use this template as the output structure guide:

`docs/ai/templates/architecture-review-template.md`

The agent must assess:

- architecture fit
- affected layers
- affected modules
- boundary impact
- dependency direction
- provider isolation
- structural risks
- documentation drift
- architecture constraints
- recommendation

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/architecture-review.md

### [x] Step: Constraints Summary

Consolidate prior specialist outputs into one implementation-ready constraint brief.

Use this template as the output structure guide:

`docs/ai/templates/constraints-template.md`

The summary must include:

- architecture constraints
- security/auth constraints
- runtime constraints
- validation constraints
- explicitly allowed changes
- explicitly forbidden changes
- protected invariants
- open questions / blocks

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/constraints.md

### [x] Step: Validation Strategy

Run **Validation Strategy Agent**.

Use this template as the output structure guide:

`docs/ai/templates/validation-template.md`

The agent must determine:

- the minimum required validation for this incident
- optional additional validation
- validation not required
- commands/checks to run
- validation gaps that remain

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/validation-strategy.md

### [x] Step: Implementation

Run **Implementation Agent**.

Inputs to use:

- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/incident-intake.md`
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/security-review.md`
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/runtime-review.md` (if present)
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/architecture-review.md` (if present)
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/constraints.md`
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/validation-strategy.md`

The agent must:

- make the minimum effective safe fix
- avoid unrelated refactors
- preserve trust-boundary clarity
- respect constraints from prior steps
- update or add tests when needed

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/implementation-report.md

### [x] Step: Validation

Run the validation plan defined in:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/validation-strategy.md`

Document:

- commands/checks executed
- whether the incident path was tested
- whether the issue is fully fixed or only mitigated
- residual risks
- validation evidence

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/validation-report.md

### [x] Step: Final Security Check

Run **Security/Auth Agent** again if the fix touched:

- auth logic
- authorization enforcement
- tenancy / organization logic
- provider integration
- cache-sensitive protected data flows

The agent should confirm:

- the trust-boundary issue is closed or mitigated
- no obvious new auth/security regression was introduced
- residual risks are explicitly named

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/security-final.md

### [x] Step: arch:lint Failure Analysis

Review arch:lint failures in `src/core/db/seed.ts`, `src/core/runtime/bootstrap.ts`, and `src/core/runtime/edge.ts`. Determine for each file whether the violation is a true boundary violation, an approved composition-root-style exception not yet modelled by the rule, a candidate for refactoring, or a lint rule adjustment.

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/arch-lint-analysis.md

### [x] Step: arch:lint Remediation

Implement the changes determined in the arch:lint analysis step (lint rule adjustment and/or code move).

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/arch-lint-remediation.md

### [x] Step: Sentry Network Error Investigation

Investigate `TypeError: network error` at `<BootstrapPage>` captured in Sentry. Correlate Sentry trace with server logs, identify root cause, and produce an investigation report.

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/sentry-investigation.md

### [x] Step: Sentry Network Error Fix (Implementation)

Based on sentry-investigation.md, implement the minimum safe fix and validate.

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/sentry-fix-report.md

### [ ] Step: Flow Trace Matrix — sign-up → bootstrap → onboarding → users (TENANCY_MODE=single)

Build a complete per-step trace matrix for the full new-user sign-up flow.
For each step: entry point, expected state, actual state, source of truth, redirect / next step, likely failure conditions.
Focus on where the flow diverges after successful bootstrap in TENANCY_MODE=single.

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/1b6f3b3f-7c91-4e66-8ca8-84bc6f8fe444/flow-trace-matrix.md
