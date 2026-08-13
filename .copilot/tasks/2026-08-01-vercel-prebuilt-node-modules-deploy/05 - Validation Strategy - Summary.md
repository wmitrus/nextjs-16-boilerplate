# 05 - Validation Strategy - Summary

## Task Context

- Task ID: Leantime #96
- Task Objective: Fix the Vercel prebuilt production deploy failure caused by traced runtime files being excluded from upload.
- Current Run Scope: Archived prototype review after production decision.
- Mode: CHANGE VALIDATION
- Status: ARCHIVED PROTOTYPE
- Last Updated: 2026-08-01
- Related Control Artifacts: `plan.md`

## Scope Handled

Archive notice: this validation summary describes prototype validation only. It
is not the final production validation strategy.

The accepted production strategy is Variant A: pinned Vercel CLI,
`.vercelignore` without user rules for `.next` or `node_modules`, validator
based on `Object.values(filePathMap)`, fail-closed checks for missing,
forbidden, escaping, and not-uploaded source paths, dry-run upload coverage
before real deploy, and upload file-count/byte-size baseline.

Rejected for production: sanitizer validation as a required green path, manual
package allowlist validation, treating `outputFileTracingExcludes` as evidence
that forbidden traces are solved, and local existence-only validation.

- change surfaces assessed: deploy artifact validation script, `.vercelignore`, `next.config.ts`, generated `.vc-config.json`, Vercel dry-run upload list.
- validation questions in scope: whether required `filePathMap` paths are uploaded and forbidden root env/log/source artifacts are absent.
- excluded validation areas: real deploy, broad app runtime E2E, auth flows, database integration beyond the build command's existing migration step.

## Inputs Reviewed

- code paths reviewed: `scripts/validate-vercel-prebuilt-artifact.ts`
- tests / configs / workflows reviewed: `scripts/validate-vercel-prebuilt-artifact.test.ts`, `package.json`, `plan.md`
- earlier task artifacts reviewed: confirmed root-cause section in `plan.md`

## Actions Performed

- validation posture review performed: scoped Phase 2 validation to parser/unit coverage and one real dry-run evidence check.
- risk analysis performed: primary risk is false confidence from local file existence when upload list still excludes those files.
- test-level recommendations prepared: fixture tests for both upload-present and upload-missing cases.
- command recommendations prepared: keep dry-run coverage optional until CI wiring.

## Current-State Findings

- Confirmed prototype result: final dry-run upload coverage passed with 11022
  traced references, 4364 upload files, 0 missing after sanitizer and manual
  `.vercelignore` exceptions.
- Production finding: that green result is not sufficient for sign-off because
  it depends on mutating generated `.vc-config.json`.
- Risks: generated `.vc-config.json` may reintroduce forbidden traces; the
  production guard must fail closed instead of deleting entries.
- Drift: `outputFileTracingExcludes` is present in `next.config.ts`, but Vercel
  `.vc-config.json` still required post-build sanitizer for this artifact shape;
  therefore the config change is not accepted as a production fix.

## Validation-Risk Assessment

- primary risks: CI command ordering; accidental unanchored ignore patterns excluding dependency-internal runtime files.
- confidence gaps: real deploy still pending Phase 5.
- over-validation or under-validation concerns: broad test suites are not required for this script-only phase.

## Recommended Validation Scope

- minimum required validation for Variant A: focused Vitest for source-value
  validator and dry-run parser behavior, focused ESLint, TypeScript,
  repository-pinned `vercel build --prod`, local artifact validation,
  repository-pinned dry-run upload manifest, upload coverage comparison, upload
  baseline metric check, and deployment smoke.
- optional additional validation: real production deploy in Phase 5 after CI wiring.
- validation explicitly not required: Playwright E2E, Storybook, database tests, real production deploy.

## Validation Commands / Checks

- commands to run after Variant A implementation: `pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-prebuilt-artifact.test.ts --coverage.enabled=false`; `pnpm exec eslint --fix scripts/validate-vercel-prebuilt-artifact.ts scripts/validate-vercel-prebuilt-artifact.test.ts next.config.ts .github/workflows/prod-deploy.yml`; `pnpm exec tsc --noEmit --pretty false`; repository-pinned `vercel build --prod`; source-value artifact guard; repository-pinned `vercel deploy --prebuilt --prod --dry --json`; upload coverage guard against the dry-run JSON; deployment smoke after real deploy.
- environment prerequisites: generated `.vercel/output`; Vercel dry-run output captured to a file.
- expected evidence: unsanitized generated artifact has no forbidden source
  values; every source value exists, remains inside the repository, does not
  symlink-escape, and is present in the dry-run upload; upload metrics are
  reported against baseline.

## Artifact Synchronization

- `plan.md` updates: Phase 2 and Phase 3 checklists marked complete.
- `intake.md` updates: not present for this task.
- `implementation-plan.md` updates: not present for this task.
- specialist artifact updates: this summary added.

## Open Questions / Blockers

- unresolved questions: whether upload-size thresholds should be enforced immediately or reported first.
- blockers: none for archive classification.
- dependencies on architecture / security / runtime decisions: Variant A
  implementation still needs production-path review for CLI pinning, forbidden
  trace policy, containment checks, upload metrics, and deploy smoke.

## Handoff Notes

- what the next agent should rely on: Phase 3 prototype proved the dry-run guard
  is valuable, but not that sanitizer/manual allowlisting is production-safe.
- what should not be re-decided without new evidence: New Relic removal is not part of the deploy fix.
- recommended next specialist or step: implement Variant A from the root-cause
  task, then validate the clean production path.

## Update Log

### Update Entry

- Date: 2026-08-01
- Trigger: User requested Phase 2.
- Summary of change: Defined and validated minimum evidence for upload coverage.
- Sections refreshed: all

### Update Entry

- Date: 2026-08-01
- Trigger: User requested Phase 3.
- Summary of change: Validated `.vercelignore` remediation and sanitizer evidence.
- Sections refreshed: all

### Update Entry

- Date: 2026-08-01
- Trigger: User accepted Variant A and requested artifact synchronization.
- Summary of change: Reclassified this validation summary as archived prototype
  evidence and replaced sanitizer-based validation with the Variant A
  production validation strategy.
- Sections refreshed: archive notice, findings, validation scope, commands,
  handoff
