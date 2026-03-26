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
2. `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
3. Domain-specific reference files listed in their own Startup Rules

---

## Repository Middleware Note

In this repository, middleware-style request interception lives in **`src/proxy.ts`** — not `middleware.ts`.

Do not spend time searching for `middleware.ts`. Analyze `src/proxy.ts` for request interception, redirect, auth pre-processing, and security headers.

---

## Agent Infrastructure — Propagation Requirement

When any agent rule, security pattern, or behavioral constraint is added or changed, it MUST be propagated to ALL applicable locations:

- **`AGENTS.md`** (root) — primary always-applied context, update here first
- `docs/ai/general/0[1-9] - *.md` — Zencoder agent prompts
- `.github/agents/*.agent.md` — GitHub Copilot agents
- `.zenflow/workflows/*.md` — ZenFlow workflow specs
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — if the rule is security-related

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
- identify the owning module/layer before changing code
- preserve existing contracts unless change is explicitly intended
- prefer narrow edits over broad refactors
- call out uncertainty instead of guessing

Never:

- introduce broad refactors without being asked
- cross module boundaries for convenience
- silently change public behavior without naming it
- assume docs are correct if code says otherwise
- weaken validation, authorization, or runtime safeguards to make implementation easier
