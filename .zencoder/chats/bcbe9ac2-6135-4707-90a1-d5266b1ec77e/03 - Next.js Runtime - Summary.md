# 03 - Next.js Runtime - Summary

## Task Context

- **Task ID**: bcbe9ac2-6135-4707-90a1-d5266b1ec77e
- **Task Objective**: Remediate production-readiness gaps — missing env validation gates, over-broad bootstrap coupling on public routes, and invalid SDD documentation placeholders
- **Current Run Scope**: Runtime placement and CI/CD execution mechanics for env validation
- **Status**: COMPLETED
- **Last Updated**: 2026-04-03
- **Related Control Artifacts**: `incident-intake.md`, `02 - Security & Auth - Summary.md`

## Scope Handled

- **runtime entrypoints reviewed**: `security-showcase/page.tsx` (RSC), CI/CD workflow scripts, existing env check scripts
- **App Router surfaces reviewed**: `security-showcase/page.tsx` — async RSC, no `'use client'` directive, runs in Node runtime
- **runtime questions in scope**: How to run `validateTenancyConfigValues`/`validateAuthProviderConfigValues` from a CI script; TypeScript path alias resolution from scripts; RSC error propagation on bootstrap failure

## Inputs Reviewed

- **code paths reviewed**:
  - `src/app/security-showcase/page.tsx` — RSC structure and error handling shape
  - `src/core/env.ts` — T3-Env + Zod schema, exported validators
  - `scripts/check-env-consistency.mjs` — existing plain-Node `.mjs` pattern
  - `scripts/check-e2e-auth-env.mjs` — another plain-Node script example
  - `package.json` — scripts section; available devDependencies
  - `.github/workflows/*.yml` — three CI pipelines
- **runtime docs reviewed**: AGENTS.md (runtime non-negotiables)
- **earlier task artifacts reviewed**: `incident-intake.md`, `02 - Security & Auth - Summary.md`

## Actions Performed

- **server/client boundary review performed**: Yes — security-showcase is a pure server component (RSC). All bootstrap and security context calls are server-side. Correct placement.
- **route handler / server action review performed**: Not applicable to this incident
- **proxy review performed**: Not applicable to this incident — proxy does not touch showcase page or env validation
- **cache / runtime review performed**: Showcase page has no `cache` export, no `revalidate` — fully dynamic RSC. Correct for auth-context-sensitive content.

## Current-State Findings

### Confirmed

**RSC error propagation — critical gap:**
In `security-showcase/page.tsx`, the call `getAppContainer().createChild()` is at line 35 of `SecurityShowcasePageContent`, **before** the `hasClerkSessionCookie` check and **outside** any try/catch. If `getAppContainer()` throws (e.g., `DEFAULT_TENANT_ID` missing), the async RSC function throws uncaught. The `<Suspense>` boundary in the parent `SecurityShowcasePage` does not catch errors — `<Suspense>` handles loading, not errors. The thrown RSC error propagates to the nearest `error.tsx` boundary (or the root `layout.tsx` error boundary). The page's own graceful `contextError` UI is never reached.

**Fix**: Wrap `getAppContainer().createChild()` in a try/catch. If it throws, set a `bootstrapError` flag and render a controlled config-error banner. The security context resolvers can remain in the `if (!hasClerkSessionCookie)` path using the synthetic guest context.

**Script execution mechanics for env:validate:**

- `tsx` is available as a devDependency (`"tsx": "^4.21.0"`)
- `tsx` respects `tsconfig.json` `paths` configuration — `@/core/env` aliases resolve correctly
- A TypeScript script `scripts/validate-env.ts` run via `tsx scripts/validate-env.ts` can directly import `import { validateAuthProviderConfigValues, validateTenancyConfigValues, env } from '@/core/env'`
- This is the correct approach: reuse real validators, no logic duplication
- T3-Env schema validation runs at `import` time — if any required env var is missing the import itself throws. The script must handle this gracefully (try/catch around the import or use `SKIP_ENV_VALIDATION` for the schema part only)
- Cross-field validators must be called explicitly after the import

