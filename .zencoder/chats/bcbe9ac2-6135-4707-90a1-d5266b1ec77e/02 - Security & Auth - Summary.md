# 02 - Security & Auth - Summary

## Task Context

- **Task ID**: bcbe9ac2-6135-4707-90a1-d5266b1ec77e
- **Task Objective**: Remediate production-readiness gaps — missing env validation gates, over-broad bootstrap coupling on public routes, and invalid SDD documentation placeholders
- **Current Run Scope**: Initial security and auth assessment
- **Status**: COMPLETED
- **Last Updated**: 2026-04-03
- **Related Control Artifacts**: `incident-intake.md`

## Scope Handled

- **auth surfaces reviewed**: Bootstrap validation chain (`createRequestContainer` → `validateAuthProviderConfigValues` → `validateTenancyConfigValues`), auth module tenant resolver factory (`buildTenantResolver` in `src/modules/auth/index.ts`), Clerk key validation in bootstrap
- **authorization surfaces reviewed**: `security-showcase/page.tsx` — no server-side authorization enforcement found; page resolves identity but does not gate access based on roles or permissions
- **trust-boundary questions in scope**: Where tenant identity is derived and validated; whether env validation is a trust boundary; whether the showcase page's container access creates a privilege escalation path

## Inputs Reviewed

- **code paths reviewed**:
  - `src/core/env.ts` — `validateTenancyConfigValues()`, `validateAuthProviderConfigValues()`
  - `src/core/runtime/bootstrap.ts` — `createRequestContainer()`, `getAppContainer()`
  - `src/modules/auth/index.ts` — `buildTenantResolver()` single-tenant branch (also throws if `defaultTenantId` missing)
  - `src/modules/provisioning/infrastructure/SingleTenantResolver.ts`
  - `src/modules/provisioning/infrastructure/build-provisioning-input.ts`
  - `src/app/security-showcase/page.tsx`
  - `.github/workflows/pr-validation.yml`, `preview-deploy.yml`, `prod-deploy.yml`
  - `docs/sdd/deployVercelProd.yml`, `docs/sdd/deployVercelPreview.yml`
- **security/auth docs reviewed**: `SECURITY_CODING_PATTERNS.md`
- **earlier task artifacts reviewed**: `incident-intake.md`

## Actions Performed

- **identity flow tracing performed**: Yes — traced from Clerk session cookie through `ClerkRequestIdentitySource` → `RequestScopedIdentityProvider` → security context creation in showcase page
- **authorization enforcement review performed**: Yes — no authorization-gated logic in the showcase page itself; the page is intentionally public
- **tenant / org context review performed**: Yes — `buildTenantResolver` in `auth/index.ts` has its own defensive throw for missing `defaultTenantId` in single-tenant mode (in addition to `validateTenancyConfigValues` in `env.ts`), meaning two layers enforce this requirement
- **sensitive-data exposure review performed**: Yes — security context object is rendered in a `<pre>` block; in guest/degraded mode this exposes only synthetic defaults, not real user data

## Current-State Findings

### Confirmed

