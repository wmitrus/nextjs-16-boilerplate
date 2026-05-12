---
description: 'Review an auth/bootstrap/onboarding change against auth-flow anti-patterns and the verification matrix before implementation or sign-off.'
name: 'Auth Flow Change Review'
argument-hint: 'Auth-flow change summary, affected files, symptoms, or risks to emphasize'
agent: '02 - Security & Auth'
---

> **Leantime Integration Required**
> At task open and close, invoke the `10 - Leantime Integration Agent`.
> Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`

Review the current auth/bootstrap/onboarding change.

Required auth-flow context:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios
- when the active provider is `authjs`, require focused browser evidence for both completed-user dashboard entry and incomplete-user onboarding settlement before full sign-off

Workflow:

- First determine the changed file set from the current working tree and, when relevant, the current branch diff against the default branch.
- Inspect the auth, bootstrap, onboarding, proxy, route-handler, server-action, and layout code paths touched by the change.
- Identify the trust-boundary, source-of-truth, redirect-flow, and runtime-sensitive risks in the affected path.
- Explicitly map the change to the relevant matrix scenarios.
- State which scenarios must be verified before the change can be considered complete.
- If the active provider is `authjs`, explicitly state whether the current validation covers the repository AuthJS core proof set (`pnpm e2e:authjs:core`) or still has an incomplete-user blind spot.
- If runtime placement or App Router behavior is central to the risk, call that out explicitly so Next.js Runtime review can follow.

Required output:

1. Objective
2. Changed Files Considered
3. Current-State Findings
4. Trust Boundary Assessment
5. Affected Matrix Scenarios
6. Required Verification Before Sign-Off
7. Risks
8. Recommended Next Action

In `Affected Matrix Scenarios`:

- list the scenario IDs
- state why each scenario is affected
- note whether the scenario appears already covered, still unverified, or likely regressed

Do not mark the auth-flow work as complete unless the affected scenarios are explicitly checked or clearly marked as deferred/blocked.
