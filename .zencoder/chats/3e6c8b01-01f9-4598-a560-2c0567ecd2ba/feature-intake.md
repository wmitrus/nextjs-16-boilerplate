# Feature Intake — Leantime AI Agent Integration Redesign

**Date**: 2026-04-07  
**Task ID**: `3e6c8b01-01f9-4598-a560-2c0567ecd2ba`  
**Status**: In Progress

---

## Objective

Redesign and fully codify the Leantime automation layer as a first-class, mandatory
part of every AI agent workflow in this repository. This includes:

1. Deciding which existing agent (or a new dedicated agent) owns the Leantime
   task-creation, time-logging, and tracking responsibilities.
2. Producing a professional, reusable prompt/template for creating Leantime tasks,
   goals, milestones, and board content.
3. Defining when time tracking should be logged (per-task, per-subtask, or at
   phase end).
4. Writing one authoritative flow document that all agents, workflows, and
   prompts must read and honor.
5. Adding the `retrospectives.*` CLI alias alongside the existing `blueprints.*`
   surface.
6. Updating the deferred-canvas-families decision task in Leantime.
7. Seeding real production boards and retrospective data.
8. Improving task authoring quality with an HTML-description helper/template.
9. Clarifying remaining secondary areas (file upload, project assignment,
   delete flows).

---

## Problem Statement

Today, Leantime automation exists as a capable but **optional and inconsistent**
layer. Agents may or may not create tasks, may or may not log time, and there is
no single governing document that every workflow and every agent extension
(Zencoder, GitHub Copilot, Codex) must read. As a result:

- Tasks are created ad-hoc and inconsistently formatted.
- Time is never logged automatically by agents.
- Retrospectives are reachable via `blueprints.*` but have no dedicated alias.
- Real production boards are mostly absent.
- The three agent extension formats (`.github/agents/`, `.agents/skills/`,
  `.zenflow/workflows/`) are not synchronized on Leantime obligations.

---

## Scope

### In Scope

- **Agent ownership decision**: Which existing agent (Architecture Guard,
  Implementation, or a new `10 - Leantime Integration Agent`) should own
  Leantime task CRUD, time logging, and status tracking.
- **Unified flow document**: A new or updated `LEANTIME_AGENT_FLOW.md` (or
  update to `LEANTIME_AUTOMATION.md`) that all agents and workflows must read.
- **Propagation to all three agent extensions**:
  - `docs/ai/general/` (Zencoder prompt files)
  - `.github/agents/*.agent.md` (GitHub Copilot agents)
  - `.agents/skills/*/SKILL.md` (Codex skills)
- **Retrospectives CLI alias**: Add `retrospectives.*` operation family as a
  stable alias for `blueprints.*` with `boardType=retros`.
- **HTML description template/helper**: A reusable template or script helper
  for building rich Leantime task descriptions.
- **Time-tracking decision**: When and how agents should log time (completion
  of subtask? main task? phase end?).
- **Leantime task creation template**: Professional template covering task,
  goal, milestone, and board creation in one structured prompt.
- **Task plan integration**: Ensure plan templates and intake templates include
  Leantime tracking steps so no agent forgets them.
- **Deferred canvas families**: Update the existing Leantime tracking task to
  explicitly note that `lbm`, `dbm`, `cp`, `sm`, `sq`, `em` are deferred
  pending future decision.
- **Production seeding**: Create at least one real production Blueprint board
  and one real production Retrospective board.
- **Secondary area clarification**: Document current status and explicit
  decision on file upload/write surface, project assignment semantics, and
  delete flows.

### Out of Scope

- Implementing hidden canvas families (`lbm`, `dbm`, `cp`, `sm`, `sq`, `em`).
- Browser-session fallback automation.
- Changes to the core Next.js application code.
- Changes to auth or security layers.

---

## Requirements

### R1 — Agent Ownership

Decide explicitly: does an existing agent absorb Leantime obligations, or does
this repository need a new `10 - Leantime Integration Agent`?

Criteria for the decision:

- Leantime work cuts across all task types (fix, doc, refactor, implement).
- It is not tied to one domain (security, architecture, runtime).
- It needs its own `SKILL.md`, `.agent.md`, and prompt counterpart to be
  propagated to all three extension systems.
- Recommendation: **new dedicated `10 - Leantime Integration Agent`** that acts
  as the Leantime task authoring and tracking authority, invoked at task start
  and task end by the Workflow Orchestrator.

### R2 — Mandatory Leantime Steps In Every Workflow

Every workflow (Safe Feature, Safe Refactor, Security Incident, etc.) must include:

- **At start**: Leantime task creation or lookup (milestone, main task, project).
- **During work**: Status patch to `W toku` (status 4) when active.
- **At completion**: Status patch to `Zrobione` (status 0), time log entry.

This must be codified in:

- The governing `LEANTIME_AGENT_FLOW.md` (or updated `LEANTIME_AUTOMATION.md`).
- Each workflow file in `.zenflow/workflows/`.
- Each Copilot prompt in `.github/prompts/`.
- Each Codex skill in `.agents/skills/`.
- The `AGENTS.md` root context.

