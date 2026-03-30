# Security Incident Workflow

## Configuration

- **Artifacts Path**: `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec` → `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses Zenflow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**: create matching presets in Zenflow Settings → Agents, or rename the inline `agent:` comments below to match your actual preset names:
  - `security-auth-agent`
  - `nextjs-runtime-agent`
  - `architecture-guard-agent`
  - `validation-strategy-agent`
  - `implementation-agent`

## Before Running

Before starting this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

Repository note:
In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

## Execution Control

This workflow supports two execution modes:

- `straight-through` — continue through the required specialist roles in one session when the active tool does not support true UI-level agent switching
- `manual-handoff` — stop after each specialist artifact or major phase and wait for operator confirmation or manual agent change before continuing

Use `manual-handoff` when the operator explicitly wants visible agent changes or per-step approval in the UI.

Artifact filenames prove that a workflow step produced an output.
They do not, by themselves, prove that the tool visibly switched the active agent in the UI.

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

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/incident-intake.md

If execution control is `manual-handoff`, stop after writing this artifact and wait for operator confirmation before continuing.

### [x] Step: Security Review

<!-- agent: security-auth-agent -->

Run **Security/Auth Agent**.

Use this template as the output structure guide:

`docs/ai/templates/specialist-summaries/02 - Security & Auth - Summary Template.md`

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

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/02 - Security & Auth - Summary.md

If execution control is `manual-handoff`, stop after writing this artifact and wait for operator confirmation before continuing.

### [x] Step: Runtime Review (Conditional)

<!-- agent: nextjs-runtime-agent -->

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

`docs/ai/templates/specialist-summaries/03 - Next.js Runtime - Summary Template.md`

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

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/03 - Next.js Runtime - Summary.md

If execution control is `manual-handoff`, stop after writing this artifact and wait for operator confirmation before continuing.

### [x] Step: Architecture Review (Conditional)

<!-- agent: architecture-guard-agent -->

If the proposed remediation may affect:

- module boundaries
- dependency direction
- DI/composition
- contracts
- provider isolation shape
- structural layering

Run **Architecture Guard Agent**.

Use this template as the output structure guide:

`docs/ai/templates/specialist-summaries/01 - Architecture Guard - Summary Template.md`

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

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/01 - Architecture Guard - Summary.md

If execution control is `manual-handoff`, stop after writing this artifact and wait for operator confirmation before continuing.

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

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/constraints.md

If execution control is `manual-handoff`, stop after writing this artifact and wait for operator confirmation before continuing.

### [x] Step: Validation Strategy

<!-- agent: validation-strategy-agent -->

Run **Validation Strategy Agent**.

Use this template as the output structure guide:

`docs/ai/templates/specialist-summaries/05 - Validation Strategy - Summary Template.md`

The agent must determine:

- the minimum required validation for this incident
- optional additional validation
- validation not required
- commands/checks to run
- validation gaps that remain

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/05 - Validation Strategy - Summary.md

If execution control is `manual-handoff`, stop after writing this artifact and wait for operator confirmation before continuing.

### [x] Step: Implementation

<!-- agent: implementation-agent -->

Run **Implementation Agent**.

Use this template as the output structure guide:

`docs/ai/templates/specialist-summaries/04 - Implementation Agent - Summary Template.md`

Inputs to use:

- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/incident-intake.md`
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/02 - Security & Auth - Summary.md`
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/03 - Next.js Runtime - Summary.md` (if present)
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/01 - Architecture Guard - Summary.md` (if present)
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/constraints.md`
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/05 - Validation Strategy - Summary.md`

The agent must:

- make the minimum effective safe fix
- avoid unrelated refactors
- preserve trust-boundary clarity
- respect constraints from prior steps
- update or add tests when needed

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/04 - Implementation Agent - Summary.md

If execution control is `manual-handoff`, stop after writing this artifact and wait for operator confirmation before continuing.

### [x] Step: Validation

Run the validation plan defined in:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/05 - Validation Strategy - Summary.md`

Document:

- commands/checks executed
- whether the incident path was tested
- whether the issue is fully fixed or only mitigated
- residual risks
- validation evidence

Output file:

/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/validation-report.md

If execution control is `manual-handoff`, stop after writing this artifact and wait for operator confirmation before continuing.

### [x] Step: Final Security Check

<!-- agent: security-auth-agent -->

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

Artifact to update:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/8c1599ca-52c3-418e-bdca-fef0919199ec/02 - Security & Auth - Summary.md`

Do not create a second security-specific artifact for this recheck.

If execution control is `manual-handoff`, stop after writing this artifact and wait for operator confirmation before continuing.
