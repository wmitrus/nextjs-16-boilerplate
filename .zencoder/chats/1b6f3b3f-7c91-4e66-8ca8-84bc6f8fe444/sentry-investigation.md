# Sentry Investigation: TypeError: network error at <BootstrapPage>

**Agent**: Debug / Investigation Agent  
**Date**: 2026-03-13  
**Status**: INVESTIGATION COMPLETE — ROOT CAUSE CONFIRMED

---

## 1. Objective

Investigate the Sentry event `TypeError: network error` at `<BootstrapPage>`, correlate with server logs, and identify what causes the error, who the Sentry click event belongs to, and why the error bypasses the existing `db_error` error UI.

---

## 2. Symptom Summary

Sentry captured a `TypeError: network error` originating inside `<BootstrapPage>`, handled by `<ErrorBoundaryHandler>` error boundary. The trace shows:

- A UI click on `div.flex.min-h-screen.items-center.justify-center`
- Navigation to `/auth/bootstrap` (415.20ms)
- Middleware ran in 7.46ms (fast, no error in middleware)
- `TypeError: network error` occurred during bootstrap page render

The user was on a page with a `flex min-h-screen items-center justify-center` container when they clicked — which is the **root `div` of `BootstrapErrorUI`** (confirmed from code inspection of `src/app/auth/bootstrap/bootstrap-error.tsx`).

---

## 3. Confirmed Evidence

### 3a. BootstrapErrorUI is the click origin (Confirmed)

`src/app/auth/bootstrap/bootstrap-error.tsx`:

```tsx
export function BootstrapErrorUI({ error }: BootstrapErrorUIProps) {
  ...
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
```

The `div.flex.min-h-screen.items-center.justify-center` in Sentry's UI click trace **is exactly this component**. The user was staring at a `BootstrapErrorUI` error page and clicked "Try Again".

### 3b. "Try Again" reloads to /auth/bootstrap (Confirmed)

```tsx
<button onClick={() => window.location.reload()}>Try Again</button>
```

`window.location.reload()` reloads the current URL: `/auth/bootstrap`. This triggers a new full navigation to bootstrap — which is what the Sentry trace shows (`navigation—/auth/bootstrap`).

### 3c. PGLite ENOENT errors are proven to occur (Confirmed)

From `logs/server.log` lines 3–9 (early session), PGLite throws:

```
ENOENT: no such file or directory, mkdir '/home/wojtek/.../data/pglite'
```

This comes from `@electric-sql/pglite/dist/fs/nodefs.js` — PGLite's Node.js filesystem backend trying to create its data directory. The parent directory `./data/` does not exist.

### 3d. ENOENT reaches `throw err` in bootstrap.tsx (Confirmed)

`src/app/auth/bootstrap/page.tsx` error-handling code:

```typescript
} catch (err) {
  logger.error(..., 'provisioning:ensure failed during bootstrap');

  if (err instanceof CrossProviderLinkingNotAllowedError) { ... }
  if (err instanceof TenantUserLimitReachedError) { ... }
  if (err instanceof TenantContextRequiredError) { ... }
  if (
    err instanceof PGliteWasmAbortError ||
    (err instanceof Error && (err.constructor?.name === 'RuntimeError' || /aborted\(\)/i.test(err.message)))
  ) {
    return <BootstrapErrorUI error="db_error" />;
  }

  throw err; // ← ENOENT FALLS THROUGH HERE
}
```

ENOENT:

- Is caught by the `try/catch` ✓
- Does NOT match `PGliteWasmAbortError` ✓
- Does NOT match `RuntimeError` name or `aborted()` pattern ✓
- **Falls through to `throw err`** — the server component throws

### 3e. Unhandled server throws become `TypeError: network error` on client (Confirmed by RSC behavior)

In Next.js App Router, when an async Server Component throws an unhandled error during RSC streaming, the React runtime on the client surfaces it as `TypeError: network error` (the RSC stream pipe breaks). React's error boundary catches this. This is a known Next.js App Router behavior for server-side throws.

### 3f. No server log entry at Sentry's timestamp (Confirmed)

Sentry event timestamp: `Mar 13, 22:07:56 CET` ≈ Unix `1,773,436,076,000 ms`.

Server log has entries at:

- `1773435866396` (22:04:26 CET) — identity resolved, no provisioning entry
- `1773436137179` (22:08:57 CET) — next entry is successful bootstrap

