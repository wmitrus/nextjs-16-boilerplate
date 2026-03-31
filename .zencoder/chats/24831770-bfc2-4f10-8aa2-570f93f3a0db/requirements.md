# PRD — Next.js 16.2 Upgrade

**Revision**: v2 — updated after Architecture Guard (01) and Next.js Runtime (03) specialist reviews.
**Changes from v1**: target pinned to 16.2.1; route-level error boundaries added to scope; `pnpm build`
added as mandatory verification gate; PostCSS rename expanded to include repository drift cleanup;
AGENTS.md version-string drift added to scope; OQ-01/OQ-03/OQ-04/OQ-05 resolved.

---

## Title

Upgrade Next.js from 16.1.7 to 16.2.1 and adopt high-value 16.2 features

## Objective

Advance this production-grade boilerplate to Next.js 16.2.1 to gain ~87% faster dev startup, ~50% faster
RSC rendering, improved developer observability (Server Function logging, hydration diff overlay, browser
log forwarding), and to adopt stable new APIs where they align with the existing architecture. The upgrade
must preserve the current security posture, module boundaries, and all quality gates.

## Problem Statement

The project is pinned to Next.js 16.1.7. Next.js 16.2 delivers measurable performance improvements at both
dev and runtime (RSC payload deserialization, Turbopack Server Fast Refresh, tree shaking) and introduces
several developer-experience and observability features directly relevant to this codebase. It also ships
experimental APIs (`unstable_retry`, `unstable_catchError`, `prefetchInlining`, `cachedNavigations`,
`appNewScrollHandler`) that warrant deliberate evaluation before adoption. Remaining on 16.1.7 means missing
verified performance gains that require zero architectural change to obtain.

Architecture Guard review confirmed the baseline upgrade is low-risk. Next.js Runtime review confirmed the
full App Router error-boundary contract scope and that `pnpm build` is mandatory. Two gaps from the initial
PRD are resolved: the error-boundary surface was understated (only root/global files were listed), and the
build gate was omitted.

## Source Inputs

- Official release post: https://nextjs.org/blog/next-16-2
- Turbopack deep-dive: https://nextjs.org/blog/next-16-2-turbopack (referenced in post)
- AI Improvements deep-dive: https://nextjs.org/blog/next-16-2-ai (referenced in post)
- Analyst summary (Polish): provided by user (covers recommendations and cautions per-feature)
- Architecture Guard specialist review: `.copilot/tasks/2026-03-31-next-16-2-upgrade-review/01 - Architecture Guard - Summary.md`
- Next.js Runtime specialist review: `.copilot/tasks/2026-03-31-next-16-2-upgrade-review/03 - Next.js Runtime - Summary.md`
- Live code reviewed: `package.json`, `next.config.ts`, `postcss.config.mjs`,
  `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/users/error.tsx`,
  `src/app/e2e-error/error.tsx`, `src/app/error.test.tsx`, `src/app/global-error.test.tsx`,
  `.github/labeler.yml`, `AGENTS.md`, `docs/tanstack-migration/02-foundation.md`

---

## Scope

### IN — Safe, high-value, immediate

| #    | Feature                                                                   | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | Upgrade `next` + `eslint-config-next` to `16.2.1`                         | Core upgrade; all other changes depend on this. Target is pinned to `16.2.1` (the documented current patch; confirmed by Next.js Runtime review).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| S-02 | Add `logging.browserToTerminal: 'warn'` to `next.config.ts`               | Stable API since 16.2.0. Dev-only, no production impact. High value for agent-assisted development and security-showcase debugging. Setting `'warn'` (not `true`) avoids terminal flooding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| S-03 | Verify `logging.serverFunctions` default is active                        | Server Function logging is on by default in 16.2. No code change expected, but confirm the config does not inadvertently disable it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| S-04 | Rename `postcss.config.mjs` → `postcss.config.ts` and clean up repo drift | Turbopack now supports `.ts` PostCSS config. The project is TypeScript-first. Not purely a file rename — three additional files reference `postcss.config.mjs` and must be updated: `AGENTS.md`, `.github/labeler.yml`, `docs/tanstack-migration/02-foundation.md`. Additionally, `AGENTS.md` currently reports `next` as `16.1.6` while `package.json` is `16.1.7`; both version references must be corrected to `16.2.1` after the upgrade.                                                                                                                                                                                                                                                        |
| S-05 | Adopt `unstable_retry` across the full App Router error-boundary surface  | The 16.2 release post states `unstable_retry` is expected to be preferred over `reset()` for most error recovery. The Next.js Runtime review confirmed the file-convention contract applies to all `error.tsx` files in the App Router, not only root/global. All four in-scope boundaries use `reset()` today and must be updated for consistency: `src/app/error.tsx` (root, has Sentry), `src/app/global-error.tsx` (global, has Sentry, must retain `<html>`/`<body>` tags), `src/app/users/error.tsx` (route-level, no Sentry), `src/app/e2e-error/error.tsx` (test fixture route, no Sentry). The `unstable_` prefix is accepted risk for a boilerplate; it must not be wrapped or abstracted. |
| S-06 | Run full quality-gate suite including production build                    | See R-05. `pnpm build` is explicitly mandatory per the Next.js Runtime review — a framework minor upgrade cannot be validated by unit tests and typecheck alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### EVALUATE — Experimental or architecturally intersecting (on a separate branch, not main)

