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

## Middleware Note

In this repository, middleware-style request interception lives in **`src/proxy.ts`** — not `middleware.ts`.

Do not search for `middleware.ts`. Do not treat its absence as a finding. Analyze `src/proxy.ts` directly.

## Dependencies

**Main Dependencies**:

- **next**: `16.1.6`
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
- **`postcss.config.mjs`**: PostCSS / Tailwind CSS 4 config.
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
- do not log secrets, tokens, or sensitive private data
- do not use dynamic file paths or configurable URLs in scripts without point-of-use guards

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

---

## Artifact-Backed Work

If a task uses `.copilot/tasks/{task_id}/` artifacts or workflow-managed task artifacts:

- treat `plan.md`, `intake.md`, and `implementation-plan.md` as live control documents
- keep checklist state synchronized as work progresses
- record blocked, skipped, deferred, and partial states explicitly
- require each non-orchestrator specialist to maintain exactly one persistent summary artifact for the task
- use the corresponding templates in `docs/ai/templates/` and `docs/ai/templates/specialist-summaries/`

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
| `.zenflow/workflows/*.md`                     | ZenFlow extension   | Step-based workflow files                              |
| `docs/ai/general/SECURITY_CODING_PATTERNS.md` | All agents + humans | Living security catalogue                              |
| ~~`.zencoder/rules/repo.md`~~                 | ~~Zencoder~~        | **DEPRECATED — April 20, 2026. Do not use.**           |

Full correspondence table and process ownership rules: `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

### Agent Numbering and File Correspondence

| #   | Role                  | Zencoder Prompt                                       | GitHub Copilot Agent                            | ZenFlow Preset              |
| --- | --------------------- | ----------------------------------------------------- | ----------------------------------------------- | --------------------------- |
| 01  | Architecture Guard    | `docs/ai/general/01 - Architecture Guard Agent.md`    | `.github/agents/architecture-guard.agent.md`    | `architecture-guard-agent`  |
| 02  | Security & Auth       | `docs/ai/general/02 - Security & Auth Agent.md`       | `.github/agents/security-auth.agent.md`         | `security-auth-agent`       |
| 03  | Next.js Runtime       | `docs/ai/general/03 - Next.js Runtime Agent.md`       | `.github/agents/nextjs-runtime.agent.md`        | `nextjs-runtime-agent`      |
| 04  | Implementation        | `docs/ai/general/04 - Implementation Agents.md`       | `.github/agents/implementation-agent.agent.md`  | `implementation-agent`      |
| 05  | Validation Strategy   | `docs/ai/general/05 - Validation Strategy Agent.md`   | `.github/agents/validation-strategy.agent.md`   | `validation-strategy-agent` |
| 06  | Debug Investigation   | `docs/ai/general/06 - Debug Investigation Agent.md`   | `.github/agents/debug-investigation.agent.md`   | `debug-investigation-agent` |
| 07  | Playwright E2E        | `docs/ai/general/07 - Playwright E2E Agent.md`        | `.github/agents/playwright-e2e.agent.md`        | `playwright-e2e-agent`      |
| 08  | Workflow Orchestrator | `docs/ai/general/08 - Workflow Orchestrator Agent.md` | `.github/agents/workflow-orchestrator.agent.md` | —                           |
| 09  | Task Brief Authoring  | `docs/ai/general/09 - Task Brief Authoring.md`        | —                                               | —                           |

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

| ID     | Rule                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| SEC-01 | Use `Map<symbol, unknown>` with `Map.get(token)` in DI mock containers — never if/else chains of `token === SYMBOL` |
| SEC-02 | `new URL('/literal-path', req.url)` is safe — `req.url` supplies only the origin                                    |
| SEC-03 | Always call `sanitizeRedirectUrl()` before forwarding any `redirect_url` query param                                |
| SEC-04 | Use explicit `Record<AllowedKeys, fn>` dispatch maps — never `obj[dynamicKey]()`                                    |
| SEC-05 | `fs.*` with `path.resolve(cwd, '<literal>')` is safe; `fs.*` with user input requires confinement                   |
| SEC-06 | `Math.random()` is only acceptable for non-security test uniqueness — use `crypto` for secrets                      |

**`02 - Security & Auth` owns this document.** After any security review or fix, that agent must update it and propagate changes to all locations in the table above.