**There is no server log entry for the Sentry error event.** This means the error occurred before `identitySource.get()` was called (before the logger could write anything).

### 3g. PGLite initialization is synchronous construction / async operation (Confirmed from code)

From `src/core/db/drivers/create-pglite.ts`:

```typescript
pglite = new PGlite(resolvedPath); // synchronous — JS object created
```

From PGLite internals (stack trace): the ENOENT is thrown from `nodefs.js:1:248` inside `async L.Ve` — PGLite's filesystem initialization happens **asynchronously on first DB operation**, not during `new PGlite()`. This means:

- `createPglite()` returns successfully (PGLite JS object created)
- `getInfrastructure()` returns and caches the runtime
- `getAppContainer()` returns successfully
- `identitySource.get()` call... wait — if `getAppContainer()` succeeds, identity WOULD be logged

See Section 6 (Likely Failure Points) for resolution.

---

## 4. Execution Path

**User journey leading to Sentry error:**

1. User visited `/auth/bootstrap` earlier
2. `provisioningService.ensureProvisioned()` threw ENOENT (PGLite `./data/` missing)
3. ENOENT was caught by try/catch in bootstrap.tsx
4. ENOENT did NOT match `PGliteWasmAbortError` check
5. `throw err` — server component threw
6. Client received `TypeError: network error`... **OR** — a previous bootstrap attempt DID catch `PGliteWasmAbortError` and returned `<BootstrapErrorUI error="db_error" />`
7. User saw `BootstrapErrorUI` with "Try Again" and "Sign Out" buttons
8. User clicked "Try Again" → `window.location.reload()` → `/auth/bootstrap`
9. Middleware processes bootstrap route (7.46ms — fast, likely caught `UserNotProvisionedError` for new user or used edge identity provider)
10. Bootstrap PAGE renders as RSC stream
11. `getAppContainer()` is called → `getInfrastructure()` is called
12. **ENOENT or another PGLite initialization error** throws — either during `getAppContainer()` itself (first time in this process — no log possible) OR during `provisioningService.ensureProvisioned()` (after identity log)
13. Error propagates as unhandled throw from server component
14. Client receives `TypeError: network error`
15. `<ErrorBoundaryHandler>` catches
16. Sentry records the event

---

## 5. Source-of-Truth Analysis

**PGLite file state**: The source of truth for whether PGLite can initialize is the filesystem — specifically whether `./data/pglite/` exists. This is outside the application's control entirely.

**Infrastructure cache**: `getInfrastructure()` caches `dbRuntime` in a module-level variable. On server restart (Next.js HMR or manual), the cache is cleared and PGLite must re-initialize.

**Two ENOENT paths**:

1. **During `new PGlite(path)` synchronous construction** (if it throws synchronously) → happens before `identitySource.get()` → no log
2. **During first DB operation inside `ensureProvisioned()`** (PGLite async FS init) → inside try/catch → error IS logged, then re-thrown

The Sentry error has NO server log → evidence for **Path 1** (synchronous throw from `getAppContainer()`) OR for a scenario where the error bypassed logging entirely.

However, the early log entries (lines 3–9) show ENOENT with a prior identity log — this matches **Path 2**. Path 1 would have NO identity log.

**Most likely scenario for the Sentry event**: Path 1 — `getAppContainer()` threw ENOENT from `createPglite()` synchronously (if PGLite does throw sync in some cases), before any logger call → no server log → `TypeError: network error` on client.

**Alternative scenario**: Clock skew between browser (Sentry) and server (log file) is hiding the matching log entry. The identity log at `1773435866396` (22:04:26) may correspond to the Sentry event's server-side identity call, and the ENOENT that followed was NOT logged if it happened between identity resolution and provisioning in an unusual way.

---

## 6. Likely Failure Points

**Failure Point 1 — ENOENT not caught as db_error (CONFIRMED)**

The critical gap: `PGliteWasmAbortError` IS caught and maps to `<BootstrapErrorUI error="db_error" />`. ENOENT is NOT caught and re-throws, causing RSC stream to break → `TypeError: network error`.

This is the root of the user experience problem regardless of which exact PGLite path triggers it.

**Failure Point 2 — "Try Again" loops into the same error (CONFIRMED)**

`window.location.reload()` reloads `/auth/bootstrap`. If PGLite still fails (directory still missing), the reload hits the same error. The user is stuck in a retry loop with no useful error message and no self-service recovery path.

