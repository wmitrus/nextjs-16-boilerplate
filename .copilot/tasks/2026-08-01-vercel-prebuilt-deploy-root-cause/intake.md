# Intake

## Request

Investigate the production Vercel deployment failure during:

```shell
vercel deploy --prebuilt --prod
```

The server-side build failed while retrieving deployment files with an `ENOENT` for a pnpm-managed OpenTelemetry file under repository `node_modules`.

## User Goal

Produce a senior, evidence-driven root-cause analysis that explains:

- why a prebuilt production deployment referenced repository `node_modules` paths;
- whether that is valid under the Vercel Build Output contract;
- why the problem began only at this point in time;
- whether the trigger was a Next.js minor update, Vercel CLI change, dependency/import change, ignore behavior, cache loss, or an external Vercel regression;
- what is the actual root cause rather than merely the immediate `ENOENT` mechanism.

After root cause confirmation, select a production-safe remediation plan without
guesswork and explicitly separate final remediation from any investigative
prototype work.

## Observed Symptom

- Vercel CLI reported version `58.4.4` on Node.js `24.18.0`.
- `vercel deploy --prebuilt --prod` uploaded approximately `4.4 MB`.
- The remote build reported that previous build caches were unavailable.
- Retrieval of deployment files failed on `lstat` for a path under `node_modules/.pnpm/@opentelemetry+api@1.9.0/.../context.js`.
- The new deployment failed; the supplied evidence does not show an already-running production deployment becoming corrupt.

## Scope

- Production deployment workflow and commands.
- Vercel project/build configuration and ignore rules.
- Next.js, Vercel CLI, pnpm, tracing, Sentry/New Relic/OpenTelemetry dependency history.
- Generated `.vercel/output` metadata and prebuilt upload file selection.
- GitHub Actions and available local/CI deployment logs.
- Relevant commit history around the last successful and first failing deploy.

## Out Of Scope

- Implementing a workaround before the failure chain is proven.
- Broad dependency upgrades or observability refactors.
- Declaring OpenTelemetry or New Relic defective solely because its file was first in the error.
- Treating removal of `node_modules` from an ignore file as a final fix without a controlled artifact/upload comparison.

## Investigation Questions

1. Which commit and workflow run form the success/failure boundary?
2. Did Vercel CLI, Next.js, pnpm lock data, observability packages, workflow steps, or ignore rules change at that boundary?
3. Which generated function configuration references the missing path, and is it relative to the project root or self-contained function directory?
4. Does the Build Output contain the referenced file or rely on the deploy uploader to include it?
5. Does the uploader omit it because of `.vercelignore`, because of symlink handling, because of prebuilt semantics, or because metadata is malformed?
6. Can the behavior be reproduced with the same commit and toolchain, and can one-variable controls falsify each hypothesis?
7. Is `Previous build caches not available` causal, contributory, or merely diagnostic context?

## Readiness Checklist

- [done] Symptom and user objective normalized.
- [done] Claims from the prior analysis marked as hypotheses rather than inherited conclusions.
- [done] Leantime task lifecycle opened: milestone `97`, task `98`.
- [done] Leantime task `98` reopened to `Do oceny` for post-merge production deploy verification.
- [done] Historical success/failure boundary identified.
- [done] Reproduction inputs and environment versions captured.
- [done] Controlled checks completed.
- [done] Root-cause confidence and residual uncertainty documented.
- [done] Production remediation decision captured: Variant A, contract-aligned prebuilt deploy.
- [done] Prototype remediation separated from the final production plan.
- [done] Preview source-upload regression reproduced and attributed to the
  shared production `/src` exclusion.
- [done] Preview-safe and production-prebuilt upload profiles separated and
  validated against real Vercel CLI dry-run plans.

## Final Decision

Variant A is the accepted remediation direction for this task:

- keep Vercel prebuilt deployment;
- keep New Relic;
- resolve `vercel@latest` dynamically through `pnpm dlx` and retain artifact
  and upload-plan guards as the per-release compatibility check;
- remove user `.vercelignore` rules for directories legally referenced by
  generated `filePathMap`, especially `.next` and `node_modules`;
- keep only truly sensitive or unnecessary root-path ignores;
- validate `Object.values(filePathMap)` as source paths;
- fail closed on missing or escaping source paths in raw metadata;
- require every allowed runtime source in the dry-run upload and reject every
  forbidden source present in that upload;
- enforce upload file-count and byte-size budgets against a fresh baseline.
- keep preview as a Vercel-owned remote source build with a preview-safe default
  `.vercelignore` and a required-source dry-run guard;
- activate the stricter `.vercelignore.prebuilt` only after the local production
  build and before prebuilt dry-run/deploy.

The prior phase-based implementation under
`.copilot/tasks/2026-08-01-vercel-prebuilt-node-modules-deploy/` is retained
only as an archived investigative prototype. Its sanitizer, manual package
allowlist, and `next.config.ts` tracing-exclude workaround are not part of the
accepted production solution.

## Closure State

The `.copilot` task is closed locally as implementation-complete. The Leantime
task remains open in `Do oceny` because the last proof requires merging this PR
and observing the real production deployment workflow.

## Sensitive Data Handling

All tokens, keys, deployment identifiers that could be sensitive, and credential-shaped values must be represented as `[REDACTED]` in committed artifacts.
