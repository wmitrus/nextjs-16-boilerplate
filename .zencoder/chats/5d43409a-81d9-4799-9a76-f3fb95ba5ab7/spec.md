# Technical Specification: Local Dev Reliability — Auth/Provisioning Stabilization

## 1. Technical Context

| Attribute       | Value                                                                |
| --------------- | -------------------------------------------------------------------- |
| Language        | TypeScript (src/) + ESM JavaScript (scripts/\*.mjs)                  |
| Runtime         | Node.js ≥20.9.0                                                      |
| Package manager | pnpm                                                                 |
| DB driver (dev) | PGlite (`@electric-sql/pglite@^0.3.15`) via Drizzle ORM              |
| Test runner     | Vitest (`pnpm test` → `vitest.unit.config.ts`)                       |
| Lint/typecheck  | `pnpm lint` (ESLint 9 flat config) + `pnpm typecheck` (tsc --noEmit) |

**Relevant existing files:**

| File                                        | Role                                                             |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `src/core/db/drivers/create-pglite.ts`      | PGlite factory — to be extended with WASM error detection        |
| `src/core/db/drivers/create-pglite.test.ts` | Existing unit tests — to be extended                             |
| `scripts/check-env-consistency.mjs`         | Env key-presence checker — to be extended with value-drift check |
| `scripts/check-env-consistency.test.ts`     | Existing tests — to be extended                                  |
| `scripts/setup-env.mjs`                     | Pattern reference: exported pure functions + guarded CLI runner  |
| `scripts/compose-db-local.mjs`              | Pattern reference: `spawnSync` for subprocess execution          |
| `package.json`                              | `scripts` block — new `db:reset:pglite` entry required           |

---

## 2. Deliverable A — `pnpm db:reset:pglite` Script

### 2.1 New file: `scripts/reset-pglite.mjs`

**Architecture pattern:** identical to `scripts/setup-env.mjs`:

- Core logic in an exported pure function `performPgliteReset(config, deps)` — injectable FS and spawn interfaces for testability
- CLI runner in `function resetPglite()` guarded by `process.argv[1] === fileURLToPath(import.meta.url)`
- No TypeScript — pure ESM `.mjs` (cannot import from compiled `src/`)

**Path resolution:** Inline a copy of the same 3-rule logic from `create-pglite.ts` (`resolvePglitePath`). The source-of-truth remains in the TypeScript file; duplication is acceptable here because:

- The script runs in a different runtime context (pure Node ESM, no tsx/ts-node)
- The logic is 5 lines and stable
- Eliminating the duplication would require adding tsx as a dev dependency to scripts or publishing a shared CJS package — both add unnecessary complexity

**Production guard:** if `NODE_ENV === 'production'`, throw immediately with:

```
[reset-pglite] Refusing to run in NODE_ENV=production. This command is for local development only.
```

**Behavior:**

```
$ pnpm db:reset:pglite

[reset-pglite] Resolved PGlite path: ./data/pglite
[reset-pglite] Removing ./data/pglite ...
[reset-pglite] Removed.
[reset-pglite] Running: pnpm db:migrate:dev
... (drizzle-kit output) ...
[reset-pglite] Done. PGlite database reset successfully.
```

**Interface:**

```js
// Exported for testability
export function resolvePglitePathFromUrl(url) { ... }
export function performPgliteReset(config, deps) { ... }
//   config: { nodeEnv, databaseUrl }
//   deps:   { rm, spawnSync, log }
//   returns: { success: boolean, message: string }
```

**`deps.rm`:** wraps `fs.promises.rm(path, { recursive: true, force: true })`  
**`deps.spawnSync`:** wraps `child_process.spawnSync` — used to run `pnpm db:migrate:dev`

**`package.json` change:**

```json
"db:reset:pglite": "node scripts/reset-pglite.mjs"
```

### 2.2 New test file: `scripts/reset-pglite.test.ts`

Co-located with the script per CLAUDE.md conventions. Covers:

