# Codacy Findings Review Intake

## Objective

- Review the local Codacy findings artifact and classify each finding against live repository code.
- Deduplicate and group findings by severity first, then by rule/type.
- Cross-reference findings against `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
- Distinguish real risks from false positives and repository-scope noise.

## Source Inputs

- Findings artifact: `.codacy/reports/codacy-findings-preview.json`
- Workflow prompt: `.github/prompts/codacy-findings-review.prompt.md`
- Workflow guide: `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`
- ZenFlow reference: `.zenflow/workflows/codacy-findings-review.md`
- Security patterns: `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- Repository context: `AGENTS.md`, `docs/ai/general/00 - Agent Interaction Protocol.md`, `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

## Readiness Checklist

- [x] Findings artifact located and read successfully
- [x] Workflow instructions loaded
- [x] Security pattern catalogue loaded
- [x] Task workspace created
- [x] Plan artifact created before specialist work
- [x] Scope review completed
- [x] Severity triage completed
- [x] Rule review completed
- [x] Remediation recorded
- [x] Pattern propagation recorded
- [x] Validation recorded
- [x] Final summary recorded

## Findings Inventory

- Total findings before dedupe: 103
- Total findings after exact dedupe: 103
- Exact duplicates removed: 0

## Severity Groups

- `error`: 8
- `warning`: 95

## Per-Severity Rule / Type Groups

### Error

- `@typescript-eslint/no-explicit-any`: 2
- `@typescript-eslint/no-deprecated`: 4
- `prettier/prettier`: 2

### Warning

- `security/detect-object-injection`: 63
- `security/detect-non-literal-fs-filename`: 22
- `security/detect-unsafe-regex`: 8
- `security/detect-child-process`: 1
- `@next/next/no-img-element`: 1

## Initial SEC-XX Cross-Reference

- `security/detect-non-literal-fs-filename`: likely overlaps `SEC-05` for static-literal config paths; requires per-file verification because script/runtime path sources may differ.
- `security/detect-object-injection`: one confirmed repository pattern overlap already exists in `SEC-04` for explicit logger dispatch; the broader rule bucket likely needs narrower classification by usage pattern.
- `security/detect-child-process`: no current SEC entry matched during intake.
- `security/detect-unsafe-regex`: no current SEC entry matched during intake.

## Initial Repository Review Priority

### Error Priority Order

1. `src/core/db/migrations/run-migrations.ts` via `@typescript-eslint/no-explicit-any`
2. `scripts/codacy-analyze.mjs` via `prettier/prettier`
3. `src/modules/auth/infrastructure/drizzle/DrizzleExternalIdentityMapper.db.test.ts` via `@typescript-eslint/no-deprecated`

### Warning Priority Order

1. Runtime/security code under `src/security`, `src/core`, `src/modules`, `src/app`
2. Shared runtime-supporting code under `src/shared`
3. Tests and E2E code under `e2e/` and `src/**/*.test.*`
4. Scripts and CLI tooling under `scripts/`
5. Local tooling under `.vscode/`

## Initial Hotspots

- Runtime warning density is concentrated in `src/security`, `src/shared/lib`, `src/core/logger`, and `src/app/api/logs/route.ts`.
- Test and E2E warning density is concentrated in `e2e/` and repository test helpers.
- Script/tooling density is concentrated in `scripts/`, especially env-loading and Codacy helper scripts.
- The findings set appears dominated by repeated scanner patterns rather than a broad variety of independent defects.

## Scope Review Snapshot

- Final mutually exclusive area counts: production/runtime 21, security/auth runtime 14, tests/E2E 38, scripts/CLI 29, local tooling/dev-only 1.
- Dominant noisy paths: `scripts/` (29), `e2e/` (20), `src/security/rsc/` (12), `src/shared/lib/` (10), `src/core/logger/` (6).
- Confirmed review order for next-step triage: security/auth runtime, remaining production/runtime, tests/E2E, scripts/CLI, local tooling/dev-only.
- Detailed scope and tuning candidates are recorded in `scope-review.md`.

## Rule Review Snapshot

- Keep with narrower scope: `security/detect-object-injection`, `security/detect-non-literal-fs-filename`, `@typescript-eslint/no-deprecated`.
- Keep as-is: `@typescript-eslint/no-explicit-any`.
- Disable or demote for repository or path scope: `security/detect-unsafe-regex` on test assertions, `security/detect-child-process` in `.vscode/extensions-dev/**/*`, `@next/next/no-img-element` in test harness mocks, and `prettier/prettier` in Codacy review.
- AI-guidance follow-up is likely warranted only for the repeated security rules: own-key accumulator and bounded lookup patterns for object-injection review, plus helper-level confinement expectations for dynamic fs helpers.

## Scope And Non-Goals

- In scope: classification, rule review, remediation planning, and durable pattern propagation.
- Out of scope unless triage proves necessary: broad refactors, mass lint cleanup, or speculative rule suppressions without code review evidence.

## Open Questions

- Whether the local Codacy execution mode used by `pnpm codacy:analyze:sarif` is honoring `.codacy.yml` exclusions correctly.
- Whether Codacy cloud configuration also needs adjustment so the path exclusions match the repository rule-review decision.
