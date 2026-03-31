# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: `2026-03-31-next-16-2-upgrade-review`
- Task Objective: close the remaining Next.js 16.2 upgrade runtime questions against the live repository and provide a clean implementation handoff
- Current Run Scope: App Router error-boundary contract review, minimum runtime validation review, target patch confirmation, dependency compatibility note
- Status: COMPLETED
- Last Updated: 2026-03-31
- Related Control Artifacts: `plan.md`, `intake.md`, `01 - Architecture Guard - Summary.md`

## Scope Handled

- runtime entrypoints reviewed: `next.config.ts`, `src/proxy.ts`, `src/app/layout.tsx`
- App Router surfaces reviewed: `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/users/error.tsx`, `src/app/e2e-error/error.tsx`, `src/app/users/page.tsx`
- runtime questions in scope:
  - whether 16.2 error-boundary contract changes apply only to root/global or also to route-level `error.tsx`
  - whether `pnpm build` is mandatory for this task
  - which exact 16.2.x patch should be targeted
  - whether `@clerk/nextjs` or `@sentry/nextjs` present an obvious upgrade blocker

## Inputs Reviewed

- code paths reviewed:
  - `package.json`
  - `next.config.ts`
  - `src/proxy.ts`
  - `src/app/layout.tsx`
  - `src/app/error.tsx`
  - `src/app/global-error.tsx`
  - `src/app/users/error.tsx`
  - `src/app/e2e-error/error.tsx`
  - `src/app/users/page.tsx`
  - `src/app/onboarding/actions.ts`
  - `src/features/security-showcase/actions/showcase-actions.ts`
  - `src/app/error.test.tsx`
  - `src/app/global-error.test.tsx`
  - `node_modules/next/package.json`
  - `node_modules/next/error.d.ts`
  - `node_modules/@clerk/nextjs/package.json`
  - `node_modules/@sentry/nextjs/package.json`
  - `.github/README.md`
- runtime docs reviewed:
  - `https://nextjs.org/docs/app/api-reference/file-conventions/error`
  - `https://nextjs.org/docs/app/api-reference/config/next-config-js/logging`
  - `https://nextjs.org/blog/next-16-2`
  - `https://nextjs.org/blog/next-16-2-turbopack`
- earlier task artifacts reviewed:
  - `plan.md`
  - `intake.md`
  - `01 - Architecture Guard - Summary.md`

## Actions Performed

- server/client boundary review performed: yes
- route handler / server action review performed: yes
- proxy review performed: yes
- cache / runtime review performed: yes

## Current-State Findings

- Confirmed:
  - the 16.2 retry contract is a framework-level App Router file-convention concern, not a root-only concern
  - `global-error.tsx` is explicitly covered by the 16.2 docs and can use `unstable_retry`
  - the route-level boundaries `src/app/users/error.tsx` and `src/app/e2e-error/error.tsx` should be treated as in-scope for consistency with the App Router `error.tsx` contract
  - `pnpm build` should be mandatory for this task because this is a Next.js minor upgrade and the repo already treats build as a meaningful CI gate
  - the current latest documented 16.2 patch is `16.2.1`, which is the correct target to record instead of a loose `16.2.x`
  - installed peer dependency metadata shows no obvious compatibility blocker for `@clerk/nextjs` or `@sentry/nextjs`
- Risks:
  - changing only `src/app/error.tsx` and `src/app/global-error.tsx` would leave route-level App Router boundaries inconsistent with the new runtime contract
  - relying on unit tests and typecheck without `pnpm build` would under-validate the framework upgrade
  - treating `ErrorInfo` from `next/error` as already proven by the current install would be incorrect because the installed `16.1.7` package surface does not yet prove the post-upgrade typing contract
- Drift:
  - the current local `node_modules/next/error.d.ts` from `16.1.7` only re-exports legacy pages `_error` types, so the final import shape must be confirmed after the version bump
  - the initial task package understated the route-level error-boundary surface and omitted the build gate

## Runtime Boundary Assessment

- server vs client placement:
  - the relevant App Router error boundaries are correctly implemented as Client Components today
  - adopting `unstable_retry` does not require moving logic across the server/client boundary
  - server actions already exist in the repo, so development logging behavior around server functions is relevant and should not be disabled as part of this task
