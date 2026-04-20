# ESLint Security Signal Validation Report

## Goal

Capture whether the selected recurring finding class is visible locally before code fixes and record the negative result from the failed regex-plugin spike.

## Validation Steps

### 1. Baseline Check Against Representative Files

- Result: local ESLint did not surface representative remaining Codacy warnings in `scripts/leantime/catalog.ts`, `e2e/provisioning-runtime.spec.ts`, or `src/core/logger/utils.ts`.
- Interpretation: the repo already loads `security/*` rules, but the remaining Codacy set is not reproduced cleanly by local ESLint.

### 2. `unsafe-regex` Spike With `eslint-plugin-regexp`

- Action: tested `eslint-plugin-regexp` against `e2e/provisioning-runtime.spec.ts` with a TypeScript-aware ESLint harness.
- Result: no actionable regex findings were produced for the current Codacy cases.
- Decision: rejected as the first rollout candidate; removed the dependency after the spike.

### 3. Proof-of-Signal Validation For Dynamic Env Access

- Command:

```shell
pnpm exec eslint scripts/check-e2e-auth-env.mjs scripts/leantime/deploy-plugin.ts
```

- Result:

```text
/home/wojtek/projects/nextjs-16-boilerplate/scripts/check-e2e-auth-env.mjs
  58:17  warning  Avoid dynamic process.env[key] access in scripts and E2E helpers. Prefer an allowlisted helper or typed resolver so the access pattern is visible in local lint before review  no-restricted-syntax

/home/wojtek/projects/nextjs-16-boilerplate/scripts/leantime/deploy-plugin.ts
  53:17  warning  Avoid dynamic process.env[key] access in scripts and E2E helpers. Prefer an allowlisted helper or typed resolver so the access pattern is visible in local lint before review  no-restricted-syntax

✖ 2 problems (0 errors, 2 warnings)
```

- Interpretation: the selected proof-of-signal is locally visible before code fixes and is therefore a valid phase-1 candidate for shift-left enforcement.

### 4. Proof-of-Signal Validation For Bare Identifier Paths At `fs.*Sync(...)` Sinks

- Command:

```shell
pnpm exec eslint e2e/global.setup.ts e2e/runtime-profile.ts scripts/e2e/load-env.mjs
```

- Result:

```text
/home/wojtek/projects/nextjs-16-boilerplate/e2e/global.setup.ts
   8:22  warning  Avoid passing a bare identifier path into fs.*Sync in scripts and E2E helpers. Prefer path.resolve(...) plus visible sink confinement so path provenance is obvious in local lint before review  no-restricted-syntax
  12:35  warning  Avoid passing a bare identifier path into fs.*Sync in scripts and E2E helpers. Prefer path.resolve(...) plus visible sink confinement so path provenance is obvious in local lint before review  no-restricted-syntax

/home/wojtek/projects/nextjs-16-boilerplate/e2e/runtime-profile.ts
  36:22  warning  Avoid passing a bare identifier path into fs.*Sync in scripts and E2E helpers. Prefer path.resolve(...) plus visible sink confinement so path provenance is obvious in local lint before review  no-restricted-syntax
  41:35  warning  Avoid passing a bare identifier path into fs.*Sync in scripts and E2E helpers. Prefer path.resolve(...) plus visible sink confinement so path provenance is obvious in local lint before review  no-restricted-syntax

/home/wojtek/projects/nextjs-16-boilerplate/scripts/e2e/load-env.mjs
  37:22  warning  Avoid passing a bare identifier path into fs.*Sync in scripts and E2E helpers. Prefer path.resolve(...) plus visible sink confinement so path provenance is obvious in local lint before review  no-restricted-syntax
  42:35  warning  Avoid passing a bare identifier path into fs.*Sync in scripts and E2E helpers. Prefer path.resolve(...) plus visible sink confinement so path provenance is obvious in local lint before review  no-restricted-syntax

✖ 6 problems (0 errors, 6 warnings)
```

