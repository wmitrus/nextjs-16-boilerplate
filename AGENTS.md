# Repository Agent Context

> **MIGRATION NOTICE — Zen Rules deprecated April 20, 2026**
>
> `.zencoder/rules/` and its `repo.md` file are being deprecated.
> **This file (`AGENTS.md`) is now the single authoritative always-applied context for all AI agents.**
>
> - **Never create new rules in `.zencoder/rules/`.**
> - All future rule additions, security patterns, and behavioral constraints go here.
> - The old `.zencoder/rules/repo.md` is a read-only stub pointing to this file.
>
> This applies to all agents: Zencoder, GitHub Copilot, ZenFlow, and any future tooling.

---

## Summary

A production-grade **Next.js 16** boilerplate implementing a **Modular Monolith** architecture. Features React 19, TypeScript strict mode, Tailwind CSS 4, Clerk authentication, Sentry error tracking, Upstash rate limiting, and a three-tier testing strategy (Unit / Integration / E2E).

## Structure

- **`src/app/`**: Next.js App Router - routes, layouts, global styles, error boundaries.
- **`src/core/`**: Foundational layer — T3-Env config (`env.ts`), logger, DI container, error contracts.
- **`src/features/`**: Domain-specific feature modules (e.g., `user-management`, `security-showcase`).
- **`src/modules/`**: Infrastructure modules — `auth/` (Clerk), `authorization/` (ABAC).
- **`src/security/`**: Centralized security logic — middleware, RSC guards, outbound filtering, audit actions.
- **`src/shared/`**: Reusable UI components, hooks, utilities, and types.
- **`src/testing/`**: Shared test factories, MSW infrastructure, integration helpers.
- **`src/stories/`**: Storybook component stories.
- **`e2e/`**: Playwright end-to-end test specs.
- **`tests/`**: Global Vitest setup files and polyfills.
- **`scripts/`**: Utility scripts (env setup/check, secret generation, E2E auth check).
- **`docs/`**: Feature documentation, architecture decisions, SDD, usage guides.
- **`.github/workflows/`**: CI/CD pipelines (PR validation, deploy, release, Lighthouse, security scan).

## Language & Runtime

**Language**: TypeScript
**Version**: TypeScript `^5`, Node.js `24` (`.node-version` / `engines: "node": "24.x"`)
**Build System**: Next.js 16 Build (Turbopack — default for dev & build)
**Package Manager**: pnpm (lockfile: `pnpm-lock.yaml`)

## Next.js 16 Key Configuration (`next.config.ts`)

- `cacheComponents: true` — Cache Components model enabled (PPR-compatible).
- `reactCompiler: true` — React Compiler active; avoid manual `useMemo`/`useCallback`/`memo`.
- `experimental.turbopackFileSystemCacheForDev: true` — Filesystem caching for dev restarts.
- Sentry integrated via `withSentryConfig` (source maps, tunnel route in production, Vercel Cron monitors).

> **`cacheComponents: true` hard constraint — route segment configs are banned**
>
> When `cacheComponents: true` is active, Next.js 16 **forbids** `export const dynamic` and `export const runtime` in any App Router route segment (pages, layouts, route handlers). Both produce a compile-time hard error that loops indefinitely in Turbopack HMR.
>
> **Do not use:**
>
> ```typescript
> export const runtime = 'nodejs'; // ❌ banned with cacheComponents
> export const dynamic = 'force-dynamic'; // ❌ banned with cacheComponents
> ```
>
> **Use instead** — opt into dynamic rendering explicitly at request time:
>
> ```typescript
> import { connection } from 'next/server';
>
> export async function GET(): Promise<Response> {
>   await connection(); // opts route into dynamic rendering
>   // ...
> }
> ```
>
> `await connection()` is the only supported dynamic opt-in under the Cache Components model. It applies equally to RSC pages, layouts, and route handlers. The `isConnected()` guard or other request-time checks do NOT replace `connection()` — they are separate concerns.

## Middleware Note

In this repository, middleware-style request interception lives in **`src/proxy.ts`** — not `middleware.ts`.

Do not search for `middleware.ts`. Do not treat its absence as a finding. Analyze `src/proxy.ts` directly.

## RSC Dynamic Rendering — `getAppContainer()` Pattern

Any async RSC page or component that calls `getAppContainer()` **must** call `await connection()` (from `next/server`) **before** that call.

**Why**: The DI infrastructure initializer (`getInfrastructure()`) calls `logger.debug()` via Pino, which records timestamps using `Date.now()` internally. Next.js 16 prerender mode throws an error if `Date.now()` is called before any request-time data source is accessed.

**Fix pattern**:

```typescript
import { connection } from 'next/server';

async function MyServerComponent() {
  await connection(); // opts route into dynamic rendering — MUST come before getAppContainer()
  const requestContainer = getAppContainer().createChild();
  // ...
}
```

`headers()` or `cookies()` from `next/headers` also satisfy this requirement (and are used by `security-showcase` which reads cookies). Use `connection()` when no actual request data is needed.

## RSC Prerender — Third-Party API `Date.now()` Constraint

**Any third-party library or internal helper that records timestamps (`Date.now()` / `new Date()`) must never be called from a Server Component or layout that may be statically prerendered by Next.js 16.**

Next.js 16 prerender mode throws a hard error if `Date.now()` is accessed before a dynamic data source (`fetch()`, `cookies()`, `headers()`, `connection()`, `searchParams`) is accessed first.

**Known violators:**

- `newrelic.getBrowserTimingHeader()` — records timestamps internally even when it returns an empty string
- `pino` logger — records `Date.now()` on every log call (managed by the `await connection()` rule above)

**Rule**: If a helper function wraps any NR API call (or any library that calls `Date.now()` / `new Date()` internally), it **must not** be called from `layout.tsx` or any page/component that may be prerendered. Use an env-var–based approach instead:

```typescript
// ✅ Safe — route handler runs at request time, after await connection()
// src/app/observability/new-relic-browser.js/route.ts
export async function GET(): Promise<Response> {
  await connection();
  const snippet = getBrowserAgentScriptSafe(); // calls getBrowserTimingHeaderSafe() at request time
  // ...
}

// ❌ Unsafe in prerendered layouts — NR records Date.now() internally
export function getBrowserTimingHeaderSafe(): string {
  return nr.getBrowserTimingHeader(...); // triggers prerender error if called from layout
}
```

**Diagnostic signal**: Error message will reference `new Date()` or the current time, plus the call-stack path through `layout.tsx`. The root cause is always a library recording timestamps — not the layout itself.

**Fix pattern for CDN mode**: NR browser monitoring is delivered via inline NREUM config + `<Script strategy="beforeInteractive">` pointing directly to the versioned NR CDN agent URL in `src/app/layout.tsx`. Do **not** call any NR API from `layout.tsx` or any prerenderable RSC.

**Fix pattern for local dev APM fallback**: The `/observability/new-relic-browser.js` route handler serves `getBrowserAgentScriptSafe()` at request time (after `await connection()`). This only works when the NR APM agent is connected — which requires local dev with `NEW_RELIC_ENABLED=true`.

