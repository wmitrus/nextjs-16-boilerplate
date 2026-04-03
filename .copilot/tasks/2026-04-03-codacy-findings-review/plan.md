# Codacy Findings Review Plan

## Objective

- Review `.codacy/reports/codacy-findings-preview.json` as the authoritative local findings set.
- Classify every finding against live repository code and `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
- Separate real production risk from false positives, tooling noise, and repository-scope mismatches.
- Produce rule-tuning guidance and propagate any durable security patterns.

## Task Classification

- Workflow: Codacy Findings Review
- Mode: `08 - Workflow Orchestrator`
- Source of truth: live repository code
- Findings artifact: `.codacy/reports/codacy-findings-preview.json`
- Initial posture: review-first, no implementation requested yet

## Planned Specialist Sequence

- [x] Workflow Orchestrator: create task workspace and control artifacts
- [x] Workflow Orchestrator: normalize findings inventory into intake
- [x] Architecture Guard: produce scope review and area-based review order
- [x] Security & Auth: triage severity groups and classify findings
- [x] Architecture Guard + Security & Auth: review repeated rules and scope decisions
- [x] Implementation Agent: write remediation plan unless targeted fixes become necessary
- [x] Security & Auth: propagate durable patterns to security docs and instructions if confirmed
- [x] Validation Strategy: record focused validation posture for review-only or changed-code outcome
- [x] Workflow Orchestrator: publish final summary

## Known Risks And Unknowns

- The findings set mixes runtime code, tests, scripts, E2E helpers, local editor tooling, and style-only lint errors.
- `security/detect-object-injection` is likely high-noise and needs file-by-file verification before any rule decision.
- `security/detect-non-literal-fs-filename` may include both acceptable static-path usage and potential script-path hardening cases.
- Existing `SEC-XX` guidance may already cover part of the findings set, but coverage must be verified against current code.

## Artifact Checklist

- [x] `plan.md`
- [x] `intake.md`
- [x] `constraints.md`
- [x] `implementation-plan.md`
- [x] `scope-review.md`
- [x] `triage-error.md`
- [x] `triage-warning.md`
- [x] `01 - Architecture Guard - Summary.md`
- [x] `02 - Security & Auth - Summary.md`
- [x] `04 - Implementation Agent - Summary.md`
- [x] `05 - Validation Strategy - Summary.md`
- [x] `rule-review.md`
- [x] `remediation.md`
- [x] `patterns-propagation-report.md`
- [x] `validation.md`
- [x] `final-summary.md`

## Current Status

- Intake and execution scaffolding created.
- Findings inventory loaded from the local JSON artifact.
- Architecture Guard completed scope separation, noisy-path review, repository review ordering, and repeated-rule decisions.
- Security & Auth completed severity-first triage for all 103 findings.
- Confirmed security outcome so far: 0 real risks, 3 latent hardening items, 90 false positives, and 2 scope-noise warnings.
- Rule-review outcome: keep runtime scrutiny for `security/detect-object-injection` and `security/detect-non-literal-fs-filename`, demote structurally low-signal test and dev-only rules, and queue two possible AI-guidance clarifications for later review.
- Implementation Agent recorded a review-only remediation plan that groups the 3 latent findings into 2 must-fix runtime workstreams, separates deferred rule-scope actions from maintenance debt, and applies no production or test code changes.
- Security & Auth propagated the two durable guidance gaps as `SEC-15` and `SEC-16` across the repository instruction surfaces.
- Implementation Agent later completed the two deferred runtime fixes, added focused regression tests, and updated `.codacy.yml` to narrow the high-noise Codacy path scope.
- Focused validation passed for lint and unit tests, and a local Codacy SARIF rerun confirmed the bootstrap fix while leaving one tooling caveat around excluded-path handling.
- Final summary refreshed; workflow dossier remains complete with only Codacy exclusion verification left as optional follow-up.

## Recommended Next Action

- Optional follow-up only: verify why the local Codacy SARIF run still includes excluded paths after the `.codacy.yml` update.