| Test case                               | Assertion                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| production guard                        | throws / returns `success: false` when `nodeEnv === 'production'`             |
| path resolution from `file:` prefix     | resolves `file:./data/pglite` → `./data/pglite`                               |
| path resolution from `pglite://` prefix | resolves `pglite://./data/custom` → `./data/custom`                           |
| path resolution — blank URL fallback    | resolves empty/undefined → `./data/pglite`                                    |
| successful reset                        | calls `deps.rm` with correct path, calls `spawnSync`, returns `success: true` |
| rm failure                              | returns `success: false` with error message                                   |
| spawn failure                           | returns `success: false` when `spawnSync.status !== 0`                        |

---

## 3. Deliverable B — WASM Abort Detection in `createPglite`

### 3.1 Modified file: `src/core/db/drivers/create-pglite.ts`

**Add:** a named export `PGliteWasmAbortError extends Error` with a `readonly path: string` property.

**Modify:** `createPglite(url?)` — wrap `new PGlite(resolvedPath)` in try/catch:

```ts
try {
  pglite = new PGlite(resolvedPath);
} catch (err) {
  if (isWasmAbortError(err)) {
    throw new PGliteWasmAbortError(resolvedPath);
  }
  throw err;
}
```

**`isWasmAbortError(err)`** — private helper:

- Returns `true` if `err` is a `RuntimeError` (check `err?.constructor?.name === 'RuntimeError'` OR `err instanceof Error && /aborted\(\)/i.test(err.message)`)
- This heuristic is robust because PGlite's WASM panic consistently produces `RuntimeError` with the message `Aborted()`

**`PGliteWasmAbortError` message:**

```
PGlite WASM abort at '<path>'. The local database may be corrupted.
Run: pnpm db:reset:pglite
```

**Also export:** `resolvePglitePath` (change from private function to named export) — makes it importable in tests and signals its stable contract.

### 3.2 Modified test file: `src/core/db/drivers/create-pglite.test.ts`

Add test cases:

| Test case                                 | Assertion                                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| WASM abort — RuntimeError                 | `createPglite()` throws `PGliteWasmAbortError` when `new PGlite()` throws `RuntimeError` with message `Aborted()` |
| WASM abort — generic Error with Aborted() | same but with plain `Error('Aborted(). Build with -sASSERTIONS')`                                                 |
| Non-WASM error passes through             | `createPglite()` re-throws other errors unchanged                                                                 |
| `resolvePglitePath` export                | exported and resolves known prefixes correctly                                                                    |

---

## 4. Deliverable C — Clerk Redirect URL Drift Detection

### 4.1 Modified file: `scripts/check-env-consistency.mjs`

**Add** an exported pure function:

```js
export function checkClerkRedirectUrls(effectiveEnv, nodeEnv = 'development') {
  // Only checks in non-production environments
  // Returns { warnings: string[] }
}
```

**Logic:**

- If `nodeEnv === 'production'`, return `{ warnings: [] }` immediately (no-op in prod)
- Check 4 variables against `/auth/bootstrap`:
  - `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`
  - `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`
