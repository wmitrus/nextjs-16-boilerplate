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

**`NEW_RELIC_BROWSER_AGENT_URL` is required and must be versioned.** The NR CDN does not expose an unversioned latest alias — `nr-spa.min.js` returns **403 Forbidden**. Get the exact versioned URL from NR UI → Browser app → Application settings → Copy/Paste JavaScript snippet → `<script src="...">`.

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

## Dependencies

**Main Dependencies**:

- **next**: `16.2.1`
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
**E2E browsers**: Chromium only (Playwright); base URL `http://localhost:3000`.

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

## Leantime Integration — Mandatory Agent Protocol

Every non-trivial AI agent task MUST include Leantime steps at task open and task close.

**Governing reference**: `docs/ai/general/LEANTIME_AUTOMATION.md`

**Responsible agent**: `10 - Leantime Integration Agent`
(`docs/ai/general/10 - Leantime Integration Agent.md`)

### When Leantime steps are required

- Every feature implementation, bug fix, refactor, documentation, security
  incident, baseline validation, and E2E verification task.
- Every workflow run in `.zenflow/workflows/`, `.github/prompts/`, and
  `.agents/skills/` that uses the agent system.

### Task Open (at workflow start)

1. Check existing milestones and tasks in the project (no duplicates).
2. Create or locate milestone.
3. Create main task with HTML description (see Task Description Template in
   `LEANTIME_AUTOMATION.md`).
4. Patch status to `W toku` (4).
5. Record task ID in `intake.md` or `plan.md`.

### Task Close (at workflow end)

1. Patch status to `Zrobione` (0).
2. Log time with `pnpm lt -- run time.log` (see Time Tracking Policy in
   `LEANTIME_AUTOMATION.md`).
3. Update wiki article if implementation notes should persist.

### CLI Entrypoint

```shell
pnpm lt -- run <operation-id> --input '{"...": "..."}' --format=json
```

For Retrospective boards: use `retrospectives.*` operations.
For Blueprint/Canvas boards: use `blueprints.*` operations.

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

## Required Reading Sequence

For any non-trivial task:

1. Read this file (`AGENTS.md`).
2. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
3. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
4. Read the relevant specialist prompt or workflow file for the task.
5. Read `docs/ai/general/SECURITY_CODING_PATTERNS.md` when the task touches redirects, logging, file access, auth, route handlers, scripts, or any security-sensitive path.

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
- **run `pnpm lint --fix`, never plain `pnpm lint`** — the linter auto-fixes import order and formatting; running without `--fix` only reports fixable errors and wastes tokens

Never:

- rely on shallow happy-path testing for security-sensitive or auth-sensitive changes
- use client-only assertions as the only proof of authorization behavior
- widen test surface area substantially without naming the risk it mitigates

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

Reference guides:

- `docs/ai/general/ARTIFACTS_GUIDE.md`
- `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`
- `docs/ai/general/09 - Task Brief Authoring.md`

---

## Agent Infrastructure — Where to Propagate Rules

> **IMPORTANT**: When any coding rule, security pattern, or behavioral constraint is added or changed,
> update **ALL** applicable locations below. Never add to `.zencoder/rules/` — it is deprecated.

| Location                                      | Consumer            | Notes                                                  |
| --------------------------------------------- | ------------------- | ------------------------------------------------------ |
| **`AGENTS.md`** (this file)                   | All AI agents       | **Primary always-applied context — update here first** |
| `docs/ai/general/0[1-9] - *.md`               | Zencoder extension  | Plain markdown prompt files                            |
| `.github/agents/*.agent.md`                   | GitHub Copilot      | YAML frontmatter + markdown                            |
| `.github/prompts/*.prompt.md`                 | GitHub Copilot      | YAML frontmatter + markdown                            |
| `.agents/skills/*/SKILL.md`                   | Codex               | YAML frontmatter + markdown                            |
| `.zenflow/workflows/*.md`                     | ZenFlow extension   | Step-based workflow files                              |
| `docs/ai/general/SECURITY_CODING_PATTERNS.md` | All agents + humans | Living security catalogue                              |
| `docs/ai/zencoder/*.md`                       | Humans              | Description guides pointing to `docs/ai/general/`      |
| `docs/ai/copilot/*.md`                        | Humans              | Description guides pointing to `.github/agents/`       |
| `docs/ai/codex/*.md`                          | Humans              | Description guides pointing to `.agents/skills/`       |
| ~~`.zencoder/rules/repo.md`~~                 | ~~Zencoder~~        | **DEPRECATED — April 20, 2026. Do not use.**           |

