# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: `2026-08-14-vercel-prebuilt-readiness-audit`
- Task Objective: Assess runtime readiness of the Production Vercel prebuilt deployment path after recurring generated-artifact `ENOENT` failures.
- Current Run Scope: Next.js Build Output tracing, Vercel `filePathMap` upload closure, proxy runtime implications, ignore-profile behavior, and pulled-environment use.
- Status: COMPLETED
- Last Updated: 2026-08-14
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- runtime entrypoints reviewed: `next.config.ts`, `src/proxy.ts`, `.github/workflows/prod-deploy.yml`, `.github/workflows/preview-deploy.yml`.
- App Router surfaces reviewed: Build Output function configuration and proxy-generated runtime trace implications; no application route behavior was changed or approved.
- runtime questions in scope: `vercel build --prod` to `deploy --prebuilt` compatibility, Build Output source mapping, upload ignore behavior, Edge proxy tracing, Node/Edge boundaries, and build/runtime environment transfer.

## Inputs Reviewed

- code paths reviewed: `.vercelignore`, `.vercelignore.prebuilt`, `scripts/validate-vercel-prebuilt-artifact.ts`, `scripts/validate-vercel-deploy-profiles.ts`, `scripts/validate-env.ts`, `scripts/vercel/prebuilt-env-template-policy.ts`, `src/core/runtime/edge.ts`, and focused validator tests.
- runtime docs reviewed: repository runtime constraints in `AGENTS.md`; current and prior task artifacts. External hosted documentation was not independently fetched during this specialist review.
- earlier task artifacts reviewed: 2026-08-01 prebuilt root-cause and node-modules prototype records, 2026-08-12 trace investigation and validation report, and 2026-08-13 public env-template investigation.

## Actions Performed

- server/client boundary review performed: confirmed the reviewed deployment code is server/tooling-only; no non-public environment value is passed to a client surface by this path.
- route handler / server action review performed: not applicable to this deployment-only scope.
- proxy review performed: confirmed `src/proxy.ts` uses the Edge-specific composition root and its direct graph contains no Node builtin or Node-only observability imports. The proxy still has its own Edge trace and therefore its traced source inputs remain deployment-critical.
- cache / runtime review performed: confirmed `cacheComponents: true` is enabled and no prohibited App Router segment `dynamic` or `runtime` export appears in the reviewed runtime entrypoints. This does not change Build Output upload closure requirements.

## Current-State Findings

- Confirmed: Production pulls the Vercel Production environment before validation and build, then explicitly sources `.vercel/.env.production.local` for `vercel build --prod`. `env:validate` rejects missing pulled `AUTH_PROVIDER`, `TENANCY_MODE`, and, for Production AuthJS, `NEXTAUTH_URL`; the build step repeats the AuthJS URL guard. This prevents a local or build-only fallback from masking the Vercel Production runtime contract.
- Confirmed: The prebuilt validator reads the source values of every generated function `filePathMap` with `Object.values(filePathMap)`, verifies source existence and root/symlink containment, then compares every allowed source with the actual CLI dry-run upload set. It also rejects forbidden uploaded trace sources and upload plans without a measurable size under the configured file and byte budgets.
- Confirmed: `.vercelignore.prebuilt` does not exclude `.next`, `node_modules`, or `src`; this is necessary because generated mappings can legitimately refer to dependency paths and proxy-reachable source files. It excludes sensitive/non-runtime paths and explicitly retains only the three tracked public env templates that the Vercel builder has generated as function sources.
- Confirmed: The 2026-08-12 fresh Production-environment dry-run, recorded in the current prior validation report, used Vercel CLI `59.0.0` and passed with four function configurations, 3,268 unique required sources, 23 required `src/**` sources, 4,390 uploaded files, 73,496,018 bytes, zero missing traced upload sources, and zero forbidden uploads. This is strong local evidence for that resolved CLI/build/input combination.
- Risks: Production resolves `vercel@latest` at workflow execution rather than using a lockfile-pinned CLI. The current dry-run validator is the compensating compatibility check, but a future CLI could change before artifact or dry-run parsing. The workflow will fail closed if the observed dry-run format or closure changes; it cannot prove a future hosted deployment before it runs.
- Drift: The historical Variant A document calls for a pinned CLI, while live workflows deliberately use `npm exec --yes vercel@latest --` for pull, build, dry-run, and deploy. The live code and the 2026-08-12 report establish the current policy as latest-CLI plus same-run artifact/upload validation. Historical text describing the proxy trace as Node is runtime-inaccurate: `src/proxy.ts` is an Edge proxy; its trace exclusion limitation remains relevant because output tracing exclusions do not remove Edge runtime trace inputs.

## Runtime Boundary Assessment

