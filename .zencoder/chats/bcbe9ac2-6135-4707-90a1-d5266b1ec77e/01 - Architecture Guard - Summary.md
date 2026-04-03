# 01 - Architecture Guard - Summary

## Task Context

- **Task ID**: bcbe9ac2-6135-4707-90a1-d5266b1ec77e
- **Task Objective**: Remediate production-readiness gaps — missing env validation gates, over-broad bootstrap coupling on public routes, and invalid SDD documentation placeholders
- **Current Run Scope**: Architecture boundary and module ownership review for all proposed fixes
- **Status**: COMPLETED
- **Last Updated**: 2026-04-03
- **Related Control Artifacts**: `incident-intake.md`, `02 - Security & Auth - Summary.md`, `03 - Next.js Runtime - Summary.md`

## Scope Handled

- **modules / layers reviewed**: `src/core/env.ts` (contracts layer), `src/core/runtime/bootstrap.ts` (composition root), `src/app/security-showcase/page.tsx` (app delivery layer), `scripts/` (tooling layer), CI/CD workflows, SDD documentation
- **change surface reviewed**: Four proposed fixes from incident intake
- **architecture questions in scope**: (1) Where does env validation belong? (2) Is wrapping bootstrap in try/catch in a page component architecturally sound? (3) Does the new script introduce module boundary violations? (4) Does the SDD doc fix introduce architectural risk?

## Inputs Reviewed

- **code paths reviewed**:
  - `src/core/env.ts` — validator functions, T3-Env schema structure
  - `src/core/runtime/bootstrap.ts` — `getAppContainer()`, `createRequestContainer()`
  - `src/app/security-showcase/page.tsx` — RSC page structure
  - `scripts/check-env-consistency.mjs` — existing script pattern
  - `src/app/error.tsx` — root error boundary (client component)
  - Module structure: `src/core/`, `src/app/`, `src/modules/`, `scripts/`
- **docs / ADRs / prompts reviewed**: `AGENTS.md` architecture non-negotiables, `REPOSITORY_AI_CONTEXT.md` module structure table
- **earlier task artifacts reviewed**: `incident-intake.md`, `02 - Security & Auth - Summary.md`, `03 - Next.js Runtime - Summary.md`

## Actions Performed

- **repository inspection performed**: Yes — verified module structure, existing script pattern, error boundary placement
- **boundary checks performed**: Yes — verified dependency direction for all four proposed changes
- **dependency / DI review performed**: Yes — env validators are exported from `src/core/env.ts` (core layer); importing them from `scripts/` is correct (scripts are outside the module graph, external tooling)
- **docs-vs-code checks performed**: Yes — confirmed invalid UUID placeholders in SDD docs vs. `z.uuid()` enforcement in env.ts

## Current-State Findings

### Confirmed

**Fix 1 — `scripts/validate-env.ts`:**

- Placing env validation in `scripts/` is architecturally correct. Scripts are external tooling, not part of the app module graph.
- Importing from `@/core/env` (`src/core/env.ts`) follows the correct dependency direction: `scripts → core`. The `core` layer is explicitly allowed to be imported from tooling.
- No new module boundary violations.
- Pattern is consistent with `scripts/check-env-consistency.mjs` (which already reads `src/core/env.ts` via filesystem, not import). The new script is simpler — direct import via `tsx`.

**Fix 2 — CI/CD workflow updates:**

- Adding `pnpm env:validate` to CI/CD YAML files is configuration-level change only.
- No architectural implications. Correct placement: before `vercel build`.
- `NODE_ENV` must be explicitly set to ensure T3-Env behaves correctly for the target environment profile.

**Fix 3 — `security-showcase/page.tsx` bootstrap decoupling:**

- The page is in `src/app/` (delivery layer). Catching bootstrap errors in the delivery layer is architecturally correct — the delivery layer is responsible for graceful user-facing degradation.
- Wrapping `getAppContainer().createChild()` in a try/catch does NOT weaken the bootstrap contract — it only changes error propagation behavior at the delivery boundary.
- The fix must NOT suppress the error silently: it should still log the error (structured, without sensitive data) and render a visible config-error banner.
- The guest context used when no session cookie is present is correct to reuse for the bootstrap-failure degraded path too.
- **Important constraint**: The controlled error UI must not expose raw error messages or env var names in production. In development, more detail is acceptable.