| #    | Feature                            | Rationale                                                                                                                                                                                                                                                                                                                              |
| ---- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01 | Turbopack SRI for JavaScript       | The blog explicitly links SRI to CSP as an alternative to nonce-based approaches. This project has a nonce-based CSP enforced in `src/security/`. Mixing nonce-based and SRI-based CSP is complex and could silently degrade the security posture. Evaluate on a dedicated branch; Security & Auth agent must sign off before merging. |
| E-02 | `experimental.prefetchInlining`    | Bundles all segment data per link into one prefetch response. Trade-off: fewer requests, but shared layout data is duplicated across prefetch responses instead of being reused from cache. The project already has `cacheComponents: true`. Evaluate only if prefetch request volume is a measured problem.                           |
| E-03 | `experimental.cachedNavigations`   | Caches Server Component data from navigations. Requires `cacheComponents: true` (already enabled). The Next.js Runtime review flags that this project has auth-sensitive routing in `src/proxy.ts`; experimental navigation caching must be validated against auth and tenant-sensitive routes before enabling.                        |
| E-04 | `experimental.appNewScrollHandler` | Reworked scroll and focus management via React Fragment refs. A11y improvement. Low risk. Evaluate and enable if no E2E regressions.                                                                                                                                                                                                   |
| E-05 | `turbopack.ignoreIssue`            | Only adopt if specific known false-positive or vendor warnings are identified during or after the upgrade. Do not preemptively add ignore rules.                                                                                                                                                                                       |

### OUT — Explicitly excluded

| #    | Feature                              | Rationale                                                                                                                                                                       |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-01 | New default error page               | Project has `src/app/error.tsx` and `src/app/global-error.tsx`. The fallback page is irrelevant.                                                                                |
| O-02 | Dev lock file                        | Fully automatic; zero config needed.                                                                                                                                            |
| O-03 | `@vercel/next-browser`               | Experimental agent-tooling package. Not production code. Not applicable to application runtime.                                                                                 |
| O-04 | AGENTS.md creation                   | Project already has a comprehensive `AGENTS.md` at the root. Updating the version string within it is in scope (S-04).                                                          |
| O-05 | CLAUDE.md creation                   | Already exists at `/CLAUDE.md`.                                                                                                                                                 |
| O-06 | `.mcp.json` / next-devtools-mcp      | Already exists and configured with `next-devtools-mcp@latest`.                                                                                                                  |
| O-07 | Adapter API adoption                 | Project deploys to Vercel. No application-level code change needed today.                                                                                                       |
| O-08 | `unstable_catchError()` component    | Experimental; adds architectural complexity beyond the existing App Router file-convention boundaries. Not appropriate for the boilerplate baseline without a defined use case. |
| O-09 | `transitionTypes` on `<Link>`        | View Transitions are an enhancement, not a boilerplate baseline requirement.                                                                                                    |
| O-10 | `next start --inspect` / dev tooling | Available automatically after upgrade; no code change required.                                                                                                                 |
| O-11 | `src/proxy.ts` changes               | The Next.js Runtime review explicitly keeps proxy behavior out of scope for this baseline task.                                                                                 |

---

## Requirements

### R-01 — Version bump

- Upgrade `next` in `package.json` `dependencies` from `16.1.7` to `16.2.1`.
- Upgrade `eslint-config-next` in `devDependencies` from `16.1.7` to `16.2.1`.
- Re-run `pnpm install` and commit the updated lockfile.
- Verify no peer-dependency warnings for `react`/`react-dom` (both currently at `19.2.4`).
- Note: installed metadata for `@clerk/nextjs` and `@sentry/nextjs` shows no obvious peer-range blocker,
  but the final typing and build behavior must be confirmed after the upgrade.

