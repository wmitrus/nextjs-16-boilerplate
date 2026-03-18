# Incident Investigation Workflow

## Configuration

- **Artifacts Path**: /home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792 → `docs/workflows/{task_id}`

---

## Workflow Steps

### [ ] Step: Incident Intake

Collect the initial report and environment details.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/incident-intake.md

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
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/flow-trace.md

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
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/runtime-review.md

Focus on:

- server vs client boundaries
- server actions
- redirects
- middleware / proxy behavior
- caching / rendering

---

### [x] Step: Architecture Impact Review

Verify that the suspected fix does not violate architecture rules.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/architecture-review.md

Confirm:

- module boundaries respected — PASS
- DI usage correct — PASS
- no security or auth regressions — PASS
- runtime placement correct — PASS
- REQUIRED follow-up: remove RouteTransitionProbe and OnboardingClientProbe before shipping

---

### [ ] Step: Remediation Plan

Define the smallest safe fix.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/remediation-plan.md

Include:

- change scope
- affected files
- expected behavior change
- risks

---

### [x] Step: Shared-Shell Transition Probe Implementation

Add minimal client-side route-transition probe in shared root boundary.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/shared-shell-transition-probe-implementation-report.md

Files changed:

- `src/app/components/route-transition-probe.tsx` — CREATED
- `src/app/layout.tsx` — MODIFIED (probe added to AppLayoutContent)

Validation: typecheck PASS, lint PASS, arch:lint PASS, test 762/762 PASS

---

### [x] Step: Final Route Boundary Root Cause Verification

Definitively identify the earliest client-side failing boundary using installed probes.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/final-route-boundary-root-cause.md

Result:

- Scenario B confirmed: `/users` committed client-side, `/onboarding` NEVER committed client-side
- Root cause: Concurrent RSC navigation conflict — `UsersLayout.redirect('/onboarding')` (streaming redirect) races with Clerk's `router.refresh()` during post-SSO session finalization
- Two concurrent RSC requests to `/onboarding` confirmed: second request arrived while first was still in-flight
- React never commits either transition — silent failure, no errors
- Earliest failing boundary: App Router route-commit step for `/onboarding`
- Next fix target: move ONBOARDING_REQUIRED redirect from `UsersLayout` to middleware layer

---

### [x] Step: Implementation

Apply the fix and update tests if needed.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/implementation-report.md

Files changed:

- `src/app/layout.tsx` — MODIFIED: removed outer `<Suspense fallback={null}>` from RootLayout body; removed unused `Suspense` import

Change: -3 lines (import + opening + closing Suspense tags). No logic changes.

Rationale: The outer Suspense with `fallback={null}` wrapped ClerkProvider + AppLayoutContent + route children at the root, creating a catch-all that silently trapped the concurrent RSC navigation conflict during the /users → /onboarding transition. Removing it allows the App Router's own transition management to proceed without a user-managed null-fallback barrier above it.

Validation: typecheck PASS, lint PASS, arch:lint PASS, test 762/762 PASS (1 pre-existing drizzle.test.ts failure unrelated)

---

### [x] Step: Architecture Review — Blocking-Route Layout Shape

Reviewed root layout after Suspense removal caused "Data that blocks navigation was accessed outside of <Suspense>" error.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/blocking-route-layout-remediation-shape.md

Key findings:

- `cacheComponents: true` in next.config.ts enforces that `use()` call inside `ClientClerkProvider` requires a Suspense ancestor — Suspense above ClerkProvider is a framework requirement, not optional
- The Suspense removal was architecturally incorrect; it must be restored with a visible (non-null) fallback
- Approved shape: `<Suspense fallback={<RootLayoutShell />}>` scoped to the Clerk branch only, with a header skeleton as fallback
- The navigation hang root cause (concurrent RSC conflict) is SEPARATE and requires a proxy.ts middleware-level redirect fix
- Two forbidden patterns explicitly named: `fallback={null}` above ClerkProvider, and no Suspense above ClerkProvider with `cacheComponents: true`

---

### [x] Step: Implementation — Layout Correction (Suspense with visible fallback)

Apply the approved layout shape from blocking-route-layout-remediation-shape.md.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/layout-correction-implementation-report.md

Scope:

- `src/app/layout.tsx` only
- Restore `import { Suspense } from 'react'`
- Add `function RootLayoutShell()` local component (header skeleton shape)
- Replace removed `<Suspense fallback={null}>` with `<Suspense fallback={<RootLayoutShell />}>` scoped to Clerk branch only
- Validate: pnpm typecheck, pnpm lint, pnpm arch:lint, pnpm test

---

### [x] Step: Architecture Review — Cookie-Bridge Routing Shape

Review proposed cookie-bridge design for the proxy-level onboarding redirect under Edge-runtime constraint.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/cookie-bridge-routing-remediation-shape.md

Decision: APPROVED WITH MODIFICATIONS

Key findings:

- Raw pre-pipeline check in `proxy.ts` is REJECTED — bypasses RouteContext abstraction, duplicates path matching
- Cookie check inside `withAuth` is APPROVED — uses existing `redirectForIncompleteOnboarding` and RouteContext
- `bootstrap/page.tsx` sets `__onboarding_pending` cookie before redirect — APPROVED
- `actions.ts` clears cookie after `updateOnboardingStatus(true)` — APPROVED
- `users/layout.tsx` cookie-setting self-healing fallback — REJECTED (layer coupling)
- `users/layout.tsx` keeps existing redirect unchanged as safety net — APPROVED
- `proxy.ts` requires NO CHANGE — cookie check flows through withAuth
- Cookie semantics: httpOnly=true, secure=production, sameSite=lax, path=/, maxAge=7days

---

### [x] Step: Implementation — Cookie-Bridge Proxy Redirect

Apply the approved cookie-bridge shape from cookie-bridge-routing-remediation-shape.md.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/cookie-bridge-implementation-report.md

Scope:

- `src/security/middleware/with-auth.ts` — read `__onboarding_pending` cookie in edge mode; remove `isNodeMode` gate from `redirectForIncompleteOnboarding` call
- `src/app/auth/bootstrap/page.tsx` — set cookie before `redirect('/onboarding...')`
- `src/app/onboarding/actions.ts` — clear cookie after `updateOnboardingStatus(true)` succeeds
- `src/app/users/layout.tsx` — NO CHANGE
- `src/proxy.ts` — NO CHANGE
- Update tests: `with-auth.test.ts`, `bootstrap/page.test.tsx`, `actions.test.ts`

---

### [x] Step: Validation

Run repository validation commands.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/14df9447-df35-4887-ac3a-5eb771969792/validation-report.md

Commands:

- pnpm typecheck
- pnpm lint
- pnpm arch:lint
- pnpm test
