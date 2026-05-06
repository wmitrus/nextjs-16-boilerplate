# 05 - Validation Strategy - Summary

## Task Context

- Task ID: `2026-05-05-admin-bootstrap-deploy-design`
- Task Objective: define the minimum safe validation scope for changing admin bootstrap secret ownership and deploy placement
- Current Run Scope: deployment/bootstrap design validation only
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-05-05
- Related Control Artifacts: `plan.md`, `intake.md`, `implementation-plan.md`

## Scope Handled

- change surfaces assessed: deploy workflows, bootstrap script invocation path, env ownership model, operator runbook expectations
- validation questions in scope: what must be proven if bootstrap moves from GitHub secrets to Vercel envs or to an explicit operator step
- excluded validation areas: broad auth-flow matrix, unrelated admin UI behavior, unrelated runtime/browser flows

## Inputs Reviewed

- code paths reviewed: `scripts/bootstrap-admin.ts`, `.github/workflows/preview-deploy.yml`, `.github/workflows/prod-deploy.yml`, `.env.example`, `src/core/env.ts`
- tests / configs / workflows reviewed: deploy workflow steps and package bootstrap scripts
- earlier task artifacts reviewed: current task control artifacts

## Actions Performed

- validation posture review performed: yes
- risk analysis performed: yes
- test-level recommendations prepared: yes
- command recommendations prepared: yes

## Current-State Findings

- Confirmed:
  - this is an operational rollout change, not a product behavior rewrite
  - high-signal validation is possible without broad test expansion
- Risks:
  - config-source drift between CI and Vercel is the primary regression risk
  - removing workflow bootstrap entirely without a verified manual path would create onboarding deadlock risk in invite-only single-tenant deployments
- Drift:
  - current docs and workflows encode different operational models

## Validation-Risk Assessment

- primary risks:
  - deploy succeeds but admin bootstrap silently stops working
  - `DEFAULT_TENANT_ID` source becomes inconsistent with runtime env
  - production deadlock reappears if explicit bootstrap path is not verified
- confidence gaps:
  - no single canonical operator runbook currently proven against the chosen rollout option
- over-validation or under-validation concerns:
  - full repo CI is not the design question here
  - diff-only validation would be too weak because the change is operationally sensitive

## Recommended Validation Scope

- minimum required validation:
  - prove the chosen source of `DEFAULT_TENANT_ID` during bootstrap execution
  - prove bootstrap still succeeds against a fresh database under the selected rollout model
  - prove second execution is idempotent
  - prove invite-only single-tenant startup does not deadlock after the first admin exists
- optional additional validation:
  - preview smoke verification if preview auto-bootstrap remains enabled
  - operator runbook dry-run against production-like env pull flow
- validation explicitly not required:
  - broad Playwright auth matrix reruns
  - unrelated admin feature suites

## Validation Commands / Checks

- commands to run:
  - `pnpm bootstrap:admin` against a production-like env file or pulled Vercel env
  - second `pnpm bootstrap:admin` rerun for idempotency proof
  - focused DB/user existence check after bootstrap
  - deploy-workflow dry run or equivalent script step validation for the selected rollout option
- environment prerequisites:
  - fresh or controlled database
  - valid `DEFAULT_TENANT_ID`
  - invite-only single-tenant config when validating the deadlock-break path
- expected evidence:
  - first run creates owner user/org/membership/policies as expected
  - second run skips cleanly
  - no GitHub-only config dependency remains if ownership is moved to Vercel

## Artifact Synchronization

- `plan.md` updates: synchronized
- `intake.md` updates: synchronized
- `implementation-plan.md` updates: synchronized with required proof set
- specialist artifact updates: created this file

## Open Questions / Blockers

- unresolved questions: whether preview and production will use the same rollout model
- blockers: none for design
- dependencies on architecture / security / runtime decisions: architecture and security decisions are now clear enough for implementation planning

## Handoff Notes

- what the next agent should rely on: this change needs operational validation, not broad product-suite expansion
- what should not be re-decided without new evidence: high-signal validation should stay focused on bootstrap correctness, config ownership, and idempotency
- recommended next specialist or step: Implementation planning using either Option A or Option B from `implementation-plan.md`

## Update Log

### Update Entry

- Date: 2026-05-05
- Trigger: user requested validation design before implementation planning
- Summary of change: defined the minimum proof set for changing bootstrap secret ownership and deploy placement
- Sections refreshed: all
