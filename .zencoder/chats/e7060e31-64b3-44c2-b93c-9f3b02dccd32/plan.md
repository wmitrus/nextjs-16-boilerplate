# Incident Investigation Workflow

## Configuration

- **Artifacts Path**: /home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32 → `docs/workflows/{task_id}`

---

## Workflow Steps

### [ ] Step: Incident Intake

Collect the initial report and environment details.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/incident-intake.md

Include:

- symptom
- environment
- reproduction steps
- logs or screenshots

---

## Artifact Execution Rule

For every workflow step:

- the file shown under `Output:` is mandatory
- the active agent must create or overwrite that markdown file
- the artifact file must contain the full result for the step
- the agent must not respond only in chat without writing the artifact
- after writing the artifact, the agent should give only a short completion summary in chat

---

### [ ] Step: Flow Trace Investigation

Trace the execution path through the system.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/flow-trace.md

Include:

- entry points
- state transitions
- identity/tenant context
- redirect flow
- likely divergence points

---

### [ ] Step: Runtime Behavior Review

Analyze runtime behavior and framework interaction.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/runtime-review.md

Focus on:

- server vs client boundaries
- server actions
- redirects
- middleware / proxy behavior
- caching / rendering

---

### [ ] Step: Architecture Impact Review

Verify that the suspected fix does not violate architecture rules.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/architecture-review.md

Confirm:

- module boundaries respected
- DI usage correct
- no security or auth regressions
- runtime placement correct

---

### [ ] Step: Remediation Plan

Define the smallest safe fix.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/remediation-plan.md

Include:

- change scope
- affected files
- expected behavior change
- risks

---

### [x] Step: Implementation

Apply the fix and update tests if needed.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/implementation-report.md

Include:

- files changed
- logic changes
- tests updated

---

### [x] Step: Validation (partial — runtime log analysis)

Run repository validation commands.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/validation-report.md

Commands:

- pnpm typecheck
- pnpm lint
- pnpm arch:lint
- pnpm test

---

### [x] Ad-hoc: PGlite vs Postgres Bootstrap Divergence Analysis

Deep investigation comparing PGlite and local dev Postgres execution paths for /auth/bootstrap.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/bootstrap-pglite-vs-postgres-analysis.md

Status: COMPLETE

---

### [x] Ad-hoc: Runtime Log Analysis (Postgres path post-fix)

Analyzed pnpm dev runtime logs provided by user after implementation fix.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/runtime-validation-log-analysis.md

Status: COMPLETE

Key finding: Postgres path is functioning. User was provisioned in a prior bootstrap session (fix worked). Current session correctly identifies ONBOARDING_REQUIRED state. Onboarding form submission logs needed to confirm full end-to-end success.

---

### [x] Ad-hoc: Single Failing Postgres Run Correlation

Strictly time-correlated investigation of one failing Postgres auth run.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/single-failing-postgres-run-correlation.md

Status: COMPLETE — No Failing Run Found

Key finding: All 225 log lines (9 distinct sessions) show ZERO errors. All bootstrap runs with Postgres SUCCEEDED. The original failing run (TypeError: Failed to fetch) is not present in server.log — it occurred before the Phase 2 fix was applied. The fix is confirmed working. Current flow correctly navigates: sign-up → /users → /auth/bootstrap → provisioning:succeed → /onboarding. Onboarding form submission logs not captured — unknown whether end-to-end is fully working. If failure is still reported, the issue has moved to /onboarding, not /auth/bootstrap.

---

### [x] Ad-hoc: Onboarding Entry Hardening Implementation

Minimum safe onboarding-entry hardening: loading.tsx + OnboardingGuard observability.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/onboarding-hardening-implementation-report.md

Status: COMPLETE — IMPLEMENTED

Files changed:

- src/app/onboarding/loading.tsx (CREATED) — segment-level skeleton loading UI
- src/app/onboarding/layout.tsx (MODIFIED) — structured logging added to OnboardingGuard; no behavioral changes

Deferred:

- src/app/onboarding/onboarding-form.tsx — form pattern migration requires action signature change; separate pass needed

Validation: typecheck PASS, lint PASS, arch:lint PASS, test 761/762 pass (1 pre-existing DB timeout failure)

---

### [x] Ad-hoc: Onboarding Transition Boundary Analysis (UPDATED)

Investigation of the /users → /onboarding transition as the current primary failure boundary.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/onboarding-transition-boundary-analysis-zencoder.md

Status: COMPLETE

Key findings:

1. No technical hang at OnboardingGuard server entry — all DB errors redirect to /auth/bootstrap (safe).
2. <Suspense fallback={null}> in OnboardingLayout (layout.tsx:16) causes blank screen during Postgres queries — this is the primary visual "hang" perception source.
3. OnboardingForm uses non-canonical form action pattern: form action={handleSubmit} (client wrapper) calls completeOnboarding server action. Direct form action={completeOnboarding} + useFormStatus() is the idiomatic Next.js 16 pattern. Redirect may not be handled identically.
4. completeOnboarding redundantly calls ensureProvisioned() on every form submit — idempotent but unnecessary Postgres overhead.
5. Clerk is present but not a hang source.
6. Minimum safe fix targets:

---

### [x] Ad-hoc: CSP Violation + Onboarding Form Non-Submission Investigation

CSP violation at `normal?lang=en-us:1` reported. Dual issue: CSP eval block + onboarding form never submitting.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/csp-violation-form-submission-investigation.md

Status: COMPLETE

- HIGH: src/app/onboarding/layout.tsx:16 — replace <Suspense fallback={null}> with visible loading indicator
- MEDIUM: src/app/onboarding/onboarding-form.tsx — use direct server action form action + useFormStatus
