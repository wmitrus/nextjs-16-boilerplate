# Task Plan

## Objective

Run a controlled auth regression verification task for the current branch using the repository auth-flow verification model, explicit task artifacts, and real-browser verification only where required.

## Progress Checklist

- [ ] Task workspace initialized
- [ ] `plan.md` completed
- [ ] `intake.md` completed
- [ ] `constraints.md` completed
- [ ] `implementation-plan.md` completed
- [ ] Env and fixture assumptions validated
- [ ] Runner architecture direction confirmed
- [ ] `07 - Playwright E2E` run prepared
- [ ] `07 - Playwright E2E - Summary.md` created
- [ ] `validation-report.md` created

## Likely Affected Areas

- `docs/feature-desings/02 - Auth Regression Tests.md`
- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`
- `e2e/auth.spec.ts`
- `e2e/users.spec.ts`
- `e2e/provisioning-runtime.spec.ts`
- `e2e/security.spec.ts`
- `playwright.config.ts`
- `src/proxy.ts`

## Task Classification

- non-trivial
- scenario-driven
- auth/bootstrap/onboarding-sensitive
- verification-first
- real-browser evidence expected
- local-first execution target
- CI/CD-ready execution required later
- sequential scenario progression required
- universal runner architecture required
- automated local container orchestration required
- single-env-var runtime/backend switching required

## Expected Specialist Sequence

1. Workflow Orchestrator kickoff and artifact creation
2. Direct intake normalization from task documents
3. Constraint consolidation from auth-flow documents
4. Implementation-plan creation for scenario execution order
5. `07 - Playwright E2E` for real-browser verification
6. Final validation/report artifact

## Sequence Checklist

- [ ] Workflow Orchestrator kickoff and artifact creation
- [ ] Intake normalization completed
- [ ] Constraint consolidation completed
- [ ] Implementation-plan completed
- [ ] Playwright E2E step completed
- [ ] Final validation/report artifact completed

## Specialist Status

- `06 - Debug Investigation`: skipped for kickoff unless repository evidence becomes too ambiguous to run safely
- `01 - Architecture Guard`: skipped for kickoff because this is a verification workflow, not a design task
- `02 - Security & Auth`: conditional only if branch evidence or observed behavior shows trust-boundary concerns before execution
- `03 - Next.js Runtime`: conditional only if branch evidence or observed behavior shows runtime-placement or App Router instability before execution
- `05 - Validation Strategy`: conditional only if validation scope materially expands beyond the defined auth regression task
- `07 - Playwright E2E`: required
- `04 - Implementation Agent`: not required for the initial verification workflow unless a verified defect later requires code changes

## Specialist Checklist

- [ ] `06 - Debug Investigation` decision recorded
- [ ] `01 - Architecture Guard` decision recorded
- [ ] `02 - Security & Auth` decision recorded
- [ ] `03 - Next.js Runtime` decision recorded
- [ ] `05 - Validation Strategy` decision recorded
- [ ] `07 - Playwright E2E` decision recorded
- [ ] `04 - Implementation Agent` decision recorded

## Known Risks / Unknowns

- prepared test accounts and environment state may be missing or inconsistent
- current branch behavior has not yet been observed in a real browser for this run
- branch-to-default drift has not yet been classified as requiring pre-execution security/runtime review
- existing runtime tests mix browser-real UI paths with helper-assisted Clerk sign-in; authoritative regression evidence for this task must prefer browser-real interactive flow
- backend/runtime mode selection is standardized as E2E_BACKEND_MODE=pglite|container

## Planned Artifacts

- `plan.md`
- `intake.md`
- `constraints.md`
- `implementation-plan.md`
- `07 - Playwright E2E - Summary.md`
- `validation-report.md`

## Artifact Checklist

- [ ] `plan.md`
- [ ] `intake.md`
- [ ] `constraints.md`
- [ ] `implementation-plan.md`
- [ ] `07 - Playwright E2E - Summary.md`
- [ ] `validation-report.md`
