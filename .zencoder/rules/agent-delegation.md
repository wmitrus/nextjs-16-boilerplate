---
description: When and how to delegate work to specialist agents in Zencoder sessions. Use when deciding whether to route to Workflow Orchestrator, Debug Investigation, Architecture Guard, Security & Auth, Next.js Runtime, Validation Strategy, Playwright E2E, or Implementation Agent.
alwaysApply: true
---

Delegate to specialized agents when the task clearly matches one of these scopes:

- Use `08 - Workflow Orchestrator` when one task needs multiple specialist agents in sequence, explicit artifact management, and plan-first execution. Zencoder automatically manages the active chat artifact workspace under `.zencoder/chats/{chat_id}/`. Start the appropriate ZenFlow workflow from `.zenflow/workflows/`.
- Use `06 - Debug Investigation` for unclear bugs, unstable flows, intermittent failures, env-driven divergence, race conditions, ordering issues, or multi-layer failures where evidence must be gathered before choosing architecture, security, runtime, validation, or implementation work.
- Use `01 - Architecture Guard` for architecture review, modular-monolith boundaries, dependency direction, DI/composition discipline, auth-routing design shape, or docs-vs-code drift.
- Use `02 - Security & Auth` for authentication, authorization, trust boundaries, tenant/org context, provider isolation, or sensitive-data exposure review.
- Use `03 - Next.js Runtime` for App Router behavior, server vs client placement, route handlers, server actions, `src/proxy.ts`, caching/revalidation, or Edge vs Node runtime analysis.
- Use `05 - Validation Strategy` for repository validation posture, minimum safe validation scope, broad test-addition decisions, over-mocking review, or deciding between unit, integration, e2e, contract, and CI validation.
- Use `07 - Playwright E2E` when real-browser Playwright verification is required for auth flows, onboarding, route transitions, cookies, hydration, or browser/runtime regressions that should be proven in a real browser.
- Use `04 - Implementation Agent` when the design constraints are already clear and the task is to make focused code changes, update tests, and validate the implementation.

Do not delegate by default when the task is simple, mixed, or can be handled directly without specialization.

For ambiguous bug hunts, use `06 - Debug Investigation` before Architecture Guard, Security & Auth, Next.js Runtime, Validation Strategy, or Implementation Agent.

For multi-step tasks that must be designed, implemented, validated, and documented through one controlled flow, use `08 - Workflow Orchestrator` and start the matching ZenFlow workflow.

Before delegating auth/bootstrap/onboarding routing work, ensure the relevant agent reads:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
