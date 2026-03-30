# Auth Regression Workflow Task Prompt

Use this as the operator prompt to paste under `/Workflow Task` for the auth regression task.

## Ready To Paste

```text
/Workflow Task

Description:
Run the controlled auth regression task described in docs/feature-desings/02 - Auth Regression Tests.md.

Task intent:
This is a controlled auth-flow regression verification task for the current branch. The goal is to verify the onboarding, post-auth routing, cookie signal behavior, and runtime stability scenarios against the repository auth-flow verification model without turning this into ad hoc exploratory testing.

Authoritative requirement sources:
- docs/feature-desings/02 - Auth Regression Tests.md
- docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md
- docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md
- docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md
- docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md

Repository context to inspect when relevant:
- e2e/auth.spec.ts
- e2e/users.spec.ts
- e2e/provisioning-runtime.spec.ts
- e2e/security.spec.ts
- playwright.config.ts
- src/proxy.ts

Primary objective:
Create a complete, controlled auth regression workflow for this branch, map the required scenarios to the auth-flow matrix, prepare the correct task artifacts, and run only the necessary specialist steps before real-browser verification.

Scope:
- controlled auth regression verification
- scenario mapping for the affected auth-flow cases
- task artifact creation under .copilot/tasks/{task_id}/
- creation of a detailed implementation-plan.md for scenario coverage and execution order
- real-browser Playwright verification where browser evidence is required
- final validation/report artifact summarizing pass, fail, deferred, and blocked scenarios

Out of scope unless evidence forces escalation:
- unrelated feature implementation
- broad refactors
- speculative architecture redesign
- unnecessary full-suite validation outside the affected auth-flow scenarios

Required orchestrator behavior:
- create .copilot/tasks/{task_id}/plan.md first
- create intake.md immediately after plan.md
- normalize the task from the listed requirement sources instead of copying them verbatim
- classify this as a non-trivial, scenario-driven auth regression workflow
- determine which specialist steps are actually needed before execution
- create constraints.md before any implementation or execution step that depends on specialist review
- create implementation-plan.md before execution begins

Implementation-plan.md must include:
- the scenario IDs that must be covered in this run
- grouping of scenarios into execution phases
- required preconditions for each phase
- which scenarios require real-browser evidence
- expected evidence per scenario group
- validation mapping back to AUTH_FLOW_VERIFICATION_MATRIX.md
- explicit deferred or blocked scenarios, if any

Specialist routing expectations:
- use 07 - Playwright E2E for the browser-real verification step
- use 05 - Validation Strategy only if validation scope becomes unclear or expands materially
- use 06 - Debug Investigation first only if the repository evidence is too ambiguous to run the regression safely
- use 02 - Security & Auth and 03 - Next.js Runtime only if the current branch changes or observed behavior indicate auth-boundary or runtime-review is needed before execution
- do not invoke specialists that are not justified by the actual task evidence

Scenario minimum to account for in implementation-plan.md:
- AF-01 / AF-02 / AF-03 / AF-04
- AF-05
- AF-06 / AF-07
- AF-08 / AF-09
- AF-12 / AF-13 / AF-14 / AF-15
- AF-17 / AF-18 / AF-21

Environment and preparation expectations:
- require a clean and explicit description of prepared identities:
  - fresh user
  - onboarded returning user
  - reusable incomplete identity
- require the implementation plan or run notes to explain how the onboarding-incomplete app state is recreated during the run for AF-06 / AF-07
- require the target environment notes
- require the Clerk redirect target when relevant
- require the operator to confirm runtime availability for the app, DB, and any auth dependencies needed for the run

Evidence expectations:
- final URL per verified scenario or scenario group
- relevant runtime logs
- cookie and network evidence where relevant
- Playwright command used
- report, trace, screenshot, or log references when available
- scenario status mapping with PASS / FAIL / DEFERRED / BLOCKED

Completion rule:
Do not treat the task as complete unless the affected scenarios are explicitly mapped, verified, or clearly marked as deferred or blocked with reasons.

Required output:
1. Objective
2. Input Sources
3. Task Classification
4. Planned Specialist Sequence
5. Artifacts To Be Produced
6. Preconditions Required From User
7. Recommended Next Action
```

## Notes

- This file is task-specific on purpose.
- The reusable entrypoint remains [workflow-task.prompt.md](../../.github/prompts/workflow-task.prompt.md).
- The task-specific detail lives here and in the referenced auth-flow documents.