- `DEFAULT_TENANT_ID` is **genuinely required** in `TENANCY_MODE=single`. Two independent enforcement points exist: `validateTenancyConfigValues()` in `env.ts` and `buildTenantResolver()` in `auth/index.ts`. Both throw. This is **architecturally correct** — the error is that it is caught too late (at request time in production) rather than at deploy time.
- `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are required when `AUTH_PROVIDER=clerk` (default). `validateAuthProviderConfigValues()` enforces this. Same gap: this validation is not run before deployment.
- The security-showcase page calls `getAppContainer().createChild()` **before** any session check. If bootstrap throws (missing env), the entire React Server Component throws and falls through to the root error boundary, not the page's own `contextError` handler. The `try/catch` around `createSecurityContext()` does not protect against bootstrap failure.
- `docs/sdd/deployVercelProd.yml` line 59: `DEFAULT_TENANT_ID: 'default'` — fails `z.uuid()` validation. Operators following this doc will deploy a broken configuration.
- `docs/sdd/deployVercelPreview.yml` line 82: `DEFAULT_TENANT_ID: 'preview-tenant'` — fails `z.uuid()` validation. Same problem.

### Risks

- **CRITICAL**: No CI/CD gate validates cross-field env requirements before deploy. A misconfigured production deploy can ship silently.
- **MAJOR**: The security-showcase page's bootstrap call is outside the try/catch — any config error during bootstrap (not just during `createSecurityContext()`) crashes the entire RSC render.
- **MAJOR**: SDD docs with invalid placeholder values will mislead operators into broken deployments.
- **LOW**: The duplicate enforcement of `DEFAULT_TENANT_ID` in both `env.ts` and `auth/index.ts` creates minor maintenance overhead (two places to update if the requirement changes), but is not a bug.

### Drift

- Documentation (`docs/sdd/`) claims `DEFAULT_TENANT_ID: 'default'` and `'preview-tenant'` are valid — code proves they must be UUIDs. This is dangerous drift.

## Trust Boundary Assessment

- **where identity is established**: Clerk session cookie → `ClerkRequestIdentitySource` → `RequestScopedIdentityProvider` (server-side only, Node runtime)
- **where authorization is enforced**: The showcase page has no authorization gate — it is intentionally public. Authorization is enforced in RSC guards and proxy for other routes.
- **where tenant or org context is derived**: `SingleTenantResolver` returns `DEFAULT_TENANT_ID` from env — static, not user-controlled. Correct trust model.
- **what claims or inputs are trusted**: Clerk session claims (server-validated). `DEFAULT_TENANT_ID` is environment-supplied, not user-controllable.

## Sensitive Data And Exposure Notes

- **logging / telemetry review**: No secrets or tokens logged. Bootstrap errors may surface env variable names in error messages but not their values.
- **response exposure review**: Security context is rendered in `<pre>` block. In degraded/guest mode, only synthetic UUIDs and static strings are shown — no real user data. Acceptable.
- **client exposure review**: `DEFAULT_TENANT_ID` is a server-side env var — not exposed to client. Safe.
- **cache exposure review**: The showcase page is a dynamic RSC (no `cache` or `revalidate` config) — no caching risk for auth-sensitive data.

## Security Decisions / Constraints

### Approved Controls

1. **Add `pnpm env:validate` script** that imports `validateAuthProviderConfigValues` and `validateTenancyConfigValues` from `src/core/env.ts` and runs them against `process.env`. This is the correct approach: reuse existing validators rather than duplicating logic.
2. **Wire `pnpm env:validate` into all three CI/CD gates** before `vercel build`. This is the primary fix.
3. **Move `getAppContainer().createChild()` inside the try/catch** (or protect with a try/catch of its own before the session check) in `security-showcase/page.tsx`. If bootstrap fails, render a controlled config-error UI rather than crashing.
4. **Fix SDD docs** to replace invalid placeholder values with valid UUID examples or explicit operator instructions.

### Rejected Directions

- **Do NOT loosen `DEFAULT_TENANT_ID` requirement** — the requirement is correct; the gap is in detection timing
- **Do NOT push tenant knowledge into UI components** — current architecture (tenant resolved server-side via `SingleTenantResolver`) is correct
- **Do NOT bypass env.ts schema** — the existing schema and validators are the right implementation

### Required Enforcement Points

- Cross-field env validation MUST run before `vercel build` in every deploy pipeline
- Bootstrap failure in the showcase page MUST be caught and render a controlled UI, not propagate as an uncaught RSC throw

## Artifact Synchronization

- `incident-intake.md`: Status confirmed, findings consistent with intake
- `plan.md`: No changes needed at this step
- `implementation-plan.md`: Not yet created
- Security patterns: No new patterns identified — existing patterns in `SECURITY_CODING_PATTERNS.md` are not applicable to this incident type

## Open Questions / Blockers

- **Unresolved**: Can `scripts/validate-env.mjs` safely `import('@/core/env')` from a plain Node script, or does it need a different approach due to TypeScript path aliases? (Most likely needs `tsx` or compiled output — to be confirmed by Runtime agent)
- **Unresolved**: Should the showcase page config-error UI be a banner (page still renders with all flags off) or a full-page error card?

## Handoff Notes

- **What the next agent should rely on**: The cross-field validators in `env.ts` are correct and should be reused, not reimplemented
- **What should not be re-decided without new evidence**: `DEFAULT_TENANT_ID` must remain required in single-tenant mode
- **Recommended next specialist**: Next.js Runtime agent (to determine how to run the validator from CI — path alias resolution, `tsx` vs compiled output, import mechanics)

## Update Log

### 2026-04-03 — Initial Assessment

- Trigger: Security incident intake
- Summary: Full security and auth surface reviewed; four issues confirmed; constraints established
- Sections refreshed: All

---

## Final Security Check (Post-Implementation)

**Date**: 2026-04-03
**Trigger**: Implementation complete; validation passed

### Trust Boundary Closure

- **DEFAULT_TENANT_ID enforcement**: ✅ Still required in `TENANCY_MODE=single` — no change to the requirement, only the detection timing improved (CI gate now catches it before deploy)
- **Auth key enforcement**: ✅ `validateAuthProviderConfigValues` still enforces Clerk keys when `AUTH_PROVIDER=clerk` — no change
- **Bootstrap error isolation**: ✅ Security showcase page now catches bootstrap failure and does NOT expose raw error details in production; only a generic "Configuration Error" banner shown
- **Server logger usage**: ✅ Bootstrap error logged with `resolveServerLogger()` in structured format — only `errorName` and `errorMessage` logged, no stack traces, no env var values

### New Security Surface Review

- `scripts/validate-env.ts` — new file: reads only from `process.env` via T3-Env; calls validators with those values; does not log secrets or env var values; exits with structured error messages only containing field names, not values. **No new security risk.**
- `package.json` — added `env:validate` entry: no security implications.
- CI/CD workflow YAML — added `pnpm env:validate` steps: no new secrets exposed; Vercel-pulled environment is already trusted at that stage.
- `security-showcase/page.tsx` — modified: bootstrap error message only shown in `NODE_ENV === 'development'`; production shows generic text. **No security regression.**
- SDD docs — corrected: replaced invalid placeholder strings with UUID instructions. **No security implications.**

### No New Regressions Identified

The implementation does not introduce:

- new auth bypass paths
- new authorization weaknesses
- new tenant isolation risks
- new sensitive data exposure
- new open redirect risks
- new server-to-client boundary violations

### Status: CLOSED

Trust-boundary issue (missing deploy-time enforcement of mandatory config) is **closed** by the implementation.
Residual documentation risk from invalid UUID placeholders is **closed** by the doc fix.
