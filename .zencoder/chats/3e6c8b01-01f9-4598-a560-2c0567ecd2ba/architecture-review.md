# Architecture Review — Leantime AI Agent Integration Redesign

**Agent**: 01 - Architecture Guard  
**Task**: Leantime AI Agent Integration Redesign  
**Date**: 2026-04-07  
**Status**: Complete

---

## Task

Determine the correct architectural shape for integrating Leantime task
management as a mandatory, first-class concern in every AI agent workflow.
Decide whether to introduce a new `10 - Leantime Integration Agent` or absorb
Leantime responsibilities into existing agents.

---

## Architecture Fit

**Outcome: Safe with constraints.**

The Leantime integration layer (`scripts/leantime/`) is already a well-isolated
external-side-effects subsystem. It has no dependency on the Next.js application
runtime (`src/`). The architectural question is about the **agent system
architecture**, not the Next.js module boundary architecture.

Introducing Leantime obligations into the agent workflow system requires:

1. A single, authoritative governing document.
2. A designated agent responsible for Leantime task lifecycle.
3. Propagation of this responsibility to all three agent extension systems.

This is safe because:

- It adds a cross-cutting coordination concern without touching core application code.
- `scripts/leantime/` is already isolated from `src/`.
- No module boundary violations are introduced.

---

## Agent Architecture Decision: New Agent (10 - Leantime Integration Agent)

### Reasoning

Leantime work is **cross-cutting** — it applies to every task type: fix, doc,
implementation, refactor, security incident, baseline validation, E2E verification.
It is not domain-specific (security, runtime, architecture).

Existing agents each have a strict domain:

- `01 Architecture Guard` — owns boundaries and structure, not project tracking.
- `02 Security & Auth` — owns auth surfaces, not tracking.
- `04 Implementation` — owns code execution, not workflow overhead.
- `08 Workflow Orchestrator` — coordinates sequence, but should not own domain-specific
  external integrations (Leantime) directly.

**Decision: Create a new `10 - Leantime Integration Agent`.**

Responsibilities:

- Leantime task creation (milestone, main task, subtasks).
- Status lifecycle management (Nowe → W toku → Zrobione).
- Time logging at task close.
- Goal and milestone seeding when relevant.
- Board seeding (Blueprints, Retrospectives) when relevant.
- Checking for existing tasks before creating duplicates.
- HTML-rich description authoring following the established template.

The Workflow Orchestrator (`08`) invokes `10` at two points:

1. **Task Open**: Create or look up the Leantime task, set status to W toku.
2. **Task Close**: Patch status to Zrobione, log time, update wiki if applicable.

---

## Affected Layers

| Layer                 | Change                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `scripts/leantime/`   | Add `retrospectives.*` alias operations. Possibly add HTML description helper.                                           |
| `docs/ai/general/`    | Add `LEANTIME_AGENT_FLOW.md` or significantly update `LEANTIME_AUTOMATION.md`. Add `10 - Leantime Integration Agent.md`. |
| `.github/agents/`     | Add `leantime-integration.agent.md`. Update all existing `.agent.md` files with Leantime step references.                |
| `.agents/skills/`     | Add `leantime-integration/SKILL.md`. Update all existing `SKILL.md` files.                                               |
| `.zenflow/workflows/` | Update all workflow files to include Leantime Open and Close steps.                                                      |
| `AGENTS.md`           | Add Leantime agent to the agent table. Add reference to governing doc.                                                   |
| `docs/ai/templates/`  | Add or update task creation template with Leantime fields.                                                               |

**No changes to `src/`, `e2e/`, or `tests/`.**

---

## Affected Modules

- `scripts/leantime/catalog.ts` — add `retrospectives.*` operations.
- All workflow and agent definition files across the three extension systems.

---

## Boundary Impact

**No module boundary violations.**

The Leantime agent system is purely in the meta-layer (docs, scripts, agent
definitions). It does not affect:

- Next.js module structure.
- DI container.
- Auth or security enforcement.
- Composition root.

The one cross-cutting concern is that `AGENTS.md` must reference the governing
Leantime flow doc — this is acceptable because `AGENTS.md` is already the
primary always-applied context for all agents.

---

## Dependency Direction Check

Not applicable to application module boundaries. The Leantime layer is:

- `scripts/leantime/` → external Leantime API (no Next.js dependencies)
- `docs/ai/general/` → read by agents, no code dependencies

No violations.

---

## Provider Isolation Check

Leantime is an external tool integration, analogous to how New Relic is handled
in `scripts/`. The pattern of:

- Isolating external tool scripts in `scripts/`
- Documenting the integration in `docs/ai/general/`
- Never importing Leantime concerns into `src/`

…is already established and must continue. The new agent definition files do not
create provider coupling in application code.

---

## Information Flow Architecture

```
Workflow Start
    ↓
10 - Leantime Integration Agent (OPEN)
    - Check existing tasks in project
    - Create milestone if needed
    - Create main task with rich HTML description
    - Patch status → W toku (4)
    ↓
[Specialist Agents: 01, 02, 03, 04, 05, 06, 07]
    ↓
10 - Leantime Integration Agent (CLOSE)
    - Patch status → Zrobione (0)
    - Log time (pnpm lt -- run time.log)
    - Update wiki article if applicable
    - Seed production boards if required by task
    ↓
Workflow End
```