Full correspondence table and process ownership rules: `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

### Agent Numbering and File Correspondence

| #   | Role                  | Zencoder Prompt                                       | GitHub Copilot Agent                            | Codex Skill                                     | ZenFlow Preset              |
| --- | --------------------- | ----------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- | --------------------------- |
| 01  | Architecture Guard    | `docs/ai/general/01 - Architecture Guard Agent.md`    | `.github/agents/architecture-guard.agent.md`    | `.agents/skills/architecture-guard/SKILL.md`    | `architecture-guard-agent`  |
| 02  | Security & Auth       | `docs/ai/general/02 - Security & Auth Agent.md`       | `.github/agents/security-auth.agent.md`         | `.agents/skills/security-auth/SKILL.md`         | `security-auth-agent`       |
| 03  | Next.js Runtime       | `docs/ai/general/03 - Next.js Runtime Agent.md`       | `.github/agents/nextjs-runtime.agent.md`        | `.agents/skills/nextjs-runtime/SKILL.md`        | `nextjs-runtime-agent`      |
| 04  | Implementation        | `docs/ai/general/04 - Implementation Agents.md`       | `.github/agents/implementation-agent.agent.md`  | `.agents/skills/implementation-agent/SKILL.md`  | `implementation-agent`      |
| 05  | Validation Strategy   | `docs/ai/general/05 - Validation Strategy Agent.md`   | `.github/agents/validation-strategy.agent.md`   | `.agents/skills/validation-strategy/SKILL.md`   | `validation-strategy-agent` |
| 06  | Debug Investigation   | `docs/ai/general/06 - Debug Investigation Agent.md`   | `.github/agents/debug-investigation.agent.md`   | `.agents/skills/debug-investigation/SKILL.md`   | `debug-investigation-agent` |
| 07  | Playwright E2E        | `docs/ai/general/07 - Playwright E2E Agent.md`        | `.github/agents/playwright-e2e.agent.md`        | `.agents/skills/playwright-e2e/SKILL.md`        | `playwright-e2e-agent`      |
| 08  | Workflow Orchestrator | `docs/ai/general/08 - Workflow Orchestrator Agent.md` | `.github/agents/workflow-orchestrator.agent.md` | `.agents/skills/workflow-orchestrator/SKILL.md` | —                           |
| 09  | Task Brief Authoring  | `docs/ai/general/09 - Task Brief Authoring.md`        | —                                               | `.agents/skills/task-brief-authoring/SKILL.md`  | —                           |
| 10  | Leantime Integration  | `docs/ai/general/10 - Leantime Integration Agent.md`  | `.github/agents/leantime-integration.agent.md`  | `.agents/skills/leantime-integration/SKILL.md`  | —                           |

### Workflow Entry Point Correspondence

| Workflow                            | Neutral Spec                                                               | GitHub Copilot Prompt                                      | Codex Skill                                                       | ZenFlow Workflow                                       |
| ----------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| 01 - Safe Feature                   | `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`                   | —                                                          | `.agents/skills/safe-feature-workflow/SKILL.md`                   | `.zenflow/workflows/feature-development.md`            |
| 02 - Safe Refactor                  | `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`                  | `.github/prompts/safe-refactor.prompt.md`                  | `.agents/skills/safe-refactor-workflow/SKILL.md`                  | `.zenflow/workflows/safe-refactor.md`                  |
| 03 - Security Incident              | `docs/ai/general/Workflow 03 - Security Incident Workflow.md`              | `.github/prompts/security-incident.prompt.md`              | `.agents/skills/security-incident-workflow/SKILL.md`              | `.zenflow/workflows/security-incident-workflow.md`     |
| 04 - Incident Investigation         | `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`         | `.github/prompts/incident-investigation.prompt.md`         | `.agents/skills/incident-investigation-workflow/SKILL.md`         | `.zenflow/workflows/incident-investigation.md`         |
| 05 - Auth Flow Change Review        | `docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md`        | `.github/prompts/auth-flow-change-review.prompt.md`        | `.agents/skills/auth-flow-change-review-workflow/SKILL.md`        | `.zenflow/workflows/auth-flow-change-review.md`        |
| 06 - Playwright E2E Validation      | `docs/ai/general/Workflow 06 - Playwright E2E Validation Workflow.md`      | `.github/prompts/playwright-e2e-validation.prompt.md`      | `.agents/skills/playwright-e2e-validation-workflow/SKILL.md`      | `.zenflow/workflows/playwright-e2e-validation.md`      |
| 07 - Change Validation              | `docs/ai/general/Workflow 07 - Change Validation Workflow.md`              | `.github/prompts/change-validation.prompt.md`              | `.agents/skills/change-validation-workflow/SKILL.md`              | `.zenflow/workflows/change-validation.md`              |
| 08 - Repository Baseline Validation | `docs/ai/general/Workflow 08 - Repository Baseline Validation Workflow.md` | `.github/prompts/repository-baseline-validation.prompt.md` | `.agents/skills/repository-baseline-validation-workflow/SKILL.md` | `.zenflow/workflows/repository-baseline-validation.md` |
| 10 - Codacy Security Review         | `docs/ai/general/Workflow 10 - Codacy Security Review Workflow.md`         | `.github/prompts/codacy-security-review.prompt.md`         | `.agents/skills/codacy-security-review-workflow/SKILL.md`         | `.zenflow/workflows/codacy-security-review.md`         |
| 11 - Codacy Findings Review         | `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`         | `.github/prompts/codacy-findings-review.prompt.md`         | `.agents/skills/codacy-findings-review-workflow/SKILL.md`         | `.zenflow/workflows/codacy-findings-review.md`         |

---

## Security Coding Patterns

Repository-specific security coding rules are maintained in:

**`docs/ai/general/SECURITY_CODING_PATTERNS.md`**

This document is the living, authoritative catalogue of:

- security patterns to avoid and their correct alternatives
- confirmed false-positive scanner signals and why they are safe
- mandatory coding rules produced from structured security reviews

**All agents that write or review code MUST read this document.**

Key rules currently in effect:

| ID     | Rule                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01 | Use `Map<symbol, unknown>` with `Map.get(token)` in DI mock containers — never if/else chains of `token === SYMBOL`                               |
| SEC-02 | `new URL('/literal-path', req.url)` is safe — `req.url` supplies only the origin                                                                  |
| SEC-03 | Always call `sanitizeRedirectUrl()` before forwarding any `redirect_url` query param                                                              |
| SEC-04 | Use explicit `Record<AllowedKeys, fn>` dispatch maps — never `obj[dynamicKey]()`                                                                  |
| SEC-05 | `fs.*` with `path.resolve(cwd, '<literal>')` is safe; `fs.*` with user input requires confinement                                                 |
| SEC-06 | `Math.random()` is only acceptable for non-security test uniqueness — use `crypto` for secrets                                                    |
| SEC-07 | `uuid` column type only for DB-generated PKs and FK refs — use `text` for external/app-level string IDs                                           |
| SEC-08 | Use `unique().nullsNotDistinct()` not `uniqueIndex()` for unique constraints on nullable columns                                                  |
| SEC-09 | Never share mutable SDK instances across requests — cache only feature definitions, evaluate with per-request context                             |
| SEC-10 | Never log raw `error` objects — extract `errorMessage` and `errorName` as separate sanitized string fields                                        |
| SEC-11 | SDK client module-level caches must key by ALL differentiating config (e.g., `clientKey + apiHost`) — never by a subset                           |
| SEC-12 | Use `path.resolve(cwd, '<literal>')` for all `fs.*` paths in scripts — never `path.join` (SEC-05 refinement)                                      |
| SEC-13 | `pnpm env:validate` is a deploy gate — run only in deploy workflows after `vercel pull`; never in `pr-validation.yml`                             |
| SEC-14 | UUID test fixtures for `z.uuid()`-validated fields must be valid RFC 4122 v4 format                                                               |
| SEC-15 | Never use `key in plainObject` to guard a user-controlled lookup before `plainObject[key]`; use `Object.hasOwn`, null-prototype records, or `Map` |
| SEC-16 | Reusable `fs.*` helpers must resolve and confine path arguments at the helper sink; caller assumptions are insufficient                           |

**`02 - Security & Auth` owns this document.** After any security review or fix, that agent must update it and propagate changes to all locations in the table above.

---

## DB Schema Type Discipline

**Pattern A — UUID vs TEXT for identifiers**

| Column type | Use when                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `uuid`      | DB-generated PKs (`defaultRandom()`), FK references to UUID-typed PKs                                                             |
| `text`      | Externally-sourced string identifiers: Clerk org IDs (`org_xxx`), tenant slugs, string scope keys, feature flag tenant scope keys |

**Rule**: Misuse of UUID for external/application-level string IDs causes Postgres error `22P02: invalid input syntax for type uuid` at query parameter binding time — silent in unit tests with mocked DB, crash in production.

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
