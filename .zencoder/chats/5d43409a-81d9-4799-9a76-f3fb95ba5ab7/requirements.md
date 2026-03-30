# PRD: Local Dev Reliability — Auth/Provisioning Stabilization

## 1. Problem Statement

After the auth/provisioning architecture refactor (bootstrap-first flow, Clerk email claim contract, single-flight provisioning), the **production architecture is correct** and **the code paths are sound**. However, local development with PGlite is unstable due to two distinct root causes that block runtime verification of the correct code paths.

### Root Cause A — PGlite WASM Abort (Highest Priority)

The local `./data/pglite` filesystem state is corrupted after prior schema drift and repeated bootstrap attempts. When `DrizzleProvisioningService.ensureProvisioned()` executes a transaction against a corrupted PGlite WAL, the WASM runtime throws:

```
RuntimeError: Aborted(). Build with -sASSERTIONS for more info.
```

This error surfaces as an unhandled exception in `BootstrapPage`, leaving the user stuck in the bootstrap loop even though:

- Clerk now correctly emits `hasEmailClaim: true`
- The provisioning code path is architecturally correct

**There is no script to wipe and recreate the local PGlite database**, and **no defensive error detection** to guide the developer to the remedy.

### Root Cause B — Clerk Redirect Drift (Medium Priority)

The user's `.env.local` may have stale overrides for Clerk redirect URLs (e.g., pointing to `/` or `/onboarding` instead of `/auth/bootstrap`). The existing `pnpm env:check` script only validates that keys declared in `src/core/env.ts` appear in `.env.example` — it does **not** validate that effective runtime values of Clerk redirect URLs converge on the required `/auth/bootstrap` target.

### Already Resolved (Out of Scope)

The following items from the prior status report are **already implemented in code** and do not require further changes:

- `pnpm dev:webpack` command — present in `package.json`
- Sentry dev filters for Turbopack noise — implemented in `src/shared/lib/observability/sentry-dev-filters.ts`
- Bootstrap-first flow — implemented in `src/app/auth/bootstrap/page.tsx`
- Single-flight provisioning — implemented in `DrizzleProvisioningService.ts`
- Synthetic email repair — implemented in `DrizzleProvisioningService.ts`
- Logger debug-level file transport — fixed in `src/core/logger/streams.ts`
- Error boundaries with rich diagnostics — fixed in `src/app/error.tsx`, `src/app/global-error.tsx`

---

## 2. Goals

| #   | Goal                                                                                        | Priority |
| --- | ------------------------------------------------------------------------------------------- | -------- |
| G1  | Provide a single command to cleanly reset the local PGlite database and re-apply migrations | P0       |
| G2  | Detect WASM abort errors from PGlite and surface an actionable error message in dev         | P1       |
| G3  | Detect Clerk redirect URL drift at dev startup and fail fast with a clear message           | P2       |

---

## 3. Non-Goals

- Fixing PGlite WASM internals or patching `@electric-sql/pglite`
- Making PGlite production-grade (it is a local-dev driver only; production uses `postgres`)
- Changing the core provisioning or auth architecture (it is correct)
- Fixing Turbopack noise in the browser (already mitigated with Sentry filters)
- Creating README or documentation files

---

## 4. User Stories

### US-1: PGlite Reset Script (G1)

> **As a developer** setting up the project or recovering from a corrupted local DB state,  
> **I want** a single `pnpm` command to wipe the PGlite data directory and re-apply migrations from scratch,  
> **so that** I can start fresh without manually inspecting the filesystem.

**Acceptance criteria:**

- Command: `pnpm db:reset:pglite`
- Removes `./data/pglite` (or the path configured by `DATABASE_URL` / env)
- Runs `pnpm db:migrate:dev` immediately after to restore schema
- Prints clear start/finish messages
- Works on macOS, Linux, and Windows (WSL2)
- Does **not** run in production (`NODE_ENV=production` guard)

### US-2: WASM Abort Detection (G2)

> **As a developer** whose PGlite instance aborts mid-transaction,  
> **I want** a descriptive error message explaining what happened and how to fix it,  
> **so that** I don't spend time debugging a cryptic `RuntimeError: Aborted()`.

**Acceptance criteria:**

- `createPglite()` wraps initialization in try/catch
- If a `RuntimeError` or error message containing `Aborted()` is detected, it throws a `PGliteWasmAbortError` with the message:
  ```
  PGlite WASM abort detected. The local database at '<path>' may be corrupted.
  Run: pnpm db:reset:pglite
  ```
- This error is detectable by log-level and Sentry event type so it can be filtered correctly in dev

### US-3: Clerk Redirect URL Drift Detection (G3)

> **As a developer** with a stale `.env.local` that overrides Clerk redirect URLs,  
> **I want** the dev startup or `pnpm env:check` to warn me that my effective Clerk redirect values don't point to `/auth/bootstrap`,  
> **so that** I don't get confused by auth redirect loops that aren't caused by code bugs.

**Acceptance criteria:**

- `pnpm env:check` (or a new dedicated check) validates that `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` all resolve to `/auth/bootstrap`
- If any deviate, the check **warns** (does not fail hard) and prints the actual vs. expected values
- Only active in `NODE_ENV=development` context

---

## 5. Assumptions

| #   | Assumption                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | PGlite is exclusively a local-dev driver; this feature has zero production impact                                                                   |
| A2  | The existing `pnpm db:migrate:dev` script is idempotent and safe to call after a reset                                                              |
| A3  | The `DATABASE_URL` env var for PGlite, when set, is in one of the supported formats: `file:./data/pglite`, `pglite://./data/pglite`, or a bare path |
| A4  | The developer has write access to `./data/pglite`                                                                                                   |
| A5  | Clerk redirect URL validation is advisory (warning only) — enforcement at runtime by Clerk itself is the authoritative check                        |

---

## 6. Out-of-Scope Edge Cases

- Multi-developer shared PGlite state (not a supported use case)
- PGlite corruption during migration (handled separately by `runMigrations` error propagation)
- CI environments (CI uses `postgres` driver via `DB_DRIVER=postgres`)

---

## 7. Success Criteria

After implementation:

1. A developer who encounters `RuntimeError: Aborted()` can run `pnpm db:reset:pglite` and obtain a clean, migrated local database.
2. `createPglite` emits a descriptive, actionable error instead of a raw WASM panic.
3. `pnpm env:check` warns when Clerk redirect URLs in the active environment do not converge on `/auth/bootstrap`.
4. `pnpm typecheck` and `pnpm lint` pass without errors.
