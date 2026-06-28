# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-05-05-admin-bootstrap-deploy-design`
- Task Objective: assess whether the current first-admin bootstrap design is production-ready and where bootstrap ownership belongs
- Current Run Scope: deployment bootstrap ownership, config source-of-truth, seed-vs-script decision, and rollout shape
- Status: COMPLETED
- Last Updated: 2026-05-05
- Related Control Artifacts: `plan.md`, `intake.md`, `implementation-plan.md`

## Scope Handled

- modules / layers reviewed: deployment workflows, bootstrap script, env schema, authorization seed layer, single-tenant runtime enforcement
- change surface reviewed: first-admin bootstrap ownership and deployment placement
- architecture questions in scope: source-of-truth ownership, environment control plane, seed boundaries, operational bootstrap shape

## Inputs Reviewed

- code paths reviewed: `scripts/bootstrap-admin.ts`, `.github/workflows/preview-deploy.yml`, `.github/workflows/prod-deploy.yml`, `src/core/env.ts`, `.env.example`, `src/modules/authorization/infrastructure/drizzle/seed.ts`, `src/security/core/node-provisioning-access.ts`
- docs / ADRs / prompts reviewed: `AGENTS.md`, `00 - Agent Interaction Protocol.md`, `REPOSITORY_AI_CONTEXT.md`, `AUTH_FLOW_ANTI_PATTERNS.md`
- earlier task artifacts reviewed: none

## Actions Performed

- repository inspection performed: yes
- boundary checks performed: yes
- dependency / DI review performed: yes, limited to operational ownership boundaries
- docs-vs-code checks performed: yes

## Current-State Findings

- Confirmed:
  - the dedicated `bootstrap-admin.ts` script is the correct abstraction for first-admin initialization
  - bootstrap is intentionally outside the Next.js runtime env contract and that boundary is correct
  - `DEFAULT_TENANT_ID` is runtime configuration used beyond bootstrap
- Risks:
  - deploy workflows split ownership between Vercel environment config and GitHub CI secrets
  - `DEFAULT_TENANT_ID` is incorrectly treated as a workflow secret input even though it is application config
  - automatic bootstrap on every deploy increases operational coupling
- Drift:
  - `.env.example` documents Vercel env ownership while workflows currently inject bootstrap values from GitHub secrets

## Boundary And Dependency Assessment

- module ownership assessment: first-admin creation belongs to operational bootstrap tooling, not authorization seed fixtures
- dependency direction assessment: moving bootstrap into seeds would wrongly couple production operator setup to fixture-oriented seed flows
- DI / composition assessment: no DI redesign is needed; the issue is deployment ownership, not composition
- cross-module coupling assessment: `DEFAULT_TENANT_ID` is currently coupled to both runtime config and CI secret injection, which is the wrong boundary split

## Architectural Decisions / Constraints

- approved architectural constraints:
  - keep `bootstrap-admin.ts`
  - keep first-admin bootstrap out of generic seed flows
  - treat `DEFAULT_TENANT_ID` as deployment environment config only
- rejected directions:
  - do not move first-admin bootstrap into `seed.ts`
  - do not keep long-term dual ownership of runtime config in both Vercel and GitHub secrets
- follow-up architectural guardrails:
  - production should prefer explicit one-time bootstrap over automatic bootstrap during every deploy
  - if auto-bootstrap remains, env ownership must be unified under the deployment environment

## Artifact Synchronization

- `plan.md` updates: created and synchronized
- `intake.md` updates: created and synchronized
- `implementation-plan.md` updates: created with approved rollout options
- specialist artifact updates: created this file

## Open Questions / Blockers

- unresolved questions: whether preview environments truly need automatic admin bootstrap for QA workflows
- blockers: none for design
- evidence still needed: implementation-time validation of the chosen rollout option

## Handoff Notes

- what the next agent should rely on: the script is structurally correct; secret ownership is the real problem
- what should not be re-decided without new evidence: seed is not the right home for first-admin production bootstrap
- recommended next specialist or step: Security & Auth review on trust boundary and secret ownership, then Validation Strategy for rollout proof

## Update Log

### Update Entry

- Date: 2026-05-05
- Trigger: user requested production-readiness design review for admin bootstrap deployment shape
- Summary of change: completed architecture review and approved the dedicated script while rejecting seed-based production bootstrap and dual ownership of runtime config
- Sections refreshed: all
