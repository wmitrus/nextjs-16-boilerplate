# Repository AI Context

Repository-specific context every agent must know before starting work.

Read this file at the start of every non-trivial session. Do not rely on generic framework assumptions when this file says otherwise.

---

## Repository Identity

This repository is a production-grade **Next.js 16 TypeScript boilerplate** designed as a **modular monolith** for long-term reuse across multiple applications.

It is not demo code and must not be treated as a rapid-prototype repository.

Primary goals:

- preserve modular monolith boundaries
- maintain contract-first design
- keep DI and composition-root discipline
- isolate provider-specific integrations
- centralize security-sensitive enforcement
- remain ready for future tenancy and organizations
- remain ready for RBAC and ABAC evolution
- remain ready for feature flags
- remain compatible with Vercel-hosted App Router deployments
- maintain production-grade observability and low-blast-radius evolution

Current practical stack:

- **Language**: TypeScript strict mode
- **Runtime**: Node.js 24
- **Package Manager**: pnpm
- **Build**: Next.js 16 + Turbopack

---

## Middleware Note

In this repository, middleware-style request interception lives in **`src/proxy.ts`** — not `middleware.ts`.

Do not search for `middleware.ts`. Do not treat its absence as a finding. Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.

When a task concerns middleware-like behavior, inspect `src/proxy.ts` first.

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

Expected dependency direction:

- `app -> features/modules/security/shared/core`
- `features -> modules/security/shared/core`
- `modules -> shared/core`
- `security -> shared/core`
- `shared -> core`
- `core` must not depend on `app/features/security/modules`

Approved exception:

- composition root and container registration in `src/core/container/*`

---

## Source of Truth Rule

The live repository code is the source of truth.

Docs, diagrams, reports, and AI summaries are secondary and may drift.

If code and docs disagree:

- trust the code
- explicitly report the drift
- do not silently reconcile the difference
- do not present doc claims as facts unless verified in code

---

## Agent Infrastructure — Complete Location Map

This is the authoritative map of every place agent rules must be propagated.

**When you add, change, or remove a coding rule, security pattern, or behavioral constraint:**
Update all locations below that apply to the rule's scope.

| Location                                      | Purpose                                | Consumer            | Format                                                       |
| --------------------------------------------- | -------------------------------------- | ------------------- | ------------------------------------------------------------ |
| **`AGENTS.md`** (root)                        | **Primary always-applied context**     | **All AI agents**   | Plain markdown — **update here first**                       |
| `docs/ai/general/0[1-9] - *.md`               | Agent prompt source                    | Zencoder extension  | Plain markdown prompt                                        |
| `.github/agents/*.agent.md`                   | Agent prompt source                    | GitHub Copilot      | YAML frontmatter + markdown                                  |
| `.github/prompts/*.prompt.md`                 | Workflow prompt source                 | GitHub Copilot      | YAML frontmatter + markdown                                  |
| `.agents/skills/*/SKILL.md`                   | Skill runtime source                   | Codex               | YAML frontmatter + markdown                                  |
| `.zenflow/workflows/*.md`                     | Workflow execution specs               | ZenFlow extension   | Step-based markdown                                          |
| `docs/ai/general/SECURITY_CODING_PATTERNS.md` | Living security rule catalogue         | All agents + humans | Indexed pattern entries                                      |
| `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`  | Auth-specific anti-patterns            | Auth/security work  | Anti-pattern list                                            |
| `docs/ai/zencoder/*.md`                       | Description guides (non-authoritative) | Humans              | Points to `general/`                                         |
| `docs/ai/copilot/*.md`                        | Description guides (non-authoritative) | Humans              | Points to `.github/agents/`                                  |
| `docs/ai/codex/*.md`                          | Description guides (non-authoritative) | Humans              | Points to `.agents/skills/`                                  |
| ~~`.zencoder/rules/repo.md`~~                 | ~~Always-applied context~~             | ~~Zencoder~~        | **DEPRECATED — April 20, 2026. Never use. See `AGENTS.md`.** |

### Agent Numbering and File Correspondence

| #   | Role                  | Zencoder Prompt                                       | GitHub Copilot Agent                            | Codex Skill                                     | ZenFlow Presets             |
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

### ZenFlow Workflow Files

