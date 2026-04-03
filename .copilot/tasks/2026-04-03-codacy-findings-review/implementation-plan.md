# Execution Plan

## Phase Checklist

- [x] Phase 1: establish plan, intake, and constraints
- [x] Phase 2: separate runtime findings from tests, scripts, and dev-only noise
- [x] Phase 3: classify error findings
- [x] Phase 4: classify warning findings
- [x] Phase 5: review repeated rules for keep/scope/disable decisions
- [x] Phase 6: record remediation or implementation outcome
- [x] Phase 7: record pattern propagation outcome
- [x] Phase 8: record validation and final summary

## Execution Sequence

### Phase 2: Scope Review

- [x] Tag each finding group by code area
- [x] Identify noisy directories and low-signal sources
- [x] Produce area-based review order

### Phase 3: Error Triage

- [x] Inspect `@typescript-eslint/no-explicit-any` findings in `src/core`
- [x] Inspect `prettier/prettier` findings in `scripts/codacy-analyze.mjs`
- [x] Inspect `@typescript-eslint/no-deprecated` findings in DB tests
- [x] Record `triage-error.md`

### Phase 4: Warning Triage

- [x] Inspect runtime `security/detect-object-injection` findings first
- [x] Inspect runtime `security/detect-non-literal-fs-filename` findings next
- [x] Inspect E2E/test and script findings after runtime review
- [x] Inspect residual low-priority warnings such as `.vscode/*` and `tests/setup.tsx`
- [x] Record `triage-warning.md`

### Phase 5: Rule Review

- [x] Aggregate false-positive rate by repeated rule
- [x] Decide keep vs scope vs disable per rule
- [x] Record required AI instruction updates

### Phase 6: Remediation

- [x] Confirm whether this remains review-only or requires targeted fixes
- [x] Record prioritized remediation actions in `remediation.md`

Implementation follow-through completed after the original review-only remediation plan:

- [x] Implement bootstrap own-key hardening in `src/app/auth/bootstrap/page.tsx`
- [x] Implement sink-level logger helper confinement in `src/core/logger/utils.ts`
- [x] Apply Codacy path-scope tuning in `.codacy.yml`

### Phase 7: Pattern Propagation

- [x] Update security pattern docs if new durable patterns are confirmed
- [x] Propagate any new mandatory guidance to relevant AI instruction locations
- [x] Record propagation outcome even if no updates were needed

### Phase 8: Validation And Closure

- [x] Record validation posture or commands run
- [x] Publish workflow final summary
