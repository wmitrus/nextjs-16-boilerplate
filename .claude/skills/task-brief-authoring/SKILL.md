---
name: task-brief-authoring
description: Prepare a workflow-ready task brief when a non-trivial task has scattered, incomplete, or ambiguous requirements. Normalize objective, scope, non-goals, requirements, scenarios, acceptance criteria, verification sources, constraints, environment/preconditions, evidence expectations, and open questions without implementing or choosing the specialist sequence. Use before workflow orchestration when the existing task input is not yet execution-ready.
---

# Task Brief Authoring

Prepare a concrete, bounded, evidence-aware source brief for later workflow orchestration.

This skill is the preparation layer. It does not implement the task, perform specialist review, or orchestrate the specialist sequence.

Its durable product is the task brief/source package itself. The Orchestrator later normalizes that source into task control artifacts such as `intake.md`.

## Context Loading

Inherit active repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- `AGENTS.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- the neutral Task Brief Authoring source;
- specialist prompts/skills;
- the full `SECURITY_CODING_PATTERNS.md`.

For substantial brief authoring:

1. read `docs/ai/templates/COPILOT_TASK_BRIEF_TEMPLATE.md`;
2. read the user's supplied requirement sources;
3. inspect only live repository files needed to verify scoping assumptions;
4. retrieve targeted repository guidance only for constraints that must be represented accurately in the brief;
5. preserve unresolved ambiguity instead of inventing missing requirements.

The template is small and is the baseline format authority for the durable brief.

Repository code is the source of truth for scoping assumptions. If notes/docs/request conflict with live code, record the conflict explicitly.

## When To Use

Use when:

- a non-trivial task needs a professional workflow-ready brief;
- requirements are scattered across docs, notes, attachments, issues, or conversation history;
- scope/non-goals are ambiguous;
- scenario lists or acceptance criteria need normalization;
- verification/evidence expectations must be made explicit before orchestration;
- a task is risky enough that beginning orchestration from the raw request would require guesswork.

Do not use when:

- the task is trivial and can be executed safely without workflow artifacts;
- a sufficient task brief already exists and only orchestration is needed;
- the user is asking a narrow read-only question;
- implementation or specialist review is already the active task and requirements are sufficiently constrained.

## Role Boundary

This skill must not:

- implement code;
- edit production behavior;
- perform Architecture/Security/Runtime approval;
- choose or run the specialist sequence;
- create a fake specialist conclusion to make the brief complete;
- turn reusable workflow docs into task-specific instructions;
- copy large repository documents into the brief;
- invent unsupported requirements, acceptance criteria, or constraints.

When specialist judgment is still needed, represent it as:

- an explicit constraint to be verified;
- an open question;
- a required specialist decision during orchestration.

Do not resolve it by guessing.

## Source Normalization

For each input source, distinguish:

- **Fact** — directly supported by the request, live repository, or authoritative requirement source;
- **Constraint** — explicit boundary the implementation/workflow must preserve;
- **Assumption** — low-risk inference required to make the package usable, clearly labeled;
- **Open Question** — unresolved point that could materially affect implementation or acceptance;
- **Conflict / Drift** — sources disagree with each other or with live repository state.

Do not silently convert:

- assumptions into requirements;
- historical notes into current repository facts;
- examples into acceptance criteria;
- scanner findings into confirmed defects;
- architecture/security suggestions into approved decisions.

## Minimum Good Task Package

A workflow-ready brief should contain, when relevant:

- title;
- objective;
- problem statement;
- scope;
- out of scope / non-goals;
- concrete requirements;
- scenarios/use cases;
- acceptance criteria;
- verification sources;
- affected areas;
- constraints;
- execution control;
- environment/preconditions;
- evidence expectations;
- open questions.

Omit a section only when it is genuinely inapplicable. Do not omit it merely because the raw request failed to provide the information; use an explicit unknown/open question when the missing information matters.

## Authoring Sequence

### 1. Gather Requirement Sources

Identify the actual sources supplied for the task, such as:

- user request;
- referenced docs/specs;
- attachments;
- issue/PR text;
- matrices/checklists;
- current task notes;
- relevant live repository code/config.

Reference sources rather than duplicating large content.

Do not search unrelated repository areas merely to make the brief longer.

### 2. Establish Objective and Problem Statement

Write:

- **Objective** — what outcome should be achieved and why;
- **Problem Statement** — what is wrong, missing, risky, or incomplete today.

Keep the objective outcome-oriented.

Do not hide multiple unrelated objectives in one task brief. If the raw request contains separable tasks with different acceptance/ownership, identify the split explicitly.

### 3. Define Scope and Non-Goals

Scope must state what this task is allowed/expected to change.

Non-goals must protect against silent expansion.

When repository evidence is available, identify likely affected:

- modules;
- routes;
- components;
- tests;
- configs;
- documents;
- scripts/tooling.

Do not claim an affected file as definite merely because its name sounds related. Verify live ownership when that distinction matters.

### 4. Normalize Concrete Requirements

Turn raw requirements into specific, testable statements.

Each requirement should be:

- bounded;
- implementation-independent when possible;
- traceable to a source;
- free of hidden assumptions.

Do not put implementation detail in the requirements unless:

- the user explicitly requires it;
- repository architecture/security/runtime policy makes it a real constraint;
- an existing public/internal contract requires it.

### 5. Define Scenarios / Use Cases

Use scenarios when behavior varies by:

- user role;
- auth state;
- tenant/org;
- provider;
- runtime mode;
- success/failure path;
- environment;
- feature flag;
- another state relevant to correctness.

For scenario-driven work, prefer stable IDs, for example:

```text
S1
S2
S3
```

or existing repository/matrix IDs when an authoritative source already defines them.

Do not renumber authoritative external scenario IDs.

### 6. Define Acceptance Criteria

Acceptance criteria describe observable completion conditions, not implementation steps.

Good criteria state what must be true.

Include:

- positive behavior;
- required negative/denied behavior;
- compatibility/invariant preservation;
- required validation/evidence;
- absence of known regressions where relevant.

Do not invent success criteria not supported by the task's intended outcome.

### 7. Capture Verification Sources

List the sources that define correct behavior, such as:

- specs;
- matrices;
- docs;
- tests;
- runbooks;
- live contracts;
- authoritative config/code ownership.

Distinguish:

- **normative verification source** — defines expected behavior;
- **supporting evidence source** — helps verify but does not define the contract.

Do not use stale docs to override live repository ownership/runtime facts.

### 8. Capture Constraints and Assumptions

Record only constraints relevant to execution, such as:

- architecture;
- security/trust;
- tenancy;
- runtime;
- public/API contracts;
- validation;
- compatibility;
- delivery/rollout;
- no-destructive-change boundaries.

Label assumptions explicitly.

If a constraint requires specialist approval, say so rather than pre-approving it.

### 9. Define Execution Control

Use:

- `straight-through` — workflow may continue through required specialists in one session;
- `manual-handoff` — workflow must stop after each specialist artifact/major phase for operator review.

If the user did not request visible pauses, do not invent `manual-handoff`.

If omitted from the durable brief, downstream workflow may use straight-through execution according to repository workflow rules.

This skill does not itself execute either mode.

### 10. Environment / Preconditions

Capture only the environment state needed for execution, including when relevant:

- accounts;
- env vars;
- feature flags;
- local services;
- seeded data;
- branch/runtime context;
- provider mode;
- deployment environment.

Do not copy secret values into the brief.

### 11. Evidence Expectations

State what evidence must exist to call the task complete, such as:

- test output;
- targeted scenario results;
- browser evidence;
- logs/traces;
- screenshots;
- static validation;
- deployment/runtime evidence;
- specialist sign-off artifacts.

Evidence expectations should follow from the task risk and authoritative verification sources.

Do not require broad evidence merely for ceremony.

### 12. Preserve Open Questions

Open questions are not failures of the brief.

Keep a question open when:

- available sources do not answer it;
- answering it requires a specialist decision;
- it depends on runtime evidence not yet gathered;
- multiple valid product/architecture choices remain.

State why the question matters and what later workflow phase/authority should resolve it when known.

Do not ask the user to repeat information already present in the sources.

## Security-Sensitive Briefs

For security changes or scanner findings:

1. inspect the live code needed to scope the affected trust/security surface;
2. use the Pattern Index in `SECURITY_CODING_PATTERNS.md`;
3. load only plausible matching SEC section(s);
4. capture the relevant known security constraint/pattern in the brief;
5. mark unresolved exploitability/trust decisions for Security/Auth review.

Do not preload the full security catalogue.

Do not use Task Brief Authoring to make the final security verdict.

If a known SEC pattern directly defines a requirement, reference the SEC-ID and concise requirement instead of copying the entire section.

## Auth / Scenario-Matrix Briefs

When an authoritative matrix already exists:

- reference the matrix as a verification source;
- preserve its scenario IDs;
- identify the subset obviously implicated by the request;
- do not invent final matrix sign-off;
- leave exact affected-scenario confirmation to the owning auth/security workflow when specialist analysis is required.

## JSON API Route Briefs

For tasks that introduce or change JSON API route handlers, make the response contract explicit.

Capture whether the route is expected to use the shared repository response/error mechanism:

```text
src/shared/lib/api/response-service.ts
src/shared/lib/api/with-error-handler.ts
```

Do not leave response-shape/error-contract expectations implicit when they are relevant.

If live repository architecture shows an established exception mechanism, reference it rather than claiming the shared mechanism is universally mandatory.

## Leantime-Dependent Tasks

When the downstream task requires Leantime workflow execution, include a short operational smoke-test checklist under Environment / Preconditions.

Do not load the full Leantime guide just to author the brief.

Capture the smallest diagnostic path needed by a fresh execution session:

- intended env file path: `.env.leantime` or `.env.leantime-dev`;
- required variable names, never secret values:
  - `LEANTIME_URL`
  - `LEANTIME_API_KEY`
- CLI entrypoint:
  - `pnpm lt` for on-prem;
  - `pnpm lt:dev` for local Podman, when that is the actual target;
- smallest falsifying check:

```shell
pnpm lt -- list
```

or the equivalent valid command for the stated target.

If command execution is unavailable in the future execution context, classify that as session/tooling limitation, not automatically as a repository defect.

Do not duplicate the full Leantime lifecycle in the brief.

## Durable Brief Format

Use `docs/ai/templates/COPILOT_TASK_BRIEF_TEMPLATE.md` as the baseline.

The durable brief is a **source document**, not a Copilot task artifact.

It should follow this structure:

1. Title
2. Objective
3. Problem Statement
4. Scope
5. Out Of Scope
6. Requirements
7. Scenarios / Use Cases
8. Acceptance Criteria
9. Verification Sources
10. Affected Areas
11. Constraints
12. Execution Control
13. Environment / Preconditions
14. Evidence Expectations
15. Open Questions

Do not create `plan.md`, `intake.md`, specialist summaries, or orchestration artifacts merely because a brief is being authored.

The downstream Orchestrator owns normalization of the brief into task artifacts.

## Relationship To Workflow Orchestrator

Use this skill before `workflow-orchestrator` when requirements are not execution-ready.

Use `workflow-orchestrator` directly when a sufficient brief already exists.

Expected handoff from this skill:

- clear task description;
- stable requirements package;
- source references;
- explicit uncertainties;
- enough specificity for downstream `plan.md` and `intake.md` to be created without guesswork.

This skill does not:

- select the specialist sequence;
- spawn/coordinate specialists;
- own implementation;
- guarantee UI-level agent switching.

## Brief Readiness Check

Before calling the brief workflow-ready, confirm:

- objective is singular and concrete;
- scope and non-goals are explicit;
- requirements are traceable and non-contradictory, or conflicts are documented;
- scenario-driven behavior has stable IDs when useful;
- acceptance criteria are observable;
- verification sources are named;
- likely affected areas are evidence-backed where material;
- important architecture/security/runtime constraints are represented without pretending specialist approval;
- execution control is explicit when manual review is required;
- environment/preconditions are sufficient to begin;
- evidence expectations are proportional;
- unresolved material questions are visible.

A brief may still be workflow-ready with open questions only when:

- the question does not block task planning or acceptance-boundary definition;
- the available sources provide enough context for the owning later specialist/workflow phase to resolve it safely;
- the question is explicitly assigned to that later authority.

A question about product intent, required behavior, scope, or acceptance criteria that would force the Orchestrator/Implementation to guess means the brief is **not** workflow-ready.

It is **not** workflow-ready whenever implementation or specialist sequencing would still require guessing an important user requirement.

## Leantime

Task Brief Authoring participates in the mandatory Leantime lifecycle only as part of the non-trivial task's existing lifecycle.

- when `workflow-orchestrator` already owns the parent task, do not duplicate its logical open/close calls;
- when authoring a brief is itself a standalone non-trivial tracked task, use `leantime-integration` for one logical open;
- on resumed standalone brief work, reuse existing tracked state;
- close once after the brief-authoring task is complete;
- do not duplicate time logging;
- do not preload the full Leantime guide.

The Leantime smoke-test section inside a brief describes **future downstream execution preconditions**; it does not itself open another Leantime lifecycle.

## Response

The durable brief/source package itself must be produced. When it is written or surfaced as the task brief, it follows the 15-section baseline in **Durable Brief Format**.

For the substantial user-facing handoff around that brief, use exactly:

1. Objective
2. Problem Statement
3. Scope
4. Non-Goals
5. Requirements Package
6. Verification Sources
7. Constraints / Assumptions
8. Open Questions
9. Recommended Next Action

The 9-section handoff may summarize the durable brief, but it does not replace the durable brief/template package and must not silently omit material uncertainty.

## Source and Compatibility

`docs/ai/general/09 - Task Brief Authoring.md` remains the neutral cross-tool role authority.

`docs/ai/templates/COPILOT_TASK_BRIEF_TEMPLATE.md` remains the baseline durable brief format.

For Claude Code, this skill changes context-loading mechanics only: inherit stable root invariants, inspect task-relevant live evidence, use targeted repository/security guidance, and avoid broad prompt/catalogue preload.

If shared Task Brief Authoring semantics change, propagate them according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary brief authoring.
