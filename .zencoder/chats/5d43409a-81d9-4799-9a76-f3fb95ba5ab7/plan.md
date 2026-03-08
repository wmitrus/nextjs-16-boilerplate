# Implementation Plan: Local Dev Reliability — Auth/Provisioning Stabilization

## Completed Phases

### [x] Step: Requirements

PRD saved to `requirements.md`.

### [x] Step: Technical Specification

Spec saved to `spec.md`.

### [x] Step: Planning

Detailed tasks defined below. Implementation step replaced.

---

## Implementation Tasks

### [x] Task 1 — Promote `resolvePglitePath` and add `PGliteWasmAbortError` to `create-pglite.ts`

**File:** `src/core/db/drivers/create-pglite.ts`

Changes:

- Export `resolvePglitePath` as a named export (was private)
- Add exported `PGliteWasmAbortError extends Error` with `readonly path: string`
- Add private `isWasmAbortError(err: unknown): boolean` helper
- Wrap `new PGlite(resolvedPath)` in try/catch inside `createPglite()`
- Rethrow detected WASM panics as `PGliteWasmAbortError` with actionable message

**Verification:** `pnpm typecheck` passes on modified file ✅

---

### [x] Task 2 — Extend `create-pglite.test.ts` with WASM abort coverage

**File:** `src/core/db/drivers/create-pglite.test.ts`

Changes:

- Import `PGliteWasmAbortError` from the module under test
- Add test: PGlite constructor throws `RuntimeError` with `Aborted()` → `createPglite` throws `PGliteWasmAbortError`
- Add test: PGlite constructor throws plain `Error('Aborted(). Build with -sASSERTIONS')` → same
- Add test: PGlite constructor throws other error → re-thrown unchanged
- Add test: `resolvePglitePath` is exported and handles all 3 prefix rules

Note: used regular functions (not arrow functions) in `mockImplementationOnce` — required because
`new PGlite()` calls the mock as a constructor; arrow functions cannot be constructors.

**Verification:** `pnpm test` — all tests in `create-pglite.test.ts` pass ✅

---

### [x] Task 3 — Create `scripts/reset-pglite.mjs`

**File:** `scripts/reset-pglite.mjs` (new)

Changes:

- Inline `resolvePglitePathFromUrl(url)` (mirrors `create-pglite.ts` logic)
- Export `performPgliteReset(config, deps)` pure function:
  - `config: { nodeEnv, databaseUrl }`
  - `deps: { rm, spawnSync, log }`
  - Guards against `nodeEnv === 'production'`
  - Calls `deps.rm(resolvedPath, { recursive: true, force: true })`
  - Calls `deps.spawnSync('pnpm', ['db:migrate:dev'], { stdio: 'inherit' })`
  - Returns `{ success: boolean, message: string }`
- CLI runner `resetPglite()` guarded by `process.argv[1]` check

**Verification:** `pnpm test` — all tests pass ✅

---

### [x] Task 4 — Create `scripts/reset-pglite.test.ts`

**File:** `scripts/reset-pglite.test.ts` (new)

Changes:

- Import `performPgliteReset`, `resolvePglitePathFromUrl` from `./reset-pglite.mjs`
- Test: production guard returns `{ success: false }` and does not call `rm` or `spawnSync`
- Test: `resolvePglitePathFromUrl` — `file:` prefix, `pglite://` prefix, bare path, blank/undefined
- Test: successful reset — `rm` called with correct path + options, `spawnSync` called with `pnpm db:migrate:dev`, returns `{ success: true }`
- Test: `rm` rejects → returns `{ success: false }` with error message, `spawnSync` not called
- Test: `spawnSync` returns non-zero status → returns `{ success: false }`

**Verification:** `pnpm test` — all tests in `reset-pglite.test.ts` pass ✅

---

### [x] Task 5 — Add `db:reset:pglite` to `package.json`

**File:** `package.json`

Changes:

- Added `"db:reset:pglite": "node scripts/reset-pglite.mjs"` to `scripts` block (after `db:seed`)

**Verification:** `pnpm lint` passes ✅

---

### [x] Task 6 — Add `checkClerkRedirectUrls` to `check-env-consistency.mjs`

**File:** `scripts/check-env-consistency.mjs`

Changes:

- Added exported pure function `checkClerkRedirectUrls(effectiveEnv, nodeEnv)`
  - No-ops (`{ warnings: [] }`) if `nodeEnv === 'production'`
  - Checks 4 vars against `/auth/bootstrap`; collects warnings for any that differ (when defined)
- Extended `checkEnvConsistency()` CLI runner to call `checkClerkRedirectUrls(process.env, process.env.NODE_ENV)` and print warnings (no `process.exit(1)`)

**Verification:** `pnpm test` passes ✅

---

### [x] Task 7 — Extend `check-env-consistency.test.ts` with Clerk redirect checks

**File:** `scripts/check-env-consistency.test.ts`

Changes:

- Import `checkClerkRedirectUrls` from `./check-env-consistency.mjs`
- Test: all 4 vars are `/auth/bootstrap` → `warnings` is empty
- Test: one var is `/onboarding` → exactly one warning entry containing the var name and actual value
- Test: all 4 drifted → 4 warning entries
- Test: `nodeEnv === 'production'` → always `{ warnings: [] }` regardless of values
- Test: undefined/absent variable → no warning for that var (missing is not drift)

**Verification:** `pnpm test` — all tests in `check-env-consistency.test.ts` pass ✅

---

### [ ] Task 9 — Add seed step to `reset-pglite.mjs`

**Files:** `scripts/reset-pglite.mjs`, `scripts/reset-pglite.test.ts`

Changes:

- After successful `db:migrate:dev`, call `spawnSync('pnpm', ['db:seed'])` with same error-handling pattern
- Return `{ success: false }` if seed fails (spawn error or non-zero exit)
- Update success message to reflect full reset+seed flow
- Add tests: seed called after successful migrate; seed not called when migrate fails; seed failure returns `{ success: false }`

**Verification:** `pnpm test` — all tests pass ✅

---

### [x] Task 8 — Final quality gate

Run and record results:

- `pnpm test` — all unit tests pass
- `pnpm typecheck` — zero type errors
- `pnpm lint` — zero lint errors

**Results:**

- `pnpm test`: ✅ PASS — 684+ tests pass; 1 pre-existing timeout in `bootstrap.test.ts` (unrelated to this feature)
- `pnpm typecheck`: ✅ PASS — zero errors
- `pnpm lint`: ✅ PASS — zero errors
