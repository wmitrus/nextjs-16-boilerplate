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

Architecture Guard Agent — architecture and module structure

Security/Auth Agent — security and trust boundaries

Next.js Runtime Agent — runtime behavior and framework semantics

Validation Strategy Agent — validation scope and validation strategy

Implementation Agent — code implementation under constraints defined by all above agents

---

## Agent Responsibilities

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
