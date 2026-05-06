# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-05-05-admin-bootstrap-deploy-design`
- Task Objective: assess trust boundaries and secret ownership for first-admin bootstrap in preview and production deploy workflows
- Current Run Scope: bootstrap credentials, tenant config ownership, privileged account creation path
- Status: COMPLETED
- Last Updated: 2026-05-05
- Related Control Artifacts: `plan.md`, `intake.md`, `implementation-plan.md`

## Scope Handled

- auth surfaces reviewed: first-admin creation path, AuthJS invite-only deadlock bypass, owner-role assignment path
- authorization surfaces reviewed: tenant, organization, role, policy, membership bootstrap writes
- trust-boundary questions in scope: where privileged bootstrap inputs should live and which control plane should own them

## Inputs Reviewed

- code paths reviewed: `scripts/bootstrap-admin.ts`, `.github/workflows/preview-deploy.yml`, `.github/workflows/prod-deploy.yml`, `src/core/env.ts`, `.env.example`, `src/security/core/node-provisioning-access.ts`
- security/auth docs reviewed: `SECURITY_CODING_PATTERNS.md`, `AUTH_FLOW_ANTI_PATTERNS.md`
- earlier task artifacts reviewed: none

## Actions Performed

- identity flow tracing performed: yes
- authorization enforcement review performed: yes
- tenant / org context review performed: yes
- sensitive-data exposure review performed: yes

## Current-State Findings

- Confirmed:
  - the bootstrap script creates the first privileged user through direct server-side DB writes and assigns owner policies explicitly
  - bootstrap credentials are not exposed through the Next.js runtime env schema
  - `DEFAULT_TENANT_ID` is trusted server-side configuration, not user input
- Risks:
  - GitHub secrets currently own privileged bootstrap credentials for deploy-time execution, expanding the trust boundary into CI
  - `DEFAULT_TENANT_ID` is injected from GitHub secrets even though runtime config should come from the deployment environment
  - a long-lived `BOOTSTRAP_ADMIN_PASSWORD` in CI is broader exposure than necessary
- Drift:
  - `.env.example` says bootstrap credentials live in environment config, but workflows currently override that through CI secret injection

## Trust Boundary Assessment

- where identity is established: bootstrap script creates the initial internal identity directly in the database
- where authorization is enforced: owner role, membership, and policy rows are created in the bootstrap transaction path
- where tenant or org context is derived: from trusted server-side environment config, specifically `DEFAULT_TENANT_ID`
- what claims or inputs are trusted: deployment-controlled env values only; this should not be split across multiple control planes

## Sensitive Data And Exposure Notes

- logging / telemetry review: the script avoids printing the password value and logs only the email and tenant/org summary
- response exposure review: not applicable; this is CLI/tooling, not a request handler
- client exposure review: bootstrap secrets are not exposed to the client bundle
- cache exposure review: not applicable

## Security Decisions / Constraints

- approved controls or constraints:
  - treat bootstrap password as short-lived operational secret
  - keep tenant config ownership in deployment environment, not CI
  - prefer environment-local or operator-local secret scope over repository CI scope for privileged bootstrap
- rejected directions:
  - do not treat GitHub Actions as the long-term source of truth for first-admin credentials
  - do not use generic seeds for privileged production bootstrap
- required enforcement points:
  - `DEFAULT_TENANT_ID` must come from the pulled Vercel environment
  - post-bootstrap password removal must remain part of the operational contract

## Artifact Synchronization

- `plan.md` updates: synchronized
- `intake.md` updates: synchronized
- `implementation-plan.md` updates: synchronized with trust-boundary-safe rollout options
- specialist artifact updates: created this file

## Open Questions / Blockers

- unresolved questions: whether production wants unattended bootstrap at all, or explicit operator intent
- blockers: none for design
- evidence still needed: implementation-time proof that chosen workflow does not reintroduce config drift

## Handoff Notes

- what the next agent should rely on: privileged bootstrap via dedicated script is acceptable; GitHub secret ownership for runtime-adjacent config is not
- what should not be re-decided without new evidence: `DEFAULT_TENANT_ID` remains required runtime config in single-tenant mode and should not be duplicated into CI secret ownership
- recommended next specialist or step: Validation Strategy review on minimum safe rollout validation

## Update Log

### Update Entry

- Date: 2026-05-05
- Trigger: user requested security/auth review for admin bootstrap deployment shape
- Summary of change: completed trust-boundary review and rejected GitHub CI as the long-term ownership plane for runtime-adjacent bootstrap config
- Sections refreshed: all
