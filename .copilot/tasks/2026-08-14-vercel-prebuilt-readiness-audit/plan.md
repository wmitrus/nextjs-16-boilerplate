# Vercel Prebuilt Readiness Audit Plan

## Task Metadata

- Task ID: `2026-08-14-vercel-prebuilt-readiness-audit`
- Objective: Produce an evidence-backed go/no-go assessment for the production Vercel prebuilt deployment path after recurring `ENOENT` failures.
- Scope: Independent audit of live workflow/code, all related prior task artifacts, official Vercel documentation, public Vercel/GitHub evidence, and reproducible validation.
- Non-goal: Make speculative production-setting changes or claim an external deploy succeeded without running it.
- Leantime: Existing incident task `98` located; status is in progress.

## Acceptance Standard

A `GO` recommendation requires all of the following:

- The source prebuilt artifact and its final dry-run upload plan satisfy every generated `filePathMap` reference that is not explicitly forbidden.
- Production migration has exactly one verified owner.
- The production workflow preserves the remote runtime environment contract and does not mask missing runtime configuration.
- Previous regression reports do not reveal an unaddressed recurrence path.
- Official Vercel documentation and public upstream evidence do not contradict the implementation model.
- Focused executable checks pass on current branch state.

A missing production workflow/deployment proof is a separate residual risk; it cannot be presented as proof that the deploy completed.

## Specialist Sequence

- [done] 06 Debug Investigation: reconciled prior incident/regression evidence and identified the forbidden-trace recurrence path.
- [done] 01 Architecture Guard: assessed configuration ownership and documentation/code drift.
- [done] 03 Next.js Runtime: assessed Build Output, tracing, and Next.js/Vercel runtime assumptions.
- [done] 05 Validation Strategy: defined the minimum credible readiness evidence.
- [done] External evidence review: official Vercel documentation and public upstream issue evidence support the remediation model.
- [done] Current-branch executable validation: full focused Vercel suite, deployment-profile gate, typecheck, formatting, and whitespace checks passed.
- [done] Consolidate findings into constraints and validation report.
- [blocked] Leantime task closure: task `98` stays in progress until a current-SHA hosted Production deployment is inspected as READY.

## Known Risks

- Vercel project settings and deployment behavior are external state; local evidence cannot substitute for a completed hosted production deployment.
- The Vercel CLI and Build Output contract may evolve; validators must test generated output and current CLI behavior rather than assume historical behavior.
- Existing worktree changes are pre-existing and must not be reverted or conflated with this audit.
- A local Production `vercel build --prod` is deliberately deferred because the verified external Build Command runs the real production migration. The protected GitHub Actions workflow is the appropriate execution boundary.

## Remediation Status

- [done] Fail closed when generated `filePathMap` metadata includes a forbidden source; the dry-run can no longer hide this mismatch.
- [done] Enforce Vercel Project Build Command as the single migration owner in the production validation gate.
- [done] Capture the production prebuilt deployment URL and require Vercel inspection to report `READY`, `production`, and `prebuilt: true`.
- [done] Retire the executable-looking Preview prebuilt SDD sample as valid YAML metadata that points to the live remote-build workflow.
- [done] A hosted Production run proved generated-artifact closure and Vercel READY/production state; its job failed only on an unsupported inspect-field assertion.
- [pending] Obtain one post-fix Production workflow run from the target SHA, preserving its fresh build, dry-run closure, real deploy, and inspected READY/production state.
