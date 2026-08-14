# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-08-12-vercel-prebuilt-trace-investigation`
- Task Objective: Identify the root cause of recurring production Vercel prebuilt deployment `ENOENT` failures.
- Current Run Scope: Trace origin, production environment state, clean-worktree reproduction, and upload-profile compatibility.
- Status: COMPLETED
- Last Updated: 2026-08-12
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- symptom or flow investigated: Vercel output materialization failure after local `vercel build --prod`.
- runtime surfaces investigated: raw Next Proxy NFT trace, Vercel function `filePathMap`, production env boolean state, Git tracked workspace inputs.
- env or timing questions investigated: whether production file logging creates `logs/server.log` before build.

## Inputs Reviewed

- code paths reviewed: `next.config.ts`, `src/core/logger/streams.ts`, `src/core/logger/utils.ts`, `src/proxy.ts`, production migration path, production deploy workflow, prebuilt profile, and artifact validator.
- logs / diagnostics reviewed: remote `ENOENT` for `logs/server.log`; raw `.next/server/middleware.js.nft.json`; Vercel generated `.vc-config.json`; Git tracking/history for log artifacts.
- tests / task artifacts reviewed: existing prebuilt validator behavior and prior profile constraints summarized in intake.

## Actions Performed

- reproduction attempts performed: built a detached clean worktree with the tracked log removed, a normal pnpm dependency install, the pulled production environment, and safe synthetic public URL placeholders needed only to allow NextAuth prerendering.
- execution-path tracing performed: Git checkout -> Next Proxy NFT -> Vercel generated `filePathMap` -> prebuilt deploy source materialization.
- source-of-truth tracing performed: checked effective `LOG_TO_FILE_PROD` without exposing its raw value; inspected Git index and history.
- evidence collection performed: counted raw trace categories before and after removing the tracked log artifact.

## Symptom Summary

- observed symptom: production `vercel deploy --prebuilt --prod` fails remotely with `ENOENT ... /logs/server.log` during "Deploying outputs".
- where it surfaces: Vercel materialization of a source path named in generated function metadata, after the artifact is built.
- reproducibility: deterministic for checkouts containing the tracked log while prebuilt upload excludes `/logs`.
- trigger conditions: tracked source entry appears in raw Proxy NFT; prebuilt deploy profile omits that path from upload.

## Confirmed Evidence

- code facts:
  - `next.config.ts` attempts to exclude `logs/**/*` and `src/**/*` from `outputFileTracingExcludes` under `'/*'`.
  - Next documentation states that output-file-tracing excludes do not affect Edge Runtime routes. Proxy produces an Edge trace.
  - `.vercelignore.prebuilt` excludes both `/logs` and `/src`.
  - the prebuilt validator records forbidden trace entries but currently allows them to be absent from the upload plan, which conflicts with Vercel materialization requirements.
- runtime evidence:
  - `LOG_TO_FILE_PROD` is `false` in pulled production environment; production file logging did not create the file for this build.
  - `logs/server.log` is tracked by Git, is present in a newly created detached worktree, and is 5,560,458 bytes.
  - the raw current workspace Proxy NFT included 210 log references, including `../../logs/server.log`.
  - after removing only the tracked `logs/server.log` in a clean worktree, a successful production-configured Next build produced a raw Proxy NFT with 506 entries, 0 log references, 0 `.env` references, and 10 source-test references.
  - the 10 remaining test references are all files in `src/core/logger/*.test.ts`; the same trace also includes the corresponding logger implementation files.
- diagnostics or logs:
  - the remote failure path exactly matches the tracked artifact source path: `logs/server.log`.

## Execution Path

- entry point: GitHub Actions production workflow runs `vercel build --prod`, validates output, activates `.vercelignore.prebuilt`, then runs `vercel deploy --prebuilt --prod`.
- critical path: tracked file -> Next raw Proxy NFT -> Vercel function `filePathMap` -> source omission by prebuilt upload profile -> remote `lstat` failure.
- state transitions:
  1. Git checkout materializes the tracked log.
  2. Next Proxy tracing records it.
  3. Vercel output config requires it as source input.
  4. Prebuilt profile suppresses it from source upload.
  5. Vercel cannot materialize the generated function output.
- failure boundary: the artifact's `filePathMap` requires a repository file that the subsequent upload profile excludes.

## Hypotheses And Failure Points

- likely failure points:
  - Confirmed: `logs/server.log` was mistakenly committed and is the immediate remote `ENOENT` source.
  - Confirmed: the prebuilt upload profile globally excludes `/src` even though the Edge Proxy trace includes logger source files and tests.
  - Confirmed: Next's documented Edge Runtime exception makes current `outputFileTracingExcludes` ineffective for this Proxy trace.
- hypotheses:
  - Likely: after deleting the tracked log, the same deployment would fail on a traced `src/core/logger/*.test.ts` because `/src` remains excluded.
  - Likely: the trace includes the logger directory because the Edge Proxy's logging dependency graph reaches the package/directory trace boundary; whether that behavior is a Next/NFT overtrace or a dependency-graph shape is not material to Vercel's requirement to materialize every `filePathMap` source.
