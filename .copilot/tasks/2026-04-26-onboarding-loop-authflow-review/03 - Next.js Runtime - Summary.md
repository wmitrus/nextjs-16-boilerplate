# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: `2026-04-26-onboarding-loop-authflow-review`
- Task Objective: review runtime-correctness of the current onboarding/bootstrap flow under AuthJS
- Current Run Scope: read-only runtime review of proxy, App Router layouts, route handlers, and provider-aware routing
- Status: COMPLETED
- Last Updated: 2026-04-26
- Related Control Artifacts: `plan.md`, `intake.md`, `constraints.md`

## Scope Handled

- runtime entrypoints reviewed: proxy, bootstrap start route, onboarding layout, users layout, dashboard layout, AuthJS sign-in page
- App Router surfaces reviewed: route handler, page, and layout redirects tied to onboarding
- runtime questions in scope: bootstrap hot-path ownership, provider-aware redirect placement, route-level vs edge-level onboarding routing

## Inputs Reviewed

- code paths reviewed: `src/proxy.ts`, `src/security/middleware/with-auth.ts`, `src/app/auth/bootstrap/start/route.ts`, `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`, `src/app/onboarding/layout.tsx`, `src/app/users/layout.tsx`, `src/app/dashboard/layout.tsx`, `src/app/auth/signin/page.tsx`
- runtime docs reviewed: mode manifest, repository runtime rules, auth anti-patterns, auth verification matrix
- earlier task artifacts reviewed: auth foundation redesign plan, admin access regression runtime notes

## Actions Performed

- server/client boundary review performed: yes
- route handler / server action review performed: yes
- proxy review performed: yes
- cache / runtime review performed: yes

## Current-State Findings

- Confirmed:
  - `src/proxy.ts` still routes AuthJS through `with-auth.ts` and leaves `/users` onboarding authority to node layouts, matching the documented compromise
  - `src/app/auth/bootstrap/start/route.ts` legally sets `__onboarding_pending` in a route handler and redirects to `/onboarding`
  - `src/app/onboarding/actions.ts` legally clears the cookie in a server action
  - `src/app/auth/signin/page.tsx` is the live AuthJS sign-in route
- Risks:
  - onboarding/bootstrap code paths still redirect to `/sign-in` in some unauthenticated cases, creating an inconsistent runtime surface versus AuthJS `/auth/signin`
  - tests assert that stale path, increasing recurrence risk
- Drift:
  - `DEFAULT_APP_ENTRY_URL` is `/dashboard`, while older docs and matrix wording still treat `/users` as the canonical entry route

## Runtime Boundary Assessment

- server vs client placement: routing and onboarding truth stay server-side; client form only submits onboarding completion
- edge vs node placement:
  - edge: proxy + `with-auth.ts` use cookie hint for general private routes
  - node: bootstrap outcome and route layouts remain authoritative for provisioning/onboarding state
- route handler / page / layout responsibilities:
  - bootstrap start route owns post-auth routing decision and cookie set
  - onboarding action owns cookie clear
  - users/dashboard layouts remain fallback DB-backed guards
  - onboarding layout decides whether onboarding should render or redirect away
- proxy responsibilities: pre-filter auth presence and use routing hint for non-`/users` private routes, not as source of truth

## Caching And Revalidation Notes

- cache-sensitive observations: reviewed auth paths are request-time routing decisions, not cacheable shared data
- revalidation observations: none in scope
- request-time vs build-time notes: current reviewed handlers/pages already use runtime-legal patterns; the issue is redirect consistency, not dynamic opt-in misuse

## Runtime Decisions / Constraints

- approved runtime constraints:
  - keep bootstrap-start as the hot-path routing boundary
  - keep `/users` excluded from edge cookie-hint redirect and protected by DB-backed layout
- rejected directions:
  - do not push onboarding truth into edge middleware
  - do not restore old `/users` hot-path redirect ownership
- runtime assumptions requiring validation:
  - whether the observed loop is a pure redirect inconsistency or a second session/bootstrap churn issue requires browser evidence

## Artifact Synchronization

- `plan.md` updates: created and synchronized
- `intake.md` updates: created and synchronized
- `implementation-plan.md` updates: created and synchronized
- specialist artifact updates: this file created

## Open Questions / Blockers

- unresolved questions: exact runtime sequence that produced the user's visible loop
- blockers: no browser/network trace in this run
- evidence still needed: redirect chain and final committed route in a real browser under local AuthJS env

## Handoff Notes

- what the next agent should rely on: runtime ownership split remains valid; the real drift is provider-unaware redirect targets
- what should not be re-decided without new evidence: cookie-hint legality and bootstrap-start route ownership
- recommended next specialist or step: focused fix plus Playwright/browser verification if remediation is requested

## Update Log

### Update Entry

- Date: 2026-04-26
- Trigger: runtime review for reported `/onboarding` loop
- Summary of change: documented current runtime shape, confirmed preserved contract, recorded redirect-target drift
- Sections refreshed: all
