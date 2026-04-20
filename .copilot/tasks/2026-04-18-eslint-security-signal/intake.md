# ESLint Security Signal Intake

## User Objective

Create a separate use-case for reducing repeated Codacy review effort by shifting useful findings left into local ESLint, adding the resulting patterns to AI docs, and tracking whether that improves signal in later PRs.

## Requirements

- Determine whether the recurring Codacy findings can be caught locally by ESLint.
- If yes, prepare a rollout plan rather than jumping straight to broad code cleanup.
- Show evidence that the chosen lint signal is visible in editor/diagnostics before code fixes are made.
- Treat this as a separate use-case, not just another sub-note in the current Codacy task.
- Include how the resulting patterns should be documented in AI docs and how gain should be tracked in future PRs.

## Non-Goals

- Fix all remaining Codacy warnings in this step.
- Force all Codacy scanner behavior into ESLint if the signal is poor or non-reproducible.
- Add broad suppressions without first understanding the cost/benefit.

## Acceptance Criteria

- A separate task dossier exists for the ESLint-security-signal use-case.
- The repo has a fact-based assessment of which recurring findings are viable ESLint candidates.
- A concrete rollout plan exists for config, docs, and measurement.
- There is proof that at least the selected candidate signal can be surfaced locally before code fixes.

## Inputs Reviewed

- `.codacy/reports/codacy-findings.json`
- `eslint.config.mjs`
- `package.json`
- representative hotspots in `src/`, `scripts/`, and `e2e/`

## Readiness Checklist

- [x] Task workspace created
- [x] User objective normalized
- [x] Current ESLint behavior sampled against representative files
- [x] Local signal prototype implemented
- [x] Diagnostics evidence captured
- [x] Rollout plan written