### R-02 — logging.browserToTerminal

- Add `logging` key to `nextConfig` in `next.config.ts`.
- Set `browserToTerminal: 'warn'` (not `true`; avoids flooding terminal with info-level browser logs).
- Do not disable `serverFunctions` — let the 16.2 default apply.
- Keep `withSentryConfig` wrapper intact; the `logging` key is added inside `nextConfig`, not inside the
  Sentry options.

### R-03 — postcss.config.ts rename and repo drift cleanup

- Rename `postcss.config.mjs` to `postcss.config.ts`.
- Update file content to TypeScript ESM syntax; add explicit typing if inference is insufficient.
- Verify Turbopack picks up the renamed config during `pnpm dev`.
- Update all files that reference `postcss.config.mjs` explicitly:
  - `AGENTS.md` — update `postcss.config.mjs` reference to `postcss.config.ts`
  - `AGENTS.md` — also correct the `next` version string from `16.1.6` to `16.2.1`
  - `.github/labeler.yml` — update `postcss.config.mjs` reference to `postcss.config.ts`
  - `docs/tanstack-migration/02-foundation.md` — update `postcss.config.mjs` reference to `postcss.config.ts`

### R-04 — Adopt unstable_retry across the full App Router error-boundary surface

The 16.2 App Router `error.tsx` file-convention contract change applies to all four boundaries.
Each file currently uses `reset: () => void` in an inline prop type. After the upgrade:

1. Confirm the exact `next/error` `ErrorInfo` type shape from the post-upgrade
   `node_modules/next/error.d.ts` before writing the implementations. The current 16.1.7 local package
   does not prove the 16.2 contract — the typing surface must be verified after `pnpm install`.

2. `src/app/error.tsx` (root boundary):
   - Accept `ErrorInfo` from `'next/error'` in place of the inline prop type.
   - Use `unstable_retry` as the primary "Try again" action.
   - Preserve Sentry `captureException` and structured pino logging in `useEffect` — must not be removed.

3. `src/app/global-error.tsx` (global boundary):
   - Accept `ErrorInfo` from `'next/error'`.
   - Use `unstable_retry` as the primary retry action.
   - Preserve the `<html>` and `<body>` wrapper tags — this is a Next.js requirement for global-error.
   - Preserve Sentry `captureException` and structured pino logging.

4. `src/app/users/error.tsx` (route-level boundary):
   - Accept `ErrorInfo` from `'next/error'`.
   - Use `unstable_retry` as the "Retry users page" action.
   - Preserve pino logger call in `useEffect`.
   - No Sentry integration in this file currently — do not add it.

5. `src/app/e2e-error/error.tsx` (test-fixture boundary):
   - Accept `ErrorInfo` from `'next/error'` for framework consistency.
   - Use `unstable_retry` as the "Retry" action.
   - This boundary is intentionally used in E2E tests to exercise the crash path. `unstable_retry`
     semantics (re-fetch + re-render) remain valid for the test fixture because the page will re-crash
     deterministically. No behavioral regression is expected.
   - Preserve the pino logger call.

6. Update corresponding test files:
   - `src/app/error.test.tsx` — update for the new prop shape.
   - `src/app/global-error.test.tsx` — update for the new prop shape.
   - These are the only test files confirmed to exist for error boundaries. If tests for `users/error.tsx`
     or `e2e-error/error.tsx` exist, update them; if not, do not create them in this task.

### R-05 — Quality gate passage (mandatory, blocking)

All of the following must pass cleanly after all changes are applied:

```text
pnpm install          (clean install after version bump)
pnpm typecheck        (no type errors)
pnpm lint --fix       (no unfixable lint errors; always use --fix not plain lint)
pnpm test             (unit tests green)
pnpm test:integration (integration tests green)
pnpm build            (production build must succeed — mandatory per Next.js Runtime review)
pnpm skott:check:only (no new circular dependencies)
pnpm depcheck         (no unused dependencies)
pnpm env:check        (env schema consistency)
```

Any failure in this list blocks the upgrade. `pnpm build` is not optional — a framework minor upgrade
cannot be validated without a production build verification.

---

## Scenarios / Use Cases