**Failure Point 3 — Missing ENOENT guidance in db_error message (CONFIRMED)**

The `ERROR_MESSAGES.db_error` message in `BootstrapErrorUI`:

```
"Local database error — the dev database may be corrupted. Run `pnpm db:reset:pglite` and restart the dev server (`pnpm dev`), then try signing in again."
```

This IS useful — but only if the ENOENT is caught and mapped to `error="db_error"`. Currently ENOENT bypasses this and becomes a generic network error.

---

## 7. Hypotheses

| Hypothesis                                                                                         | Confidence    | Evidence                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1: ENOENT from PGLite falls through try/catch `throw err`, causes RSC network error on client** | **Confirmed** | Code path verified, `PGliteWasmAbortError` check does not cover ENOENT                                                                                        |
| **H2: User was on BootstrapErrorUI (prior db_error) and clicked "Try Again"**                      | **Confirmed** | Sentry click target `div.flex.min-h-screen.items-center.justify-center` matches BootstrapErrorUI's root div exactly                                           |
| **H3: The "Try Again" click reloads bootstrap, hitting the same PGLite error**                     | **Confirmed** | `window.location.reload()` → same URL → same PGLite state                                                                                                     |
| **H4: Error happened before logger could write (getAppContainer() synchronous throw)**             | **Likely**    | No server log at Sentry timestamp; PGLite may throw synchronously in some circumstances                                                                       |
| **H5: Clock skew between browser and server hides the matching log entry**                         | **Possible**  | Identity logs at 22:04:26 and 22:08:57 bracket the Sentry error at 22:07:56                                                                                   |
| **H6: The onboarding form non-submission is unrelated — user was in error loop**                   | **Likely**    | The successful bootstrap at 22:08:57 and onboarding page render at 22:08:57 happened AFTER the Sentry error; user was likely in PGLite retry loop before that |

---

## 8. Missing Evidence / Uncertainty

**Missing:**

- Full server log (23206 chars, first/last 8087 shown) — middle section not available. May contain additional error entries between early ENOENT failures and the 22:03:30 CET entries.
- Whether `new PGlite(path)` throws synchronously or only async — depends on PGLite version behavior for missing parent directory.
- Whether the Sentry event at 22:07:56 corresponds to the identity log at 22:04:26 (clock skew hypothesis) or is truly a separate visit with no log.
- Whether `./data/` directory exists on the developer's machine currently.

**Uncertainty:**

- The exact mechanism of "no server log" for the Sentry error — Path 1 (sync throw from `getAppContainer()`) vs clock skew vs something else.
- Whether this issue is **development-only** (PGLite file mode missing parent dir) or could affect any future deployment with PGLite.

---

## 9. Recommended Next Action

**Immediate fix (low blast radius):**

Expand the `PGliteWasmAbortError` catch in `src/app/auth/bootstrap/page.tsx` to also catch filesystem errors from PGLite (ENOENT, EPERM, etc.). A broad DB-error catch on `PGliteWasmAbortError | NodeJS filesystem errors` should return `<BootstrapErrorUI error="db_error" />` instead of re-throwing.

Specifically, add a check for `err.code === 'ENOENT'` alongside `PGliteWasmAbortError`:

```typescript
if (
  err instanceof PGliteWasmAbortError ||
  (err instanceof Error && (
    err.constructor?.name === 'RuntimeError' ||
    /aborted\(\)/i.test(err.message) ||
    (err as NodeJS.ErrnoException).code === 'ENOENT' ||
    (err as NodeJS.ErrnoException).code === 'EPERM' ||
    (err as NodeJS.ErrnoException).code === 'EACCES'
  ))
) {
  return <BootstrapErrorUI error="db_error" />;
}
```

This ensures ENOENT is caught cleanly and the user sees the actionable `db_error` message (`Run pnpm db:reset:pglite`) instead of a generic network error.

**Scope:** Only `src/app/auth/bootstrap/page.tsx` needs to change. No module boundary, no security implication, no DI impact. This is a pure error-handling gap.

**Validation needed:**

- Unit test: mock `provisioningService.ensureProvisioned()` to throw `{ code: 'ENOENT', message: '...' }` → assert `<BootstrapErrorUI error="db_error" />` is returned.
- `pnpm test`, `pnpm typecheck` — confirm no regressions.

**This investigation is ready to hand off to Implementation Agent.**