---

## Retrospectives CLI Alias Architecture

The `retrospectives.*` alias must:

- Be implemented as thin wrappers in `scripts/leantime/catalog.ts`.
- Delegate to the existing `blueprints.*` operations with `boardType=retros` injected.
- Not duplicate business logic.
- Document the delegation in the operation's description field.

Minimum alias surface:

- `retrospectives.board.create`
- `retrospectives.board.list`
- `retrospectives.board.get`
- `retrospectives.board.update`
- `retrospectives.item.create`
- `retrospectives.item.list`
- `retrospectives.item.get`
- `retrospectives.item.update`
- `retrospectives.item.patch`
- `retrospectives.comment.create`
- `retrospectives.comment.list`
- `retrospectives.milestone.create-link`

---

## Governing Document Architecture

The governing document (`LEANTIME_AGENT_FLOW.md` or updated `LEANTIME_AUTOMATION.md`)
must be the **single agent-facing reference** for:

- When Leantime steps are mandatory.
- How to create tasks (template, fields, HTML format).
- Time tracking policy.
- Status lifecycle.
- Board seeding rules.

It must be referenced from:

- `AGENTS.md` (under Required Reading or a dedicated section).
- Every workflow file.
- Every agent definition.
- The new `10 - Leantime Integration Agent.md`.

**Architecture decision**: Update `LEANTIME_AUTOMATION.md` rather than creating
a new file. It is already established as the single agent-facing reference.
Add a new `10 - Leantime Integration Agent.md` as the dedicated agent prompt.

---

## Time Tracking Architecture

**Decision: Log at task close, once per task.**

Rationale:

- Agents estimate elapsed time from session context, not wall-clock timestamps.
- Logging per-subtask creates noise and inaccurate fragmented records.
- A single consolidated log entry per main task keeps reporting clean.

Policy:

- `kind` must match task type: `DEVELOPMENT` for code, `DOCUMENTATION` for docs,
  `BUG` for bug fixes, `MANAGEMENT` for planning/orchestration work.
- `hours` should be estimated from session duration (default: 0.5 for short tasks,
  1.0–2.0 for substantial work, up to 4.0 for full-session implementations).
- `description` should summarize what was accomplished.

---

## Structural Risks

| Risk                                                                          | Severity | Mitigation                                                                                                                      |
| ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Agent extensions drift out of sync over time                                  | Medium   | The governing doc must be the single source of truth; propagation to all three systems is required at authoring time, not after |
| `retrospectives.*` alias becomes stale if upstream `retros` boardType changes | Low      | Document the delegation clearly; alias is thin and delegates to `blueprints.*`                                                  |
| Task duplication in Leantime if agents skip the existing-task check           | Medium   | The agent must always run `tasks.list` + `milestones.list` before creating new entries                                          |
| Inconsistent time log entries                                                 | Low      | Policy document with explicit `kind` and `hours` guidance                                                                       |

---

## Documentation Drift

Confirmed drift:

- `docs/ai/general/LEANTIME_AUTOMATION.md` mentions retrospectives via
  `blueprints.*` with `boardType=retros`, but the `pnpm lt` catalog has no
  dedicated `retrospectives.*` alias yet.
- `docs/features/31` plans a future `retrospectives.*` alias without
  implementing it.
- No `10 - Leantime Integration Agent.md` exists yet.
- No formal time-tracking policy document exists.
- `AGENTS.md` agent table ends at `09`; there is no row for a Leantime agent.

All drift items are expected pending this task's completion.

---

## Architecture Constraints

1. Do not import Leantime concerns into `src/`.
2. The `retrospectives.*` alias must delegate to `blueprints.*` — do not
   duplicate canvas logic.
3. The governing document (`LEANTIME_AUTOMATION.md`) must remain the single
   agent-facing reference — do not split guidance across multiple docs.
4. The `10 - Leantime Integration Agent.md` must follow the established format
   of existing agent prompt files.
5. All three extension systems must be updated together — never update only one.
6. `AGENTS.md` must be updated first; extensions reference it.
7. Time logging must use `pnpm lt -- run time.log` — not `pnpm lt:rpc`.
8. The existing-task check must use `tasks.list` with `projectId` before
   creating new tasks.

---

## Recommendation

**Safe to implement, with the following sequencing constraint:**

1. Update `LEANTIME_AUTOMATION.md` with the governing flow (Leantime OPEN/CLOSE
   protocol, time tracking policy, task creation template).
2. Create `docs/ai/general/10 - Leantime Integration Agent.md`.
3. Update `AGENTS.md` to add agent 10 to the table and reference the governing doc.
4. Implement `retrospectives.*` CLI alias in `scripts/leantime/catalog.ts`.
5. Propagate Leantime step references to all three extension systems
   (`.github/agents/`, `.agents/skills/`, `.zenflow/workflows/`).
6. Seed production boards.
7. Update Leantime tracking for deferred canvas families.

Security Review is not required (no auth surface changes, no sensitive data).  
Runtime Review is not required (no Next.js application code changes).  
Validation Strategy should confirm smoke-test scope for the CLI alias and
propagation correctness.
