# Sentry Network Error Fix Report

**Agent**: Implementation Agent  
**Date**: 2026-03-13  
**Status**: IMPLEMENTED

---

## 1. Objective

Extend the PGLite error guard in `src/app/auth/bootstrap/page.tsx` to also catch Node.js filesystem errors (ENOENT, EPERM, EACCES) thrown by PGLite during provisioning, mapping them to `<BootstrapErrorUI error="db_error" />` instead of re-throwing and producing a `TypeError: network error` on the client.

---

## 2. Affected Files / Modules

| File                                   | Change                                                         | Touches                                                         |
| -------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/app/auth/bootstrap/page.tsx`      | Extended `PGliteWasmAbortError` guard with ENOENT/EPERM/EACCES | Error handling only — no contracts, no DI, no auth, no security |
| `src/app/auth/bootstrap/page.test.tsx` | Added 2 new test cases                                         | Tests only                                                      |

No module boundaries crossed. No contracts changed. No DI touched. No security or auth logic modified.

---

## 3. Implementation Plan

Extend the single existing `if (err instanceof PGliteWasmAbortError || ...)` condition inside the provisioning `catch (err)` block to also check for Node.js `ErrnoException` error codes `ENOENT`, `EPERM`, and `EACCES`. These are the filesystem-level errors PGLite throws (async, during first DB operation) when:

- the data directory or its parent does not exist (ENOENT)
- filesystem permissions are denied (EPERM / EACCES)

---

## 4. Changes Made

### `src/app/auth/bootstrap/page.tsx`

**Before:**

```typescript
if (
  err instanceof PGliteWasmAbortError ||
  (err instanceof Error &&
    (err.constructor?.name === 'RuntimeError' ||
      /aborted\(\)/i.test(err.message)))
) {
  return <BootstrapErrorUI error="db_error" />;
}
```

**After:**

```typescript
if (
  err instanceof PGliteWasmAbortError ||
  (err instanceof Error &&
    (err.constructor?.name === 'RuntimeError' ||
      /aborted\(\)/i.test(err.message) ||
      (err as NodeJS.ErrnoException).code === 'ENOENT' ||
      (err as NodeJS.ErrnoException).code === 'EPERM' ||
      (err as NodeJS.ErrnoException).code === 'EACCES'))
) {
  return <BootstrapErrorUI error="db_error" />;
}
```

All other error handling is unchanged. The `throw err` fallthrough remains for genuinely unexpected errors.

### `src/app/auth/bootstrap/page.test.tsx`

Added 2 tests inside the existing `describe('BootstrapPage')` block:

1. **`renders db_error UI when PGlite throws ENOENT during provisioning`** — simulates `{ code: 'ENOENT' }` error from `ensureProvisioned`, asserts `<BootstrapErrorUI error="db_error" />`
2. **`renders db_error UI when PGlite throws EPERM during provisioning`** — simulates `{ code: 'EPERM' }` error from `ensureProvisioned`, asserts `<BootstrapErrorUI error="db_error" />`

---

## 5. Validation / Verification

| Check                               | Result                             |
| ----------------------------------- | ---------------------------------- |
| `pnpm typecheck`                    | ✅ 0 errors                        |
| `pnpm lint`                         | ✅ 0 errors                        |
| `pnpm arch:lint`                    | ✅ PASS (no new violations)        |
| `pnpm test`                         | ✅ 115 files, 709 tests — all pass |
| New ENOENT test                     | ✅ passes                          |
| New EPERM test                      | ✅ passes                          |
| Existing bootstrap tests (10 tests) | ✅ all pass, no regression         |

---

## 6. Risks / Follow-ups

**Residual risk — `getAppContainer()` synchronous throw path:**  
The fix covers ENOENT thrown from inside `provisioningService.ensureProvisioned()` (async PGLite FS init path — the confirmed Sentry failure path). If `new PGlite(path)` ever throws synchronously before the provisioning try/catch is entered (e.g., a future PGLite version changes init behavior), the error would still escape to the RSC stream as `TypeError: network error`. This scenario is not the confirmed Sentry path based on investigation evidence (PGLite init is async), but could be addressed with a top-level try/catch around `getAppContainer()` if it becomes a concern.

**`BootstrapErrorUI` "Try Again" button behavior:**  
The button calls `window.location.reload()`. If the underlying PGLite directory issue persists (e.g., `./data/` still missing), the reload will hit the same error again — now correctly showing `db_error` UI with the actionable message (`Run pnpm db:reset:pglite`). This is expected behavior for a dev-environment filesystem issue. No change needed here.