- server vs client placement: `vercel pull`, environment validation, build, artifact validation, dry-run, and deploy all run in the GitHub Actions Linux job. The browser bundle is not involved. `NEXT_PUBLIC_APP_ENV=production` is intentionally public; other pulled values are sourced only by the server/tooling process.
- edge vs node placement: `src/proxy.ts` runs in the Next.js proxy Edge boundary and composes `createEdgeRequestContainer`, documented in code as auth-only with no DB or Node-only services. Node-capable Vercel functions are generated separately under `.vercel/output/functions`. The prebuilt uploader must materialize the source values requested by either runtime's generated function metadata.
- route handler / page / layout responsibilities: not changed or relied on for artifact closure. `cacheComponents: true` makes route-segment runtime exports invalid; no such export is introduced by the reviewed path. Function metadata, not route source classification, is the authoritative list of source files required for prebuilt materialization.
- proxy responsibilities: the proxy handles request-time security composition only; it is not a deploy guard. Its Edge trace can include `src/**` files despite `outputFileTracingExcludes`, so excluding `/src` in the prebuilt profile would recreate the earlier metadata/upload inconsistency.

## Caching And Revalidation Notes

- cache-sensitive observations: no user- or tenant-scoped application response cache is configured by the reviewed deploy path. Build artifact correctness is bound to the freshly pulled environment and the same job's generated `.vercel/output`.
- revalidation observations: no `revalidate` behavior is implicated.
- request-time vs build-time notes: Vercel environment values pulled and sourced for `vercel build --prod` influence build-time configuration. The checks require the relevant values to be present in Vercel Production itself, preserving the separate deployed runtime contract. `VERCEL_URL` is deliberately unset when absent, avoiding an empty synthetic value during build.

## Runtime Decisions / Constraints

- approved runtime constraints: treat generated `filePathMap` source values as the required prebuilt materialization set; require a fresh `vercel build --prod`, local artifact containment/existence validation, and a CLI dry-run upload-closure validation before real deploy. Keep preview source upload and Production prebuilt upload profiles separate.
- rejected directions: do not globally exclude `/src`, `node_modules`, or `.next` from the Production prebuilt profile; do not sanitize generated `.vc-config.json`; do not rely on `outputFileTracingExcludes` to remove Edge proxy trace inputs; do not use build-only AuthJS URL synthesis.
- runtime assumptions requiring validation: the dry-run JSON `files`, `ignored`, and size fields must retain the currently parsed shape; the resolved `vercel@latest` must still honor the same Build Output source mapping at upload and hosted materialization time.

## Artifact Synchronization

- `plan.md` updates: not edited by this specialist because the request limits output to this single specialist artifact; runtime review is complete and ready for orchestration to mark.
- `intake.md` updates: not edited for the same reason.
- `implementation-plan.md` updates: not present / not applicable to this read-only review.
- specialist artifact updates: created this single persistent `03 - Next.js Runtime - Summary.md` artifact.

## Open Questions / Blockers

- unresolved questions: Vercel's hosted service behavior after upload cannot be verified from local generated output or `--dry` planning alone, including any server-side materialization behavior beyond the CLI plan.
- blockers: no local runtime/code blocker identified. A completed protected Production workflow remains required evidence for a final hosted-deploy success claim.
- evidence still needed: one fresh Production workflow run using its actual resolved CLI, followed by ready-status/hosted logs showing `deploy --prebuilt --prod` completed; preserve its artifact and dry-run metrics without credentials.

## Handoff Notes

- what the next agent should rely on: the current workflow is structurally sound for local prebuilt readiness when a fresh build and dry-run pass; the recorded CLI 59.0.0 dry-run proves closure for that historical current-branch input set, not a hosted deployment.
- what should not be re-decided without new evidence: `filePathMap` values, rather than keys, are the upload contract; `src/**`, `.next`, and `node_modules` may be required inputs; public templates are narrow allowed exceptions while actual `.env*` secrets remain excluded; proxy trace sources must remain eligible for upload.
- recommended next specialist or step: Validation Strategy should decide whether the existing fresh-build/dry-run evidence plus one protected Production workflow is sufficient for the task acceptance verdict. Do not claim GO until that hosted workflow result is recorded.

## Update Log

### Update Entry

- Date: 2026-08-14
- Trigger: Runtime follow-up implemented the identified trace-metadata fail-closed control.
- Summary of change: Production validation now rejects forbidden generated trace metadata before dry-run upload comparison, eliminating the prior path where an ignored trace source could evade local closure checks. The workflow also verifies the final hosted deployment is a ready Production prebuilt deployment.
- Sections refreshed: current-state findings, runtime constraints, and remaining hosted-proof condition.

### Update Entry

- Date: 2026-08-14
- Trigger: Read-only Next.js Runtime review requested for the Vercel prebuilt readiness audit.
- Summary of change: Reviewed the live workflow, profiles, generated-output validators, Edge proxy boundary, pulled-environment guards, and prior incident evidence; recorded proven local closure and the remaining hosted-deploy uncertainty.
- Sections refreshed: all.