- edge vs node placement:
  - `src/proxy.ts` is runtime-sensitive request interception logic and should remain out of scope for behavioral change in this baseline upgrade
  - nothing in this baseline task requires runtime switching or new edge/node mixing
- route handler / page / layout responsibilities:
  - the error-boundary contract change belongs in App Router file-convention boundaries, not in shared abstractions
  - `src/app/users/page.tsx` is already client-heavy and has its own custom boundary, but that does not remove the need to keep `src/app/users/error.tsx` aligned with the framework contract
  - `src/app/global-error.tsx` must retain its own `<html>` and `<body>` tags
- proxy responsibilities:
  - proxy should not be treated as part of error recovery semantics for this task
  - auth-sensitive routing in `src/proxy.ts` is a strong reason to keep cached-navigation-style experiments out of scope here

## Caching And Revalidation Notes

- cache-sensitive observations:
  - this repo already uses `cacheComponents: true`, so adding other navigation or caching experiments without dedicated review would increase runtime risk disproportionately
  - because the app has auth-sensitive routing and user-specific flows, the baseline upgrade should avoid experimental navigation caching changes
- revalidation observations:
  - the purpose of `unstable_retry` is materially different from `reset()` because it retries by re-fetching and re-rendering the boundary subtree rather than only clearing local error state
  - this makes `unstable_retry` the correct default for these App Router error boundaries unless implementation finds a specific file that intentionally needs `reset()` semantics
- request-time vs build-time notes:
  - the current task is request-time behavior sensitive, but build output remains the most important minimum verification surface for the framework upgrade

## Runtime Decisions / Constraints

- approved runtime constraints:
  - target `next@16.2.1` and matching `eslint-config-next`
  - include route-level `error.tsx` files in the runtime contract update scope
  - preserve `withSentryConfig`, existing Sentry capture, and existing client logging behavior
  - require `pnpm build` in addition to typecheck, lint, and targeted test updates
  - keep experimental features such as `cachedNavigations`, `prefetchInlining`, `appNewScrollHandler`, `sri`, and `turbopack.ignoreIssue` out of the baseline implementation
- rejected directions:
  - updating only root/global error files
  - treating the current `node_modules` typings as proof of the 16.2 `ErrorInfo` import contract
  - declaring the upgrade validated without a production build
- runtime assumptions requiring validation:
  - after upgrading, confirm the actual `next/error` typing surface and adapt the implementation accordingly
  - confirm the boundary tests still reflect the final contract shape after the version bump

## Artifact Synchronization

- `plan.md` updates:
  - mark Next.js Runtime review complete
  - update specialist status so Implementation is the next required step
  - remove runtime questions from the active unknowns list and replace them with implementation-level validation notes
- `intake.md` updates:
  - convert the runtime questions into resolved decisions
  - keep only implementation-time validation notes open
- `implementation-plan.md` updates:
  - not created yet
- specialist artifact updates:
  - this summary created as the persistent Next.js Runtime artifact

## Open Questions / Blockers

- unresolved questions:
  - none that block implementation of the baseline upgrade
- blockers:
  - none at runtime-review level
- evidence still needed:
  - post-upgrade typecheck and build confirmation of the exact `ErrorInfo` import shape

## Handoff Notes

- what the next agent should rely on:
  - the baseline upgrade is runtime-safe if it stays narrow
  - the App Router error-boundary change scope includes route-level `error.tsx` files in this repo
  - `pnpm build` is mandatory for this task
  - the target patch should be `16.2.1`
  - Clerk and Sentry do not show an obvious peer-range blocker from installed metadata
- what should not be re-decided without new evidence:
  - experimental runtime flags should remain out of scope
  - proxy behavior should not be changed for this task
  - the task should not be considered complete without build validation
- recommended next specialist or step:
  - `04 - Implementation Agent`

## Update Log

### Update Entry

- Date: 2026-03-31
- Trigger: user requested the dedicated Next.js Runtime review to answer the remaining framework-contract questions before implementation
- Summary of change: reviewed the live App Router surfaces, runtime docs, and installed package metadata; closed the scope, validation, patch-target, and compatibility questions; recorded the implementation handoff
- Sections refreshed: all
