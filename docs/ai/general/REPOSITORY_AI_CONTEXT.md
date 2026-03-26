# Repository AI Context

Repository-specific context every agent must know before starting work.

Read this file at the start of every session. Do not rely on generic framework assumptions when this file says otherwise.

---

## Repository Identity

Production-grade **Next.js 16** boilerplate implementing a **Modular Monolith** architecture.

- **Language**: TypeScript strict mode
- **Runtime**: Node.js 24
- **Package Manager**: pnpm
- **Build**: Next.js 16 + Turbopack

---

## Middleware Note

In this repository, middleware-style request interception lives in **`src/proxy.ts`** — not `middleware.ts`.

Do not search for `middleware.ts`. Do not treat its absence as a finding. Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.

---

## Module Structure

| Layer                    | Path            | Owns                                              |
| ------------------------ | --------------- | ------------------------------------------------- |
| App (delivery)           | `src/app/`      | Routes, layouts, pages, error boundaries          |
| Core (contracts)         | `src/core/`     | T3-Env, DI container, error contracts, logger     |
| Features (domain)        | `src/features/` | Domain-specific feature modules                   |
| Modules (infrastructure) | `src/modules/`  | Auth (Clerk), authorization (ABAC)                |
| Security (enforcement)   | `src/security/` | Middleware, RSC guards, outbound filtering, audit |
| Shared (reusable)        | `src/shared/`   | UI components, hooks, utilities, types            |
| Testing                  | `src/testing/`  | MSW, test factories, integration helpers          |
| E2E                      | `e2e/`          | Playwright specs                                  |

Dependency direction: `app → features/modules/security/shared/core`

---

## Agent Infrastructure — Complete Location Map

This is the authoritative map of every place agent rules must be propagated.

**When you add, change, or remove a coding rule, security pattern, or behavioral constraint:**
Update ALL locations below that apply to the rule's scope.

| Location                                      | Purpose                                | Consumer                 | Format                      |
| --------------------------------------------- | -------------------------------------- | ------------------------ | --------------------------- |
| `docs/ai/general/0[1-9] - *.md`               | Agent prompt source                    | Zencoder extension       | Plain markdown prompt       |
| `.github/agents/*.agent.md`                   | Agent prompt source                    | GitHub Copilot           | YAML frontmatter + markdown |
| `.zencoder/rules/repo.md`                     | Always-applied context                 | Zencoder (every session) | `alwaysApply: true`         |
| `.zenflow/workflows/*.md`                     | Workflow execution specs               | ZenFlow extension        | Step-based markdown         |
| `docs/ai/general/SECURITY_CODING_PATTERNS.md` | Living security rule catalogue         | All agents + humans      | Indexed pattern entries     |
| `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`  | Auth-specific anti-patterns            | Auth/security work       | Anti-pattern list           |
| `docs/ai/zencoder/*.md`                       | Description guides (non-authoritative) | Humans                   | Points to `general/`        |
| `docs/ai/copilot/*.md`                        | Description guides (non-authoritative) | Humans                   | Points to `.github/agents/` |

### Agent Numbering and File Correspondence

| #   | Role                  | Zencoder Prompt                                       | GitHub Copilot Agent                            | ZenFlow Presets             |
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

### ZenFlow Workflow Files

| Workflow                       | File                                                   |
| ------------------------------ | ------------------------------------------------------ |
| Feature development            | `.zenflow/workflows/feature-development.md`            |
| Safe refactor                  | `.zenflow/workflows/safe-refactor.md`                  |
| Incident investigation         | `.zenflow/workflows/incident-investigation.md`         |
| Security incident              | `.zenflow/workflows/security-incident-workflow.md`     |
| Auth flow change review        | `.zenflow/workflows/auth-flow-change-review.md`        |
| Change validation              | `.zenflow/workflows/change-validation.md`              |
| Repository baseline validation | `.zenflow/workflows/repository-baseline-validation.md` |
| Playwright E2E validation      | `.zenflow/workflows/playwright-e2e-validation.md`      |
| Architecture lint              | `.zenflow/workflows/architecture-lint.md`              |

---

## Security Coding Patterns — Process Ownership

**`docs/ai/general/SECURITY_CODING_PATTERNS.md`** is the living catalogue of security patterns.

### When it must be updated

- After every structured security review (scanner triage, pentest, manual review)
- After any security fix that reveals a new pattern or confirms a false positive
- After a security incident workflow run
- When a new anti-pattern is identified during implementation or refactoring

### Who owns the update

**`02 - Security & Auth`** is the process owner.

After any security finding or fix, this agent must:

1. Classify each finding: real risk, latent risk, or false positive
2. Add or update the relevant SEC-XX entry in `SECURITY_CODING_PATTERNS.md`
3. Propagate mandatory rules to the agent location map above

The Workflow Orchestrator (08) must include a SECURITY_CODING_PATTERNS.md update step in any security-related workflow plan.

---

## Key Repository Files

| File                                      | Purpose                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| `src/core/env.ts`                         | T3-Env schema — single source of truth for all env vars         |
| `src/proxy.ts`                            | Request interception / middleware equivalent                    |
| `src/security/middleware/with-auth.ts`    | Auth guard middleware                                           |
| `src/shared/lib/routing/safe-redirect.ts` | `sanitizeRedirectUrl()` — use for all forwarded redirect params |
| `next.config.ts`                          | Next.js configuration with Sentry                               |
| `eslint.config.mjs`                       | ESLint 9 Flat Config                                            |
| `tsconfig.json`                           | TypeScript strict config with path aliases                      |
| `.env.example`                            | Template for all required environment variables                 |

---

## TypeScript Path Aliases

| Alias          | Resolves to      |
| -------------- | ---------------- |
| `@/*`          | `src/*`          |
| `@/features/*` | `src/features/*` |
| `@/shared/*`   | `src/shared/*`   |
| `@/core/*`     | `src/core/*`     |

---

## Test Strategy

| Suite       | Config                         | Pattern                              | Command                 |
| ----------- | ------------------------------ | ------------------------------------ | ----------------------- |
| Unit        | `vitest.unit.config.ts`        | `src/**/*.test.{ts,tsx}`             | `pnpm test`             |
| Integration | `vitest.integration.config.ts` | `src/**/*.integration.test.{ts,tsx}` | `pnpm test:integration` |
| Storybook   | `vitest.config.ts`             | `.stories.{ts,tsx}`                  | `pnpm test:storybook`   |
| E2E         | `playwright.config.ts`         | `e2e/**/*.spec.ts`                   | `pnpm e2e`              |

Unit tests are co-located with source files (e.g. `src/core/env.ts` → `src/core/env.test.ts`).

---

## Quality Gates

| Gate               | Command                 |
| ------------------ | ----------------------- |
| Type check         | `pnpm typecheck`        |
| Lint               | `pnpm lint`             |
| Unit tests         | `pnpm test`             |
| Circular dep check | `pnpm skott:check:only` |
| Unused dep check   | `pnpm depcheck`         |
| Env consistency    | `pnpm env:check`        |

Pre-push hook runs: typecheck → skott → depcheck → madge.