| ID    | Scenario                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-01 | Developer runs `pnpm dev`; no startup regression relative to `16.1.7` (upstream ~87% faster; the bar is no regression).                         |
| SC-02 | Developer triggers a browser console warning; it appears in the terminal (`browserToTerminal: 'warn'`).                                         |
| SC-03 | Developer invokes a Server Action; Next.js logs its name, arguments, timing, and source file in the terminal.                                   |
| SC-04 | A route causes a hydration mismatch; the error overlay shows a clear `+ Client / - Server` diff.                                                |
| SC-05 | Root error boundary is triggered; user clicks "Try again"; `unstable_retry()` re-fetches RSC data rather than only clearing client error state. |
| SC-06 | Users route error boundary is triggered; user clicks "Retry users page"; `unstable_retry()` re-fetches the users segment.                       |
| SC-07 | Global error boundary is triggered; user clicks "Refresh Application"; `unstable_retry()` is invoked.                                           |
| SC-08 | PostCSS-powered Tailwind CSS 4 styles compile correctly after `postcss.config.ts` rename.                                                       |
| SC-09 | All quality gates in R-05 pass, including `pnpm build`, without manual suppression.                                                             |

---

## Acceptance Criteria

- [ ] `next` is pinned to `16.2.1` in `package.json` and `pnpm-lock.yaml`.
- [ ] `eslint-config-next` is pinned to `16.2.1` in `package.json` and `pnpm-lock.yaml`.
- [ ] `next.config.ts` contains `logging.browserToTerminal: 'warn'`; `withSentryConfig` wrapper is intact.
- [ ] `postcss.config.mjs` no longer exists; `postcss.config.ts` exists with equivalent content.
- [ ] `AGENTS.md` references `postcss.config.ts` (not `.mjs`) and reports `next` as `16.2.1`.
- [ ] `.github/labeler.yml` references `postcss.config.ts` (not `.mjs`).
- [ ] `docs/tanstack-migration/02-foundation.md` references `postcss.config.ts` (not `.mjs`).
- [ ] All four error boundary files (`error.tsx`, `global-error.tsx`, `users/error.tsx`, `e2e-error/error.tsx`) accept `ErrorInfo` from `'next/error'` and use `unstable_retry`.
- [ ] Sentry capture and structured pino logging are preserved in `error.tsx` and `global-error.tsx`.
- [ ] `global-error.tsx` retains its `<html>` and `<body>` wrapper tags.
- [ ] `src/app/error.test.tsx` and `src/app/global-error.test.tsx` are updated and pass.
- [ ] All quality gates in R-05 pass, including `pnpm build`.
- [ ] No new circular dependencies (`skott`, `madge`).
- [ ] No new unused dependencies (`depcheck`).

---

## Verification Sources

| Source                                            | Purpose                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `package.json`                                    | Confirm `next` and `eslint-config-next` versions                          |
| `next.config.ts`                                  | Confirm `logging.browserToTerminal: 'warn'` and `withSentryConfig` intact |
| `postcss.config.ts`                               | Confirm rename and content                                                |
| `AGENTS.md`                                       | Confirm PostCSS and version drift corrections                             |
| `.github/labeler.yml`                             | Confirm PostCSS drift correction                                          |
| `docs/tanstack-migration/02-foundation.md`        | Confirm PostCSS drift correction                                          |
| All four `error.tsx` files                        | Confirm `ErrorInfo` type, `unstable_retry`, preserved logging             |
| `src/app/error.test.tsx`, `global-error.test.tsx` | Confirm test coverage of new prop shape                                   |
| `node_modules/next/error.d.ts` (post-upgrade)     | Confirm actual `ErrorInfo` type surface before implementation             |
| `pnpm typecheck` output                           | No type errors                                                            |
| `pnpm lint --fix` output                          | No unfixable lint errors                                                  |
| `pnpm test` output                                | Unit tests green                                                          |
| `pnpm test:integration` output                    | Integration tests green                                                   |
| `pnpm build` output                               | Production build succeeds                                                 |
| `pnpm skott:check:only` output                    | No circular deps                                                          |
| `pnpm depcheck` output                            | No unused deps                                                            |

---

## Affected Areas

**Configuration**

- `package.json` — version bump: `next`, `eslint-config-next`
- `pnpm-lock.yaml` — updated lockfile
- `next.config.ts` — `logging` section added

**PostCSS + drift cleanup**

- `postcss.config.mjs` → `postcss.config.ts` — renamed
- `AGENTS.md` — two corrections: PostCSS filename reference + `next` version string
- `.github/labeler.yml` — PostCSS filename reference updated
- `docs/tanstack-migration/02-foundation.md` — PostCSS filename reference updated

**App Router error boundaries**