| Workflow                       | File                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Feature development            | `.zenflow/workflows/feature-development.md`                                                                                                                              |
| Safe refactor                  | `.zenflow/workflows/safe-refactor.md`                                                                                                                                    |
| Incident investigation         | `.zenflow/workflows/incident-investigation.md`                                                                                                                           |
| Security incident              | `.zenflow/workflows/security-incident-workflow.md`                                                                                                                       |
| Codacy PR security review      | `.zenflow/workflows/codacy-security-review.md` · `docs/ai/general/Workflow 10 - Codacy Security Review Workflow.md` · `.github/prompts/codacy-security-review.prompt.md` |
| Codacy local findings review   | `.zenflow/workflows/codacy-findings-review.md` · `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md` · `.github/prompts/codacy-findings-review.prompt.md` |
| Auth flow change review        | `.zenflow/workflows/auth-flow-change-review.md`                                                                                                                          |
| Change validation              | `.zenflow/workflows/change-validation.md`                                                                                                                                |
| Repository baseline validation | `.zenflow/workflows/repository-baseline-validation.md`                                                                                                                   |
| Playwright E2E validation      | `.zenflow/workflows/playwright-e2e-validation.md`                                                                                                                        |
| Architecture lint              | `.zenflow/workflows/architecture-lint.md`                                                                                                                                |

### Cross-Tool Workflow Entry Points

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

## Architectural Non-Negotiables

Never approve or introduce:

- business logic inside `shared/*`
- reverse dependency from `core` to higher layers outside approved composition-root exceptions
- provider SDK leakage into domain or core contracts
- authorization enforced only in UI
- ad hoc role or tenant logic scattered across unrelated files
- security-critical logic moved to client components without necessity
- middleware as the sole protection for sensitive mutations
- cache behavior that can leak user-specific or tenant-specific data
- hidden service-locator patterns in request-sensitive flows
- broad refactors without clear architectural justification

---

## Security and Trust Model

Important assumptions:

- authentication, authorization, and tenancy are separate concerns
- trust boundaries must be explicit
- server-side enforcement is mandatory for sensitive behavior
- tenant or org context must come from trustworthy server-side derivation
- provider-specific concerns must stay isolated in adapters and framework boundaries
- sensitive data must not leak through logs, telemetry, responses, or client bundles

---

## Runtime Model

Agents must reason explicitly about:

- App Router boundaries
- server vs client components
- server actions
- route handlers
- proxy responsibilities
- Edge vs Node runtime behavior
- request-time vs build-time behavior
- caching and revalidation
- Vercel deployment implications
- public vs non-public env exposure

---

## Future Extensibility Expectations

The repository should evolve safely toward:

- stronger RBAC
- ABAC
- tenant-aware and organization-aware behavior
- per-tenant feature flags
- request-scoped caching
- worker and background runtime entrypoints

Agents should judge whether current boundaries make those futures easier or harder.

---

## Security Coding Patterns — Process Ownership

**`docs/ai/general/SECURITY_CODING_PATTERNS.md`** is the living catalogue of security patterns.

### When it must be updated

- After every structured security review
- After any security fix that reveals a new pattern or confirms a false positive
- After a security incident workflow run
- When a new anti-pattern is identified during implementation or refactoring

### Who owns the update

**`02 - Security & Auth`** is the process owner.

After any security finding or fix, this agent must:

1. Classify each finding: real risk, latent risk, or false positive
2. Add or update the relevant `SEC-XX` entry in `SECURITY_CODING_PATTERNS.md`
3. Propagate mandatory rules to the agent location map above

The Workflow Orchestrator must include a `SECURITY_CODING_PATTERNS.md` update step in any security-related workflow plan.

---

## Key Repository Files

| File                                      | Purpose                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| `src/core/env.ts`                         | T3-Env schema — single source of truth for all env vars         |
| `src/proxy.ts`                            | Request interception and middleware equivalent                  |
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

Unit tests are co-located with source files.

---

## Quality Gates

| Gate               | Command                 |
| ------------------ | ----------------------- |
| Type check         | `pnpm typecheck`        |
| Lint (with fix)    | `pnpm lint --fix`       |
| Unit tests         | `pnpm test`             |
| Circular dep check | `pnpm skott:check:only` |
| Unused dep check   | `pnpm depcheck`         |
| Env consistency    | `pnpm env:check`        |

**Lint rule**: Always run `pnpm lint --fix`, never plain `pnpm lint`. The linter auto-fixes import ordering and formatting issues on save; running without `--fix` only reports fixable errors and wastes tokens. If unfixable errors remain after `--fix`, report them.

Pre-push hook runs: typecheck -> skott -> depcheck -> madge.

---

## AI Governance Files

Before performing architectural, security, or runtime analysis, agents should read:

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/MODE_MANIFEST.md`

These files define:

- mode-selection rules
- repository identity
- non-negotiable rules
- agent authority boundaries
- conflict resolution model
