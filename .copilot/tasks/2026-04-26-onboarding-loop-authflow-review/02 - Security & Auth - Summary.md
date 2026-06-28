# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-04-26-onboarding-loop-authflow-review`
- Task Objective: verify the reported `/onboarding` loop and recent auth-flow changes against the current repository auth contract
- Current Run Scope: auth-flow review plus PR-readiness follow-up on logging hygiene and redirect-validation coverage under `AUTH_PROVIDER=authjs`
- Status: COMPLETED
- Last Updated: 2026-04-26
- Related Control Artifacts: `plan.md`, `intake.md`, `constraints.md`, `validation-report.md`

## Scope Handled

- auth surfaces reviewed: bootstrap start, onboarding guard, protected-route guards, AuthJS sign-in entry, redirect sanitization
- authorization surfaces reviewed: route-level provisioning access and admin gating were inspected only where they shape onboarding redirects
- trust-boundary questions in scope: provider-aware sign-in redirects, bootstrap ownership of onboarding routing, DB truth vs cookie hint

## Inputs Reviewed

- code paths reviewed: `src/app/auth/bootstrap/start/route.ts`, `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`, `src/app/onboarding/layout.tsx`, `src/app/onboarding/actions.ts`, `src/security/middleware/with-auth.ts`, `src/app/users/layout.tsx`, `src/app/dashboard/layout.tsx`, `src/app/auth/signin/page.tsx`, `src/app/auth/post-auth-redirect.ts`
- security/auth docs reviewed: auth anti-patterns, matrix usage guide, verification matrix, security coding patterns
- earlier task artifacts reviewed: auth foundation master plan, admin access regression plan

## Actions Performed

- identity flow tracing performed: yes
- authorization enforcement review performed: yes, at route/layout level
- tenant / org context review performed: yes, only as it affects bootstrap decisions
- sensitive-data exposure review performed: yes, limited to redirect and cookie-hint handling
- PR-readiness follow-up performed: yes, for SEC-10 log hygiene and AuthJS-aware redirect validation coverage

## Current-State Findings

- Confirmed:
  - bootstrap start still owns the post-auth onboarding routing decision, matching the repository contract
  - `sanitizeRedirectUrl()` is applied where `redirect_url` enters bootstrap routing
  - DB truth still decides onboarding completion; `__onboarding_pending` remains a routing hint only
  - `with-auth.ts` is provider-aware for sign-in redirects
- Risks:
  - no remaining provider-mixed unauthenticated redirect was found in the reviewed bootstrap/onboarding/users/dashboard/admin slice after the implementation fixes
  - PR-readiness follow-up identified raw `err` logger payloads in touched auth-flow guards and Clerk-only redirect assertions in integration tests; both were low-blast-radius fix targets before sign-off
- Drift:
  - tests in onboarding/bootstrap still encode `/sign-in`, so the drift is institutionalized, not incidental
  - docs and matrix language still over-reference `/users` while live default app entry is `/dashboard`

## Trust Boundary Assessment

- where identity is established: provider session via AuthJS identity source and NextAuth session handling
- where authorization is enforced: server-side in `with-auth.ts`, node provisioning access guards, and route/layout redirects
- where tenant or org context is derived: bootstrap outcome and provisioning services, not from client input
- what claims or inputs are trusted: server-resolved identity and DB records; `redirect_url` only after sanitization; onboarding cookie only as routing hint

## Sensitive Data And Exposure Notes

- logging / telemetry review: no new secret leakage found in reviewed paths; repeated guard logs would be symptom noise rather than exposure issue
- response exposure review: auth paths use same-origin redirects and safe defaults
- client exposure review: no security-critical enforcement moved client-side in reviewed paths
- cache exposure review: reviewed paths are dynamic request-time decisions, not globally cached user state

## Security Decisions / Constraints

- approved controls or constraints:
  - keep bootstrap-start as the hot-path onboarding decision boundary
  - keep DB as the onboarding truth source
  - keep `sanitizeRedirectUrl()` on forwarded redirect params
  - keep raw `Error` objects out of logger payloads in auth-flow guards
- rejected directions:
  - do not normalize by moving all onboarding redirects back into route layouts
  - do not treat `/sign-in` as acceptable in AuthJS-sensitive code paths
- required enforcement points:
  - provider-aware unauthenticated redirects in bootstrap/onboarding guards
  - scenario-level matrix verification before sign-off

## Artifact Synchronization

- `plan.md` updates: created and synchronized
- `intake.md` updates: created and synchronized
- `implementation-plan.md` updates: created with follow-up plan only
- specialist artifact updates: this file created

## Open Questions / Blockers

- unresolved questions: whether the user-visible loop is caused solely by redirect drift or by a second runtime/session issue
- blockers: no browser trace captured in this run and no terminal-backed focused test execution was available in this tool surface
- evidence still needed: real-browser navigation evidence for `/auth/bootstrap/start -> /onboarding` under local AuthJS env

## Handoff Notes

- what the next agent should rely on: provider-aware redirect drift in onboarding/bootstrap was real and is now fixed in the reviewed slice; SEC-10 logging hygiene is also now corrected there
- what should not be re-decided without new evidence: bootstrap-start ownership, DB truth, cookie-hint role
- recommended next specialist or step: focused implementation fix plus browser verification if the user wants the loop remediated

## Update Log

### Update Entry

- Date: 2026-04-26
- Trigger: auth-flow review request for `/onboarding` loop and latest AuthJS fixes
- Summary of change: recorded security/auth findings, trust-boundary assessment, and concrete redirect drift
- Sections refreshed: all

### Update Entry

- Date: 2026-04-26
- Trigger: PR-readiness follow-up after user-confirmed loop disappearance
- Summary of change: recorded that remaining review blockers were narrowed to raw-error logging and missing AuthJS-aware integration assertions, then updated the summary after those blockers were fixed in code
- Sections refreshed: Task Context, Actions Performed, Current-State Findings, Security Decisions / Constraints, Open Questions / Blockers, Handoff Notes, Update Log