`getBrowserSnippetSafe()`, `resolveBrowserSnippetSource()`, `readRawSnippetFromEnvFiles()`, and the `NEW_RELIC_BROWSER_SNIPPET` / `NEW_RELIC_BROWSER_SNIPPET_BASE64` env vars have been **removed**. The snippet was ~88 KB (exceeding Vercel's 64 KB per-variable limit).

## New Relic Browser — CDN Delivery Constraints

**Primary delivery model** (Vercel + local dev): CDN standalone agent via inline NREUM config + `<Script strategy="beforeInteractive">` in `src/app/layout.tsx`. Requires `NEW_RELIC_BROWSER_ENABLED=true` + `NEW_RELIC_BROWSER_LICENSE_KEY` + `NEW_RELIC_BROWSER_APP_ID` + `NEW_RELIC_BROWSER_ACCOUNT_ID` + `NEW_RELIC_BROWSER_AGENT_URL`.

**`NEW_RELIC_BROWSER_AGENT_URL` must use `nr-loader-spa-X.min.js`, NOT `nr-spa-X.min.js`.** Critical distinction: `nr-spa-X.min.js` is a webpack module chunk — it requires the NR loader webpack runtime to be loaded first. Loading it directly causes the agent code to be stored in a plain array and **never executed** (zero beacon requests). The NR CDN does not expose an unversioned alias — `nr-spa.min.js` returns **403 Forbidden**. Use the exact versioned **loader** URL: `https://js-agent.newrelic.com/nr-loader-spa-X.min.js`. The loader automatically loads `nr-spa-X.min.js` as a dynamic webpack chunk when the first harvest is needed.

**`strategy="beforeInteractive"` is mandatory** for the CDN agent. `afterInteractive` causes the agent to load after React hydration, missing page load timing (LCP, FCP, TTFB), initial XHR/Fetch, and errors during bootstrap.

**`NREUM.init` is required.** Without it the NR Browser agent uses internal defaults and distributed tracing / ajax deny-list may not be configured correctly. The config is generated by `getNrBrowserCdnConfig()` in `src/core/observability/new-relic-browser.ts`.

**Do NOT** route CDN delivery through the `/observability/new-relic-browser.js` route handler. The route causes a double-hop (route fetch → dynamic script creation → CDN fetch) that loads the agent 3–8 seconds after navigation.

**Do NOT recommend setting `NEW_RELIC_BROWSER_SNIPPET_BASE64` or `NEW_RELIC_BROWSER_SNIPPET` as Vercel environment variables.** Ruled out in task `2026-04-05-nr-browser-spa`.

**APM fallback delivery model** (local dev only): `/observability/new-relic-browser.js` route → `getBrowserAgentScriptSafe()` → APM Node agent (requires connected agent). On Vercel this route returns empty — expected.

**SPA vs rum/lite**: set **Browser agent type** to **Pro + SPA** in NR UI (Browser app → Application settings) for full SPA monitoring. rum/lite only records the initial hard page load.

**Prior tasks**: `.copilot/tasks/2026-04-05-nr-browser-spa/`, `.copilot/tasks/2026-04-08-vercel-newrelic-incident/`, `.copilot/tasks/2026-04-12-vercel-nr-proper-integration/` — read before any NR Browser work.

## New Relic Browser — `allowTransactionlessInjection` Is Banned

**Do not pass `allowTransactionlessInjection: true` to `nr.getBrowserTimingHeader()`.**

The repository guard `nr.agent?.collector?.isConnected()` already ensures the loader is only served when the APM agent has an active server-side transaction context. Passing `allowTransactionlessInjection: true` overrides this safety: the NR SPA agent initializes without a linked transaction on hard refresh, causing its internal harvest serializer to crash with:

```text
TypeError: Cannot read properties of undefined (reading '0')
  at y.serializer (nr-spa-*.min.js)
  at y.makeHarvestPayload
  at S.triggerHarvestFor
```

**Correct pattern** — `isConnected()` guard is sufficient, no additional flags needed:

```typescript
if (!nr.agent?.collector?.isConnected()) return '';
const header = nr.getBrowserTimingHeader({ hasToRemoveScriptWrapper: true });
```

**Never**:

```typescript
nr.getBrowserTimingHeader({
  hasToRemoveScriptWrapper: true,
  allowTransactionlessInjection: true, // ❌ causes SPA harvest crash on hard refresh
});
```

## New Relic Browser — `agentID` vs `applicationID`

NR Browser entities have **two distinct numeric IDs**:

- `agentID` (in `loader_config`) → `NEW_RELIC_BROWSER_APP_ID`
- `applicationID` (in `info`) → `NEW_RELIC_BROWSER_APPLICATION_ID`

These are **always different numbers** in NR Browser. `applicationID` controls which NR entity receives the beacon data. If `APPLICATION_ID` is unset, the code falls back to `APP_ID` — but this routes beacons to the wrong entity (or creates an unnamed `beacon:XXXXXXX` entity in NR).

**Always set both `APP_ID` and `APPLICATION_ID` per-environment (Production, Preview) in Vercel — never "All Environments".** Get both values from the NR entity's snippet: NR UI → Browser entity → Application settings → Copy/Paste JavaScript snippet → `loader_config.agentID` and `info.applicationID`.

Setting `APPLICATION_ID` to "All Environments" routes all beacon traffic to a single entity regardless of environment, breaking isolation. Setting it incorrectly or omitting it creates unnamed `beacon:XXXXXXX` entities.

## New Relic — Per-Environment Browser Entity Setup

Each Vercel deployment environment (Production, Preview) must have its **own separate NR Browser application** with its own `agentID`, `applicationID`, `licenseKey`, and agent URL. Sharing a single NR Browser entity across environments mixes production and preview data.

**Entity names** (e.g. `beacon:421415380`) are **not** controlled by env vars. `NEW_RELIC_APP_NAME` applies only to the Node.js APM agent. Browser entity display names are edited directly in the NR UI entity header.

**Full integration guide**: `docs/features/26 - New Relic Server & Browser Integration.md` — read before making any changes to NR integration.

## AuthJS — Module-Level NextAuth Call Banned In Shared Modules

**Never call `NextAuth(options)` at module level in shared auth configuration files (`auth.ts` or similar).**

The correct pattern is to call `NextAuth(req, ctx, options)` **inside the route handler function only**.

```typescript
// ❌ BANNED — causes CLIENT_FETCH_ERROR regression
// src/modules/auth/infrastructure/authjs/auth.ts
const handler = NextAuth(authOptions);
export { handler };

// ✅ CORRECT — call inside the route handler
// src/app/api/auth/[...nextauth]/route.ts
async function handler(req, ctx) {
  await connection();
  return NextAuth(req, ctx, authOptions);
}
export { handler as GET, handler as POST };
```

**Why this is critical**: Turbopack's filesystem cache (`turbopackFileSystemCacheForDev: true`) does NOT always invalidate compiled route handler caches when only a transitive dependency (`auth.ts`) changes. If `auth.ts` has the module-level call and is compiled into the cache, all `/api/auth/*` routes will return **404 HTML** on the next dev server start, triggering:

- `CLIENT_FETCH_ERROR` in the browser console
- Session showing `null` / unauthenticated on the client
- Admin or protected route guards redirecting to home or sign-in

**Recovery procedure** when CLIENT_FETCH_ERROR recurs in development:

1. `curl http://localhost:3000/api/auth/session` — if it returns HTML (`<!DOCTYPE`), the route is broken
2. `touch src/app/api/auth/[...nextauth]/route.ts` — forces Turbopack to recompile with current source
3. If that does not fix it: `rm -rf .next` and restart `pnpm dev`
4. Verify no module-level `NextAuth()`, `withAuth()`, or similar initializer calls in `auth.ts`

This recovery check targets the normal local dev app on `http://localhost:3000`, not the dedicated Playwright E2E origin.

**Regression guards added** (do not remove):

- `auth.test.ts` has a test verifying `auth.ts` does NOT export `handler`, `GET`, or `POST`
- `e2e/authjs-session.spec.ts` verifies `/api/auth/session` returns `application/json`
- `e2e/authjs-dashboard-entry.spec.ts` verifies AuthJS default landing and unauthenticated `/dashboard` redirect behavior
- `e2e/authjs-onboarding-entry.spec.ts` verifies an incomplete AuthJS user goes through `/onboarding` and then settles on `/dashboard`

## AuthJS E2E Provisioning — Completed-User Blind Spot Is Banned

**Do not keep AuthJS E2E provisioning helpers hard-coded to `onboardingComplete: true` when the task or regression history involves onboarding routing.**

That shape creates a validation blind spot: session-route health and completed-user dashboard entry can still pass while the incomplete-user path (`/auth/signin -> /onboarding -> ready route`) silently regresses.

**Required pattern**:

- AuthJS E2E provisioning helpers must support an explicit onboarding-state override
- auth-flow sign-off for AuthJS must include browser proof for both:
  - session/dashboard health
  - incomplete-user onboarding settlement
- prefer the focused package script `pnpm e2e:authjs:core` for this proof set before widening to broader matrix coverage

**Minimum required AuthJS browser proof for focused auth-flow regressions**:

```shell
pnpm e2e:authjs:core
```

This script must cover:

- `e2e/authjs-session.spec.ts`
- `e2e/authjs-dashboard-entry.spec.ts`
- `e2e/authjs-onboarding-entry.spec.ts`

**Prior incidents**: Tasks `2026-04-21-admin-access-regression` (Session 3: RC1+RC2), `2026-04-25-admin-access-regression` (Session 5: recurred due to missing documentation).

## Rate Limiting — Edge-Log Loop Prevention

`checkRateLimit()` accepts an optional second argument `meta?: { path?: string }`. **Always pass it** from any request-aware context:

```typescript
const result = await checkRateLimit(ip, { path: pathname });
```

**Why this matters**: When Upstash times out, `checkRateLimit()` logs a WARN via the edge logger. The edge logger's loop prevention guard (`edge-utils.ts`) suppresses forwarding to `/api/logs` only when `payload.context.path === '/api/logs'`. Without `path` in the WARN context, the guard cannot fire → WARN is forwarded to `/api/logs` → another rate-limit check → another WARN → infinite recursive log flood.

**Never** add a bypass list (`SELF_RATE_LIMITED_PATHS` or similar) to skip rate limiting on internal endpoints. The bypass removes protection without solving the loop. The correct fix is always propagating `path` in the log context.

See also: SEC-17 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

## Dependencies

**Main Dependencies**:

- **next**: `16.2.11`
- **react** / **react-dom**: `19.2.4`
- **@clerk/nextjs**: `^6.39.0` — Authentication
- **@sentry/nextjs**: `^10.40.0` — Error tracking & observability
- **@t3-oss/env-nextjs**: `^0.13.10` — Type-safe environment variables
- **@upstash/ratelimit** + **@upstash/redis**: Rate limiting
- **zod**: `^4.3.6` — Schema validation
- **pino** + **pino-logflare**: `^10.3.1` — Structured logging
- **clsx** + **tailwind-merge**: Utility class helpers

**Development Dependencies**:

- **tailwindcss**: `^4.2.1`
- **eslint**: `^9.39.3` (Flat Config)
- **prettier**: `^3.8.1`
- **typescript**: `^5`
- **vitest**: `^4.0.18` + **@vitest/coverage-v8**
- **@playwright/test**: `^1.58.2`
- **storybook**: `^10.2.13` (`@storybook/nextjs-vite`)
- **msw**: `^2.12.10` — API mocking
- **@testing-library/react**: `^16.3.2`
- **husky**: `^9.1.7` + **lint-staged**: `^16.2.7`
- **semantic-release**: `^25.0.3`
- **babel-plugin-react-compiler**: `^1.0.0`
- **skott** + **madge** + **depcheck**: Dependency analysis

## Build & Installation

```bash
pnpm install          # Install dependencies
pnpm env:init         # Initialize .env.local from .env.example
pnpm env:check        # Verify env consistency
pnpm dev              # Dev server (Turbopack)
pnpm build            # Production build
pnpm start            # Production server
pnpm typecheck        # TypeScript check (tsc --noEmit)
pnpm lint             # ESLint (Flat Config)
pnpm commit           # Conventional commits via commitizen
pnpm release          # Semantic release
```

## Main Files & Resources

- **`src/app/page.tsx`**: Homepage entry point.
- **`src/app/layout.tsx`**: Root layout.
- **`src/core/env.ts`**: T3-Env schema — single source of truth for all env vars.
- **`next.config.ts`**: Next.js configuration with Sentry wrapper.
- **`eslint.config.mjs`**: ESLint 9 Flat Config.
- **`tsconfig.json`**: TypeScript strict config with path aliases.
- **`postcss.config.ts`**: PostCSS / Tailwind CSS 4 config.
- **`src/proxy.ts`**: Node.js runtime request proxy (replaces middleware for Node use cases).
- **`src/instrumentation.ts`** / **`src/instrumentation-client.ts`**: Sentry instrumentation hooks.
- **`.env.example`**: Template with all required environment variables.

## TypeScript Path Aliases

| Alias          | Resolves to      |
| -------------- | ---------------- |
| `@/*`          | `src/*`          |
| `@/features/*` | `src/features/*` |
| `@/shared/*`   | `src/shared/*`   |
| `@/core/*`     | `src/core/*`     |

## Testing

**Frameworks**: Vitest (unit + integration + Storybook), Playwright (E2E)
**Coverage**: v8 provider, 80% threshold for unit tests (lines/functions/branches/statements)

| Suite       | Config                                    | Pattern                                                | Command                 |
| ----------- | ----------------------------------------- | ------------------------------------------------------ | ----------------------- |
| Unit        | `vitest.unit.config.ts`                   | `src/**/*.test.{ts,tsx}`, `scripts/**/*.test.{ts,tsx}` | `pnpm test`             |
| Integration | `vitest.integration.config.ts`            | `src/**/*.integration.test.{ts,tsx}`                   | `pnpm test:integration` |
| Storybook   | `vitest.config.ts` (project: `storybook`) | `.stories.{ts,tsx}`                                    | `pnpm test:storybook`   |
| E2E         | `playwright.config.ts`                    | `e2e/**/*.spec.ts`                                     | `pnpm e2e`              |
| All Vitest  | `vitest.config.ts`                        | All above                                              | `pnpm test:all`         |

**Test co-location**: Unit tests reside next to source files (e.g., `src/core/env.ts` → `src/core/env.test.ts`).
**Setup files**: `tests/setup.tsx`, `tests/polyfills.ts`.
**E2E browsers**: Chromium only (Playwright); default base URL `http://localhost:3100`.

## Git Hooks & Quality Gates

- **pre-commit**: `lint-staged` — ESLint fix + Prettier on JS/TS; Prettier on JSON/CSS/MD; `tsc-files` on TS.
- **pre-push**: `pnpm typecheck` → `pnpm skott:check:only` → `pnpm depcheck` → `pnpm madge`.
- **commit-msg**: `commitlint` — enforces Conventional Commits spec.

## CI/CD Workflows (`.github/workflows/`)

- **`pr-validation.yml`**: Runs typecheck, lint, unit tests on every PR.
- **`prod-deploy.yml`** / **`preview-deploy.yml`**: Vercel deployments.
- **`release.yml`**: Semantic release automation.
- **`lighthouse.yml`**: Lighthouse CI performance audits.
- **`deployChromatic.yml`**: Chromatic visual regression tests.
- **`security-scan.yml`**: Security scanning.
- **`e2e-label.yml`**: E2E test label automation.

## GitHub Actions / CI Log Retrieval Discipline

Applies whenever an agent checks CI/PR status, GitHub Actions workflow runs, or
Vercel deployment diagnostics for this repository — during `debug-investigation`,
`incident-investigation-workflow`, `change-validation-workflow`, or an ad-hoc
status check. Goal: full diagnostic correctness with minimal context spend, and
an always-available escalation path to raw logs.

1. **Metadata first.** After a push/PR, use the GitHub connector/API only for
   runs/checks, jobs, conclusions, steps, job/step IDs, and artifacts
   metadata. If every required check/job is successful, stop — do not fetch
   any job logs merely to confirm success.
2. **Scope: non-success terminal states, not just `failure`.** By default,
   fetch logs only for jobs/checks in a materially non-success terminal state
   — `failure`, `timed_out`, `cancelled`, `action_required`,
   `startup_failure`, `stale`, or any other state that fails a required
   check/workflow. Never pull logs of a genuinely successful job just to
   double-check it, except the narrow exception in rule 7.
3. **Job-log content never goes through the model context via the
   connector/API directly.** The GitHub connector/API log-fetch path
   available in this repo (e.g. a `fetch_workflow_job_logs`-style call) has
   been observed to return the entire, multi-thousand-line job log with no
   partial/offset option — "metadata-first" (rule 1) does not extend to log
   content. For any non-success job, pull the raw log to a local file outside
   model context first — e.g. `gh run view --log` or `gh api` against the
   GitHub Actions job-logs/raw-download endpoint, redirected to a temp file —
   then use targeted grep/search/read against that file to extract the
   failed step and primary error before anything reaches the model. Do not
   assume `gh run view --log` itself is reliable — it has returned empty
   output in this repo against a job log that existed; if it fails or returns
   nothing, fall back to `gh api` against the direct job-logs/raw-download
   endpoint. The full log may exist locally as evidence/fallback; it must not
   automatically enter model context in full — load it in full only when
   targeted extraction is impossible or the result is inconclusive (rule 8).
4. **First-pass budget ≈100 relevant lines of log content.** The budget
   covers log content that enters model context during first-pass diagnosis —
   not metadata/status calls, not local scan volume, and not solely the size
   of the excerpt reported back to the user. Targeted commands (grep/awk/sed)
   may scan the whole local file; keep their stdout minimal — line numbers
   plus a short signature — and pull one real excerpt only once the location
   is known. ~100 is an orientation budget, not a hard security limit: a
   modest overrun is acceptable when needed to correctly locate the failure,
   but avoid repeated, overlapping reads of the same log content.

   Do not anchor the first excerpt solely on the terminal
   `##[error]Process completed with exit code ...` marker or the job's last
   lines — that is usually only the terminal symptom. Locate, in order: the
   failed-step boundary; the first material error/exception/assertion/fatal
   signature inside that step; the causal stack/server error tied to that
   signature; the exit code/`##[error]` marker only as a secondary anchor. If
   more than one error signature exists, classify them into distinct failure
   clusters before choosing the excerpt. Target shape once anchored: ~20
   lines of causal context before the signature, the full relevant
   error/stack block (commonly ~60 lines), ~20 lines after.

5. **Retries/duplication.** When a test runner (e.g. Playwright) repeats an
   identical failure across retries, keep one representative stack trace plus
   the retry count, and keep every materially different failure cluster —
   don't paste duplicate traces.
6. **Selective expansion.** If the first ~100 relevant lines don't establish
   root cause, are ambiguous, show only a symptom, are missing earlier causal
   context, or span multiple distinct failure clusters, expand by ~100–200
   more lines around the right location, read from the local raw-log file
   (rule 3) rather than by re-fetching through the connector. Don't jump
   straight to the full log.
7. **Successful-job exception.** If a non-success job's root cause depends on
   an artifact, state, or output produced by an earlier successful job, and
   that evidence isn't available otherwise, selectively read the specific
   relevant fragment of that successful job's log using the same local-file/
   targeted-extraction approach as rule 3. Do not fetch that successful job's
   full log automatically.
8. **Raw log fallback.** Treat the full raw job log (retrieved locally per
   rule 3) as the authoritative source, and escalate to it fully when:
   failure location is uncertain; the excerpt is contradictory or
   incomplete; an exact stack/timestamp/request ID/path/test name is needed;
   the cause may sit well before the final error; or the agent is about to
   sign off on a final root cause and truncation could change the conclusion.
9. **High-risk evidence.** For security, auth/authorization, production
   deployment, Vercel production failures, migrations/SQL/persistence, tenant
   isolation, or secrets/environment configuration: a truncated excerpt may
   route and start diagnosis, but must not be the sole basis for the final
   conclusion if omitted context could matter — fetch the needed raw evidence
   block or full raw log before concluding.
10. **Truncation must be explicit.** When working from a truncated excerpt,
    say so: name the workflow/job/step it came from and that the full raw log
    is available as fallback. Never present an excerpt as a complete log.
11. **GitHub connector/API vs RTK — don't mix them.** Use the GitHub
    connector/API only for metadata (rule 1). Route all job-log retrieval —
    partial or full — through the local-file/targeted-extraction path in
    rule 3, never through RTK. RTK remains first-pass compression for local
    shell output (git, tests, package manager, build, lint, and supported
    `gh` summaries); it is not the primary layer for GitHub Actions job logs,
    and raw output remains RTK's fallback too. Do not install a global RTK
    hook and do not run `rtk init -g`.
12. **Evidence escalation ladder.** Use the lightest evidence layer that can
    answer the question correctly, and apply the same metadata-first /
    targeted-extraction discipline at every layer. The default escalation path
    is:
    1. failed/non-success job metadata + targeted log excerpt;
    2. run/job artifact metadata, then targeted extraction from relevant
       artifact content;
    3. observability evidence (for example Sentry, Logflare, runtime/provider
       logs) correlated narrowly by timestamp, route, request, deployment,
       trace, or other available identifier;
    4. full/raw evidence from the relevant layer only when narrower evidence is
       insufficient, contradictory, or truncation could affect the conclusion.

    Do not load whole archives, reports, traces, dashboards, or log streams when
    a targeted read is sufficient.

    This is a default escalation order, not a mandatory sequence. A layer may
    be skipped when available metadata/evidence shows it is irrelevant or when
    a more direct authoritative source is already known. Preserve the reason
    for the skip in the investigation notes.

    For high-risk conclusions covered by rule 9, targeted evidence may start
    the investigation, but fetch the raw evidence needed to support the final
    conclusion whenever omitted context could materially change it.

Baseline: many confirmed root causes in this repo fit in ~8–12 lines; more
complex Playwright failures needed ~40–80 lines; full job logs ran to
thousands of lines of setup/install/build noise. Treat 100 lines as a
deliberately conservative first-pass budget, not a hard cap or a security
control.

## Environment Variables (Key Groups)

Managed via `src/core/env.ts` (T3-Env + Zod). Groups:

- **App**: `NODE_ENV`, `NEXT_PUBLIC_APP_URL`
- **Auth (Clerk)**: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, redirect URLs
- **Error Tracking (Sentry)**: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- **Logging**: `LOG_LEVEL`, `LOGFLARE_*`, `PINO_*`
- **Rate Limiting**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `API_RATE_LIMIT_*`
- **Security**: `INTERNAL_API_KEY`, `SECURITY_AUDIT_LOG_ENABLED`, `SECURITY_ALLOWED_OUTBOUND_HOSTS`, CSP allowlists
- **E2E**: `E2E_ENABLED`, `E2E_CLERK_USER_USERNAME`, `E2E_CLERK_USER_PASSWORD`

---

## Default Operating Principles

Treat this repository as production-grade engineering work, not demo code.

Always:

- inspect surrounding code and existing patterns before proposing or making changes
- prefer the minimum safe change over a broad speculative refactor
- preserve module ownership, dependency direction, and low blast radius
- reason explicitly about trust boundaries, runtime placement, data ownership, and future extensibility
- call out assumptions, unknowns, risks, and tradeoffs directly

Never:

- assume the current implementation is correct without checking the code
- introduce hidden coupling, service-locator behavior, or accidental cross-module knowledge
- move sensitive logic into client code for convenience
- treat middleware or proxy logic as a substitute for server-side authorization
- recommend broad refactors without naming the risk they solve

If a requested solution conflicts with sound architecture, security, or runtime constraints:

- say so clearly
- explain why
- propose the minimum safe alternative

---

## Leantime Integration

Every non-trivial AI task participates in the repository Leantime lifecycle.

Use the applicable `leantime-integration` agent/skill as the operational
authority for task open, resume, close, time logging, diagnostics, and CLI use.

Repository-wide invariants:

- reuse existing task/milestone state; do not create duplicates;
- record the active Leantime task ID in the workflow control artifact;
- close and log time only when the logical task is actually complete;
- parent workflows own lifecycle when they invoke child specialists;
- resumed work reuses the existing lifecycle state;
- do not infer that `.env.leantime` or `.env.leantime-dev` is absent from
  default search results alone.

Detailed automation rules live in:

`docs/ai/general/LEANTIME_AUTOMATION.md`

---

## Source Of Truth

Repository code is authoritative.

Docs, prompts, ADRs, reports, and summaries are supporting evidence and may drift.

If documentation and code disagree:

- trust the code
- report the drift explicitly
- do not silently reconcile the difference
- do not present doc claims as facts unless they were verified in code

---

## Context Loading Protocol

For any non-trivial task:

1. start from the active root instructions and the narrowest applicable skill/workflow;
2. inspect live code/config relevant to the task;
3. load only the AGENTS.md sections and supporting docs needed for the current risk or decision;
4. expand context only when current evidence is insufficient;
5. use targeted Security Coding Patterns sections for applicable SEC rules rather than loading the full catalogue;
6. use `NEXTJS_IMPLEMENTATION_PLAYBOOK.md` only when its implementation guidance is relevant.

Do not preload the full Agent Interaction Protocol, Repository AI Context,
Implementation Anti-Patterns, Security Coding Patterns catalogue, or unrelated
specialist documentation merely because the task is non-trivial.

For middleware-style behavior, inspect `src/proxy.ts` first.

---

## Architecture And Runtime Non-Negotiables

Always reason explicitly about:

- App Router boundaries
- server vs client placement
- route handlers and server actions
- Edge vs Node runtime behavior
- caching and revalidation
- environment-variable exposure
- module boundaries and dependency direction
- DI and composition-root discipline
- provider isolation

Hard rules:

- do not move business logic into `src/shared/*` or UI delivery code
- do not bypass module boundaries because it is convenient
- do not mix server-only code into client bundles
- do not create runtime confusion between Edge-safe and Node-only code paths
- do not ignore cache behavior when data is user-sensitive, tenant-sensitive, or auth-sensitive
- do not introduce provider-specific concepts into core contracts

---

## Auth, Tenancy, And Security Non-Negotiables

Always distinguish:

- authentication
- authorization
- tenant or organization context
- session context
- feature entitlement
- UI visibility

Hard rules:

- authentication checks in UI are never sufficient
- authorization must be enforced server-side
- do not trust client input for tenant, org, or permission authority
- do not scatter raw role checks across unrelated layers
- do not forward redirect-style query parameters without safe sanitization
- do not validate user-controlled record lookups with `key in plainObject`; use `Object.hasOwn`, a null-prototype record, or `Map`
- do not log secrets, tokens, or sensitive private data
- do not use dynamic file paths or configurable URLs in scripts or reusable helpers without point-of-use guards

When auth, org, role, permission, policy, or tenant logic is involved, increase scrutiny and identify:

- where identity is established
- where authorization is enforced
- where tenant context is derived and validated
- whether claims are trustworthy
- whether failure paths are explicit and safe

### Admin Route Scope Discipline — Enforced By A Test

**This is a requirement, not a preference.**
`src/security/core/platform-admin.guard.test.ts` walks every `route.ts` under
`src/app/api/admin` and fails the suite on either half of the rule below.

The same defect was found four times across this repository's security audit
(SEC-26 twice, SEC-41 twice), always in the same shape. Two things must hold:

1. **Two grants, never one boolean.** `isEnvBasedPlatformAdmin` is genuinely
   unscoped; the ABAC `SECURITY_MANAGE_POLICIES` grant is evaluated against
   the caller's **active tenant**, so every tenant owner holds it inside
   their own tenant and nobody holds it beyond. Return
   `{ allowed, isPlatformAdmin }` and turn `isPlatformAdmin` into the scope
   you pass down (`null` for a platform admin, the caller's own
   tenant/organization otherwise). A single `isAdmin` boolean in front of an
   unscoped query serves one tenant's owner every other tenant's rows.
2. **The scope goes in the statement, not in a check above it.** A route may
   not issue an inline `insert`/`update`/`delete`; writes go through a module
   service whose signature makes the scope mandatory. A `SELECT` that proves
   ownership followed by an `UPDATE ... WHERE id = ?` is two decisions, and
   only the second one touches data — put the scope (and a status guard, when
   the mutation should be single-shot) in the same `WHERE` as the id.

Reference implementations: `DrizzleFeatureFlagAdminService.scopePredicate`,
`DrizzleAdminUsersService` (`AdminUserScope`),
`DrizzleInvitationRepository.revokePendingScoped`. Full detail: SEC-26 and
SEC-41 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

Related and non-negotiable: never treat a client-supplied `tenantId` or
`organizationId` as scope authority — derive it from the verified session, and
be especially suspicious of one that reached the database through an
unauthenticated endpoint (SEC-41's waitlist finding).

### An Admin Session Is Not A Person (SEC-48)

Authorization says _what a caller may touch_. It never says _whether the
human is still there_. Every state-changing handler under
`src/app/api/admin/**` therefore runs inside `withAdminStepUp`, which requires
a second factor verified within the last 15 minutes, in the current session.

**This is enforced by a test.** `with-admin-step-up.guard.test.ts` walks the
whole admin route family and fails the suite on any mutating export that is
not wrapped. Its exemption list is empty and the guard asserts that it stays
empty — the same defect (one route left out of a rule the others follow) is
the most repeated finding in this repository's history.

Non-negotiables:

- **Step-up is authentication assurance, not authorization.** It does not
  care whether the caller is a platform admin or a tenant admin; that
  distinction is SEC-26/SEC-41's job and is enforced separately. Both kinds
  of administrator pass the same challenge.
- **Password-only never satisfies MFA**, however recently it was typed. An
  account with no second factor is refused and sent to enrollment, never
  downgraded to a password prompt.
- **Order**: `withNodeProvisioning` first (so SEC-33 deactivation and SEC-36
  revocation apply before a proof is read), then enrollment, then freshness.
  A missing logical session id fails closed — never fall back to the user id,
  which would make one proof valid across every session that user opens.
- **Missing configuration means required, never bypass.**
  `ADMIN_STEP_UP_MODE=bypass-local-only` is rejected by the env schema at
  startup _and_ again at runtime on any deployed environment; missing key
  material resolves to `unavailable` and refuses the mutation.
- **`APP_SECURITY_MASTER_KEY` is HKDF input only**, never used directly, and
  deliberately not `NEXTAUTH_SECRET` or `CLERK_SECRET_KEY` — step-up spans
  both auth providers, and binding it to one provider's secret leaks that
  provider into a shared mechanism.
- **`authorize()` must never resolve roles or ABAC.** MFA at sign-in asks one
  question that belongs to the auth module — _does this account have a second
  factor?_ — and the admin gate asks the authorization one, afterwards.
- **Enrolling a factor is not challenged; removing one is.** Raising
  assurance cannot demand a factor that does not exist yet; lowering it is
  exactly what a hijacked session would do.

Full detail, including the proof format, key derivation, replay handling and
the recovery-code design: SEC-48 in
`docs/ai/general/SECURITY_CODING_PATTERNS.md`, and
`docs/features/37 - MFA & Step-Up Authentication.md`.

### Secrets Never Appear In A Response, Even Masked (SEC-44)

A diagnostics or health payload may report **whether** a variable is set. It
must never carry any part of the value — no prefix, no suffix, no "masked"
form. `getEnvDiagnostics()` returned
`value.slice(0,2) + '***' + value.slice(-4)`, which handed fragments of
`CLERK_SECRET_KEY` and `INTERNAL_API_KEY` to `/api/internal/env-check` **and**
to the `/env-summary` demo page.

Fix such a leak at the function that builds the field, not at one consumer:
the second consumer is the one you will forget.

Related rules for shared-secret guards:

- **Check whether a guard returns before the rate limiter.** A global limiter
  is not coverage for something rejected upstream of it. Give credential
  rejection its own counter rather than reordering the pipeline — an
  unauthenticated caller must not spend a legitimate client's allowance.
- **Compare secrets in constant time**, and compare every configured key even
  after one matches (an early exit makes "current" and "previous" separable by
  timing during a rotation). `crypto.timingSafeEqual` is Node-only; in Edge,
  digest both sides with `crypto.subtle` and XOR-accumulate.
- **Support `current + previous` rotation** so a cutover needs no flag day,
  and log when the previous key is still being used.
- **Floor secret length in production.** `z.string().min(1)` is not a
  validation.

### The Client IP Comes From The Declared Ingress (SEC-43)

**Never read `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip` or a sibling
directly.** Use `getClientIp()` from `@/shared/lib/network/get-ip`. A static
guard (`client-ip.guard.test.ts`) fails the suite on any direct read outside
the resolver.

A header is believed because `DEPLOYMENT_PROXY` declares the ingress that sets
it authoritatively — never because it is present. `DEPLOYMENT_PROXY` is
**required in production** (`vercel | cloudflare | trusted-proxy | none`) and
defaults to `none` in development and test. It is deliberately not inferred
from `VERCEL_ENV`.

`getClientIp()` returns a discriminated result, not a string:

```ts
{ kind: 'trusted'; ip: string } | { kind: 'untrusted'; reason: … }
```

Handle `untrusted` deliberately — the type exists because the old code
returned a fictional `127.0.0.1` and every caller believed it:

- **keyed on the client** (rate limits) → `rateLimitKeyForClient(prefix, client)`,
  which puts unidentifiable clients in one **stable** shared bucket. Never a
  per-request key: that is not a weaker limit, it is no limit.
- **recording provenance** (audit log, ABAC `environment.ip`) →
  `auditIpForClient(client)`, which yields `null`.

Any security condition reading an IP must fail closed when it is absent.
"I cannot tell whether you are blocked" is not "you are not blocked".

### Security-Critical Rate Limits Must Be Durable (SEC-42)

Any limit protecting sign-in, sign-up, password reset, email verification or
invitations goes through `checkStrictRateLimit`
(`src/security/api/strict-rate-limit.ts`), never bare `checkRateLimit`.

Standard mode falls back to a process-local counter when Upstash is
unreachable. On serverless that is not a weakened limit, it is a different
limit: instances are ephemeral and unshared, so the allowance is granted once
per instance the attacker can reach. Strict mode reaches for a durable
Postgres secondary first and **fails closed** if neither store answers —
which costs nothing, because every endpoint that runs in strict mode already
needs Postgres to do its job at all.

Two rules follow from this:

- **A global middleware is not coverage.** Before concluding an endpoint is
  rate-limited, check whether the covering middleware's fallback is durable
  and whether its window is tuned for that endpoint. Three endpoints looked
  covered by the Edge per-IP window and were not (`reset-password`, `signup`,
  `invite`).
- **Key an authenticated abuse control on the actor, not the IP.** An IP key
  misses one account behind a rotating IP and punishes everyone behind a
  shared NAT.

Degrading a strict limit is an operator decision, expressed through the
`strict_rate_limit_degrade` **operational switch** — not by editing the call
site. Operational switches use `OperationalSwitch`
(`src/core/contracts/operational-switch.ts`), never `FeatureFlagService`
directly: that contract requires a tenant and a subject, and these controls
run before authentication. Any flag-backed override must be **loosen-only**,
because `isEnabled()` cannot distinguish "off" from "unavailable".

---

## Pending Scheduled Security Follow-Ups

Load this section only when:

- the current task touches the repository security surface; or
- the user explicitly asks to check pending security work.

Apply only follow-ups whose trigger date has been reached. `CLAUDE.md`
carries the lightweight pointer; this section is the authoritative detail.

### Next.js Critical security release — check on/after 2026-08-26

**Status as of 2026-08-22**: Next.js has publicly announced a **Critical**
severity security release targeted for **2026-08-26**, naming `16.3.2` and
`15.5.24` as the patched versions-to-be. This repository is already on
`next@16.3.2` (upgraded 2026-08-21, the day before that version's public
release) — but **do not assume this repo already has the fix**. As of
2026-08-22, `next@16.3.2`'s public release notes describe only unrelated
backport fixes (app-entry validation, catch-all routing, Turbopack) — there
is no evidence yet that the embargoed Critical fix is already in the
published `16.3.2`, since the advisory itself hadn't been published as of
that date. Treat "we're on 16.3.2" and "we have the fix" as two separate,
unverified claims until the official advisory confirms which exact
version(s) actually carry it.

**On or after 2026-08-26, any session touching this repo's security
surface (or asked to check for pending security work) MUST**:

1. Check whether Next.js has published the official advisory (npm
   registry release notes for `next`, the Next.js GitHub security
   advisories page, or a web search for "Next.js critical security
   advisory 16.3" / "15.5.24").
2. If published: read the advisory's actual affected-version range and
   actual patched version — do not assume it's `16.3.2`/`15.5.24` just
   because those were the pre-announced targets; the real patched version
   could differ once the advisory ships.
3. If this repo's current `next` version is inside the affected range and
   below the real patched version, upgrade:
   `pnpm add next@<patched-version> eslint-config-next@<patched-version>`
   (mirroring how the 16.3.2 upgrade updated the pinned `@next/*` and
   `eslint-config-next` versions in `pnpm-workspace.yaml`'s
   `minimumReleaseAgeExclude` list — update those pins too).
4. Run the full security-relevant gate before calling this done: frozen
   lockfile install (`pnpm install --frozen-lockfile`), `pnpm audit`
   (or the repo's `audit` config in `pnpm-workspace.yaml`), `pnpm test`,
   `pnpm typecheck`, a real `CSP_SCRIPT_MODE=nonce-dynamic pnpm build`
   plus the nonce-dynamic E2E suite (`e2e-label.yml`'s
   `e2e-csp-nonce-dynamic` job, or the path-triggered workflow at
   `.github/workflows/e2e-csp-nonce-dynamic-paths.yml`), a Preview deploy,
   and a Preview runtime smoke check.
5. Only after all of the above passes does this constitute a genuine
   production GO for this dependency — do not treat "the app is on
   16.3.2" alone as sufficient at any point before this checklist
   completes.
6. If this section is still unresolved by the time you read it (advisory
   not yet published, or published but not yet actioned): say so
   explicitly rather than silently skipping it, and if a tracked task for
   this doesn't already exist (check Leantime per this file's mandatory
   protocol, and this repo's `.copilot/tasks/` history), create one so the
   follow-up isn't lost between sessions.

Once this follow-up is actually completed (patch applied and the full gate
above passes, or the advisory turns out not to affect this repo's version
range), delete this subsection from both this file and `CLAUDE.md` — do
not leave a stale "pending" notice pointing at a date that already passed.

---

## Forward-Compatibility Constraints

This boilerplate must remain compatible with stronger tenancy, authorization, and release-control models over time.

Design with future support for:

- tenant and organization isolation
- RBAC and ABAC-style policy enforcement
- provider replacement behind stable contracts
- feature flags with explicit ownership and removal paths

Hard rules:

- do not bake single-tenant assumptions deep into core business logic unless they are clearly labeled
- do not scatter raw role comparisons or policy decisions across unrelated UI and utility layers
- do not make feature flags a substitute for authorization
- do not couple business rules permanently to Clerk-specific shapes when a local contract should exist
- do not design APIs that would make future policy enforcement or tenant isolation painful to add

When these concerns are relevant, assess:

- where enforcement belongs
- how tenant or org context is established and propagated
- whether the design keeps provider-specific details isolated
- whether the change leaves a safe cleanup path for future flag removal or policy hardening

---

## Validation And Change Discipline

Prefer focused validation with strong signal over broad validation with weak justification.

Always:

- validate at the right level for the risk
- distinguish must-fix risks from follow-up debt
- keep risky behavioral changes separate from unrelated cleanup when possible
- document residual risk if a task is only partially complete or intentionally deferred
- **Temporary ESLint execution blocker (effective 2026-08-14, narrowed 2026-08-20):** `pnpm lint --fix` repeatedly hung in some agent shells. **Confirmed Codex-specific** — Claude Code's shell does not reproduce the hang (verified 2026-08-20: `pnpm lint --fix` completes normally, no hang, exit code reflects errors/warnings correctly). **Claude Code agents must run `pnpm lint --fix` normally**, same as every other quality gate — do not skip it. Codex agents (and any other tool that still reproduces the hang) should continue to skip `pnpm lint`, `pnpm lint --fix`, ESLint directly, and any script that invokes ESLint, and report lint as skipped because of this blocker. If a Codex or other-tool run reproduces the hang, that is still real evidence the underlying repo issue isn't fixed for that shell — don't infer from Claude Code's clean run that it's fixed everywhere.
- **run `pnpm lint --fix`, never plain `pnpm lint`** — the linter auto-fixes import order and formatting; running without `--fix` only reports fixable errors and wastes tokens
- for substantial phase-based implementation work, use focused validation during the phase and run repo-wide `pnpm lint --fix` plus `pnpm typecheck` before marking the phase complete
- when shifting recurring scanner findings into local lint, record a baseline in task artifacts and compare local ESLint coverage versus Codacy findings on later PRs

Never:

- rely on shallow happy-path testing for security-sensitive or auth-sensitive changes
- use client-only assertions as the only proof of authorization behavior
- widen test surface area substantially without naming the risk it mitigates

---

## Project-Wide Implementation Anti-Patterns

Project-wide coding and implementation anti-patterns are maintained in:

**`docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md`**

Use that document for durable repository-wide implementation guardrails that are broader than one security rule and narrower than full architectural redesign.

Examples include:

- dynamic bracket dispatch that creates repeat scanner churn
- repeated dynamic object mutation chains in runtime helpers
- open-coded script fs access instead of shared sink-confined wrappers
- broad refactors mixed into behavior work
- phase-close validation being skipped or deferred silently

---

## Testing Expectations

Treat testing as part of design, not an afterthought.

Always reason about:

- unit, integration, and E2E coverage at the right level
- failure paths and regression risks
- auth, redirect, tenant-isolation, and policy-sensitive scenarios when relevant
- whether mocks are hiding architectural mistakes or trust-boundary mistakes

Prefer:

- focused validation with strong signal
- explicit coverage of invariants and failure modes
- realistic integration coverage for security-sensitive behavior

### Playwright E2E Execution Rules

For Playwright/E2E work, use the repository E2E specialist and current architecture sources rather than duplicating their runtime and fixture policy here.

Authoritative sources:

- the applicable `playwright-e2e` agent/skill for the active consumer;
- `docs/usage/05 - Playwright E2E Architecture.md`;
- `scripts/e2e/run-scenario.mjs` for scenario runtime/origin semantics;
- Clerk fixture sources only when Clerk auth/bootstrap/provisioning is involved.

Repository-wide invariants:

- use repository-owned scenario/package runners when they own environment setup;
- do not treat raw Playwright as authoritative sign-off when it bypasses scenario setup;
- keep public, interactive-auth, steady-auth, and mixed scenarios in the fixture model selected for their semantics;
- do not reuse authenticated state for flows whose subject is authentication/bootstrap/onboarding itself;
- do not modify production behavior merely to make E2E validation pass.

Load detailed E2E architecture, provider fixtures, and auth-specific rules only when the task actually touches those surfaces.

---

## Data And Persistence Discipline

Always reason about data ownership and enforcement boundaries.

Hard rules:

- do not allow repositories to become generic dumping grounds
- do not bypass module ownership just because data lives in the same database
- do not silently violate tenant, auth, or policy constraints in data access
- do not mix business orchestration with low-level persistence carelessly

When persistence is involved, assess:

- who owns the data
- where queries should be shaped
- whether transaction boundaries are explicit enough
- whether idempotency or ordering matters
- whether tenant-sensitive or auth-sensitive data could leak through caching or overly broad queries

### Adding A Migration — Two Files, Not One

A new Drizzle migration is not finished when the `.sql` file and
`_journal.json` entry exist. `scripts/validate-migration-journal.ts` resolves
each journal tag through a **hand-maintained literal-path `switch`**
(`readMigrationSql`) — deliberately, because SEC-05/SEC-12 forbid the dynamic
`readFile(join(dir, tag))` form. A tag missing from that switch throws
`[migration-journal] Unsupported journal entry <tag>`, which fails
`pnpm db:migrate:prod` and therefore the Vercel build.

**Every local gate passes when you forget this** — typecheck, unit tests, DB
tests, skott, depcheck, env:check. It went unnoticed for five consecutive
security cases in the 2026-08 audit series, each of which reported "all gates
green" while every preview deploy was failing.

So: add the `case` in the same commit as the migration.
`scripts/validate-migration-journal.test.ts` now walks the real journal and
fails locally if you don't.

---

## Observability And Error Handling

Always preserve actionable, tenant-safe observability.

Hard rules:

- do not swallow meaningful errors silently
- do not emit telemetry that leaks secrets, tokens, or sensitive user data
- do not add noisy monitoring without signal
- do not ignore failure visibility for auth, provisioning, sync, or security-critical flows
- do not pass raw `Error` objects to logger calls — extract `errorMessage: error.message` and `errorName: error.name` as separate string fields (SEC-10)
- when a `window.addEventListener('error', handler)` or `addEventListener('unhandledrejection', handler)` fully owns an error (logs it, sends it to Sentry), **always call `event.preventDefault()`** — without it the browser still marks the error "Uncaught" in the console even after the handler has captured it

Prefer:

- meaningful error handling
- actionable logs and tags
- enough context to debug production failures
- stable telemetry conventions across related flows

## API Response Discipline

**This is a requirement, not a preference, and it is enforced by a test.**
`src/shared/lib/api/response-service.guard.test.ts` walks every `route.ts`
under `src/app/api` and fails the suite if one builds a response by hand.

This wording used to say "prefer". Twelve of thirty-six routes did not
follow it, including five live auth endpoints — advice that nothing checks
is advice that decays. See SEC-38 in
`docs/ai/general/SECURITY_CODING_PATTERNS.md`.

For App Router route handlers and internal API surfaces in this repository:

- **use** the shared response helpers in `src/shared/lib/api/response-service.ts` — never `Response.json(...)` or `NextResponse.json(...)` directly
- use `createSuccessResponse()` for successful JSON payloads
- use `createServerErrorResponse()` or `createValidationErrorResponse()` for structured error payloads
- convert a `ZodError` with `getFieldErrors()` from `@/shared/lib/api/field-errors` rather than flattening issues by hand
- use `withErrorHandler()` for route-handler exception mapping unless the endpoint has a deliberate protocol-specific reason not to
- keep response bodies aligned with the repository response envelope types under `src/shared/types/api-response`

On the client side:

- read error text with `extractApiErrorMessage()` from `@/shared/lib/api/extract-error-message` — the envelope has two error channels (`server_error` carries `error`, `form_errors` carries `errors`), and a client that only reads `.error` silently shows its fallback for every validation failure
- remember that success payloads are wrapped: read `body.data.x`, not `body.x`

Do not:

- open-code ad hoc `NextResponse.json(...)` success/error envelopes in normal application APIs
- add a route to the guard's `EXEMPT_ROUTES` without a written reason naming who consumes that wire format and why the envelope does not fit
- return inconsistent `status` payload shapes across sibling admin or auth APIs without an explicit architectural reason
- design new admin/API surfaces without stating whether they follow the shared ResponseService contract
- **branch client logic on a response's human-readable `message` text.** Return an explicit field and read that; a message comparison breaks silently the moment anyone rewords it (this is exactly what `sign-up-client.tsx` did)

Exception rule:

- raw `Response` / `NextResponse` usage is acceptable for protocol-specific cases such as redirects, streaming, non-JSON payloads, framework handshake endpoints, or other paths where the shared JSON envelope is not the right transport shape
- when taking an exception, document the reason in the design or implementation notes instead of silently diverging

---

## Documentation And ADR Discipline

Prefer durable engineering artifacts over transient chat output.

When a decision materially affects architecture, security, runtime behavior, or workflow expectations, update or create the relevant:

- spec, runbook, or workflow document
- ADR or architecture note
- security pattern entry
- verification checklist or validation artifact

Important decisions should capture:

- context
- decision
- alternatives considered
- consequences
- migration notes or cleanup expectations
- rollback or containment considerations

---

## Possible Enhancements Backlog

`docs/ai/general/POSSIBLE_ENHANCEMENTS.md` is the single holding pen for
valuable-but-deferred ideas that surface during work.

Do not load or inspect the backlog merely because a task started.

When the current task actually surfaces an improvement worth preserving but
outside its required scope, read the backlog rules, add or reference the
appropriate `PE-XX` entry, and avoid duplicating its full rationale in task
artifacts.

Entries are not authorized work and must never be implemented without explicit
scope or user approval.

---

## Change Management

Default to incremental, reviewable, low-blast-radius change sets.

Always assess:

- affected modules and ownership boundaries
- migration risk
- rollback options
- runtime, operational, and validation impact
- whether a cleanup can be separated from behavioral risk

Never:

- hide architectural changes inside “small” edits
- mix unrelated cleanup with risky behavioral changes without saying so
- change public contracts casually

---

## Response Quality

Do not produce AI fluff.

Be:

- specific
- critical when needed
- explicit about tradeoffs and unknowns
- precise about risks and evidence

If asked to review:

- return findings by severity
- separate must-fix issues from lower-priority follow-up
- distinguish architectural, security, runtime, and validation issues instead of blending them together

If asked to design or implement:

- start with boundaries, trust, runtime, and constraints before code
- prefer low-blast-radius recommendations unless larger change is clearly justified

All fenced code blocks in markdown artifacts MUST include a language identifier.
Use `shell` or `bash` for terminal output and commands, `json` for JSON, `text` for plain text and
stack traces, `typescript` / `javascript` for source code, and the appropriate token for all other
languages. Bare ` ``` ` fences without a language identifier are not acceptable.

---

## Artifact-Backed Work

If a task uses `.copilot/tasks/{task_id}/` artifacts or workflow-managed task artifacts:

- treat `plan.md`, `intake.md`, and `implementation-plan.md` as live control documents
- keep checklist state synchronized as work progresses
- record blocked, skipped, deferred, and partial states explicitly
- require each non-orchestrator specialist to maintain exactly one persistent summary artifact for the task
- use the corresponding templates in `docs/ai/templates/` and `docs/ai/templates/specialist-summaries/`

> **CRITICAL — Task artifacts must never contain real credential-shaped values**
>
> When quoting evidence from env files, snippets, config, or logs that contains any key, token, password, license key, API key, secret, or credential-shaped string, **always replace the value with `[REDACTED]`** before writing it into any artifact file.
>
> This applies to ALL agents writing `.copilot/tasks/{task_id}/*.md` files. Browser monitoring license keys (e.g., NR `licenseKey`), API keys, and connection strings are in scope — even when technically public or browser-visible. Gitleaks scans all committed text including markdown. A violation fails the `security-scan` CI workflow and requires both a file redaction and a `.gitleaksignore` fingerprint entry to unblock the branch.
>
> This rule also applies to **all other committed markdown and instruction files**, not only task artifacts. Do not include credential-shaped example values in docs, prompts, summaries, or code snippets even when they are fake or hashed. Use neutral placeholders like `[REDACTED]`, `[hash-prefix]`, or `[example-value]` instead of realistic-looking hex, base64, token, or key strings.

Reference guides:

- `docs/ai/general/ARTIFACTS_GUIDE.md`
- `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`
- `docs/ai/general/09 - Task Brief Authoring.md`

---

## Agent Infrastructure — Where to Propagate Rules

> **IMPORTANT**: When any coding rule, security pattern, or behavioral constraint is added or changed,
> update **ALL** applicable locations below. Never add to `.zencoder/rules/` — it is deprecated.

| Location                                            | Consumer            | Notes                                                                                                                         |
| --------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **`AGENTS.md`** (this file)                         | All AI agents       | Shared repository knowledge base — load relevant sections on demand; update applicable repository-wide rules here             |
| `docs/ai/general/0[1-9] - *.md`                     | Zencoder extension  | Plain markdown prompt files                                                                                                   |
| `.github/agents/*.agent.md`                         | GitHub Copilot      | YAML frontmatter + markdown                                                                                                   |
| `.github/prompts/*.prompt.md`                       | GitHub Copilot      | YAML frontmatter + markdown                                                                                                   |
| `.agents/skills/*/SKILL.md`                         | Codex               | YAML frontmatter + markdown                                                                                                   |
| `.claude/skills/*/SKILL.md`                         | Claude Code         | YAML frontmatter + markdown                                                                                                   |
| `CLAUDE.md`                                         | Claude Code         | Bridges to this file; update its quick-reference sections when Testing/Env/Quality-Gate rules change                          |
| `.zenflow/workflows/*.md`                           | ZenFlow extension   | Step-based workflow files                                                                                                     |
| `docs/ai/general/SECURITY_CODING_PATTERNS.md`       | All agents + humans | Living security catalogue                                                                                                     |
| `docs/ai/general/NEXTJS_IMPLEMENTATION_PLAYBOOK.md` | All agents + humans | How to build a new API route, page/route segment, or test — cross-links SEC-XX and anti-patterns rather than duplicating them |
| `docs/ai/zencoder/*.md`                             | Humans              | Description guides pointing to `docs/ai/general/`                                                                             |
| `docs/ai/copilot/*.md`                              | Humans              | Description guides pointing to `.github/agents/`                                                                              |
| `docs/ai/codex/*.md`                                | Humans              | Description guides pointing to `.agents/skills/`                                                                              |
| `docs/ai/claude/*.md`                               | Humans              | Description guides pointing to `.claude/skills/`                                                                              |
| ~~`.zencoder/rules/repo.md`~~                       | ~~Zencoder~~        | **DEPRECATED — April 20, 2026. Do not use.**                                                                                  |

Full correspondence table and process ownership rules: `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

### Agent Numbering and File Correspondence

| #   | Role                  | Zencoder Prompt                                       | GitHub Copilot Agent                            | Codex Skill                                     | Claude Code Skill                               | ZenFlow Preset              |
| --- | --------------------- | ----------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- | --------------------------- |
| 01  | Architecture Guard    | `docs/ai/general/01 - Architecture Guard Agent.md`    | `.github/agents/architecture-guard.agent.md`    | `.agents/skills/architecture-guard/SKILL.md`    | `.claude/skills/architecture-guard/SKILL.md`    | `architecture-guard-agent`  |
| 02  | Security & Auth       | `docs/ai/general/02 - Security & Auth Agent.md`       | `.github/agents/security-auth.agent.md`         | `.agents/skills/security-auth/SKILL.md`         | `.claude/skills/security-auth/SKILL.md`         | `security-auth-agent`       |
| 03  | Next.js Runtime       | `docs/ai/general/03 - Next.js Runtime Agent.md`       | `.github/agents/nextjs-runtime.agent.md`        | `.agents/skills/nextjs-runtime/SKILL.md`        | `.claude/skills/nextjs-runtime/SKILL.md`        | `nextjs-runtime-agent`      |
| 04  | Implementation        | `docs/ai/general/04 - Implementation Agents.md`       | `.github/agents/implementation-agent.agent.md`  | `.agents/skills/implementation-agent/SKILL.md`  | `.claude/skills/implementation-agent/SKILL.md`  | `implementation-agent`      |
| 05  | Validation Strategy   | `docs/ai/general/05 - Validation Strategy Agent.md`   | `.github/agents/validation-strategy.agent.md`   | `.agents/skills/validation-strategy/SKILL.md`   | `.claude/skills/validation-strategy/SKILL.md`   | `validation-strategy-agent` |
| 06  | Debug Investigation   | `docs/ai/general/06 - Debug Investigation Agent.md`   | `.github/agents/debug-investigation.agent.md`   | `.agents/skills/debug-investigation/SKILL.md`   | `.claude/skills/debug-investigation/SKILL.md`   | `debug-investigation-agent` |
| 07  | Playwright E2E        | `docs/ai/general/07 - Playwright E2E Agent.md`        | `.github/agents/playwright-e2e.agent.md`        | `.agents/skills/playwright-e2e/SKILL.md`        | `.claude/skills/playwright-e2e/SKILL.md`        | `playwright-e2e-agent`      |
| 08  | Workflow Orchestrator | `docs/ai/general/08 - Workflow Orchestrator Agent.md` | `.github/agents/workflow-orchestrator.agent.md` | `.agents/skills/workflow-orchestrator/SKILL.md` | `.claude/skills/workflow-orchestrator/SKILL.md` | —                           |
| 09  | Task Brief Authoring  | `docs/ai/general/09 - Task Brief Authoring.md`        | —                                               | `.agents/skills/task-brief-authoring/SKILL.md`  | `.claude/skills/task-brief-authoring/SKILL.md`  | —                           |
| 10  | Leantime Integration  | `docs/ai/general/10 - Leantime Integration Agent.md`  | `.github/agents/leantime-integration.agent.md`  | `.agents/skills/leantime-integration/SKILL.md`  | `.claude/skills/leantime-integration/SKILL.md`  | —                           |
| 11  | Leantime Strategy     | `docs/ai/general/11 - Leantime Strategy Agent.md`     | —                                               | —                                               | —                                               | —                           |

### Workflow Entry Point Correspondence

| Workflow                            | Neutral Spec                                                               | GitHub Copilot Prompt                                      | Codex Skill                                                       | Claude Code Skill                                                 | ZenFlow Workflow                                       |
| ----------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| 01 - Safe Feature                   | `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`                   | —                                                          | `.agents/skills/safe-feature-workflow/SKILL.md`                   | `.claude/skills/safe-feature-workflow/SKILL.md`                   | `.zenflow/workflows/feature-development.md`            |
| 02 - Safe Refactor                  | `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`                  | `.github/prompts/safe-refactor.prompt.md`                  | `.agents/skills/safe-refactor-workflow/SKILL.md`                  | `.claude/skills/safe-refactor-workflow/SKILL.md`                  | `.zenflow/workflows/safe-refactor.md`                  |
| 03 - Security Incident              | `docs/ai/general/Workflow 03 - Security Incident Workflow.md`              | `.github/prompts/security-incident.prompt.md`              | `.agents/skills/security-incident-workflow/SKILL.md`              | `.claude/skills/security-incident-workflow/SKILL.md`              | `.zenflow/workflows/security-incident-workflow.md`     |
| 04 - Incident Investigation         | `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`         | `.github/prompts/incident-investigation.prompt.md`         | `.agents/skills/incident-investigation-workflow/SKILL.md`         | `.claude/skills/incident-investigation-workflow/SKILL.md`         | `.zenflow/workflows/incident-investigation.md`         |
| 05 - Auth Flow Change Review        | `docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md`        | `.github/prompts/auth-flow-change-review.prompt.md`        | `.agents/skills/auth-flow-change-review-workflow/SKILL.md`        | `.claude/skills/auth-flow-change-review-workflow/SKILL.md`        | `.zenflow/workflows/auth-flow-change-review.md`        |
| 06 - Playwright E2E Validation      | `docs/ai/general/Workflow 06 - Playwright E2E Validation Workflow.md`      | `.github/prompts/playwright-e2e-validation.prompt.md`      | `.agents/skills/playwright-e2e-validation-workflow/SKILL.md`      | `.claude/skills/playwright-e2e-validation-workflow/SKILL.md`      | `.zenflow/workflows/playwright-e2e-validation.md`      |
| 07 - Change Validation              | `docs/ai/general/Workflow 07 - Change Validation Workflow.md`              | `.github/prompts/change-validation.prompt.md`              | `.agents/skills/change-validation-workflow/SKILL.md`              | `.claude/skills/change-validation-workflow/SKILL.md`              | `.zenflow/workflows/change-validation.md`              |
| 08 - Repository Baseline Validation | `docs/ai/general/Workflow 08 - Repository Baseline Validation Workflow.md` | `.github/prompts/repository-baseline-validation.prompt.md` | `.agents/skills/repository-baseline-validation-workflow/SKILL.md` | `.claude/skills/repository-baseline-validation-workflow/SKILL.md` | `.zenflow/workflows/repository-baseline-validation.md` |
| 10 - Codacy Security Review         | `docs/ai/general/Workflow 10 - Codacy Security Review Workflow.md`         | `.github/prompts/codacy-security-review.prompt.md`         | `.agents/skills/codacy-security-review-workflow/SKILL.md`         | `.claude/skills/codacy-security-review-workflow/SKILL.md`         | `.zenflow/workflows/codacy-security-review.md`         |
| 11 - Codacy Findings Review         | `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`         | `.github/prompts/codacy-findings-review.prompt.md`         | `.agents/skills/codacy-findings-review-workflow/SKILL.md`         | `.claude/skills/codacy-findings-review-workflow/SKILL.md`         | `.zenflow/workflows/codacy-findings-review.md`         |

---

## Security Coding Patterns

Repository-specific security rules are maintained in:

`docs/ai/general/SECURITY_CODING_PATTERNS.md`

The catalogue is authoritative for SEC rules and confirmed scanner patterns.

For code writing or review:

1. consult the catalogue Pattern Index when the task has a plausible security or SEC-pattern concern;
2. load only the applicable SEC sections;
3. expand security context only when targeted evidence is insufficient;
4. use `security-auth` when a security/trust decision requires specialist authority.

Do not preload the full Security Coding Patterns catalogue for unrelated work.

`02 - Security & Auth` owns the catalogue. After a durable security pattern changes,
propagate it only to the applicable agent surfaces defined by the repository
agent-infrastructure rules.

---

## DB Schema Type Discipline

**Pattern A — UUID vs TEXT for identifiers**

| Column type | Use when                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `uuid`      | DB-generated PKs (`defaultRandom()`), FK references to UUID-typed PKs                                                             |
| `text`      | Externally-sourced string identifiers: Clerk org IDs (`org_xxx`), tenant slugs, string scope keys, feature flag tenant scope keys |

**Rule**: Misuse of UUID for external/application-level string IDs causes Postgres error `22P02: invalid input syntax for type uuid` at query parameter binding time — silent in unit tests with mocked DB, crash in production.

**Route param rule**: App Router `context.params` values are untrusted strings. Before any `params.*` value is used in a Drizzle predicate against a `uuid` column, parse it with `z.uuid()` or an existing schema such as `organizationIdSchema`, branch on parse failure with `createValidationErrorResponse(...)`, and use only `parseResult.data.*` in DB queries and mutations. Do not alias raw route params as `const invitationId = params.id` or pass `params.id` directly into `eq(table.id, ...)`.

Every route handler with a UUID path segment must have a negative test for a malformed ID (for example `not-a-uuid`) proving the endpoint returns `400` before any DB read/write/repository call that would bind the UUID value.

**Codacy HIGH error-prone rule**: Treat unnecessary optional chaining / nullish
coalescing, Promise-returning JSX handlers, unbound mock methods, and invalid template
literal types as reliability/type-safety findings unless live-code triage identifies a
concrete security path. Do not accept quick fixes blindly. For sparse dynamic state use
`Partial<Record<string, T>>` or `Map<string, T>` and keep required `?.` / `??` fallbacks.
For async JSX handlers use `onClick={() => void handleX(...)}` and
`onSubmit={(event) => void handleSubmit(event)}`. For object mocks use
`vi.Mocked<Interface>`. For finite domain values use `z.enum(...)` or an existing typed
schema instead of broad `z.string()`.

**Deploy/runtime env rule**: A pipeline fix is incomplete if it only makes the
current command pass while the deployed runtime receives a different or missing
configuration contract. Before adding env fallbacks in CI/CD, identify whether the
value is needed at build time, runtime, or both. If runtime needs it, require the
deployment env value and fail fast when it is missing; do not synthesize a build-only
value that masks Vercel/hosted runtime drift. This is mandatory for auth/provider
URLs, tenant context, database URLs, redirect origins, cookies, and other
security-sensitive env.

**Also applies to unique indexes with nullable columns**: A `uniqueIndex(...).on(col1, nullableCol)` in Postgres does NOT enforce uniqueness when `nullableCol IS NULL` (BTree treats `NULL != NULL`). Use `.nullsNotDistinct()` on the unique **constraint** builder (`unique(name).on(cols).nullsNotDistinct()`) when NULLs should be treated as equal for uniqueness.

---

## Script Environment Patterns

**Pattern E — `load-env.ts` for tsx scripts**

`tsx` scripts do NOT auto-load `.env.local`. Scripts that need env vars must import `scripts/load-env.ts` as their absolute first import:

```typescript
import '../load-env'; // MUST be first import
```

`node --env-file ... node_modules/.bin/tsx` is **BROKEN** — the tsx CLI binary is a shell script, not a Node.js module. The canonical `package.json` entry is:

```json
"my:script": "tsx scripts/my-script.ts"
```

**Pattern D — `isMain` guard for exported script functions**

Scripts that export functions AND run side-effectful code at module level MUST use an `isMain` guard:

```typescript
const isMain =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/script-name.ts');
if (isMain) {
  run().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
```

Without this guard, importing the script in tests triggers the side-effectful `run()` call.

---

## DB Adapter Testing — `*.db.test.ts` Required

**Pattern B — Real-DB integration test for every Drizzle adapter**

Every `Drizzle*Service` or `Drizzle*Repository` class MUST have a companion `*.db.test.ts` integration test alongside it.

Pattern:

- `/** @vitest-environment node */` at the top
- Uses `resolveTestDb()` from `@/testing/db/create-test-db`
- `beforeAll`: create testDb, seed test data directly into the relevant table
- `afterAll`: `testDb.cleanup()`
- Must cover: not found, enabled/disabled, tenant isolation, fallback to global

Unit tests with mocked DB (`vi.mock('drizzle-orm', ...)`) are **NOT** sufficient alone — they cannot catch Postgres schema type errors (e.g., `22P02`) or NULL uniqueness issues.

---

## MSW for External HTTP Adapters

**Pattern C — MSW handler required for any adapter making HTTP calls**

Any adapter that calls an external HTTP service (GrowthBook SDK, third-party APIs) MUST have a companion MSW handler:

- File location: `src/modules/{module}/infrastructure/{adapter}/__mocks__/handlers.ts`
- Export a named array: `export const {adapter}Handlers: HttpHandler[]`
- Register via the MSW server from `src/shared/lib/mocks/server.ts`

**Important**: The GrowthBook SDK captures `globalThis.fetch` at module import time. If the module is pre-imported before `server.listen()` runs in `beforeAll`, MSW interception will not work for that module in vitest. In that case, keep the MSW handlers for future integration test use and use `vi.mock(...)` for the unit test.

---

## E2E Coverage for Demo / Showcase Pages

**Pattern F — Playwright spec required for every demo or showcase page**

Every showcase or demo page added to the boilerplate (`/security-showcase`, `/feature-flags-demo`, etc.) MUST have a Playwright E2E spec.

Minimum coverage:

- Page loads without error boundary
- Page title is correct
- Key UI elements (status cards, section headings) are visible
- Active provider / adapter name is visible

Demo pages are public (no auth required). E2E specs MUST NOT depend on Clerk credentials. Do not add `storageState` or authentication setup to demo page specs.

---

## Testing Patterns

### Pattern G — `vi.mock('next/server')` with `vi.importActual`

When mocking `next/server` in Vitest unit tests, use `vi.importActual` (the standalone `vi.` method) without a type parameter. **Never** use `typeof import('next/server')` inline as a type annotation — it violates `@typescript-eslint/consistent-type-imports`.

```typescript
vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});
```

This pattern:

- Spreads the real module so `NextResponse`, `NextRequest`, etc. remain functional
- Overrides only the specific API that needs mocking (e.g., `connection`)
- Avoids the `consistent-type-imports` lint error
- Matches the established pattern used for `pino` in `src/core/logger/utils.test.ts`

**Never use:**

```typescript
// ❌ violates @typescript-eslint/consistent-type-imports
const actual = await importActual<typeof import('next/server')>();
```
