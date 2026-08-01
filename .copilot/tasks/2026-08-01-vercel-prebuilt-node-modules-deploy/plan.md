# Vercel Prebuilt Deploy Missing `node_modules` Plan

## Archive Status

**Status: ARCHIVED PROTOTYPE - not the accepted production remediation plan.**

This task captured useful investigation and prototype validation work, but it has
been superseded by the production decision in
`.copilot/tasks/2026-08-01-vercel-prebuilt-deploy-root-cause/production-remediation-options.md`.

Keep from this prototype:

- dry-run JSON parsing lessons;
- upload coverage comparison tests;
- fail-closed validation concept;
- evidence that `.vercelignore` can make `filePathMap` and uploaded files
  inconsistent.

Do not carry forward as production implementation:

- sanitizer behavior that edits generated `.vc-config.json`;
- manual package allowlists in `.vercelignore`;
- `outputFileTracingExcludes` added to `next.config.ts` as a workaround;
- validation based on `Object.keys(filePathMap)` instead of
  `Object.values(filePathMap)`.

The accepted direction is Variant A: contract-aligned prebuilt deployment,
pinned Vercel CLI, simplified `.vercelignore`, source-value validation,
dry-run upload coverage, and upload baseline metrics.

## Objective

Fix the production `vercel deploy --prebuilt --prod` failure where Vercel remote
deployment cannot `lstat` files referenced by generated function config, starting
with:

```text
node_modules/.pnpm/@opentelemetry+api@1.9.0/node_modules/@opentelemetry/api/build/src/api/context.js
```

No remediation should be implemented until each checklist item in the root-cause
section is accepted as evidence-backed.

## Confirmed Root Cause

- [x] `vercel build --prod` generates `.vercel/output/functions/**/*.func/.vc-config.json`.
- [x] The generated `.vc-config.json` contains `filePathMap` entries for files under `node_modules/.pnpm/...`.
- [x] The first `filePathMap` entry in `_global-error.func/.vc-config.json` is the same OpenTelemetry path reported by the failed Vercel deploy.
- [x] The referenced OpenTelemetry file exists locally after install/build.
- [x] `vercel deploy --prebuilt --prod --dry --json` reports `nodeModulesCount: 0`.
- [x] `.vercelignore` ignores `node_modules`.
- [x] Therefore, the prebuilt deployment config references `node_modules` files that are excluded from the deployment upload.

## New Relic Decision

- [x] Keep New Relic as an observability integration.
- [x] Do not restore `NODE_OPTIONS=-r newrelic`.
- [x] Do not restore `NODE_OPTIONS=--require newrelic`.
- [x] Do not restore `NODE_OPTIONS=--require=newrelic`.
- [x] Keep the Vercel guard that rejects New Relic preload through `NODE_OPTIONS`.
- [ ] Preserve the current intended delivery model: server late-load / instrumentation path, Vercel log drain where applicable, and Browser CDN delivery.

Rationale: the deploy failure is not caused by New Relic preload. New Relic and
OpenTelemetry appear in the failing path because the generated function trace
requires those packages. The actual failure is that required traced files are not
included in the prebuilt upload.

## Validation Cost Decision

- [x] Do not add a second `vercel build`; that would significantly lengthen deploys.
- [x] Do not run broad test suites as part of this deploy-specific guard.
- [x] Prefer a local filesystem guard after `vercel build --prod`; expected runtime is sub-second to a few seconds.
- [x] Use `vercel deploy --prebuilt --prod --dry --json` only if upload-list proof is required; observed local runtime was about 2 seconds, but allow a CI budget of 5-15 seconds because it contacts Vercel.
- [ ] If deploy time becomes a concern, split validation into:
  - mandatory local `filePathMap` existence check
  - optional CI/release-gate dry-run upload coverage check

Expected impact: small compared with `vercel build`, TypeScript, migrations, and
remote deployment. The expensive operation to avoid is rebuilding, not inspecting
the already-produced artifact.

