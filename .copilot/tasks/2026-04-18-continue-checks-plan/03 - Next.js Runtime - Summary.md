# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: `2026-04-18-continue-checks-plan`
- Task Objective: determine which Next.js runtime concerns justify narrow Continue checks.
- Current Run Scope: planning-level runtime review for Continue rollout
- Status: COMPLETED
- Last Updated: 2026-04-18
- Related Control Artifacts:
  - `plan.md`
  - `intake.md`
  - `implementation-plan.md`

## Scope Handled

- runtime entrypoints reviewed:
  - `src/proxy.ts`
  - App Router guidance in `AGENTS.md`
- App Router surfaces reviewed: pages/layouts/route handlers by policy and targeted examples
- runtime questions in scope: `connection()`, request-time rendering, cacheComponents constraints, proxy responsibilities

## Inputs Reviewed

- code paths reviewed:
  - `src/proxy.ts`
  - runtime-related examples surfaced during search
- runtime docs reviewed:
  - `AGENTS.md`
  - Continue spec/examples
- earlier task artifacts reviewed: none

## Actions Performed

- server/client boundary review performed: yes, enough to reject duplicate import-hygiene checks for v1
- route handler / server action review performed: targeted
- proxy review performed: yes
- cache / runtime review performed: yes

## Current-State Findings

- Confirmed:
  - the most valuable runtime Continue check is the `connection()` before DI/request bootstrap rule
  - `export const dynamic` and `export const runtime` do not need Continue checks because Next/Turbopack already fail hard
  - runtime awareness belongs partly in a shared rule file, partly in one narrow blocking check
- Risks:
  - a broad Next.js runtime check would become noisy and overlap with framework/compiler failures
- Drift:
  - none material for this planning target

## Runtime Boundary Assessment

- server vs client placement: important, but partially covered by current lint restrictions and review conventions
- edge vs node placement: important context for `src/proxy.ts` and auth/security middleware
- route handler / page / layout responsibilities: must respect request-time rendering rules under `cacheComponents`
- proxy responsibilities: remain central to auth/security routing behavior and should inform auth-related checks

## Caching And Revalidation Notes

- cache-sensitive observations:
  - `cacheComponents: true` creates stricter runtime constraints than many generic Next.js checks assume
- revalidation observations: not a first-wave Continue target
- request-time vs build-time notes:
  - `await connection()` is a repository-critical request-time guardrail

## Runtime Decisions / Constraints

- approved runtime constraints:
  - one dedicated `connection-before-di` blocking check
  - one shared runtime rule file for codebase awareness
- rejected directions:
  - generic App Router or caching mega-check
- runtime assumptions requiring validation:
  - the check prompt must narrow itself to changed App Router server files touching DI/bootstrap patterns

## Artifact Synchronization

- `plan.md` updates: completed
- `intake.md` updates: completed
- `implementation-plan.md` updates: completed
- specialist artifact updates: this file created

## Open Questions / Blockers

- unresolved questions: none blocking the plan
- blockers: none
- evidence still needed: local prompt trial once implementation starts

## Handoff Notes

- what the next agent should rely on:
  - runtime value comes from one sharp, repo-specific check, not a broad framework review gate
- what should not be re-decided without new evidence:
  - do not convert framework hard errors into redundant Continue checks
- recommended next specialist or step: Validation Strategy synthesis

## Update Log

### Update Entry

- Date: 2026-04-18
- Trigger: Continue planning analysis
- Summary of change: recorded runtime-specific Continue check fit and exclusions
- Sections refreshed: all
