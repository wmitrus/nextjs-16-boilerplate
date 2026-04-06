# Leantime Automation Guide

This document is the single agent-facing reference for the repository's
Leantime automation scripts.

Use it when work should be mirrored into the on-prem Leantime workspace without
forcing every agent to memorize the raw JSON-RPC method surface.

## Primary Commands

- `pnpm lt -- list`
- `pnpm lt -- run <operation-id> --input-file path/to/input.json`
- `pnpm lt:rpc -- --method leantime.rpc.<Module>.<Service>.<Method> --input '{"...": "..."}'`

## Preferred Agent Patterns

- For repeatable repository workflows, prefer `pnpm lt -- run <operation-id>`
- For one-off documented Leantime methods not wrapped yet, use `pnpm lt:rpc`
- Prefer `--input-file` when descriptions, acceptance criteria, or wiki content are long
- Prefer env defaults (`LEANTIME_DEFAULT_PROJECT_ID`, `LEANTIME_DEFAULT_AUTHOR_ID`, `LEANTIME_DEFAULT_CLIENT_ID`) so agents do not repeat IDs unnecessarily

## High-Value Operations

- `project.create`
- `project.patch`
- `task.create`
- `task.update`
- `task.patch`
- `subtask.upsert`
- `milestone.create`
- `goal.create`
- `wiki.create`
- `wiki.article.create`
- `wiki.article.update`
- `time.log`
- `reports.full`
- `initiative.kickoff`

## Workflow Suggestions

- Safe feature kickoff:
  Use `initiative.kickoff` to create a milestone, wiki space, starter articles, and initial tasks.
- During implementation:
  Use `task.patch` and `task.update` for status and detail changes, and `wiki.article.update` for implementation notes.
- During validation:
  Use `wiki.article.update` to store findings, verification notes, and follow-ups.
- During retrospectives:
  Update the kickoff-generated retrospective article until native retros canvas automation exists.

## Input Examples

### Create a project

```json
{
  "name": "Leantime Automation Rollout",
  "clientId": 12,
  "details": "Integrate repository workflows with on-prem Leantime.",
  "assignedUsers": "5,9",
  "hourBudget": 80
}
```

### Create a rich task

```json
{
  "headline": "Implement Leantime script catalog",
  "projectId": 123,
  "description": "Add isolated scripts, env wiring, tests, and docs.",
  "acceptanceCriteria": "- CLI lists operations\n- raw RPC escape hatch works\n- docs explain AI-agent usage",
  "priority": 3,
  "status": 3,
  "storypoints": 5,
  "planHours": 6,
  "tags": "automation,leantime"
}
```

### Kick off an initiative

```json
{
  "name": "Leantime Agent Workflow",
  "projectId": 123,
  "authorId": 9,
  "milestone": {
    "headline": "Agent Workflow MVP"
  },
  "goals": [
    {
      "headline": "Keep project knowledge in Leantime",
      "projectId": 123
    }
  ],
  "tasks": [
    {
      "headline": "Create script catalog",
      "description": "Mirror the New Relic pattern for Leantime.",
      "projectId": 123
    }
  ]
}
```

## Known Gaps

Native API coverage is currently strong for projects, tasks, milestones, goals,
wiki, files, time tracking, and reports.

Native API coverage is currently weak or missing for:

- idea wall creation / editing
- native blueprint board creation / editing
- retrospective board automation

Until on-prem Leantime exposes those flows through supported JSON-RPC services,
agents should use:

- wiki articles for structured project briefs, insights, and retros
- goals plus milestones plus tasks for execution tracking
- `pnpm lt:rpc` only for officially documented methods
