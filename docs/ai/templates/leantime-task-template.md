# Leantime Task Authoring Template

Use this template when creating tasks, subtasks, milestones, or goals in Leantime
via the `pnpm lt` CLI.

---

## Main Task HTML Description

Copy and adapt this HTML for the `description` field in `task.create` or `task.patch`:

```html
<h2>Objective</h2>
<p>[One-sentence summary of what this task achieves and why it matters.]</p>

<h2>Scope</h2>
<ul>
  <li>[Scope item 1]</li>
  <li>[Scope item 2]</li>
</ul>

<h2>Out of Scope</h2>
<ul>
  <li>[Excluded item 1]</li>
</ul>

<h2>Acceptance Criteria</h2>
<ul>
  <li>[Criterion 1]</li>
  <li>[Criterion 2]</li>
</ul>

<h2>Affected Areas</h2>
<ul>
  <li>[File, module, or system 1]</li>
</ul>

<h2>Notes</h2>
<p>[Any context, constraints, or decisions relevant to this task.]</p>
```

---

## Subtask HTML Description

```html
<p>
  [Brief description of what this subtask covers and its definition of done.]
</p>
```

---

## task.create Field Reference

```json
{
  "headline": "Short imperative title",
  "projectId": 2,
  "description": "<h2>Objective</h2><p>...</p>",
  "acceptanceCriteria": "- Criterion 1\n- Criterion 2",
  "priority": 3,
  "storypoints": 2,
  "planHours": 2,
  "milestoneid": 0,
  "tags": "tag1,tag2",
  "status": 3
}
```

Priority scale:

- `1` — Low
- `2` — Normal (default)
- `3` — Medium
- `4` — High
- `5` — Critical

Status codes:

- `3` — Nowe (set on create)
- `4` — W toku (set when work starts)
- `0` — Zrobione (set when complete)
- `1` — Zablokowane
- `2` — Do oceny

---

## milestone.create Field Reference

```json
{
  "headline": "Milestone title",
  "projectId": 2,
  "description": "<p>Milestone covering [phase or objective].</p>",
  "tags": "milestone,phase1"
}
```

---

## goal.create Field Reference

```json
{
  "title": "Goal title",
  "projectId": 2,
  "canvasId": 0,
  "status": "status_ontrack",
  "startValue": "0",
  "currentValue": "0",
  "endValue": "100",
  "metricType": "percent",
  "assignedTo": 1,
  "milestoneId": 0,
  "tags": "delivery,automation"
}
```

Goal status values: `status_ontrack`, `status_ahead`, `status_behind`, `status_atRisk`

---

## time.log Field Reference

```json
{
  "ticketId": 0,
  "hours": 1.0,
  "kind": "DEVELOPMENT",
  "description": "Summary of work done in this session.",
  "date": "YYYY-MM-DD"
}
```

Kind values: `DEVELOPMENT`, `DOCUMENTATION`, `BUG`, `MANAGEMENT`, `REVIEW`

---

## CLI Usage Examples

```shell
pnpm lt -- run milestone.create --input '{"headline":"Phase 1 - Feature X","projectId":2,"tags":"phase1,featureX"}' --format=json

pnpm lt -- run task.create --input-file .tmp/task.json --format=json

pnpm lt -- run task.patch --input '{"id":42,"fields":{"status":4}}' --format=json

pnpm lt -- run time.log --input '{"ticketId":42,"hours":1.5,"kind":"DEVELOPMENT","description":"Implemented feature X and updated tests.","date":"2026-04-07"}' --format=json

pnpm lt -- run retrospectives.board.create --input '{"title":"Sprint Retrospective Q2 2026","projectId":2}' --format=json

pnpm lt -- run retrospectives.item.create --input '{"boardId":123,"box":"well","title":"Deployment pipeline worked flawlessly"}' --format=json
```

---

## Input File Pattern

When descriptions are long, use `--input-file` with a JSON file:

```json
{
  "headline": "Add Leantime agent integration",
  "projectId": 2,
  "description": "<h2>Objective</h2><p>Create the Leantime Integration Agent...</p>",
  "acceptanceCriteria": "- Agent prompt file created\n- All extensions updated",
  "priority": 3,
  "storypoints": 3,
  "planHours": 3,
  "milestoneid": 34,
  "tags": "leantime,agents,integration",
  "status": 3
}
```

```shell
pnpm lt -- run task.create --input-file .tmp/task-leantime-agent.json --format=json
```
