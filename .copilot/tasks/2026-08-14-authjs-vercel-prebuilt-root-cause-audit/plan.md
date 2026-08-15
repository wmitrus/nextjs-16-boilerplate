# Investigation Plan

## Status

`SECOND PRODUCTION RUNTIME CORRECTION VALIDATED LOCALLY` - hosted smoke exposed
an invalid reserved deployment-ID contract after the trace fix. Source and
artifact guards are corrected; a fresh staged Production run remains pending.

## Decision Gates

No auth or deployment fix is accepted until these gates are satisfied:

1. Hosted deployment identity is proven: URL/alias -> deployment ID -> commit SHA
   -> build mode -> effective environment.
2. The failing AuthJS transition is tied to a concrete request, response status,
   content type, cancellation/error signal, and matching server log when one
   exists.
3. Source-to-artifact equivalence is checked for the affected route and runtime
   dependencies rather than inferred from a successful build/deploy status.
4. The prebuilt upload contract is compared with official Vercel documentation
   and a fresh, unmodified `.vercel/output` plus dry-run upload plan.

## Specialist Sequence

- [x] Workflow Orchestrator: normalize scope, create workspace, link Leantime.
- [x] Debug Investigation: reconstructed the cross-deployment timeline and ranked
      hypotheses with evidence for and against.
- [x] Next.js Runtime: classified PPR/Flight behavior, `connection()`, session reads,
      build output, and Vercel runtime boundaries.
- [x] Security & Auth: verified the signed-in predicate and preserved AuthJS
      trust, session, redirect, and provider-isolation constraints.
- [x] Architecture Guard: approved the minimum provider-aligned design.
- [x] Validation Strategy: defined proof that distinguishes source,
      artifact, deploy, and runtime behavior.
- [x] Implementation Agent: removed both trace overrides, made artifact
      validation relational, and corrected machine-readable deploy output
      handling.
- [x] Playwright E2E: captured the failing hosted request chain and added final
      browser behavior against the identified deployment.
- [ ] Workflow Orchestrator: synchronize this workspace and the previous Copilot
      task artifacts, then close Leantime with time logging.

### D. Production Runtime Deployment ID

- [x] Correlated the two hosted smoke failures with the exact Vercel function
      launcher error.
- [x] Reproduced Next.js enabling `runtimeServerDeploymentId` when
      `NEXT_DEPLOYMENT_ID` is present in Vercel builder context.
- [x] Replaced the reserved variable with
      `VERCEL_PREBUILT_DEPLOYMENT_ID` and retained custom prebuilt Skew
      Protection.
- [x] Added source/workflow guards and generated-artifact validation.
- [ ] Run a fresh staged Production deployment, pass both immutable smoke tests,
      promote, and pass both canonical URL smoke tests.

## Workstreams

### A. Vercel Build And Prebuilt Contract

- [x] Read the August prebuilt task chain and reconstructed each claimed Vercel CLI
      behavior change from package/upstream evidence.
- [x] Compared Preview source deployment and Production prebuilt workflows,
      `.vercelignore` profiles, build commands, env pulling, and migration ownership.
- [x] Verified artifact validators check generated `filePathMap` source values,
      upload inclusion, repository containment, and size/file budgets without editing
      generated metadata.
- [x] Checked official current Vercel guidance for `vercel build`,
      `vercel deploy --prebuilt`, environment targeting, Build Output API, and ignore
      behavior.
- [x] Determined that a successful deploy can still serve a broken traced artifact
      and defined a reproducible source-to-deployment provenance check.

### B. AuthJS Root Cause

- [x] Identified the last known working Preview and affected deployments showing the
      loading fallback / `Connection closed.` symptom.
- [x] Diffed sign-in, auth route, session, bootstrap, layout, proxy, Next.js version,
      and build/deploy inputs across that boundary.
- [x] Inspected current `getServerSession()` and `getToken()` behavior in the
      installed NextAuth version and their Next.js 16 dynamic/PPR implications.
- [x] Captured browser network/console evidence for document, Flight,
      `/api/auth/*`, and bootstrap requests against the exact deployment.
- [x] Distinguished normal navigation cancellation from truncated server output,
      stale PPR/cache output, malformed AuthJS response, and source/artifact mismatch.

### C. Decision And Validation

- [x] Wrote specialist findings and consolidated decision/evidence artifacts.
- [x] Selected one remediation after hosted logs falsified the auth hypotheses.
- [x] Validated a fresh build with worker usage capped at 16 without treating the
      cap itself as an auth fix.
- [ ] Validate the fresh CI prebuilt artifact and dry-run upload plan.
- [x] Ran focused validators, typecheck, and the production build.
- [ ] Rerun the corrected two-test hosted browser smoke against the exact newly
      deployed artifact; the deployment itself and manual sign-in are confirmed.
- [x] Recorded lint as skipped while the repository's temporary ESLint blocker is
      active.

## Hypothesis Disposition

- H1 confirmed as the browser symptom: the Flight continuation closed.
- H2 falsified: the hosted function failed before AuthJS session logic could run;
  `getToken()` was reverted.
- H3 partially confirmed: deployment identity matched, but generated function
  packaging omitted a required Next.js runtime file.
- H4 falsified: no AuthJS protocol response caused the initial failure.
- H5 confirmed with conditions: the split source Preview / prebuilt Production
  model is supported with pinned tooling, artifact closure, and staged promotion.

## Current Constraints

- Do not run ESLint while the documented blocker remains active.
- Do not run an unrestricted high-concurrency build; the existing cap remains in
  place during investigation, but its configuration is subject to review.
- Do not call the incident resolved until fresh hosted artifact and browser gates
  pass.