- Interpretation: this rule is intentionally narrower than Codacy's broad fs heuristic. It exists to force local review of path provenance before PR triage, not to claim that every flagged sink is a vulnerability.

## Validation Verdict

- Validated: a narrow subset of recurring Codacy review can be shifted left into local ESLint.
- Validated: a second narrow subset can be reviewed locally through fs-sink visibility warnings rather than waiting for Codacy.
- Not validated: 1:1 local ESLint parity for the current remaining warning set.
- Recommendation: proceed with selective rollout, not blanket migration.

### 5. Repo-Wide Cleanup Validation After Rule Rollout

- Command:

```shell
pnpm lint
```

- Result:

```text
> temp-nextjs-scaffold@1.26.0 lint /home/wojtek/projects/nextjs-16-boilerplate
> eslint
```

- Interpretation: the previously visible `46` warnings were reduced to a clean repo-wide lint run without backing out the new local rules.

### 6. Focused Unit Validation For Refactored Helpers

- Command:

```shell
pnpm exec vitest run --config vitest.unit.config.ts --coverage.enabled=false scripts/load-env.test.ts scripts/check-env-consistency.test.ts scripts/flags/import.test.ts src/modules/feature-flags/infrastructure/static/StaticFeatureFlagService.test.ts
```

- Result:

```text
✓  unit  scripts/load-env.test.ts (10 tests)
✓  unit  src/modules/feature-flags/infrastructure/static/StaticFeatureFlagService.test.ts (14 tests)
✓  unit  scripts/check-env-consistency.test.ts (9 tests)
✓  unit  scripts/flags/import.test.ts (7 tests)

Test Files  4 passed (4)
Tests  40 passed (40)
```

- Interpretation: the env parsing and feature-flag helper refactors are covered by focused green tests.

### 7. Browser Verification

- Command:

```shell
pnpm exec playwright test e2e/home.spec.ts e2e/security.spec.ts --project=chromium
```

- Result:

```text
7 passed
1 failed

Failed test:
- e2e/security.spec.ts › should allow internal API access with correct key
  Expected 200, received 403
```

- Interpretation: browser verification confirms the app boots and the public/security smoke scenarios largely still work. One existing internal-API-key scenario remains red and should be treated as follow-up investigation rather than silently ignored.

### 8. Clean Public Browser Smoke

- Command:

```shell
pnpm exec playwright test e2e/home.spec.ts --project=chromium
```

- Result:

```text
Running 3 tests using 3 workers
3 passed
```

- Interpretation: the application boots and renders correctly in a real browser after the warning cleanup.

### 9. Focused Investigation Of The Remaining Internal API Failure

- Commands:

```shell
node -e "console.log(JSON.stringify({ shellHasInternalApiKey: Boolean(process.env.INTERNAL_API_KEY) }))"
INTERNAL_API_KEY=test-internal-api-key pnpm exec playwright test e2e/security.spec.ts --project=chromium --grep "correct key"
```

- Result:

```text
{"shellHasInternalApiKey":false}

Running 1 test using 1 worker
1 passed
```

- Interpretation: the remaining failure is explained by a source-of-truth mismatch. `playwright.config.ts` starts the dev server with `webServer.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'test-internal-api-key'`, while `e2e/security.spec.ts` falls back to manually reading `.env.local` when the parent shell does not expose `INTERNAL_API_KEY`. When both sides are forced onto the same explicit env value, the scenario passes.

### 10. Implemented Shared Resolver Fix

- Commands:

```shell
pnpm exec eslint e2e/internal-api-key.ts e2e/security.spec.ts playwright.config.ts playwright.vscode.config.ts
pnpm exec playwright test e2e/security.spec.ts --project=chromium
pnpm exec playwright test e2e/home.spec.ts --project=chromium
pnpm lint
```

- Result:

```text
e2e/security.spec.ts: 5 passed
e2e/home.spec.ts: 3 passed
pnpm lint: clean
```

- Interpretation: the implemented fix replaces the competing key-resolution paths with one shared resolver used by the spec and both Playwright configs. The previously failing internal API success-path scenario is now green without manual env override.
