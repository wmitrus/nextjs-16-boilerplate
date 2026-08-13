# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-08-13-vercel-prebuilt-env-template`
- Task Objective: Identify the root cause of the production-only Vercel prebuilt dry-run failure.
- Current Run Scope: Generated Vercel function metadata, upload profiles, and validator policy.
- Status: COMPLETED
- Last Updated: 2026-08-13
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- symptom or flow investigated: Production `vercel deploy --prebuilt --prod --dry --json` validation.
- runtime surfaces investigated: `vercel build --prod`, generated `.vc-config.json`, prebuilt upload plan.
- env or timing questions investigated: Whether `.env.example` is introduced by Next tracing or the Vercel builder.

## Inputs Reviewed

- code paths reviewed: `next.config.ts`, `scripts/validate-vercel-prebuilt-artifact.ts`, production workflow and both ignore profiles.
- logs / diagnostics reviewed: GitHub Actions failure supplied in the request and local production build/dry-run output.
- tests / task artifacts reviewed: focused validator tests.

## Actions Performed

- reproduction attempts performed: Local `vercel build --prod` and production prebuilt dry-run.
- execution-path tracing performed: Next trace metadata and generated Vercel `filePathMap` compared.
- source-of-truth tracing performed: Inspected the installed Vercel Next builder and generated output.
- evidence collection performed: Confirmed `.env.example` appears only after `vercel build` in generated `.vc-config.json`, not in `.next` traces.

## Symptom Summary

- observed symptom: CI validator fails before deployment because the dry-run uploads `.env.example`.
- where it surfaces: `Validate Prebuilt Upload Coverage` in production workflow.
- reproducibility: Deterministic after a production prebuilt build.
- trigger conditions: Production prebuilt workflow activates `.vercelignore.prebuilt` and validates Vercel builder `filePathMap` output.

## Confirmed Evidence

- code facts: The validator marks every path with prefix `.env` as forbidden.
- runtime evidence: Vercel generated `.env.example` entries for `_global-error`, `api/admin/invitations/[id]`, and `api/internal/env-check` functions.
- diagnostics or logs: CI reports exactly those three entries as forbidden.
- disproven possibility: `next.config.ts` output tracing is not the source; `.env.example` is absent from `.next` trace files.

## Execution Path

- entry point: `.github/workflows/prod-deploy.yml` production prebuilt dry-run.
- critical path: `vercel build --prod` -> Vercel Next builder writes `filePathMap` -> production dry-run creates upload plan -> validator rejects uploaded forbidden paths.
- state transitions: The Vercel builder creates source references that must be materialized remotely during prebuilt deployment.
- failure boundary: Repository validator applies a security classification that is too broad for a public Vercel-required template.

## Hypotheses And Failure Points

- likely failure points: Validator's `.env` prefix policy treats `.env.example` as a secret file.
- hypotheses: Confirmed. `.env.example` must be an explicit allowed exception while actual `.env` files remain prohibited.
- disproven possibilities: Excluding it through Next output tracing is not effective because the Vercel builder adds the reference after Next has produced its traces.

## Missing Evidence / Uncertainty

- what remains unclear: Vercel's internal rationale for attaching the public template to these function file maps is external implementation detail.
- what evidence would reduce uncertainty fastest: A Vercel upstream issue or builder changelog; not required to correct the repository contract.
- external dependencies or blockers: None.

## Artifact Synchronization

- `plan.md` updates: Investigation steps recorded.
- `intake.md` updates: Symptom and readiness recorded.
- `implementation-plan.md` updates: Not applicable during investigation.
- specialist artifact updates: This summary created.

## Handoff Notes

- what the next agent should rely on: `.env.example` is public, tracked, Vercel-builder-required prebuilt source; the validator must distinguish it from credential-bearing env files.
- what remains unproven: Only Vercel's private implementation rationale.
- recommended next specialist or step: Focused implementation: refine the validator policy, keep the exception only in `.vercelignore.prebuilt`, and validate with the production dry-run.

## Resolution Evidence

- The validator now explicitly recognizes root `.env.example` as the public template required by the Vercel builder. Other `.env*` paths remain forbidden.
- A focused regression test proves `.env.local` remains forbidden while `.env.example` is allowed.
- The exact production prebuilt dry-run and validator completed with `0 missing allowed reference(s)` and `0 forbidden upload(s)`.
- The active preview profile was restored with its E2E helper allowlist; the public template upload exception remains scoped to `.vercelignore.prebuilt`.

## Preview And Production Profile Audit

- Confirmed: `e2e/env-files.ts` and `e2e/internal-api-key.ts` remain required preview upload inputs. Both `playwright.config.ts` and `playwright.vscode.config.ts` import `e2e/internal-api-key.ts`, which imports `e2e/env-files.ts`.
- Confirmed: Commit `6c1d8f84` introduced the two negated preview rules after a source-upload regression. The current preview dry-run contains both files, and the existing profile guard checks them as required build inputs.
- Confirmed: Production uses a distinct prebuilt profile after `vercel build --prod`; it excludes `e2e/` because the serverless prebuilt output does not require Playwright configuration or E2E helper sources. The real production dry-run contains no `e2e/` files.
- Confirmed: Production trace guards continue to cover historical failure classes: missing sources, malformed function metadata, source-value versus target-key handling, paths escaping the repository, malformed dry-run output, forbidden source upload, missing allowed source upload, and file-count and byte budgets.
- Validation evidence: preview source dry-run passed with both E2E helpers present; production prebuilt dry-run passed with `0 missing allowed reference(s)`, `0 forbidden upload(s)`, no E2E sources, and only the three tracked public env templates.

## Update Log

### Update Entry

- Date: 2026-08-13
- Trigger: Production prebuilt upload validation failure.
- Summary of change: Established the policy mismatch and ruled out application-level Next tracing as the source.
- Sections refreshed: All, including resolution evidence.