**Important note on T3-Env behavior:**
When `scripts/validate-env.ts` is run in CI, `process.env` must contain the Vercel-pulled environment variables. The workflow already runs `vercel pull` before calling `pnpm env:check`. The same `process.env` will be available to `tsx scripts/validate-env.ts`. This is correct — the script will see the effective Vercel environment.

**Path alias support in tsx:**
`tsx` uses esbuild's transform and respects `tsconfig.json` `compilerOptions.paths`. The `@/*` → `./src/*` alias resolves correctly when running from the project root. No additional configuration needed.

### Risks

- **MEDIUM**: T3-Env raises a schema-level error (missing required vars) at import time. If `src/core/env.ts` marks a var as required (without `.optional()`) and that var is missing, the script crashes before reaching the cross-field validators. Current env schema marks most fields as `.optional()` with defaults, so this is likely safe, but should be verified.
- **LOW**: If `NODE_ENV` is not set in CI when running the validate script, T3-Env defaults to `'development'`. This may affect which cross-field rules trigger. The `NODE_ENV` env var should be set in the workflow step.

### Drift

- None identified in runtime areas

## Runtime Boundary Assessment

- **server vs client placement**: All bootstrap and security context logic is correctly placed on the server. No client exposure risk.
- **edge vs node placement**: Security showcase page is a Node-runtime RSC — confirmed. `getAppContainer()` uses Node-only code (Drizzle, PGlite). Correct.
- **route handler / page / layout responsibilities**: Showcase page is an async RSC — correct pattern. Error boundary responsibility falls to the nearest `error.tsx`, not `<Suspense>`.
- **proxy responsibilities**: Not involved in this incident.

## Caching And Revalidation Notes

- Security showcase page is fully dynamic (no `export const revalidate` or `export const dynamic`). Auth-context-sensitive content is not cached. Correct.
- The env validation script runs at deploy time, not at request time — no caching concern.

## Runtime Decisions / Constraints

### Approved Runtime Constraints

1. **`scripts/validate-env.ts` must use `tsx`** — not plain `node` — to resolve TypeScript path aliases from `@/core/env`
2. **The validate script should set `NODE_ENV=production`** when run in production CI to ensure cross-field rules activate for the correct mode
3. **Bootstrap call in showcase page must be wrapped in try/catch** — the RSC must not throw uncaught from bootstrap failure; it must degrade to a controlled UI
4. **The controlled error UI in showcase page must not expose raw error details** in production — banner text should be generic ("Configuration error") without stack trace or env var names

### Rejected Directions

- **Do NOT duplicate the cross-field validator logic** in a plain `.mjs` script — reuse `src/core/env.ts` via `tsx`
- **Do NOT use `ts-node`** — `tsx` is faster and already available
- **Do NOT add `'use client'`** to the showcase page or move bootstrap to client — server placement is correct

### Runtime Assumptions Requiring Validation

- Verify that `tsx` resolves `@/*` aliases without extra config when run from project root with `tsconfig.json` present (assumed true based on tsx documentation — implementation agent should verify by running the script)

## Artifact Synchronization

- `incident-intake.md`: Findings consistent
- `02 - Security & Auth - Summary.md`: Open question about tsx import mechanics — resolved here (use tsx + @/core/env import)
- `implementation-plan.md`: Not yet created

## Open Questions / Blockers

- None blocking — all runtime questions resolved

## Handoff Notes

- **What the next agent should rely on**: Use `tsx scripts/validate-env.ts` as the invocation pattern; bootstrap wrapping in try/catch is the right fix for the RSC
- **What should not be re-decided without new evidence**: tsx path alias resolution approach
- **Recommended next specialist**: Architecture Guard (to verify bootstrap decoupling shape and module boundary implications)

## Update Log

### 2026-04-03 — Initial Assessment

- Trigger: Security incident intake, security review handoff
- Summary: Runtime placement confirmed correct; script execution mechanics resolved; RSC error propagation gap detailed
- Sections refreshed: All
