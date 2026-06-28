# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-04-26-onboarding-loop-authflow-review`
- Task Objective: assess whether the reported onboarding-loop remediation can be implemented without violating auth-flow structure, provider isolation, or modular-monolith boundaries
- Current Run Scope: architecture review of bootstrap, onboarding, protected-route guard, and provider-aware redirect ownership
- Status: COMPLETED
- Last Updated: 2026-04-26
- Related Control Artifacts: `plan.md`, `intake.md`, `constraints.md`, `implementation-plan.md`

## Scope Handled

- modules / layers reviewed: `src/app/auth/bootstrap/*`, `src/app/onboarding/*`, `src/app/users/*`, `src/app/dashboard/*`, `src/security/middleware/*`
- change surface reviewed: unauthenticated redirect ownership, provider-aware sign-in path usage, tests and docs that institutionalize redirect shape
- architecture questions in scope: provider isolation, redirect contract ownership, low-blast-radius remediation fit

## Inputs Reviewed

- code paths reviewed: `src/app/auth/bootstrap/start/route.ts`, `src/app/onboarding/layout.tsx`, `src/app/users/layout.tsx`, `src/app/dashboard/layout.tsx`, `src/security/middleware/with-auth.ts`, `src/app/auth/post-auth-redirect.ts`
- docs / ADRs / prompts reviewed: `AGENTS.md`, `00 - Agent Interaction Protocol.md`, `REPOSITORY_AI_CONTEXT.md`, `AUTH_FLOW_ANTI_PATTERNS.md`, `AUTH_FLOW_MATRIX_HOW_TO_USE.md`, `AUTH_FLOW_VERIFICATION_MATRIX.md`, Workflow 05 prompt/package
- earlier task artifacts reviewed: current task control artifacts plus the existing security/runtime/debug summaries in this task workspace

## Actions Performed

- repository inspection performed: yes
- boundary checks performed: yes
- dependency / DI review performed: yes, focused on where redirect decisions are owned rather than on new service design
- docs-vs-code checks performed: yes

## Current-State Findings

- Confirmed:
  - `src/security/middleware/with-auth.ts` already owns the canonical provider-aware sign-in path selection via `getSignInPath()`
  - bootstrap-start remains the hot-path onboarding decision boundary and should stay there
  - `/users` remains intentionally DB-backed and exempt from the edge cookie-hint redirect path
  - default authenticated app entry is `/dashboard`, not `/users`
- Risks:
  - `src/app/auth/bootstrap/start/route.ts`, `src/app/onboarding/layout.tsx`, and `src/app/users/layout.tsx` each hardcode `/sign-in`, creating a second provider-coupled redirect convention outside the centralized middleware pattern
  - tests lock that drift in place, increasing recurrence risk during future auth-flow work
- Drift:
  - docs and matrix wording still overemphasize `/users` as the canonical ready route while code uses `DEFAULT_APP_ENTRY_URL = '/dashboard'`

## Boundary And Dependency Assessment

- module ownership assessment: redirect ownership is split coherently today, but provider-aware sign-in path knowledge is duplicated inconsistently across delivery-layer guards
- dependency direction assessment: the smallest safe fix can remain inside `src/app/*` delivery surfaces and reuse an existing middleware pattern without introducing new cross-layer imports if implemented carefully
- DI / composition assessment: no DI changes are required for the approved remediation; the issue is contract drift, not composition drift
- cross-module coupling assessment: broadening the fix into proxy, provisioning, or tenant-context logic would unnecessarily increase blast radius and is not justified by current evidence

## Architectural Decisions / Constraints

- approved architectural constraints:
  - keep bootstrap-start as the primary post-auth routing boundary
  - keep DB truth and cookie-hint semantics unchanged
  - keep `/users` as a DB-backed safety net rather than moving hot-path onboarding authority back there
  - prefer redirect-unification over auth-flow redesign
- rejected directions:
  - no broad auth-flow refactor
  - no proxy ownership expansion for `/users`
  - no provider-specific branching scattered further across layouts/pages
- follow-up architectural guardrails:
  - the first patch should stay within the concrete drift slice and its coupled tests
  - docs/matrix landing-route drift can be handled as a follow-up unless required by the same patch for clarity

## Artifact Synchronization

- `plan.md` updates: synchronized to mark architecture review complete and record design-review completion
- `intake.md` updates: synchronized to record design review outcome and approved remediation slice
- `implementation-plan.md` updates: synchronized to record GO recommendation and non-goals
- specialist artifact updates: created this file

## Open Questions / Blockers

- unresolved questions: whether the user-visible loop also depends on a second runtime/session churn issue beyond redirect drift
- blockers: no browser trace captured in this run
- evidence still needed: post-fix browser evidence only if the low-blast-radius redirect cleanup does not fully settle the flow

## Handoff Notes

- what the next agent should rely on: the remediation does not require architecture redesign; the real issue is provider-isolation drift in delivery-layer redirects
- what should not be re-decided without new evidence: bootstrap-start ownership, `/users` safety-net role, DB truth, and cookie-hint semantics
- recommended next specialist or step: focused implementation of provider-aware redirect cleanup, then targeted validation

## Update Log

### Update Entry

- Date: 2026-04-26
- Trigger: formal auth-flow change review requested before implementation
- Summary of change: recorded architectural approval for a constrained redirect-unification patch and blocked broader redesign scope
- Sections refreshed: all
