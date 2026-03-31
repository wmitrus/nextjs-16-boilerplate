# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/requirements.md`.

**Stop here.** Present the PRD to the user and wait for their confirmation before proceeding.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

**Stop here.** Present the technical specification to the user and wait for their confirmation before proceeding.

### [x] Step: Planning

Create a detailed implementation plan based on `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

Save to `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/plan.md`.

**Stop here.** Present the implementation plan to the user and wait for their confirmation before proceeding.

---

## Implementation Tasks

Reference documents:

- Requirements: `.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/requirements.md`
- Spec: `.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/spec.md`

**Execution order**: Tasks 1 → 2 and 3 (parallel) → 4 → 5 → 6.
Task 1 must complete first (version bump gates all type-surface work). Tasks 2 and 3 are independent of each other and can run after Task 1. Task 4 depends on Task 1 (ErrorInfo type confirmed). Task 5 depends on Task 4. Task 6 is the final gate — runs after all others.

---

### [x] Task 1: Version bump, lockfile regeneration, and ErrorInfo type inspection

**Files**: `package.json`, `pnpm-lock.yaml`

**Work**:

- Edit `package.json`: set `next` to `16.2.1` and `eslint-config-next` to `16.2.1`
- Run `pnpm install` to regenerate the lockfile
- After install, read `node_modules/next/error.d.ts` and record the exact `ErrorInfo` type shape — this is a prerequisite for Task 4

**Verification**:

- `pnpm install` exits 0 with no peer-dependency errors for `react`/`react-dom`, `@clerk/nextjs`, or `@sentry/nextjs`
- `package.json` shows `"next": "16.2.1"` and `"eslint-config-next": "16.2.1"`
- `node_modules/next/error.d.ts` has been read and the `ErrorInfo` type is confirmed (record it)

---

### [x] Task 2: Add logging config to next.config.ts

**Files**: `next.config.ts`

**Work**:

- Add `logging: { browserToTerminal: 'warn' }` inside `nextConfig`, alongside the existing keys
- Do not disable `serverFunctions` — let the 16.2 default apply
- Keep `withSentryConfig` wrapper and all existing config keys (`cacheComponents`, `reactCompiler`, `serverExternalPackages`, `experimental`) unchanged

**Verification**:

- `pnpm typecheck` passes
- `pnpm lint --fix` passes

---

### [x] Task 3: Rename postcss.config.mjs to postcss.config.ts and fix repo drift

**Files**: `postcss.config.mjs` (deleted), `postcss.config.ts` (created), `AGENTS.md`, `.github/labeler.yml`, `docs/tanstack-migration/02-foundation.md`

**Work**:

- Delete `postcss.config.mjs`
- Create `postcss.config.ts` with equivalent content (same plugin config, TypeScript ESM format; add explicit type annotation only if `tsc` requires it)
- `AGENTS.md`: update `postcss.config.mjs` reference to `postcss.config.ts` AND correct the `next` version string from `16.1.6` to `16.2.1`
- `.github/labeler.yml`: update `postcss.config.mjs` reference to `postcss.config.ts`
- `docs/tanstack-migration/02-foundation.md`: update `postcss.config.mjs` reference to `postcss.config.ts`

**Verification**:

- `postcss.config.mjs` does not exist
- `postcss.config.ts` exists and contains the `@tailwindcss/postcss` plugin config
- `pnpm typecheck` passes
- `pnpm lint --fix` passes
- Grep confirms no remaining `postcss.config.mjs` references in the repository

---

### [x] Task 4: Update all four App Router error boundaries to ErrorInfo + unstable_retry

**Files**: `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/users/error.tsx`, `src/app/e2e-error/error.tsx`

**Prerequisite**: Task 1 complete — the actual `ErrorInfo` type from `node_modules/next/error.d.ts` must be confirmed before writing these changes. Do not assume the type shape.

**Work** (same pattern for all four files):

- Import `type { ErrorInfo } from 'next/error'`
- Replace the inline prop type with `ErrorInfo`
- Destructure `unstable_retry` from the props; use it as the retry button's `onClick` handler
- Preserve all existing `useEffect` body (Sentry capture in `error.tsx` and `global-error.tsx`; pino logger in all four)
- `global-error.tsx` specific: retain the `<html lang="en"><head>...</head><body>...</body></html>` wrapper and all inline `React.CSSProperties` style objects
- `users/error.tsx` specific: no Sentry — do not add it
- `e2e-error/error.tsx` specific: test fixture — `unstable_retry` semantics (re-fetch + re-crash) are acceptable
- If the confirmed `ErrorInfo.error` type is `Error` (not `Error & { digest?: string }`), add a type guard before accessing `error.digest` in `error.tsx` and `global-error.tsx`

**Verification**:

- `pnpm typecheck` passes across all four files with zero errors
- All four files import `ErrorInfo` from `'next/error'` and use `unstable_retry` in the retry button

---

### [x] Task 5: Update error boundary tests

**Files**: `src/app/error.test.tsx`, `src/app/global-error.test.tsx`

**Prerequisite**: Task 4 complete — tests must match the final implemented prop shape.

**Work**:

- Read `tests/setup.tsx` first to check whether `@sentry/nextjs` is already globally mocked
- If not globally mocked, add `vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))` to each test file that tests a Sentry-integrated boundary (`error.test.tsx`, `global-error.test.tsx`)
- Update prop rendering: replace `reset={vi.fn()}` with `unstable_retry={vi.fn()}` (or the exact prop name confirmed from the installed `ErrorInfo` type)
- Update assertion: replace `expect(reset).toHaveBeenCalled()` with `expect(unstable_retry).toHaveBeenCalled()`
- If `ErrorInfo` retains both `reset` and `unstable_retry`, pass both mocks and assert the one the button calls

**Verification**:

- `pnpm test` passes for both `error.test.tsx` and `global-error.test.tsx`
- No test is suppressed or skipped

---

### [x] Task 6: Full quality gate run

**Files**: none (verification only)

**Work**:
Run all gates in sequence. Stop and record output on first failure. Do not skip any gate.

```bash
pnpm typecheck
pnpm lint --fix
pnpm test
pnpm test:integration
pnpm build
pnpm skott:check:only
pnpm depcheck
pnpm env:check
```

`pnpm build` is mandatory. A framework minor upgrade cannot be considered validated without a successful production build.

**On `pnpm build` failure**:

- Record the exact error output
- Classify: breaking change in Next.js 16.2, Sentry build-time issue, or type error missed by typecheck
- Treat as a blocker — do not mark this task complete until the build passes

**Verification**:

- All eight commands exit 0
- No unfixable lint errors
- No new circular dependencies
- No new unused dependencies
- Record final pass/fail status for each gate in a brief completion note
