# Agent Interaction Protocol

Rules that govern how all agents in this repository must behave.

Every agent must read this file before beginning any non-trivial task.

---

## Source of Truth

Repository code is the source of truth.

Docs, comments, ADRs, and summaries are useful context but are secondary.

If docs and code differ:

- trust the code
- note the drift if it is relevant to the task
- do not "fix" architecture by assumption

---

## Agent Authority Boundaries

Each agent has a defined authority domain. Agents must not silently override each other.

| Agent                    | Owns                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------- |
| 01 Architecture Guard    | Module boundaries, dependency direction, DI/composition, architectural drift        |
| 02 Security & Auth       | Authentication, authorization, tenant trust, provider isolation, sensitive data     |
| 03 Next.js Runtime       | App Router, server/client placement, route handlers, server actions, proxy, caching |
| 04 Implementation        | Code execution within established constraints                                       |
| 05 Validation Strategy   | Minimum safe validation scope, validation quality                                   |
| 06 Debug Investigation   | Evidence gathering, execution path tracing, ambiguity reduction                     |
| 07 Playwright E2E        | Real-browser verification, runtime evidence capture                                 |
| 08 Workflow Orchestrator | Multi-step sequencing, artifact management, specialist routing                      |
| 09 Task Brief Authoring  | Requirements normalization, task input preparation                                  |

When a task depends on an unresolved decision owned by another agent:

- do not proceed as if the decision was already made
- state explicitly which agent's decision is blocking progress

---

## Startup Sequence

Before any non-trivial task, agents must read:

1. This file (`00 - Agent Interaction Protocol.md`)
2. `AGENTS.md`
3. `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
4. `docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md` for implementation, refactor, script, or tooling work
5. Domain-specific reference files listed in their own Startup Rules

---

## Repository Middleware Note

In this repository, middleware-style request interception lives in **`src/proxy.ts`** — not `middleware.ts`.

Do not spend time searching for `middleware.ts`. Analyze `src/proxy.ts` for request interception, redirect, auth pre-processing, and security headers.

---

## Runtime Bug Constraint

If the issue is classified as a runtime bug:

- Architecture Guard must not propose architecture redesign as the first move
- Architecture Guard may verify that the proposed fix respects existing constraints and module boundaries
- Debug Investigation or Next.js Runtime should lead until the failure path is clear

---

## Default Delegation Guidance

For non-trivial work, route to the specialist whose authority best matches the active decision:

- Debug Investigation first for unclear bugs, unstable flows, env-driven divergence, race conditions, ordering bugs, or multi-layer failures where the right specialist is not yet clear
- Workflow Orchestrator when one task must be driven across multiple specialist steps with explicit artifact creation and handoff discipline
- Architecture Guard for module boundaries, dependency direction, DI/composition shape, auth-routing design shape, or docs-vs-code drift
- Security & Auth for authentication, authorization, tenant/org trust, provider isolation, or sensitive-data exposure review
- Next.js Runtime for App Router behavior, server/client placement, route handlers, server actions, `src/proxy.ts`, caching/revalidation, or Edge vs Node runtime analysis
- Validation Strategy for repository validation posture, minimum safe validation scope, broad test-addition decisions, over-mocking review, or choosing between unit, integration, e2e, contract-style, and CI validation
- Playwright E2E when real-browser verification is required and the question cannot be closed safely with unit or integration evidence alone
- Implementation only after the relevant constraints are clear enough to execute safely

Do not delegate by default when the task is simple, mixed, or can be handled directly without specialist isolation.

---

## Agent Infrastructure — Propagation Requirement

When any agent rule, security pattern, or behavioral constraint is added or changed, it MUST be propagated to all applicable locations:

- **`AGENTS.md`** (root) — primary always-applied context, update here first
- `docs/ai/general/0[1-9] - *.md` — Zencoder agent prompts
- `.github/agents/*.agent.md` — GitHub Copilot agents
- `.github/prompts/*.prompt.md` — GitHub Copilot workflow prompts
- `.agents/skills/*/SKILL.md` — Codex repo-local skills
- `.zenflow/workflows/*.md` — ZenFlow workflow specs
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — if the rule is security-related
- `docs/ai/zencoder/*.md`, `docs/ai/copilot/*.md`, `docs/ai/codex/*.md` — human-facing description guides

**Never add to `.zencoder/rules/` — Zen Rules are deprecated April 20, 2026.**

Full location map: `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

---

## Security Coding Patterns

`docs/ai/general/SECURITY_CODING_PATTERNS.md` is the living security rule catalogue.

All agents that write or review code must read it.

**02 - Security & Auth owns this document.** After any security review or fix, that agent must update it.

---

## Behavior Constraints — All Agents

Always:

- inspect affected files before editing
- identify the owning module or layer before changing code
- preserve existing contracts unless change is explicitly intended
- prefer narrow edits over broad refactors
- call out uncertainty instead of guessing

Never:

- introduce broad refactors without being asked
- cross module boundaries for convenience
- silently change public behavior without naming it
- assume docs are correct if code says otherwise
- weaken validation, authorization, or runtime safeguards to make implementation easier

---

## Conflict Resolution

If specialist guidance conflicts:

- Architecture Guard decides structure
- Security & Auth decides enforcement
- Next.js Runtime decides runtime placement
- Validation Strategy decides validation scope once risk and constraints are known

Implementation must defer to those decisions rather than inventing a compromise.
