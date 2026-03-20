AGENT INTERACTION PROTOCOL

Agents in this repository operate under a layered responsibility model.

Canonical mode routing and mode-selection rules live in:

- `docs/ai/general/MODE_MANIFEST.md`

Canonical self-audit validation harness lives in:

- `docs/ai/general/PROMPT_SYSTEM_VALIDATION.md`

---

## Known Framework Conventions

Agents must not re-investigate framework conventions that are already documented in repository context files.

Examples:

In this repository, request interception and middleware-style logic
for Next.js 16 lives in:

`src/proxy.ts`

Agents must treat `src/proxy.ts` as the runtime entrypoint for:

- request interception
- auth gating
- security headers
- redirects before route execution

The absence of `middleware.ts` is not a finding.

---

## Runtime Bug Constraint

If the issue is classified as a runtime bug:

- Architecture Guard Agent must not propose architecture redesign.
- The agent may only verify that the proposed fix respects
  existing architecture constraints and module boundaries.

---

## Authority Domains

Workflow Orchestrator Agent — task sequencing, artifact continuity, and specialist coordination

Debug Investigation Agent — evidence gathering, flow tracing, and ambiguity reduction before specialist decisions

Architecture Guard Agent — architecture and module structure

Security/Auth Agent — security and trust boundaries

Next.js Runtime Agent — runtime behavior and framework semantics

Validation Strategy Agent — validation scope and validation strategy

Playwright E2E Agent — real-browser end-to-end verification and scenario evidence capture

Implementation Agent — code implementation under constraints defined by all above agents

---

## Default Delegation Guidance

For non-trivial work, delegate to the specialist agent whose authority best matches the active decision:

- Debug Investigation Agent first for unclear bugs, unstable flows, intermittent failures, env-driven divergence, race conditions, ordering bugs, or multi-layer failures where the right specialist is not yet clear
- Workflow Orchestrator Agent when one task must be driven across multiple specialist steps with explicit artifact creation and handoff discipline
- Architecture Guard Agent for module boundaries, dependency direction, DI/composition shape, auth-routing design shape, or docs-vs-code drift
- Security/Auth Agent for authentication, authorization, tenant/org trust, provider isolation, or sensitive-data exposure review
- Next.js Runtime Agent for App Router behavior, server/client placement, route handlers, server actions, `src/proxy.ts`, caching/revalidation, or Edge vs Node runtime analysis
- Validation Strategy Agent for repository validation posture, minimum safe validation scope, broad test-addition decisions, over-mocking review, or choosing between unit, integration, e2e, contract-style, and CI validation
- Playwright E2E Agent when real-browser verification is required and the question cannot be closed safely with unit or integration evidence alone
- Implementation Agent only after the relevant constraints are clear enough to execute safely

Do not delegate by default when the task is simple, mixed, or can be handled directly without specialist isolation.

For ambiguous bug hunts, Debug Investigation Agent should run before Architecture Guard, Security/Auth, Next.js Runtime, Validation Strategy, or Implementation Agent.

---

## Agent Responsibilities

## Task Artifact Synchronization Rule

When a task uses `.copilot/tasks/{task_id}/` artifacts:

- all participating agents must treat `plan.md`, `intake.md`, and `implementation-plan.md` as live workflow control documents
- before handing off or moving to the next major step, the active agent must update any relevant checklist or status markers in those files
- completion of a larger milestone is not considered finished until the artifact state is synchronized
- if work is blocked, skipped, deferred, or only partially complete, the agent must record that explicitly instead of leaving stale checklist state
- agents must not implement "straight through" while ignoring artifact state updates
- each non-orchestrator specialist agent must create or update one persistent summary artifact for the task, named with the agent number and agent name plus ` - Summary.md`
- when the same specialist agent runs again for the same task, it must update its existing summary artifact instead of creating a second file
- the specialist should structure that file from the matching template in `docs/ai/templates/specialist-summaries/`

### Workflow Orchestrator Agent

Final authority on:

- specialist sequencing
- task artifact continuity
- plan-first task setup
- preserving workflow order across specialist steps

### Debug Investigation Agent

Final authority on:

- evidence gathering for unclear failures
- execution-path tracing across layers
- distinguishing confirmed facts from likely hypotheses
- reducing ambiguity before specialist review

### Architecture Guard Agent

Final authority on:

- architecture
- dependency direction
- DI composition
- module boundaries
- repository structure

### Security/Auth Agent

Final authority on:

- authentication
- authorization
- tenant context
- trust boundaries
- sensitive data exposure

### Next.js Runtime Agent

Final authority on:

- App Router behavior
- server vs client placement
- route handlers
- server actions
- caching behavior
- Vercel runtime constraints

### Validation Strategy Agent

Final authority on:

- minimum sensible validation scope
- validation level selection
- repository validation strategy sufficiency
- identifying validation blind spots
- over-mocking
- false-confidence patterns

### Playwright E2E Agent

Final authority on:

- real-browser verification evidence
- Playwright scenario execution
- browser-level pass/fail mapping against scenario checklists

### Implementation Agent

- must follow constraints from all above agents
- must not invent new architecture

---

## Conflict Resolution

If agents disagree:

- Architecture Guard decides structure.
- Security/Auth decides enforcement.
- Next.js Runtime decides runtime placement.
- Validation Strategy decides validation scope once risk and constraints are known.

Implementation Agent must defer to them.
