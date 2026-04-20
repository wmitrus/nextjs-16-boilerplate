# ESLint Security Signal Plan

## Objective

- Determine which recurring Codacy security findings can be surfaced locally through ESLint before PR review.
- Separate high-signal local lint candidates from Codacy-only noise.
- Create an implementation plan for local linting, AI-doc propagation, and gain tracking across later PRs.

## Scope

- `eslint.config.mjs`
- `package.json`
- representative files from `src/`, `scripts/`, and `e2e/`
- repository AI docs related to coding patterns and anti-patterns
- task artifacts for the rollout plan and validation evidence

## Specialist Sequence

- [x] Orchestrator intake and artifact setup
- [x] Initial ESLint vs Codacy rule-mapping review
- [x] Architecture review for lint-layer shape and blast radius
- [x] Local ESLint signal prototype
- [x] Diagnostics verification before code fixes
- [x] Rollout plan for docs and PR-gain tracking

## Known Constraints

- Codacy findings do not map 1:1 to local ESLint behavior even when the rule IDs look similar.
- Some current findings are already locally suppressed with inline ESLint comments.
- Some remaining Codacy warnings are low-signal test/tooling noise and should not drive broad lint churn.

## Artifacts

- [x] `plan.md`
- [x] `intake.md`
- [x] `01 - Architecture Guard - Summary.md`
- [x] `04 - Implementation Agent - Summary.md`
- [x] `implementation-plan.md`
- [x] `validation-report.md`

## Current Status

- Confirmed that local ESLint currently does not surface representative remaining Codacy findings in `scripts/leantime/catalog.ts`, `e2e/provisioning-runtime.spec.ts`, or `src/core/logger/utils.ts`.
- Confirmed that the relevant `security/*` rules are present in resolved ESLint config, so the remaining gap is rule behavior / suppression / signal quality rather than missing rule registration alone.
- Confirmed that an off-the-shelf `eslint-plugin-regexp` spike did not reproduce the current Codacy `unsafe-regex` warnings in this repository.
- Implemented a narrow local proof-of-signal in `eslint.config.mjs` for dynamic `process.env[key]` access under `scripts/**` and `e2e/**`.
- Validated that local ESLint now reports warnings in `scripts/check-e2e-auth-env.mjs` and `scripts/leantime/deploy-plugin.ts` before any code fixes.
- Implemented a second narrow local proof-of-signal in `eslint.config.mjs` for bare identifier paths at `fs.*Sync(...)` sinks under `scripts/**` and `e2e/**`.
- Propagated the approved shift-left workflow into `docs/ai/general/SECURITY_CODING_PATTERNS.md` and `AGENTS.md`, including PR gain-tracking guidance.
- Cleaned the concrete warning sites surfaced by the new rules with low-blast-radius helper refactors across `scripts/**`, `e2e/**`, and the static feature flag parser.
- Confirmed repo-wide lint is clean, focused helper tests pass, and Playwright browser verification is mostly green with one remaining internal API scenario still returning `403` for the “correct key” case.
