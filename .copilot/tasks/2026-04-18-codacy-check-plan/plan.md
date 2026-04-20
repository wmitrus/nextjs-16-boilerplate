# Codacy Check Plan

## Objective

- Run the repository Codacy analysis in persistent findings mode.
- Capture the generated findings artifact and use it as the source of truth.
- Group the findings into actionable remediation buckets and produce a task plan.

## Scope

- `scripts/codacy-analyze.mjs`
- Codacy CLI local findings output under `.codacy/reports/`
- Affected repository files reported by the scan
- Artifact-backed planning for remediation sequencing

## Specialist Sequence

- [x] Orchestrator intake and artifact setup
- [ ] Leantime task open and ID capture
- [x] Local Codacy findings scan
- [x] Findings triage and grouping
- [x] Remediation task breakdown
- [x] Validation/report artifact update
- [x] First remediation bucket completed
- [x] Second remediation bucket completed
- [x] Third remediation bucket completed
- [x] Fourth remediation bucket completed
- [x] Fresh close-out Codacy rerun
- [x] Residual-noise disposition completed

## Known Risks

- Local Codacy output may differ from Codacy Cloud if cloud sync env vars are not set.
- The working tree is already dirty, so unrelated changes must not be mixed into the remediation plan.
- Findings may include noise or duplicates that need consolidation before planning.

## Artifacts

- [x] `plan.md`
- [x] `intake.md`
- [x] `implementation-plan.md`
- [x] `validation-report.md`

## Current Status

- Persistent findings mode works via `pnpm codacy:analyze:findings`.
- Current report summary: 0 findings total, 0 errors, 0 warnings.
- Dominant rule families: none remaining.
- Dominant areas: none remaining.
- First remediation bucket cleared all 9 error-level findings.
- Second remediation bucket cleared all remaining `src/**` findings.
- Third remediation bucket is complete: `scripts/**` findings dropped from `41` to `0` after eliminating object-injection shapes and consolidating repeated fs access behind shared sink-confined helpers.
- Fourth remediation bucket is complete: `e2e/**` findings dropped from `19` to `0` after consolidating env-file reads behind a shared helper, replacing dynamic provider-claim lookups with explicit helpers, and swapping the flagged URL regex shapes for pathname/query assertions.
- Policy alignment started for later buckets: narrow local ESLint coverage now includes `obj[dynamicKey]()` bracket-dispatch, and repository instructions now require repo-wide `pnpm lint --fix` plus `pnpm typecheck` before closing a major implementation phase.
- Policy decision for this run: no new broad ESLint fs-sink selector was added; instead the repository now documents and prefers shared sink-confined fs helper wrappers, with a narrow local lint exception only for the reviewed helper modules themselves.
- Additional policy hardening: project-wide implementation anti-patterns now have a dedicated global document and are wired into the required reading path for implementation work, so future agents do not rediscover these rules only after Codacy churn.
- Freshness gap is closed: the report was rerun successfully after fixing a local wrapper bug in `scripts/codacy-analyze.mjs`.
- Browser validation for the edited E2E spec passed in Playwright (`2/2`) on targeted provisioning-runtime scenarios.
- Residual-noise disposition is complete: the `.vscode/extensions-dev/**` child-process warning was replaced with an allowlisted `execFile(...)` path, and the `tests/setup.tsx` image mock no longer uses JSX `<img>`.
- Final Codacy rerun returned zero findings. Because the result set was empty, the command did not write a new `.codacy/reports/codacy-findings.json` artifact; only `.codacy/reports/codacy-findings-preview.json` remains on disk.
- Repo-wide `pnpm lint --fix` passed after the residual cleanup.
- Repo-wide `pnpm typecheck` still fails only on the unrelated pre-existing blocker at `scripts/leantime/lib.ts:316` (`stats` is possibly `undefined`).
- Remaining administrative gap: Leantime task open is still pending.
