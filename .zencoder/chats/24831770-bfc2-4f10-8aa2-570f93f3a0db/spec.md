# Technical Specification — Next.js 16.2.1 Upgrade

**Based on**: `requirements.md` v2, `01 - Architecture Guard - Summary.md`, `03 - Next.js Runtime - Summary.md`
**Status**: Draft — awaiting user confirmation before implementation begins

---

## Technical Context

| Item            | Value                                            |
| --------------- | ------------------------------------------------ |
| Language        | TypeScript (strict mode)                         |
| Runtime         | Node.js 24.x                                     |
| Framework       | Next.js (upgrading from `16.1.7` → `16.2.1`)     |
| Package manager | pnpm                                             |
| Build           | Turbopack (dev + build)                          |
| Rendering       | App Router, React 19, RSC                        |
| Auth            | Clerk (`@clerk/nextjs ^6.39.0`) — not touched    |
| Error tracking  | Sentry (`@sentry/nextjs ^10.40.0`) — preserved   |
| Styling         | Tailwind CSS 4 via `@tailwindcss/postcss`        |
| Test frameworks | Vitest (unit), Testing Library, Playwright (E2E) |

**Packages changing in this task**:

- `next`: `16.1.7` → `16.2.1`
- `eslint-config-next`: `16.1.7` → `16.2.1`

No other dependencies change. No new dependencies are added.

---

## Files In Scope

| File                                       | Change type        | Notes                                                               |
| ------------------------------------------ | ------------------ | ------------------------------------------------------------------- |
| `package.json`                             | Version bump       | `next`, `eslint-config-next`                                        |
| `pnpm-lock.yaml`                           | Regenerated        | Via `pnpm install` after version bump                               |
| `next.config.ts`                           | Config addition    | `logging.browserToTerminal: 'warn'` added to `nextConfig`           |
| `postcss.config.mjs`                       | Deleted            | Replaced by `postcss.config.ts`                                     |
| `postcss.config.ts`                        | Created            | Identical content, TypeScript ESM format                            |
| `AGENTS.md`                                | Two edits          | `postcss.config.mjs` → `.ts`; `next: 16.1.6` → `16.2.1`             |
| `.github/labeler.yml`                      | One edit           | `postcss.config.mjs` → `postcss.config.ts`                          |
| `docs/tanstack-migration/02-foundation.md` | One edit           | `postcss.config.mjs` → `postcss.config.ts`                          |
| `src/app/error.tsx`                        | Interface + button | `ErrorInfo` type; `unstable_retry` action                           |
| `src/app/global-error.tsx`                 | Interface + button | `ErrorInfo` type; `unstable_retry` action; `<html>/<body>` retained |
| `src/app/users/error.tsx`                  | Interface + button | `ErrorInfo` type; `unstable_retry` action                           |
| `src/app/e2e-error/error.tsx`              | Interface + button | `ErrorInfo` type; `unstable_retry` action                           |
| `src/app/error.test.tsx`                   | Test update        | Prop shape updated: `unstable_retry` mock                           |
| `src/app/global-error.test.tsx`            | Test update        | Prop shape updated: `unstable_retry` mock                           |

Files **not** in scope: `src/proxy.ts`, anything under `src/security/`, `src/modules/`, `src/features/`,
`src/core/`, `src/shared/`.

---

## Implementation Approach

### Phase 1 — Version bump and lockfile

Edit `package.json`:

```json
"next": "16.2.1"
"eslint-config-next": "16.2.1"
```

Run `pnpm install` to regenerate the lockfile. After install:

- Inspect `node_modules/next/error.d.ts` to confirm the exact `ErrorInfo` type surface.
  This is a prerequisite for Phase 4; do not assume the type shape before reading it.

Expected `ErrorInfo` shape based on the Next.js 16.2 blog (confirm after upgrade):

```typescript
type ErrorInfo = {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry: () => void;
};
```

The blog shows both `reset` and `unstable_retry` may coexist. Confirm from the installed type declaration
before writing implementations. If the shape differs, use the installed declaration as ground truth.

### Phase 2 — next.config.ts: logging section

Add `logging` inside `nextConfig`, before the `Sentry` wrapper. Existing keys (`cacheComponents`,
`reactCompiler`, `serverExternalPackages`, `experimental`) are preserved unchanged.

Current structure:

```typescript
const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  serverExternalPackages: [...],
  experimental: { turbopackFileSystemCacheForDev: true },
};
```

After:

```typescript
const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  serverExternalPackages: [...],
  experimental: { turbopackFileSystemCacheForDev: true },
  logging: {
    browserToTerminal: 'warn',
  },
};
```

No changes to `withSentryConfig(nextConfig, {...})` call.

### Phase 3 — PostCSS rename and repo drift cleanup

**File rename**:

- Delete `postcss.config.mjs`.
- Create `postcss.config.ts` with equivalent content in TypeScript ESM format.

Current `postcss.config.mjs` content:

```javascript
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

New `postcss.config.ts` — check if an explicit Config type is available from `postcss-load-config` or
similar. If not, retain the plain object export (TypeScript infers the shape correctly):

```typescript
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

No content change is needed unless `tsc` reports an inference error after the rename.

**Repo drift cleanup** (three files, minimal line edits):

`AGENTS.md`:

- Line 60: `**next**: \`16.1.6\``→`**next**: \`16.2.1\``
- Line 109: `**\`postcss.config.mjs\`**`→`**\`postcss.config.ts\`\*\*`

`.github/labeler.yml`:

- Line 39: `- 'postcss.config.mjs'` → `- 'postcss.config.ts'`

`docs/tanstack-migration/02-foundation.md`:

- Line 17: `postcss.config.mjs` → `postcss.config.ts`

### Phase 4 — App Router error-boundary contract update

**Prerequisite**: Confirm `ErrorInfo` type from `node_modules/next/error.d.ts` (Phase 1 output).

All four boundaries follow the same pattern. Each currently uses an inline prop type:

```typescript
function ComponentName({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
```

Replace with `ErrorInfo` import and destructure `unstable_retry`:

```typescript
import type { ErrorInfo } from 'next/error';

function ComponentName({ error, unstable_retry }: ErrorInfo) {
```

> If the confirmed `ErrorInfo` type does not include `error: Error & { digest?: string }` but instead
> `error: Error`, the Sentry payloads that access `error.digest` must be guarded. Inspect and adapt.

**Per-file details**:

**`src/app/error.tsx`** (root):

- Import `ErrorInfo` from `'next/error'`.
- Destructure `{ error, unstable_retry }` (drop `reset` from destructuring if `unstable_retry` replaces it; keep `reset` only if the type exposes both and there is a reason to keep it).
- Replace `onClick={() => reset()}` on the "Try again" button with `onClick={() => unstable_retry()}`.
- `useEffect` Sentry capture block and pino logger call are unchanged.

**`src/app/global-error.tsx`** (global):

- Same `ErrorInfo` import and destructure pattern.
- Replace `onClick={() => reset()}` on the "Refresh Application" button with `onClick={() => unstable_retry()}`.
- The `<html lang="en"><head>...</head><body>...</body></html>` wrapper must be retained — Next.js App Router requirement for `global-error.tsx`.
- `useEffect` Sentry capture and pino logger call are unchanged.
- The inline `React.CSSProperties` style objects at the bottom of the file are unchanged.

**`src/app/users/error.tsx`** (route-level):

- Same `ErrorInfo` import and destructure pattern.
- Replace `onClick={() => reset()}` on the "Retry users page" button with `onClick={() => unstable_retry()}`.
- `useEffect` pino logger call is unchanged.
- No Sentry; do not add it.

**`src/app/e2e-error/error.tsx`** (test fixture):

- Same `ErrorInfo` import and destructure pattern.
- Replace `onClick={() => reset()}` on the "Retry" button with `onClick={() => unstable_retry()}`.
- `useEffect` pino logger call is unchanged.
- This route is an intentional crash fixture for E2E. `unstable_retry` will re-fetch and re-crash deterministically — this is acceptable.

### Phase 5 — Test file updates

**`src/app/error.test.tsx`**:

Current: passes `reset={reset}` as `vi.fn()`, asserts `expect(reset).toHaveBeenCalled()`.

After update — adapt to the confirmed `ErrorInfo` prop shape. If `unstable_retry` replaces `reset`:

```typescript
const unstable_retry = vi.fn();
render(<ErrorBoundary error={new Error('Crash')} unstable_retry={unstable_retry} />);
// ...
await user.click(screen.getByRole('button', { name: 'Try again' }));
expect(unstable_retry).toHaveBeenCalled();
```

If `ErrorInfo` retains `reset` alongside `unstable_retry`, pass both as mocks and assert the one
the button calls.

**`src/app/global-error.test.tsx`**:

Same pattern as `error.test.tsx`. Adapt to confirmed `ErrorInfo` shape:

```typescript
const unstable_retry = vi.fn();
render(<GlobalError error={new Error('Critical')} unstable_retry={unstable_retry} />);
// ...
await user.click(screen.getByRole('button', { name: 'Refresh Application' }));
expect(unstable_retry).toHaveBeenCalled();
```

**Note on Sentry in tests**: Both existing test files mock `@/core/logger/client` via `vi.mock`.
Neither currently mocks `@sentry/nextjs`. After the change, `error.tsx` and `global-error.tsx` still
import Sentry. If the test environment lacks a Sentry stub and the import causes an error, add a
`vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))` stub. Inspect existing test setup
files (`tests/setup.tsx`) to check if Sentry is already globally mocked.

---

## Data Model / API / Interface Changes

This task has no data model changes. The only interface change is the prop type for the four error
boundary components:

| Component                                  | Old props                                                   | New props                       |
| ------------------------------------------ | ----------------------------------------------------------- | ------------------------------- |
| `ErrorBoundary` (`error.tsx`)              | `{ error: Error & { digest?: string }; reset: () => void }` | `ErrorInfo` from `'next/error'` |
| `GlobalError` (`global-error.tsx`)         | same as above                                               | `ErrorInfo` from `'next/error'` |
| `UsersErrorBoundary` (`users/error.tsx`)   | same as above                                               | `ErrorInfo` from `'next/error'` |
| `E2eErrorBoundary` (`e2e-error/error.tsx`) | same as above                                               | `ErrorInfo` from `'next/error'` |

No public API surface is exposed to other modules. These are Next.js App Router file-convention
components consumed only by the framework. No changes in `src/core/`, `src/shared/`, `src/modules/`,
or `src/features/` are required.

---

## Delivery Phases

Execute in this order. Each phase is independently verifiable before starting the next.

| Phase | Title                          | Key files                                                                                           | Gate                                                                             |
| ----- | ------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1     | Version bump + lockfile        | `package.json`, `pnpm-lock.yaml`                                                                    | `pnpm install` succeeds; inspect `node_modules/next/error.d.ts`                  |
| 2     | logging config                 | `next.config.ts`                                                                                    | `pnpm typecheck` passes                                                          |
| 3     | PostCSS rename + drift cleanup | `postcss.config.ts`, `AGENTS.md`, `.github/labeler.yml`, `docs/tanstack-migration/02-foundation.md` | `pnpm typecheck`, `pnpm lint --fix` pass; verify Turbopack picks up `.ts` config |
| 4     | Error boundary contract update | four `error.tsx` files                                                                              | `pnpm typecheck` passes                                                          |
| 5     | Test updates                   | `error.test.tsx`, `global-error.test.tsx`                                                           | `pnpm test` passes                                                               |
| 6     | Full gate run                  | —                                                                                                   | All gates in R-05 pass including `pnpm build`                                    |

Phases 2 and 3 are independent and can be executed in either order after Phase 1. Phases 4 and 5 depend
on Phase 1 (type surface confirmed). Phase 6 is the final integration gate.

---

## Verification Approach

Run in the order below. Stop and record on first failure.

```bash
# Phase 1 gate
pnpm install

# Phase 2–3 gates
pnpm typecheck
pnpm lint --fix

# Phase 4–5 gates
pnpm test
pnpm test:integration

# Final integration gate (mandatory)
pnpm build

# Structural gates
pnpm skott:check:only
pnpm depcheck
pnpm env:check
```

**Specific verification checkpoints**:

1. After `pnpm install`: read `node_modules/next/error.d.ts` and confirm `ErrorInfo` type shape.
2. After Phase 3: confirm `postcss.config.mjs` does not exist; `postcss.config.ts` exists; and that
   `@tailwindcss/postcss` is still correctly resolved during a quick `pnpm dev` startup check.
3. After Phase 4: confirm `pnpm typecheck` passes with zero errors across all four boundary files.
4. After Phase 5: confirm `pnpm test` passes for `error.test.tsx` and `global-error.test.tsx` specifically.
5. After Phase 6: confirm `pnpm build` exits 0. Build failure is a task blocker, not a warning.

**If `pnpm build` fails**:

- Do not suppress or skip.
- Record the exact error output.
- Determine if it is caused by a Next.js 16.2 breaking change, a Sentry build-time error, or a type error
  that typecheck missed.
- Treat as a blocker until resolved.

---

## Assumptions

| #    | Assumption                                                                                                      | Risk if wrong                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A-01 | `next@16.2.1` is available on the npm registry at time of upgrade                                               | Low; documented as current patch                                    |
| A-02 | `ErrorInfo` from `'next/error'` in 16.2.1 includes `unstable_retry: () => void`                                 | Medium; verify immediately after `pnpm install` from `node_modules` |
| A-03 | `@sentry/nextjs` and `@clerk/nextjs` do not have hard peer-range conflicts with `next@16.2.1`                   | Low; installed metadata shows no blocker                            |
| A-04 | Turbopack correctly picks up `postcss.config.ts` without additional config changes                              | Low; documented as supported in 16.2                                |
| A-05 | Existing Sentry mock setup (if any) in `tests/setup.tsx` covers the `captureException` call in error boundaries | Medium; inspect `tests/setup.tsx` before writing test updates       |

---

## Out-of-Scope Technical Notes

- **SRI (E-01)**: Turbopack now supports SRI for JavaScript bundles. This intersects with the existing
  nonce-based CSP in `src/security/`. Any SRI adoption requires Security & Auth specialist sign-off on a
  dedicated branch. Not part of this implementation.
- **Experimental flags (E-02 through E-05)**: No `experimental.*` keys are added to `next.config.ts` in
  this task. All experimental evaluation is deferred to separate branches.
- **`src/proxy.ts`**: Not touched. The Next.js Runtime review explicitly keeps proxy behavior out of scope.