### R3 — Professional Task Creation Template

A new file (or section in the governing doc) must provide a complete, reusable
prompt template for task creation covering:

- Headline / title conventions.
- HTML description format (rich content, acceptance criteria, scope).
- Priority, story points, plan hours defaults.
- Milestone association.
- Goal linkage (when relevant).
- Board seeding (Blueprints or Retrospectives).

### R4 — Time Tracking Policy

Define when time is logged:

- Recommendation: log at **task close** (not per-subtask), with a single
  `time.log` entry summarizing the session duration.
- Agents should estimate time from the session rather than tracking clock
  time precisely.
- The governing doc must specify the `kind` values (`DEVELOPMENT`,
  `DOCUMENTATION`, `BUG`, etc.).

### R5 — Retrospectives Alias

Add `retrospectives.*` CLI operations that delegate to `blueprints.*` with
`boardType=retros`. At minimum:

- `retrospectives.board.create`
- `retrospectives.board.list`
- `retrospectives.board.get`
- `retrospectives.item.create`
- `retrospectives.item.list`

### R6 — Production Seeding

Create at least:

- One production Blueprint board (e.g., Project Value Canvas for the NextJS
  Boilerplate project).
- One production Retrospective board (e.g., Sprint Retrospective Q2 2026).

### R7 — HTML Description Helper

Either a script helper or a documentation template that agents use to build
valid, rich Leantime task HTML descriptions.

### R8 — Deferred Canvas Decision Update

Update the existing Leantime tracking task for deferred canvas families to
record that they remain deferred pending explicit future decision.

### R9 — Secondary Area Decisions

Document final status for:

- File upload/write surface (currently not verified).
- Project assignment semantics (`assignedUsers` field).
- Blueprints/Retrospectives delete flows (only in explicit cleanup tasks).

---

## Acceptance Criteria

- [x] Agent ownership decision is documented and justified.
- [x] A new or updated governing Leantime flow document exists in `docs/ai/general/`.
- [x] All three agent extensions are updated to require Leantime steps.
- [x] `AGENTS.md` references the governing Leantime flow document.
- [x] All workflow files (`.zenflow/`, `.github/prompts/`, `.agents/skills/`) include Leantime steps.
- [x] `retrospectives.*` CLI alias is implemented and smoke-tested.
- [x] Production Leantime task authoring template exists.
- [x] Time tracking policy is documented in the governing flow doc.
- [x] At least one production Blueprint board and one Retrospective board seeded.
- [x] Deferred canvas families task updated in Leantime.
- [x] Secondary area decisions documented.

---

## Referenced Files

- `docs/ai/general/LEANTIME_AUTOMATION.md` — current automation reference
- `docs/features/27 - Leantime Automation Integration.md` — integration history
- `docs/features/30 - Leantime AutomationApi Blueprints Plan.md` — blueprints plan
- `docs/features/31 - Leantime AutomationApi Retrospectives Plan.md` — retrospectives plan
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/08 - Workflow Orchestrator Agent.md`
- `AGENTS.md` — primary always-applied context
- `scripts/leantime/` — automation scripts
- `.github/agents/` — GitHub Copilot agents
- `.agents/skills/` — Codex skills
- `.zenflow/workflows/` — ZenFlow workflow definitions

---

## Assumptions

- Leantime on-prem instance is accessible at `https://leantime.wmitrus.useruno.com`.
- Default project ID is `2` (NextJS Boilerplate project).
- The `AutomationApi` plugin is deployed and supports `boardType=retros`.
- Three agent extension systems exist: Zencoder (`docs/ai/general/`), GitHub
  Copilot (`.github/agents/`), Codex (`.agents/skills/`).
- `pnpm lt` CLI is functional and the environment is set up.

---

## Open Questions

- OQ-1: Should the new Leantime agent (`10`) have its own workflow step in
  every existing workflow file, or should it be embedded as a protocol
  section all agents must honor?
- OQ-2: Should time logging happen at every agent handoff or only at final
  task closure?
- OQ-3: Should the task creation template live in `docs/ai/general/` or in
  `docs/ai/templates/`?
- OQ-4: Should the HTML description helper be a script or a documentation
  template with copy-paste patterns?

---

## Readiness Checklist

- [x] Existing Leantime automation docs reviewed.
- [x] Agent extension locations confirmed (three systems).
- [x] `pnpm lt` CLI verified operational in prior sessions.
- [x] AutomationApi plugin with `boardType=retros` confirmed.
- [x] Final agent ownership decision made. — 10 - Leantime Integration Agent created in all three extension systems.
- [x] Production seeding environment confirmed ready. — Blueprint board #14 and Retrospective board #15 seeded.

---

## Closure

**Status**: Complete — 2026-04-07

All acceptance criteria met. All readiness prerequisites satisfied. Task closed in Leantime as `#36 Zrobione`. 3.0h logged.
