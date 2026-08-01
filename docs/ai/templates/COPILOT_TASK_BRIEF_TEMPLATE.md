# Copilot Task Brief Template

Use this template for task-specific requirements.

This file is not a Copilot artifact.
It is a source document that the orchestrator should read and normalize into `.copilot/tasks/{task_id}/intake.md`.

## Title

Short task name.

## Objective

What should be achieved and why.

## Problem Statement

What is wrong, missing, risky, or incomplete today.

## Scope

What is in scope for this task.

## Out Of Scope

What must not be changed or expanded in this task.

## Requirements

List the concrete requirements.

## Scenarios / Use Cases

List the scenarios the implementation must support.

For scenario-driven tasks, prefer stable IDs.

## Acceptance Criteria

State what must be true for the task to be considered complete.

## Verification Sources

Reference the docs, matrices, checklists, specs, or runbooks that define correct behavior.

## Affected Areas

List the likely modules, routes, components, tests, configs, or documents involved.

## Constraints

List architecture, runtime, security, tenancy, validation, or delivery constraints.

## Execution Control

State how the workflow should advance:

- `straight-through` — the workflow may continue through the required specialist roles in one session when the tool does not support true UI-level agent switching
- `manual-handoff` — the workflow must stop after each specialist artifact or major phase so the operator can review the output and switch agents manually before continuing

If omitted, the workflow may use straight-through execution.

## Environment / Preconditions

List accounts, feature flags, local services, env vars, seeded data, or branch context required.

For tasks that require Leantime workflow execution, include a short operational
smoke-test checklist here before the main implementation steps. Prefer a flat
checklist such as:

- [ ] Confirm the intended env file path (`.env.leantime` or `.env.leantime-dev`)
- [ ] Confirm required Leantime vars are present for the target command (`LEANTIME_URL`, `LEANTIME_API_KEY`)
- [ ] Confirm the CLI entrypoint to use (`pnpm lt` for on-prem, `pnpm lt:dev` for local Podman)
- [ ] Run the smallest falsifying command first (`pnpm lt -- list` or equivalent)
- [ ] If command execution is unavailable in the current session, record that as a session-tooling limitation rather than a repository defect

## Evidence Expectations

State what artifacts, logs, screenshots, traces, test results, or reports should be produced.

## Open Questions

List unresolved questions explicitly.
