# Incident Intake

## Incident Description

Production deployment failure caused by a compound of four distinct but related problems:

1. **DEFAULT_TENANT_ID missing in Vercel** — With `TENANCY_MODE=single` (the default), `validateTenancyConfigValues()` throws at bootstrap time if `DEFAULT_TENANT_ID` is not set. This variable was not provisioned in Vercel's production environment, causing runtime crash for any route that calls `getAppContainer()`.

2. **Over-broad bootstrap coupling on public/showcase routes** — `src/app/security-showcase/page.tsx` calls `getAppContainer().createChild()` unconditionally at render time. `getAppContainer()` calls `createRequestContainer()` which calls `validateAuthProviderConfigValues()` and `validateTenancyConfigValues()`. A missing configuration for _any_ of those systems causes the entire showcase page to crash, even though the page should be able to degrade gracefully.

3. **Deploy-time environment validation gap** — CI/CD gates (`pr-validation.yml`, `preview-deploy.yml`, `prod-deploy.yml`) run `pnpm env:check` which only validates `.env.example` file sync. It does NOT validate cross-field requirements (e.g., `TENANCY_MODE=single` requires `DEFAULT_TENANT_ID`). This allowed a broken configuration to ship to production without triggering any gate.

4. **Documentation drift with invalid tenant placeholders** — SDD templates (`docs/sdd/deployVercelProd.yml` line 59 and `docs/sdd/deployVercelPreview.yml` line 82) contain `DEFAULT_TENANT_ID: 'default'` and `DEFAULT_TENANT_ID: 'preview-tenant'` respectively, which are not valid UUIDs and will fail the `z.uuid()` schema validation. Operators following these docs will deploy broken configurations.

## Suspected Severity

**CRITICAL** — The deployment gap means broken configurations can reach production silently.
The root cause is architectural (missing deploy gates) not just a missing variable.

## Affected Surface

| Surface                                                               | Status                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/core/env.ts`                                                     | Cross-field validators exist but are NOT run in CI/CD gates          |
| `src/core/runtime/bootstrap.ts`                                       | `getAppContainer()` runs full validation including auth+tenancy      |
| `src/app/security-showcase/page.tsx`                                  | Calls `getAppContainer()` unconditionally — no config-error fallback |
| `.github/workflows/pr-validation.yml`                                 | Only runs `pnpm env:check` (file sync only)                          |
| `.github/workflows/preview-deploy.yml`                                | Only runs `pnpm env:check` (file sync only)                          |
| `.github/workflows/prod-deploy.yml`                                   | Only runs `pnpm env:check` (file sync only)                          |
| `docs/sdd/deployVercelProd.yml`                                       | `DEFAULT_TENANT_ID: 'default'` — invalid (not a UUID)                |
| `docs/sdd/deployVercelPreview.yml`                                    | `DEFAULT_TENANT_ID: 'preview-tenant'` — invalid (not a UUID)         |
| `src/modules/provisioning/infrastructure/SingleTenantResolver.ts`     | Correctly requires `defaultTenantId` — behavior is correct           |
| `src/modules/provisioning/infrastructure/build-provisioning-input.ts` | Correctly reads `env.DEFAULT_TENANT_ID` in single-tenant mode        |

## Known Symptoms

- Deployed app crashes at any route invoking `getAppContainer()` when `DEFAULT_TENANT_ID` is not set
- No CI gate caught the missing variable before deployment
- Operators following SDD docs would create deployments with invalid non-UUID tenant IDs
- Public showcase pages crash instead of degrading gracefully

## Known Constraints

- `DEFAULT_TENANT_ID` must remain required in `TENANCY_MODE=single` — this is architecturally correct; the fix is earlier failure detection, not loosening requirements
- The cross-field validators (`validateTenancyConfigValues`, `validateAuthProviderConfigValues`) already exist in `src/core/env.ts` and are correct — they just need to be wired into CI/CD gates
- The security-showcase page should remain functional but must degrade to a controlled config-error UI rather than crashing the route entirely
- The minimum change principle applies: do not refactor unrelated subsystems

## Initial Unknowns

- Whether a new standalone `env:validate` script should import the real env module (preferred, but requires CI to have actual env vars available), or whether a lightweight structural check is more practical for CI
- Whether the security-showcase page's container bootstrap failure should surface a user-visible error banner or redirect to an error page
- Whether the doc drift in `docs/sdd/` should be corrected in place or the files should be annotated as examples requiring operator substitution

## Source of Findings

- Post-incident architectural analysis from AI specialist review (pasted context)
- Direct code inspection of: `bootstrap.ts`, `env.ts`, `security-showcase/page.tsx`, `SingleTenantResolver.ts`, `build-provisioning-input.ts`, all three CI/CD workflow files, and both SDD deployment docs

## Required Fixes Before Production Signoff

1. Add a `pnpm env:validate` command that runs the real cross-field validators against the effective runtime environment
2. Wire `pnpm env:validate` into PR validation, preview deploy, and production deploy — before `vercel build`
3. Update `security-showcase/page.tsx` to catch bootstrap failure and render a controlled config-error UI rather than crashing
4. Fix `docs/sdd/deployVercelProd.yml` and `docs/sdd/deployVercelPreview.yml` to use valid UUID placeholders or explicit operator instructions

## Status

- [x] Intake complete
- [ ] Security Review
- [ ] Runtime Review
- [ ] Architecture Review
- [ ] Constraints Summary
- [ ] Validation Strategy
- [ ] Implementation
- [ ] Validation
- [ ] Scanner Ignore Report
- [ ] Final Security Check
- [ ] Security Patterns Update
