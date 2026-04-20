# Codacy Remediation Implementation Plan

## Phase 1: Findings Baseline

- [x] Run local Codacy analysis in persistent findings mode.
- [x] Confirm artifact path and report shape.
- [x] Record environment parity note: run used Codacy cloud sync for `gh/wmitrus/nextjs-16-boilerplate` and tool `eslint`.

## Phase 2: Priority 0 Lint Blockers

- [x] Task 1: fix 9 error-level findings first.
- [x] Scope:
  - `src/core/db/migrations/run-migrations.ts` — 2 `@typescript-eslint/no-explicit-any`
  - `src/core/logger/utils.ts` — 1 `@typescript-eslint/no-require-imports`
  - `src/core/observability/new-relic.ts` — 1 `@typescript-eslint/no-require-imports`
  - `src/monitoring/server-init.ts` — 1 `@typescript-eslint/no-require-imports`
  - `src/modules/auth/infrastructure/drizzle/DrizzleExternalIdentityMapper.db.test.ts` — 4 `@typescript-eslint/no-deprecated`
- [x] Validation: targeted lint plus focused tests for touched files.
- [x] Outcome: refreshed Codacy findings report shows `0` errors and `113` warnings.

## Phase 3: Application Security Warning Buckets

- [x] Task 2: address `src` object-injection warnings with real guard patterns or justified suppressions.
- [x] Primary hotspots:
  - `src/security/rsc/data-sanitizer.ts` — 8 findings
  - `src/shared/lib/security/sanitize-log-context.ts` — 4 findings
  - `src/core/logger/edge.ts` — 4 findings
  - remaining `src` object-injection findings across API/error helpers
- [x] Goal: reduce noise by replacing dynamic plain-object indexing with `Object.hasOwn`, null-prototype records, `Map`, or repository-standard safe patterns.
- [x] Validation: targeted unit tests where guard behavior changes.
- [x] Outcome: refreshed Codacy findings report shows `0` remaining `src/**` findings and `62` warnings total.

## Phase 4: Script Hardening Bucket

- [x] Task 3: address `scripts` findings, mostly `non-literal-fs-filename` and object-injection.
- [ ] Priority files:
  - `scripts/leantime/catalog.ts` — 7 findings
  - `scripts/leantime/deploy-plugin.ts` — 6 findings
  - `scripts/codacy-analyze.mjs` — 5 findings
  - supporting env/setup scripts under `scripts/`
- [x] Goal: either add explicit confinement/justification comments at the sink or refactor path handling so the rule becomes provably safe.
- [x] Validation: targeted script tests where they already exist, plus lint.
- [x] Sub-step: eliminate the `scripts/**` `security/detect-object-injection` bucket via helper-based lookups and iterator parsing.
- [x] Sub-step: validate touched script behavior with focused unit tests for existing coverage.
- [x] Sub-step: finish the remaining `security/detect-non-literal-fs-filename` hotspots (`scripts/codacy-analyze.mjs`, `scripts/leantime/deploy-plugin.ts`, `scripts/codacy-install.mjs`, shared script helpers).
- [x] Sub-step: clear the residual formatting finding in the scripts bucket.
- [x] Outcome: refreshed Codacy findings report shows `scripts/**` dropped from `41` to `0`.
- [x] Policy decision: prefer shared sink-confined fs helper wrappers plus a narrow helper-module lint exception instead of adding another broad ESLint fs selector.

## Phase 5: E2E And Test-Support Cleanup

- [x] Task 4: clean `e2e` warnings.
- [x] Primary hotspots:
  - `e2e/provisioning-runtime.spec.ts` — 9 findings, mostly `unsafe-regex`
  - `e2e/clerk-auth.ts` — 6 object-injection findings
  - `e2e/global.setup.ts` and `e2e/runtime-profile.ts` — fs-path findings
- [x] Goal: replace vulnerable regex shapes where real, otherwise simplify assertions/parsers to lower-risk patterns.
- [x] Validation: targeted Playwright or unit-adjacent checks only if behavior changes materially.
- [x] Outcome: refreshed Codacy findings report shows `e2e/**` dropped from `19` to `0`.
- [x] Policy decision: prefer shared E2E env-file helpers plus URL pathname/query assertions instead of repeated regex URL matchers and open-coded env-file parsing.

## Phase 6: Noise Disposition And Policy Alignment

- [x] Task 5: review residual low-signal findings and decide keep/fix/suppress.
- [ ] Candidate noise areas:
  - `.vscode/extensions-dev/parent-branch-status/parent-branch-status.js` — dev extension artifact
  - `tests` single `@next/next/no-img-element` finding
- [x] Goal: avoid spending remediation effort on generated or non-product code without an explicit reason.
- [x] Early policy win: local ESLint now flags `obj[dynamicKey]()` bracket-dispatch as a narrow SEC-04 shift-left warning.
- [x] Early policy win: implementation instructions now require repo-wide `pnpm lint --fix` and `pnpm typecheck` before marking a major phase complete, while keeping in-phase validation focused.
- [x] Outcome: the residual `.vscode` and `tests` findings were fixed directly and the final Codacy rerun returned `0` findings.

## Ordering And Dependencies

- [x] Sequence `Task 1` first because it clears all error-level blockers.
- [x] Continue with `Task 4`; these can be split across separate PRs or parallel owners.
- [x] Finish with `Task 5` to decide which residual findings deserve code change versus documented suppression.

## Proposed Delivery Split

- [x] PR A: error-level lint blockers
- [x] PR B: `src` security warning reductions
- [x] PR C: `scripts` hardening
- [x] PR D: `e2e` cleanup
- [x] PR E: residual disposition (`.vscode` + `tests`)