## Fix Plan

The original phase checklist below is preserved as history of the prototype.
It is not the current implementation plan.

### Phase 1 - Artifact Contract Guard

- [x] Add a script that reads all `.vercel/output/functions/**/*.func/.vc-config.json`.
- [x] Prototype collected keys from each `filePathMap`.
- [x] For each key, verify the referenced file exists relative to the repository root.
- [x] Report missing files with the function config path and missing dependency path.
- [x] Fail fast with a concise error if any required file is missing locally.
- [x] Add focused unit tests using a temporary fake `.vercel/output` tree.

Production correction: the final validator must collect
`Object.values(filePathMap)`, not keys.

Acceptance criteria:

- [x] The guard passes against a valid generated `.vercel/output`.
- [x] The guard fails when a `filePathMap` entry points to a missing file.
- [x] The guard has no dependency on secrets or Vercel network access.

### Phase 2 - Upload Coverage Guard

- [x] Add an optional mode that consumes `vercel deploy --prebuilt --prod --dry --json` output.
- [x] Compare dry-run upload paths against required `filePathMap` paths.
- [x] Fail if any required `filePathMap` path is absent from the dry-run upload list.
- [x] Keep this mode separate from the local existence check so it can be enabled only in deployment CI.

Acceptance criteria:

- [x] The guard identifies that `node_modules/.pnpm/.../context.js` is required.
- [x] The guard identifies when that required file is not present in the dry-run upload list.
- [x] The guard output names `.vercelignore` as a likely upload-exclusion cause only when the missing path is ignored by deploy dry-run.

### Phase 3 - `.vercelignore` Remediation

- [x] Prototype updated `.vercelignore` so files required by `.vercel/output/functions/**/*.func/.vc-config.json` are not excluded from prebuilt deploy upload.
- [x] Keep unrelated large/non-runtime directories excluded, including root env files, root logs, source, coverage, docs, test results, Storybook output, and Playwright reports.
- [x] Confirm the dry-run upload list includes required `node_modules/.pnpm/...` files.
- [x] Confirm the upload does not include unnecessary root source/test/log/env artifacts.

Production correction: the final solution must remove user ignore rules for
`.next` and `node_modules` instead of maintaining manual package allowlists or a
broad `.pnpm` exception. It must reject forbidden traces rather than deleting
them from `.vc-config.json`.

Acceptance criteria:

- [x] `vercel deploy --prebuilt --prod --dry --json` includes the OpenTelemetry `context.js` path.
- [x] `vercel deploy --prebuilt --prod --dry --json` includes all required `filePathMap` paths.
- [x] Dry-run upload size remains reasonable and is recorded in the PR summary.

### Phase 4 - CI Wiring

- [ ] Superseded by Variant A implementation plan in the root-cause task.

Acceptance criteria:

- [ ] CI fails before remote Vercel deployment if required files are missing from the upload.
- [ ] Failure message points to the exact missing path and relevant `.vc-config.json`.
- [ ] Successful CI proceeds to the existing `vercel deploy --prebuilt --prod`.

### Phase 5 - Final Verification

- [ ] Superseded by Variant A implementation plan in the root-cause task.

## Explicit Non-Goals

- [ ] Do not remove New Relic as part of this fix.
- [ ] Do not re-enable New Relic preload through `NODE_OPTIONS`.
- [ ] Do not replace pnpm or change package manager layout as a speculative fix.
- [ ] Do not disable Next.js output tracing.
- [ ] Do not add broad cleanup or dependency refactors.
- [ ] Do not mask missing runtime files by relying on Vercel build cache.

## Open Questions

- [x] Production direction selected: Variant A.
- [x] Sanitizer rejected for production.
- [x] New Relic remains.
- [ ] Decide during Variant A implementation whether preview should receive the
      same dry-run guard as production.
- [ ] Decide upload baseline threshold during Variant A implementation.
- [ ] Should the final runbook be promoted into `docs/sdd/` after the fix is proven in CI?
