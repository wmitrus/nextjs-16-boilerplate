# 04 - Implementation Agent - Summary

## Task Context

- Task ID: `2026-03-31-next-16-2-upgrade-review`
- Task Objective: implement the Next.js 16.2.1 upgrade within the architectural and runtime constraints established by the Architecture Guard and Next.js Runtime specialist reviews
- Current Run Scope: all six implementation tasks from `plan.md` — version bump, logging config, PostCSS rename + drift cleanup, error boundary contract update, test updates, full quality gate run
- Status: COMPLETED
- Last Updated: 2026-03-31
- Related Control Artifacts: `plan.md`, `intake.md`, `01 - Architecture Guard - Summary.md`, `03 - Next.js Runtime - Summary.md`

## Scope Handled

- files changed: `package.json`, `next.config.ts`, `postcss.config.ts` (created), `AGENTS.md`, `.github/labeler.yml`, `docs/tanstack-migration/02-foundation.md`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/users/error.tsx`, `src/app/e2e-error/error.tsx`, `src/app/error.test.tsx`, `src/app/global-error.test.tsx`, `src/app/users/error.test.tsx`
- files deleted: `postcss.config.mjs`
- layers touched: delivery config, App Router error-boundary file conventions, test layer, repository metadata

## Inputs Reviewed

- code paths reviewed:
  - `package.json`
  - `next.config.ts`
  - `postcss.config.mjs`
  - `src/app/error.tsx`
  - `src/app/global-error.tsx`
  - `src/app/users/error.tsx`
  - `src/app/e2e-error/error.tsx`
  - `src/app/error.test.tsx`
  - `src/app/global-error.test.tsx`
  - `src/app/users/error.test.tsx`
  - `AGENTS.md`
  - `.github/labeler.yml`
  - `docs/tanstack-migration/02-foundation.md`
  - `tests/setup.tsx`
  - `node_modules/next/dist/client/components/error-boundary.d.ts`
- task artifacts reviewed:
  - `plan.md`
  - `intake.md`
  - `01 - Architecture Guard - Summary.md`
  - `03 - Next.js Runtime - Summary.md`

## Actions Performed

### Task 1 — Version bump

- `package.json`: `next` bumped from `16.1.7` to `16.2.1`; `eslint-config-next` bumped from `16.1.7` to `16.2.1`
- `pnpm install` regenerated `pnpm-lock.yaml` with no peer-dependency errors
- `ErrorInfo` type confirmed from `node_modules/next/dist/client/components/error-boundary.d.ts`:
  ```typescript
  export type ErrorInfo = {
    error: Error;
    reset: () => void;
    unstable_retry: () => void;
  };
  ```
  Both `reset` and `unstable_retry` are present; `error` is plain `Error` (no `digest`), requiring a local type cast to access `error.digest`

### Task 2 — Logging config

- `next.config.ts`: added `logging: { browserToTerminal: 'warn' }` inside `nextConfig`
- `withSentryConfig` wrapper, `cacheComponents`, `reactCompiler`, `serverExternalPackages`, and `experimental` keys left unchanged

### Task 3 — PostCSS rename + drift cleanup

- `postcss.config.mjs` deleted
- `postcss.config.ts` created with identical plugin config (`@tailwindcss/postcss: {}`) in TypeScript ESM format
- `AGENTS.md`: `postcss.config.mjs` → `postcss.config.ts`; `next: 16.1.6` → `next: 16.2.1`
- `.github/labeler.yml`: `postcss.config.mjs` → `postcss.config.ts`
- `docs/tanstack-migration/02-foundation.md`: `postcss.config.mjs` → `postcss.config.ts`
- grep confirmed no remaining `postcss.config.mjs` references in live source paths

### Task 4 — Error boundary contract update

All four App Router error boundaries updated to the 16.2.1 `ErrorInfo` contract:

- `import type { ErrorInfo } from 'next/error'` added to all four files
- props destructured as `{ error, unstable_retry }: ErrorInfo`; `reset` retained as a silent prop (required by the type, not used in any button)
- `unstable_retry()` used as the retry button `onClick` handler in all four files
- `error.tsx` and `global-error.tsx`: `digest` extracted as a primitive constant (`const digest = (error as Error & { digest?: string }).digest`) to avoid closure cast in the `useEffect` dependency array; Sentry `captureException` call preserved; `useEffect` deps updated to `[error, digest]`
- `global-error.tsx`: `<html lang="en"><head>...</head><body>...</body></html>` wrapper and all inline `React.CSSProperties` style objects retained
- `users/error.tsx`: no Sentry added; pino logger preserved; `useEffect` deps kept as `[error]`
- `e2e-error/error.tsx`: pino child logger preserved; `useEffect` deps kept as `[error]`

### Task 5 — Test updates

- `tests/setup.tsx` inspected: `@sentry/nextjs` is not globally mocked
- `src/app/error.test.tsx`: `vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))` added; render updated to pass `reset={vi.fn()}` and `unstable_retry={vi.fn()}`; assertion updated to `expect(unstable_retry).toHaveBeenCalled()`
- `src/app/global-error.test.tsx`: same Sentry mock pattern; same prop and assertion update
- `src/app/users/error.test.tsx`: identified as missed during initial Task 5 scope (plan listed only root and global); updated to pass `reset={vi.fn()}` and `unstable_retry={vi.fn()}`; assertion updated from `reset` to `unstable_retry`; test description updated

### Task 6 — Quality gate run

All eight gates confirmed passing by the user:

| Gate                    | Result |
| ----------------------- | ------ |
| `pnpm typecheck`        | PASS   |
| `pnpm lint --fix`       | PASS   |
| `pnpm test`             | PASS   |
| `pnpm test:integration` | PASS   |
| `pnpm build`            | PASS   |
| `pnpm skott:check:only` | PASS   |
| `pnpm depcheck`         | PASS   |
| `pnpm env:check`        | PASS   |

## Findings During Implementation

- `users/error.test.tsx` was out of scope in the original Task 5 definition but required updating because it still rendered with only `reset` (without `unstable_retry`), causing a TypeScript error once `ErrorInfo.unstable_retry` became non-optional in 16.2.1
- the `digest` primitive extraction pattern (instead of passing the cast object to the `useEffect` dep array) is cleaner and avoids potential React Compiler and ESLint dep-array concerns
- the `if (error instanceof Error)` guard around `Sentry.captureException` was simplified out since `ErrorInfo.error: Error` guarantees the type; this is a minor cleanup, not a behavioral change

## Constraints Respected

- `withSentryConfig`, `cacheComponents`, `reactCompiler`, `serverExternalPackages`, and `experimental.turbopackFileSystemCacheForDev` left unchanged
- experimental flags (`cachedNavigations`, `prefetchInlining`, `appNewScrollHandler`, SRI, `turbopack.ignoreIssue`) kept out of scope as directed by the runtime specialist
- `src/proxy.ts` not touched
- no new shared abstractions introduced for error-boundary logic
- all changes stayed within the delivery and test layers

## Open Questions / Residual Risk

- none blocking — all quality gates passed
- the EVALUATE items from `requirements.md` (SRI, `prefetchInlining`, `cachedNavigations`, `appNewScrollHandler`, `turbopack.ignoreIssue`) remain deferred; they require dedicated branch evaluation, not included here
- `07 - Playwright E2E` was noted as optional for this baseline; no E2E regressions are expected given the error-boundary changes are UI-only and all build/integration gates passed

## Update Log

### Update Entry

- Date: 2026-03-31
- Trigger: all six implementation tasks completed and all eight quality gates confirmed passing by user
- Summary of change: recorded full implementation execution, findings, and gate results
- Sections refreshed: all