**Fix 4 — SDD doc correction:**

- `docs/sdd/` contains example deployment templates. These are documentation, not production configuration.
- Correcting `DEFAULT_TENANT_ID: 'default'` to `DEFAULT_TENANT_ID: '<your-uuid-here>'` (with explicit instruction) is a documentation-only change — zero architectural risk.
- No module boundaries involved.

### Risks

- **LOW**: The `scripts/validate-env.ts` script imports T3-Env. If T3-Env validates the full schema at import time and any non-optional var is absent in the CI environment, the import throws before the cross-field validators run. Inspection of `env.ts` confirms all vars are either `.optional()` or have defaults — this risk is low but should be tested.
- **LOW**: Wrapping bootstrap in try/catch in the showcase page adds complexity. The error object caught must not be logged with sensitive details. Implementation agent must use structured logging with only `error.message` and `error.name`, not the full stack trace or env var values.

### Drift

- `docs/sdd/deployVercelProd.yml` and `docs/sdd/deployVercelPreview.yml`: placeholder values are invalid — confirmed drift. Fix is required.
- No other docs-vs-code drift found in this scope.

## Boundary And Dependency Assessment

- **module ownership assessment**: `src/core/env.ts` is owned by the `core` layer. Validators are exported correctly. No ownership issue.
- **dependency direction assessment**: `scripts → core` is correct. `app → core` (bootstrap) is correct. No inversions.
- **DI / composition assessment**: `getAppContainer()` is the composition root entrypoint. Wrapping it in try/catch in the delivery layer is correct — the composition root's contract remains unchanged, only the delivery layer's error handling improves.
- **cross-module coupling assessment**: No new cross-module coupling introduced by any of the four fixes. Each fix is local to its layer.

## Architectural Decisions / Constraints

### Approved Architectural Constraints

1. **`scripts/validate-env.ts` imports from `@/core/env` via `tsx`** — correct dependency direction, no new coupling
2. **Bootstrap error catch must log via the server logger** (`resolveServerLogger()` from `@/core/logger/di`), not `console.log`, to maintain observability conventions
3. **Controlled error UI in showcase page must be a simple inline banner** — not a redirect, not a full-page component from a shared library; keep it minimal and local to the showcase page
4. **SDD doc fix uses `<your-uuid-v4-here>` placeholder pattern** with an explicit comment instructing operators to generate a UUID — not a hardcoded example UUID (which could be accidentally reused)

### Rejected Directions

- **Do NOT create a separate `ConfigErrorPage` component in `src/shared/`** for the showcase error state — this is not a reusable concern; keep it inline
- **Do NOT move bootstrap validation out of `createRequestContainer()`** — the contract is correct; the fix is catch-at-delivery, not remove-from-bootstrap
- **Do NOT add `error.tsx` to the `security-showcase/` route segment** — that would still crash the RSC render; the try/catch must be in the page component itself

### Follow-Up Architectural Guardrails

- Any future route that calls `getAppContainer()` must follow the same pattern: bootstrap in try/catch with a controlled degradation UI. This should be documented in the component-level comment or a runbook entry.
- The validate-env script should be added to the pre-push hook sequence or at minimum be documented in a production deploy checklist.

## Artifact Synchronization

- `incident-intake.md`: Consistent with all findings
- `02 - Security & Auth - Summary.md`: No conflicts; security constraints reinforced
- `03 - Next.js Runtime - Summary.md`: No conflicts; runtime constraints reinforced
- `implementation-plan.md`: Not yet created

## Open Questions / Blockers

- None blocking implementation

## Handoff Notes

- **What the next agent should rely on**: All four fixes are architecturally sound; implementation can proceed within the defined constraints
- **What should not be re-decided without new evidence**: Bootstrap must remain in `createRequestContainer()`; error catch belongs in the delivery layer
- **Recommended next specialist**: Constraints Summary, then Validation Strategy, then Implementation

## Update Log

### 2026-04-03 — Initial Assessment

- Trigger: Security and runtime review handoff
- Summary: All four proposed fixes reviewed; none violate module boundaries or dependency direction; constraints established for implementation
- Sections refreshed: All