- disproven possibilities:
  - Production `LOG_TO_FILE_PROD=true` is not the cause in the pulled production environment.
  - `.vercelignore` is not the origin of the bad log trace; it only exposes the source/output incompatibility.
  - A dirty local `.next` was not required to reproduce the trace issue; a clean worktree demonstrated it.

## Missing Evidence / Uncertainty

- what remains unclear: exact internal NFT reason for including sibling logger test files in the Edge trace.
- what evidence would reduce uncertainty fastest: a Next.js Runtime review of Edge Proxy trace semantics; it is not needed to establish the deploy contract failure.
- external dependencies or blockers: none for the root-cause remediation. The clean isolated build required public URL placeholders only because the copied pulled environment did not supply a valid NextAuth origin to the standalone test context.

## Artifact Synchronization

- `plan.md` updates: initial findings and clean build step have been recorded; remaining handoff is pending.
- `intake.md` updates: symptom and confirmed evidence captured; clean build result should be marked complete.
- `implementation-plan.md` updates: not created; implementation has not been authorized in Debug Investigation mode.
- specialist artifact updates: this file created as the sole Debug Investigation summary.

## Handoff Notes

- what the next agent should rely on:
  - Remove `logs/server.log` from Git; keep log directories excluded from deployment upload.
  - Treat the prebuilt upload as the closure of Vercel `filePathMap`, not as an arbitrary source minimization profile.
  - Do not add a log-file upload exception or mutate generated Vercel output.
  - Do not retain a validator policy that permits a required forbidden trace source to be omitted from upload.
  - Preserve preview E2E helper exceptions separately; they are unrelated to production trace closure.
- what remains unproven: why NFT includes logger test siblings, not whether they must be available when present in generated `filePathMap`.
- recommended next specialist or step:
  - `03 - Next.js Runtime` should confirm the supported handling of Edge Proxy trace inputs.
  - `04 - Implementation Agent` should make the narrow remediation after that confirmation: remove tracked runtime artifacts and align the prebuilt profile/validator to required file-path-map closure, with no per-file exception ladder.

## Update Log

### Update Entry

- Date: 2026-08-12
- Trigger: Repeated remote prebuilt `ENOENT` after successive `.vercelignore` exceptions.
- Summary of change: Established that `logs/server.log` is a tracked Git artifact and that `/src` exclusion is a second deterministic file-path-map conflict.
- Sections refreshed: all sections.

### Update Entry

- Date: 2026-08-14
- Trigger: Requested safe removal of the tracked log artifact before any broader remediation.
- Summary of change: Simulated `git rm` using a disposable index, confirmed the operation targeted only `logs/server.log`, then ran `git rm -- logs/server.log`. Post-operation checks confirmed one staged deletion, no staged implementation changes, and no tracked or on-disk `logs/server.log`.
- Sections refreshed: Inputs Reviewed, Confirmed Evidence, Update Log.

### Update Entry

- Date: 2026-08-14
- Trigger: Correct production prebuilt upload closure after the safe tracked-log removal.
- Summary of change: Removed `/src` from `.vercelignore.prebuilt`; `src/**` cannot be globally excluded because Vercel generated `filePathMap` contains `src/core/logger/*`. Removed the incorrect `src/` forbidden-trace classification and added a regression test requiring a traced source file in dry-run upload. Focused tests passed (30 tests); profile validation and typecheck passed. The existing local Vercel output correctly fails validation because it is stale and still references the removed log; CI must rebuild before deploy.
- Sections refreshed: Confirmed Evidence, Handoff Notes, Update Log.

### Update Entry

- Date: 2026-08-14
- Trigger: Authenticated production prebuilt validation became available.
- Summary of change: In a disposable worktree containing exactly the current patch, pulled the Production environment, ran a fresh `vercel build --prod`, activated the production prebuilt profile, and ran `vercel deploy --prebuilt --prod --dry --json`. The fresh artifact had no `logs/server.log` reference, required 23 `src/**` files, and passed artifact validation. Upload coverage passed with 4,390 files / 73,512,860 bytes under the 5,000-file / 83,886,080-byte budgets, 0 missing traced sources, and 0 forbidden uploads.
- Sections refreshed: Confirmed Evidence, Artifact Synchronization, Update Log.

### Update Entry

- Date: 2026-08-14
- Trigger: Ensure every local and CI Vercel action resolves the actual latest CLI rather than a stale pnpm dlx cache entry.
- Summary of change: Replaced active `pnpm dlx vercel@latest` invocations with `npm exec --yes vercel@latest --` in the wrapper and deployment workflows. A second authenticated disposable-worktree production build and prebuilt dry-run resolved Vercel CLI 59.0.0, had no `logs/server.log` trace, required 23 `src/**` paths, and passed upload closure validation with 4,390 files / 73,496,018 bytes, 0 missing, and 0 forbidden sources.
- Sections refreshed: Actions Performed, Confirmed Evidence, Update Log.
