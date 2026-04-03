# Constraints Summary

## Task

Production-readiness remediation: add runtime env validation to CI/CD gates, fix bootstrap coupling on public routes, and correct SDD documentation drift.

## Scope

1. New `scripts/validate-env.ts` script that runs cross-field env validators against the effective runtime environment
2. Add `pnpm env:validate` npm script and wire it into PR validation, preview deploy, and production deploy workflows
3. Fix `src/app/security-showcase/page.tsx` bootstrap call to degrade gracefully on config errors
4. Fix `docs/sdd/deployVercelProd.yml` and `docs/sdd/deployVercelPreview.yml` invalid placeholder tenant IDs

## Out of Scope

- Modifying `validateTenancyConfigValues()` or `validateAuthProviderConfigValues()` logic in `src/core/env.ts`
- Modifying the `getAppContainer()` / `createRequestContainer()` bootstrap contract
- Refactoring the auth module, provisioning module, or tenant resolver implementations
- Adding new Vercel environment variables beyond the ones that already exist
- Adding feature flags or changing tenancy mode defaults
- E2E test changes (not required for this remediation)

---

## Architecture Constraints

- **`scripts/validate-env.ts` must import from `@/core/env`** using TypeScript path aliases; invoked via `tsx`; no logic duplication of validators
- **Dependency direction**: `scripts → core` only. The script must not import from `src/app/`, `src/features/`, `src/modules/`, or `src/security/`
- **DI / composition**: `getAppContainer()` contract is unchanged — error catch is added at the delivery layer (`src/app/security-showcase/page.tsx`), not inside bootstrap
- **No new shared component** should be created for the config-error banner in showcase page — keep it inline
- **No `error.tsx` route segment** should be added to `security-showcase/` — the fix must be a try/catch in the RSC, not a React error boundary

## Security / Auth Constraints

- **`DEFAULT_TENANT_ID` must remain required in `TENANCY_MODE=single`** — this is architecturally correct; enforcement must move earlier (CI gate), not be loosened
- **`CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` must remain required when `AUTH_PROVIDER=clerk`**
- **The validate-env script exit code must be non-zero on validation failure** — CI must fail; not just warn
- **Config-error banner in showcase page must not expose raw error stack traces or env var names in production** — log with server logger, display generic message to the user
- **All cross-field validation logic must stay in `src/core/env.ts`** — the script only calls the exported validators; no duplication

## Runtime Constraints

- **Validate script invocation**: `tsx scripts/validate-env.ts` — no plain `node`, no `ts-node`
- **`NODE_ENV` must be explicitly set** when running the validate script in CI workflows, matching the target deploy environment
- **Bootstrap try/catch in showcase page** must cover the entire `getAppContainer().createChild()` call chain, not just `createSecurityContext()`
- **Degraded path uses the same synthetic guest context** already used for the unauthenticated path — no new context shape needed
- **Server logger** (`resolveServerLogger()`) must be used for logging bootstrap errors in the showcase page, not `console.error`

## Validation Constraints

- **Minimum required**: TypeScript typecheck, unit tests pass, lint clean, manual smoke test of the validate script in isolation, review of changed CI workflows
- **Optional**: Integration test for showcase page degraded path
- **Not required**: E2E tests, Playwright browser tests — scope is limited to build-time and config-time fixes

---

## Explicitly Allowed Changes

| File                                   | Change                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `scripts/validate-env.ts`              | **Create** — new TypeScript validation script                                                            |
| `package.json`                         | **Add** `env:validate` script key                                                                        |
| `.github/workflows/pr-validation.yml`  | **Add** `pnpm env:validate` step after `pnpm env:check`                                                  |
| `.github/workflows/preview-deploy.yml` | **Add** `pnpm env:validate` step before `vercel build`                                                   |
| `.github/workflows/prod-deploy.yml`    | **Add** `pnpm env:validate` step before `vercel build`                                                   |
| `src/app/security-showcase/page.tsx`   | **Modify** — wrap bootstrap call in try/catch; add controlled error banner                               |
| `docs/sdd/deployVercelProd.yml`        | **Modify** — replace invalid `DEFAULT_TENANT_ID: 'default'` with valid UUID placeholder + comment        |
| `docs/sdd/deployVercelPreview.yml`     | **Modify** — replace invalid `DEFAULT_TENANT_ID: 'preview-tenant'` with valid UUID placeholder + comment |

## Explicitly Forbidden Changes

- Modifying `validateTenancyConfigValues()` or `validateAuthProviderConfigValues()` implementations
- Modifying `getAppContainer()` or `createRequestContainer()` to suppress errors
- Making `DEFAULT_TENANT_ID` optional when `TENANCY_MODE=single`
- Adding `SKIP_ENV_VALIDATION=true` to any CI/CD workflow step
- Moving business logic into `src/shared/`
- Adding any `'use client'` to the showcase page
- Changing the auth module, provisioning module, or tenant resolver code
- Logging secrets, env var values, or stack traces in production

## Protected Invariants

- `DEFAULT_TENANT_ID` is and must remain required in `TENANCY_MODE=single` — both `validateTenancyConfigValues()` in `env.ts` and `buildTenantResolver()` in `auth/index.ts` enforce this; neither enforcement point should be removed
- The cross-field validators in `src/core/env.ts` are the single source of truth for configuration requirements
- Bootstrap error propagation from `createRequestContainer()` must remain — only the delivery layer adds catch; the bootstrap contract stays strict
- Server-only code must not migrate into client bundles

## Open Questions / Blocks

- **Resolved**: `tsx` available as devDependency; path alias resolution confirmed
- **Resolved**: Security showcase degraded path — use inline banner, same synthetic guest context shape
- **Resolved**: SDD doc fix approach — use explicit `<your-uuid-v4-here>` placeholder with instructional comment
- **No blocking open questions** — implementation can proceed