- `src/app/error.tsx` — `ErrorInfo` type, `unstable_retry`, Sentry preserved
- `src/app/global-error.tsx` — `ErrorInfo` type, `unstable_retry`, Sentry preserved, `<html>/<body>` retained
- `src/app/users/error.tsx` — `ErrorInfo` type, `unstable_retry`
- `src/app/e2e-error/error.tsx` — `ErrorInfo` type, `unstable_retry`

**Tests**

- `src/app/error.test.tsx` — updated for new prop shape
- `src/app/global-error.test.tsx` — updated for new prop shape

---

## Constraints

| #    | Constraint                                                                                                                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Must not weaken or alter CSP / nonce architecture in `src/security/`. SRI evaluation (E-01) is a separate branch activity.                                                                                           |
| C-02 | Must not touch `src/proxy.ts` — no middleware behavior changes in scope (Next.js Runtime review decision).                                                                                                           |
| C-03 | Must not introduce any `experimental.*` flags to `next.config.ts`. Experimental flags (E-01 through E-05) go on a dedicated branch, not main.                                                                        |
| C-04 | `unstable_retry` must be imported from `'next/error'`. Its `unstable_` prefix is accepted; it must not be wrapped or abstracted away in a way that would hide a future breaking API change.                          |
| C-05 | `pnpm lint --fix` (not plain `pnpm lint`) must be used throughout.                                                                                                                                                   |
| C-06 | No new dependencies may be introduced beyond upgrading existing ones.                                                                                                                                                |
| C-07 | React Compiler (`reactCompiler: true`) and `cacheComponents: true` must remain enabled.                                                                                                                              |
| C-08 | Sentry integration must remain functional; `withSentryConfig` wrapper must not be removed or misconfigured.                                                                                                          |
| C-09 | `global-error.tsx` must retain its `<html>` and `<body>` wrapper tags — Next.js App Router requirement.                                                                                                              |
| C-10 | The `ErrorInfo` type import shape from `'next/error'` must be verified against the post-upgrade `node_modules` before being used in implementations. Do not assume the 16.1.7 local typings prove the 16.2 contract. |

---

## Execution Control

`manual-handoff` — The plan.md workflow requires user confirmation after each major phase:
Requirements (this document) → Technical Specification → Planning → Implementation.

---

## Environment / Preconditions

- Node.js 24.x (matches `.node-version` and `engines` field)
- pnpm (lockfile must be regenerated via clean `pnpm install` after version bump)
- All existing env vars from `.env.example` present in `.env.local` for dev and build verification
- `pnpm build` requires valid env vars for `NEXT_PUBLIC_*` variables

---

## Evidence Expectations

- Updated `package.json` (versions) and `pnpm-lock.yaml`
- Updated `next.config.ts` with `logging` block
- `postcss.config.ts` present; `postcss.config.mjs` absent
- `AGENTS.md`, `.github/labeler.yml`, `docs/tanstack-migration/02-foundation.md` with corrected references
- All four error boundary files updated and showing `ErrorInfo` import
- `src/app/error.test.tsx` and `global-error.test.tsx` updated
- Terminal output from all quality gates in R-05 (including `pnpm build`) showing pass status
- If any gate fails: explicit record of what failed and whether it is a blocker

---

## Open Questions

| #     | Status       | Question                                                                                                                                                                                                                                                         | Impact                                             |
| ----- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| OQ-01 | **Resolved** | Target version is `16.2.1`.                                                                                                                                                                                                                                      | Version pin in package.json                        |
| OQ-02 | Open         | Does `postcss.config.ts` require an explicit type annotation import or does `tsc` infer correctly?                                                                                                                                                               | Rename implementation detail; confirm after rename |
| OQ-03 | **Resolved** | `global-error.tsx` uses `reset()` — confirmed in scope for `unstable_retry`.                                                                                                                                                                                     | Covered in R-04                                    |
| OQ-04 | **Resolved** | No obvious peer-range blocker found for `@sentry/nextjs` or `@clerk/nextjs` from installed metadata. Final confirmation required post-build.                                                                                                                     | Risk low; watch for type or build errors           |
| OQ-05 | **Resolved** | `src/app/users/error.tsx` and `src/app/e2e-error/error.tsx` use `reset()` — both in scope.                                                                                                                                                                       | Covered in R-04                                    |
| OQ-06 | Open         | What is the exact `ErrorInfo` type shape exported by `node_modules/next/error.d.ts` after upgrading to `16.2.1`? The 16.1.7 package only re-exports legacy pages `_error` types. Confirm the correct import pattern post-upgrade before writing implementations. | Implementation must not assume; verify first       |
