# 05 - Validation Strategy - Summary

## Task Context

- **Task ID**: bcbe9ac2-6135-4707-90a1-d5266b1ec77e
- **Task Objective**: Remediate production-readiness gaps — env validation gates, bootstrap coupling, SDD doc drift
- **Current Run Scope**: Change validation scope and command plan
- **Mode**: CHANGE VALIDATION
- **Status**: COMPLETED
- **Last Updated**: 2026-04-03
- **Related Control Artifacts**: `constraints.md`, `incident-intake.md`

## Scope Handled

- **change surfaces assessed**: New `scripts/validate-env.ts`, `package.json` script addition, three CI/CD workflow files, `src/app/security-showcase/page.tsx` bootstrap catch, two SDD doc files
- **validation questions in scope**: What is the minimum safe validation before considering this remediation complete? What tests are meaningfully impacted?
- **excluded validation areas**: E2E browser tests; provisioning flow tests; auth matrix tests (none of these are impacted by the four targeted changes)

## Inputs Reviewed

- **code paths reviewed**: All files in scope from constraints.md
- **tests / configs / workflows reviewed**: `vitest.unit.config.ts` (pattern: `src/**/*.test.{ts,tsx}`), `scripts/check-env-consistency.test.ts` (existing script test pattern)
- **earlier task artifacts reviewed**: `incident-intake.md`, `constraints.md`, all specialist summaries

## Actions Performed

- **validation posture review performed**: Yes
- **risk analysis performed**: Yes — primary risk is the validate-env script failing to import `@/core/env` correctly via tsx path aliases
- **test-level recommendations prepared**: Yes
- **command recommendations prepared**: Yes

## Current-State Findings

### Confirmed

- Existing test pattern for scripts: `scripts/check-env-consistency.test.ts` and `scripts/setup-env.test.ts` demonstrate that script logic is testable via vitest unit tests with mock env injection
- Unit tests for `validateTenancyConfigValues` and `validateAuthProviderConfigValues` already exist (they are exported from `src/core/env.ts` and are testable) — no new tests needed for the validators themselves
- The primary new testable artifact is `scripts/validate-env.ts` — its exit behavior (zero / non-zero) under different env profiles

### Risks

- **HIGH**: If `tsx` does not resolve `@/core/env` path aliases correctly, the validate-env script will throw `Cannot find module '@/core/env'` and exit non-zero in CI — but for the wrong reason. This would be a false positive failure. Must be caught in local testing before merging.
- **MEDIUM**: The showcase page bootstrap catch changes error propagation behavior. Without a targeted test, a future regression could silently remove the catch and reintroduce the crash. A unit test for the degraded path is recommended.
- **LOW**: CI workflow YAML changes could have syntax errors. Human review of the changed YAML is required.

### Drift

- No test drift identified

## Validation-Risk Assessment

- **primary risks**: tsx path alias resolution; showcase page catch regression risk
- **confidence gaps**: Cannot auto-verify CI workflow behavior without a PR push; local script execution provides sufficient signal
- **over-validation concerns**: E2E tests would be disproportionate — the changes are structural (CI gates) and defensive (error handling), not behavioral runtime changes

## Recommended Validation Scope

### Minimum Required Validation

1. **`pnpm typecheck`** — verify TypeScript compiles cleanly with the new script and modified showcase page
2. **`pnpm lint --fix`** — verify lint passes on all changed files
3. **`pnpm test`** (unit) — verify existing unit tests still pass; add new unit tests for the validate-env script
4. **Manual: `tsx scripts/validate-env.ts`** locally with a `.env.local` that has valid config — must exit 0
5. **Manual: `tsx scripts/validate-env.ts`** with `DEFAULT_TENANT_ID` unset — must exit non-zero with clear error message
6. **Manual review of changed CI workflow YAML** — validate step ordering, env var propagation, correct script name

### Optional Additional Validation

7. **Unit test for showcase page degraded path** — test that when `getAppContainer()` throws, the component renders the error banner rather than throwing itself
8. **Integration check**: confirm `pnpm env:check` (existing) still passes after changes

### Validation Explicitly Not Required

- E2E browser tests — no runtime user-facing behavior changed (error UI is a defensive fallback path)
- Auth matrix E2E tests — provisioning and auth flows are unaffected
- Storybook tests — no UI component changes in `src/shared/` or `src/stories/`
- Database integration tests — no data layer changes

## Validation Commands / Checks

```shell
# 1. TypeScript check
pnpm typecheck

# 2. Lint (always use --fix per repo convention)
pnpm lint --fix

# 3. Unit tests (includes script tests)
pnpm test

# 4. Validate script — happy path (requires valid .env.local with DEFAULT_TENANT_ID set)
tsx scripts/validate-env.ts

# 5. Validate script — failure path (unset DEFAULT_TENANT_ID)
TENANCY_MODE=single DEFAULT_TENANT_ID="" tsx scripts/validate-env.ts
# Expected: non-zero exit code + error message containing "DEFAULT_TENANT_ID"

# 6. Existing env check still passes
pnpm env:check
```

### Environment Prerequisites

- Local `.env.local` with at minimum: `DEFAULT_TENANT_ID=<valid-uuid>`, `CLERK_SECRET_KEY=<any-value>`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<any-value>`
- `tsx` available (it is a devDependency — available after `pnpm install`)

### Expected Evidence

| Check                                                     | Expected Result                                      |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm typecheck`                                          | Zero errors                                          |
| `pnpm lint --fix`                                         | Zero unfixable errors                                |
| `pnpm test`                                               | All existing tests pass; new validate-env tests pass |
| `tsx scripts/validate-env.ts` (valid env)                 | Exits 0, prints success message                      |
| `tsx scripts/validate-env.ts` (missing DEFAULT_TENANT_ID) | Exits 1, prints clear error                          |
| `pnpm env:check`                                          | Still passes (unchanged logic)                       |

## Artifact Synchronization

- `constraints.md`: Validation constraints are consistent with this plan
- `incident-intake.md`: Remediation scope confirmed
- `implementation-plan.md`: To be created next

## Open Questions / Blockers

- None blocking

## Handoff Notes

- **What implementation agent must validate before closing**: All six minimum required validation commands must pass
- **Test file location for new validate-env tests**: `scripts/validate-env.test.ts` (consistent with `scripts/check-env-consistency.test.ts` pattern)
- **Recommended next specialist**: Implementation Agent

## Update Log

### 2026-04-03 — Initial Strategy

- Trigger: Post-constraints handoff
- Summary: Validation scope defined; minimum required commands enumerated; tsx path alias risk flagged as primary concern
- Sections refreshed: All