- For each variable where `effectiveEnv[key] !== '/auth/bootstrap'` and the value is defined (don't warn on absent optional vars):
  - Append a warning: `  ${key}=${effectiveEnv[key]} (expected /auth/bootstrap)`

**Modify** the existing `checkEnvConsistency()` CLI runner:

```js
function checkEnvConsistency() {
  // ... existing key-presence check (unchanged) ...

  const { warnings } = checkClerkRedirectUrls(
    process.env,
    process.env.NODE_ENV,
  );
  if (warnings.length > 0) {
    console.warn('⚠️  Clerk redirect URL drift detected:');
    for (const w of warnings) {
      console.warn(w);
    }
    console.warn(
      '   Expected: /auth/bootstrap for all sign-in/sign-up redirect URLs.',
    );
    console.warn(
      '   If your .env.local overrides these, update them to /auth/bootstrap.',
    );
    // Does NOT call process.exit(1) — drift is a warning, not a hard error
  }
  // existing success message
}
```

### 4.2 Modified test file: `scripts/check-env-consistency.test.ts`

Add test cases for `checkClerkRedirectUrls`:

| Test case                   | Assertion                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------- |
| all correct                 | returns `{ warnings: [] }` when all 4 vars are `/auth/bootstrap`                    |
| one drifted                 | returns one warning entry with the variable name and actual value                   |
| all drifted                 | returns 4 warning entries                                                           |
| production skip             | returns `{ warnings: [] }` regardless of env values when `nodeEnv === 'production'` |
| absent variable (undefined) | does not warn for unset variables (they fall back to env.ts defaults)               |

---

## 5. Source Code Structure Changes

```
scripts/
  reset-pglite.mjs              ← NEW
  reset-pglite.test.ts          ← NEW
  check-env-consistency.mjs     ← MODIFIED (add checkClerkRedirectUrls export)
  check-env-consistency.test.ts ← MODIFIED (add new test cases)

src/core/db/drivers/
  create-pglite.ts              ← MODIFIED (PGliteWasmAbortError + detection)
  create-pglite.test.ts         ← MODIFIED (new test cases)

package.json                    ← MODIFIED (add db:reset:pglite script)
```

**Total files changed: 6** (2 new, 4 modified). Zero new dependencies.

---

## 6. Interface / API Changes

### Exported from `src/core/db/drivers/create-pglite.ts`

```ts
// New named export — error type for WASM panics
export class PGliteWasmAbortError extends Error {
  readonly path: string;
  constructor(path: string);
}

// Promoted to named export (was private)
export function resolvePglitePath(url?: string): string;
```

### Exported from `scripts/check-env-consistency.mjs`

```js
// New named export
export function checkClerkRedirectUrls(
  effectiveEnv: Record<string, string | undefined>,
  nodeEnv?: string,
): { warnings: string[] }
```

### Exported from `scripts/reset-pglite.mjs`

```js
export function resolvePglitePathFromUrl(url?: string): string
export function performPgliteReset(
  config: { nodeEnv?: string; databaseUrl?: string },
  deps: { rm, spawnSync, log }
): Promise<{ success: boolean; message: string }>
```

---

## 7. Delivery Phases

| Phase | Deliverable                                                      | Verifiable by                               |
| ----- | ---------------------------------------------------------------- | ------------------------------------------- |
| 1     | `PGliteWasmAbortError` + detection in `create-pglite.ts` + tests | `pnpm test` (unit)                          |
| 2     | `scripts/reset-pglite.mjs` + tests + `package.json` entry        | `pnpm test` + manual `pnpm db:reset:pglite` |
| 3     | `checkClerkRedirectUrls` in `check-env-consistency.mjs` + tests  | `pnpm test` + manual `pnpm env:check`       |
| 4     | Final `pnpm typecheck` + `pnpm lint` pass                        | CI gate                                     |

---

## 8. Verification Approach

```bash
# Unit tests (covers all 3 deliverables)
pnpm test

# Type safety
pnpm typecheck

# Code quality
pnpm lint

# Manual smoke test (after implementation)
pnpm db:reset:pglite   # expect: clears ./data/pglite and re-applies migrations
pnpm env:check         # expect: warns if Clerk redirect URLs are drifted
```

---

## 9. Risk Assessment

| Risk                                                                                        | Likelihood | Mitigation                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| PGlite constructor is synchronous — WASM panic may be thrown synchronously or surface later | Low        | Test both RuntimeError throw at construction time and via `.query()` promise rejection; the PRD scope is construction-time only |
| `resolvePglitePath` logic diverges between `.ts` and `.mjs` over time                       | Low        | The `.mjs` copy is intentionally inline-documented as "mirrors `create-pglite.ts`"                                              |
| `checkClerkRedirectUrls` warns for legitimate non-bootstrap flows (e.g., staging)           | Medium     | Warning-only (no `process.exit(1)`), skipped in `production`                                                                    |
