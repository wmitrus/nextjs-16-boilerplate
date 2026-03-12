AGENT INTERACTION PROTOCOL

Agents in this repository operate under a layered responsibility model.

Canonical mode routing and mode-selection rules live in:

- `docs/ai/general/MODE_MANIFEST.md`

Canonical self-audit validation harness lives in:

- `docs/ai/general/PROMPT_SYSTEM_VALIDATION.md`

Authority order:

1. Architecture Guard Agent
2. Security/Auth Agent
3. Next.js Runtime Agent
4. Implementation Agent

Rules:

Architecture Guard Agent

- final authority on architecture
- dependency direction
- DI composition
- module boundaries
- repository structure

Security/Auth Agent

- final authority on:
  - authentication
  - authorization
  - tenant context
  - trust boundaries
  - sensitive data exposure

Next.js Runtime Agent

- final authority on:
  - App Router behavior
  - server vs client placement
  - route handlers
  - server actions
  - caching behavior
  - Vercel runtime constraints

Implementation Agent

- must follow constraints from all above agents
- must not invent new architecture

Conflict resolution:

If agents disagree:

Architecture Guard decides structure.
Security/Auth decides enforcement.
Next.js Runtime decides runtime placement.

Implementation agent must defer to them.
