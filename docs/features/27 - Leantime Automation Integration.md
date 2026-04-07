# Leantime Automation Integration

This repository now includes a script-first Leantime integration modeled after
the existing New Relic tooling:

- `pnpm lt` is the professional day-to-day entrypoint
- `pnpm lt:rpc` is the escape hatch for raw JSON-RPC method calls
- implementation is isolated to `scripts/leantime/*`
- configuration lives in server-only env vars

## What This Enables Now

Curated operations currently cover:

- user and client lookup
- project create / fetch / patch / search
- task create / fetch / update / patch / search
- subtask upsert via parent-task inheritance
- milestone creation and listing
- goal board creation, goal creation, and goal polling
- plugin-backed ideas board creation/listing/fetch/update/delete, idea
  create/list/fetch/update/delete, comments, column labels, comment reactions,
  milestone linking, and kanban moves
- wiki creation plus wiki article create / update / fetch
- file listing by module
- time logging
- full and realtime reports
- an `initiative.kickoff` composite that creates a milestone, wiki, starter knowledge articles, goals, and tasks

Examples:

- `pnpm lt -- list`
- `pnpm lt -- run project.create --input-file .tmp/project.json`
- `pnpm lt -- run task.create --input '{"headline":"Kickoff","projectId":123,"description":"Initial delivery task"}'`
- `pnpm lt -- run initiative.kickoff --input-file .tmp/initiative.json`
- `pnpm lt:rpc -- --method leantime.rpc.Tickets.Tickets.getTicket --input '{"id":9}'`

Optional flags:

- `--format=json` for machine-readable output
- `--project=123` to override `LEANTIME_DEFAULT_PROJECT_ID`
- `--author=456` to override `LEANTIME_DEFAULT_AUTHOR_ID`
- `--client=789` to override `LEANTIME_DEFAULT_CLIENT_ID`

## Environment Variables

- `LEANTIME_URL`
- `LEANTIME_API_KEY`
- `LEANTIME_RPC_PATH`
- `LEANTIME_API_TIMEOUT_MS`
- `LEANTIME_DEFAULT_PROJECT_ID`
- `LEANTIME_DEFAULT_AUTHOR_ID`
- `LEANTIME_DEFAULT_CLIENT_ID`

## Verified On-Prem Baseline

Verified against the on-prem instance on `2026-04-06`:

- `LEANTIME_URL=https://leantime.wmitrus.useruno.com`
- `LEANTIME_DEFAULT_AUTHOR_ID=1`
- `LEANTIME_DEFAULT_PROJECT_ID=2`
- `LEANTIME_DEFAULT_CLIENT_ID=1`
- Current project name in Leantime is spelled `NextJS Boileplate`

These defaults matter because the wrapper fills `projectId`, `authorId`, and
`clientId` automatically when the input payload omits them.

For the Ideas wrappers, deploy the `AutomationApi` plugin and use the normal
`LEANTIME_API_KEY` JSON-RPC path. Browser-session cookies are not part of the
normal production Ideas workflow.

## Live-Verified Read Operations And Properties

The table below focuses on the APIs already exercised against the live on-prem
instance. It combines:

- required input shape for the wrapper
- important response properties observed in the real instance
- the fields most useful for AI workflow decisions

| Operation          | Input Shape                                                  | Live-Observed Response Properties                                                                                                                                                                                                                                                                  | Most Useful Workflow Fields                                                                                               |
| ------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `users.list`       | `{"activeOnly": true}`                                       | `id`, `firstname`, `lastname`, `username`, `role`, `status`, `clientId`, `clientName`, `modified`                                                                                                                                                                                                  | `id`, `username`, `role`, `status`                                                                                        |
| `clients.list`     | `{}`                                                         | `id`, `name`, `internet`, `numberOfProjects`                                                                                                                                                                                                                                                       | `id`, `name`, `numberOfProjects`                                                                                          |
| `projects.list`    | `{}` or `{"showClosedProjects": true}`                       | `id`, `name`, `details`, `clientId`, `state`, `hourBudget`, `dollarBudget`, `menuType`, `type`, `modified`, `start`, `end`, `clientName`, `isFavorite`                                                                                                                                             | `id`, `name`, `clientId`, `state`, `modified`                                                                             |
| `projects.find`    | `{"term": "NextJS Boileplate"}`                              | `id`, `name`, `details`, `clientId`, `state`, `modified`, `parentId`, `parentName`                                                                                                                                                                                                                 | `name`, `clientId`, `modified`                                                                                            |
| `project.get`      | `2` or `{"id": 2}`                                           | `id`, `name`, `clientId`, `details`, `state`, `hourBudget`, `dollarBudget`, `psettings`, `menuType`, `type`, `parent`, `modified`, `start`, `end`, `isFavorite`                                                                                                                                    | `id`, `clientId`, `state`, `psettings`                                                                                    |
| `tasks.list`       | `{"projectId": 2}` or `{"searchCriteria": {"projectId": 2}}` | `id`, `headline`, `description`, `projectId`, `priority`, `status`, `tags`, `dependingTicketId`, `milestoneid`, `planHours`, `storypoints`, `type`, `parentHeadline`, `authorId`, `statusLabel`                                                                                                    | `id`, `headline`, `status`, `priority`, `dependingTicketId`, `milestoneid`, `type`, `statusLabel`                         |
| `task.get`         | `11` or `{"id": 11}`                                         | `id`, `headline`, `type`, `description`, `projectId`, `editorId`, `userId`, `priority`, `date`, `dateToFinish`, `status`, `storypoints`, `hourRemaining`, `planHours`, `acceptanceCriteria`, `tags`, `dependingTicketId`, `milestoneid`, `projectName`, `bookedHours`, `children`, `collaborators` | `headline`, `description`, `status`, `planHours`, `storypoints`, `acceptanceCriteria`, `dependingTicketId`, `milestoneid` |
| `milestones.list`  | `{"projectId": 2}`                                           | `id`, `headline`, `type`, `description`, `projectId`, `status`, `priority`, `date`, `dateToFinish`, `milestoneColor`, `projectName`, `userId`, `authorFirstname`, `authorLastname`                                                                                                                 | `id`, `headline`, `status`, `projectId`, `type`, `dateToFinish`                                                           |
| `goals.list`       | `{"projectId": 2}` or `{"projectId": 2, "board": 9}`         | `id`, `title`, `description`, `box`, `author`, `canvasId`, `status`, `milestoneId`, `startDate`, `endDate`, `setting`, `metricType`, `startValue`, `currentValue`, `endValue`, `impact`, `effort`, `probability`, `action`, `assignedTo`, `parent`, `tags`, `projectId`                            | `title`, `status`, `canvasId`, `milestoneId`, `startValue`, `currentValue`, `endValue`, `assignedTo`, `projectId`         |
| `wiki.list`        | `{"projectId": 2}`                                           | `id`, `title`, `author`, `created`, `projectId`, `category`                                                                                                                                                                                                                                        | `id`, `title`, `projectId`, `author`                                                                                      |
| `wiki.get`         | `5` or `{"id": 5}`                                           | `id`, `title`, `author`, `created`, `projectId`, `category`                                                                                                                                                                                                                                        | `id`, `title`, `projectId`                                                                                                |
| `wiki.article.get` | `{"id": 5, "projectId": 2}`                                  | `id`, `title`, `description`, `canvasId`, `parent`, `tags`, `data`, `status`, `created`, `modified`, `author`, `milestoneId`, `firstname`, `lastname`, `profileId`, `sortindex`, `projectId`, `milestoneHeadline`, `percentDone`                                                                   | `title`, `description`, `canvasId`, `status`, `author`, `milestoneId`, `projectId`                                        |
| `reports.full`     | `{"projectId": 2}`                                           | `date`, `sum_todos`, `sum_open_todos`, `sum_progres_todos`, `sum_closed_todos`, `sum_planned_hours`, `sum_logged_hours`, `sum_points`, `tickets`, `sum_teammembers`                                                                                                                                | `sum_open_todos`, `sum_closed_todos`, `sum_logged_hours`, `tickets`                                                       |
| `reports.realtime` | `{"projectId": 2}`                                           | `sum_open_todos`, `sum_closed_todos`, `sum_progres_todos`, `sum_planned_hours`, `sum_logged_hours`, `sum_points`, `tickets`, `sum_milestones`, `sum_hours_remaining`, and related live rollup counters                                                                                             | `sum_open_todos`, `sum_closed_todos`, `sum_logged_hours`, `sum_hours_remaining`, `tickets`, `sum_milestones`              |

Notes:

- `projects.find` returns an `id` in the combined form `<projectId>-<modified>`.
  Use `project.get` or `projects.list` when you need the canonical integer ID.
- `milestones.list` falls back to `getAllMilestonesOverview` when
  `getAllMilestones` throws a server error on this instance.
- `goal.create` requires a Goal Canvas board first. The curated flow now treats
  `canvasId` / `boardId` as the primary linkage and can create a board when a
  `goalBoard` definition or `goalBoardTitle` is supplied.
- `wiki.list` and `wiki.get` correctly bind to project `2`, even though the
  earlier first-pass test output showed a `null` projectId in the list response.
- `wiki.article.create` and `wiki.article.update` must use the real Leantime
  article fields: `title`, `description`, and `canvasId`.
- Ticket-like entities created through the API key currently appear under the
  effective API identity on this instance, even when `author` is passed.

## Live-Verified Write Semantics

Verified against the on-prem instance on `2026-04-06`:

- `wiki.create` returns a wiki id and creates a visible wiki space.
- `wiki.article.create` works when the payload uses `title`, `description`, and
  `canvasId`.
- `wiki.article.update` persists content updates and keeps article-to-wiki
  linkage intact.
- `task.create` correctly persists `headline`, `description`,
  `acceptanceCriteria`, `priority`, `status`, `storypoints`, `planHours`, and
  `tags`.
- `task.patch` is safe for low-blast-radius changes such as `status`,
  `planHours`, and `tags`.
- `subtask.upsert` creates true subtasks by setting `dependingTicketId` and
  preserving the parent project context.
- `milestone.create` works, but the tested instance did not persist the
  milestone `description`; treat milestone creation as a narrower write surface.
- `goalboard.create` and `goal.create` work via the Goal Canvas board-first
  contract.
- `files.list` works for task entities and currently returns an empty array for
  task `17`.
- `time.log` works when `kind` is supplied; omitting `kind` causes a generic
  server error on this instance.
- `reports.realtime` works through the curated wrapper and currently requires a
  `sprintId` default of `0` for backlog-style reporting on this instance.
- `project.patch` correctly persists `details` and `hourBudget`.
- `project.create` correctly creates new projects and persists `name`,
  `clientId`, `details`, and `hourBudget`.
- `project.create` accepts `assignedUsers`, but the tested `project.get`
  response does not expose assignment state, so create-time assignment cannot
  yet be verified from the current read surface.
- `goal.create` correctly persists KPI-oriented fields such as `metricType`,
  `startValue`, `currentValue`, `endValue`, `assignedTo`, `milestoneId`, and
  `tags`.
- `task.update` works as a full-payload update path and correctly persisted the
  tested description, acceptance criteria, tags, status, story points, and
  planned hours for task `17`.
- `milestone.create` did not persist the tested `dateToFinish` value on this
  instance; milestone schedule fields still need deeper contract validation.
- `project.patch` with `assignedUsers` currently fails with a server error on
  this instance, including a raw RPC attempt with array-shaped params; project
  assignment semantics still need separate validation.
- `leantime.rpc.Projects.Projects.getProjectUsers` is not exposed on this
  instance.
- `leantime.rpc.Projects.Projects.getUsersAssignedToProject` exists, but
  returned an empty array for project `4` even after create-time
  `assignedUsers: "1"` was accepted.
- `leantime.rpc.Projects.Projects.getProject` ignores `includeUsers: true` in
  the tested instance and returns the standard project payload.
- the practical `ideas.*` surface is now implemented against the
  `AutomationApi` plugin JSON-RPC contract; production validation should remain
  read-only by default, and destructive deletes require explicit `confirm=true`.
- the expanded `AutomationApi.Ideas` plugin was deployed to the on-prem
  instance on `2026-04-07`; read-only smoke validation passed for plugin ping,
  label listing, board listing, idea listing, idea fetch, and comment listing.

## Professional Operating Model For Apps Built From This Boilerplate

Use this operating model when a new app is being developed from the boilerplate.
The goal is to keep Leantime clean, queryable, and useful for humans and AI
agents over time.

### Project baseline

For each new product built from the boilerplate:

- create one Leantime project for the product
- create one primary knowledge wiki for the product
- create one active goal board for the current planning horizon
- create milestones only for real delivery slices
- create tasks only for independently reviewable work items

Avoid:

- a new project for every feature
- a new goal board for every small task batch
- a new wiki for every ad hoc note

### Wiki strategy

Default policy:

- start with one wiki space called something like `Product Knowledge Base` or
  `Delivery Knowledge Base`
- create articles inside that wiki for:
  - product brief
  - architecture notes
  - implementation notes
  - discovery / research
  - incidents / debugging
  - retrospectives

Create a second wiki space only when one of these is true:

- a separate audience needs a separate information boundary
- the content has a meaningfully different lifecycle
- the number of articles makes one wiki hard to navigate

For this repo family, a good default is:

- one primary wiki for all delivery knowledge
- optional second wiki for operational runbooks if the app becomes production-heavy

Professional content layout inside the primary wiki:

- one article for the product brief and scope
- one article for architecture and major technical decisions
- one article for implementation notes and rollout details per substantial feature
- one article for validation evidence or bug investigation when the work matters later
- one stable retrospective article that is updated over time instead of creating many small retro pages

### Goal board strategy

Default policy:

- create one goal board per active planning horizon or product stream
- keep goals outcome-oriented, not task-oriented
- create a new goal board only when the review cadence or ownership changes

Good reasons to create a new goal board:

- a new release train or quarter starts
- a separate stakeholder group owns a separate outcome set
- an incubation stream needs isolated KPI tracking

Bad reasons:

- one feature needs two tasks
- a bugfix sprint starts
- an engineer wants a private planning board

For apps built from this boilerplate, the clean default is:

- one active goal board for the current release horizon
- one replacement board when the horizon or owner group changes
- old boards remain historical records and should not be reused forever

### Goal strategy

Use goals for measurable outcomes such as:

- activation improvement
- deployment reliability
- onboarding completion
- support-load reduction
- performance or stability objectives

Each goal should normally include:

- `title`
- `canvasId`
- `status`
- measurement fields such as `startValue`, `currentValue`, `endValue`
- optional `milestoneId` when the goal is tied to a specific delivery slice
- optional `assignedTo` when one owner is accountable for movement
- optional `tags` when reporting or filtering by stream matters

Do not use goals as a duplicate task list.

Good goal examples for this repo family:

- improve onboarding completion
- reduce auth-related production regressions
- reduce deployment recovery time
- increase delivery predictability for release slices

### Ideas strategy

Use Ideas for early-stage exploration that is still too fluid for task-first
delivery tracking.

Good uses:

- raw customer or operator pain points
- opportunities worth triaging before implementation
- discovery items that may or may not become tasks
- pre-backlog concepts that benefit from kanban-style movement

Do not use Ideas for:

- already-approved implementation work
- work that already has clear acceptance criteria and ownership
- items that belong directly in tasks, milestones, or goals

For this instance, the verified Ideas kanban column model is:

- `idea`
- `research`
- `prototype`
- `validation`
- `implemented`
- `deferred`

The UI labels can be edited, but these internal status keys are what the web
contract actually uses.

### Milestone strategy

Use milestones for delivery slices that have a recognizable outcome:

- MVP delivery
- auth hardening release
- observability rollout
- onboarding redesign

Create a milestone when:

- multiple tasks contribute to one reviewable outcome
- stakeholders need progress rolled up to a higher-level slice
- reporting should answer “how is this release slice progressing?”

Do not create milestones for:

- every single task batch
- every debugging thread
- one-person micro-work that should stay at task level

For this instance, rely on:

- `headline`
- `projectId`
- `status`
- dates if later validated

Treat milestone `description` as non-authoritative until further write testing proves it persists reliably.

### Task strategy

Tasks are the main execution unit.

Create a task when the work is:

- independently completable
- independently reviewable
- likely to need its own status updates
- important enough to show up in reports

Every non-trivial task should include:

- `headline`
- `description`
- `acceptanceCriteria`
- `priority`
- `status`
- `storypoints` when relative sizing is useful
- `planHours` when estimate-driven reporting matters
- `tags` for retrieval and grouping

Recommended task categories for this repo family:

- feature delivery
- architecture decision execution
- validation / QA
- observability / monitoring
- security hardening
- incident follow-up
- documentation / rollout

Professional task-writing standard:

- the `headline` should describe the outcome, not just the area
- the `description` should explain context, expected behavior, constraints, and relevant technical notes
- the `acceptanceCriteria` should describe observable completion conditions
- `planHours` should be added when the work enters active planning
- `storypoints` are useful when relative sizing matters across a backlog, but should stay stable once execution starts
- `tags` should be durable retrieval labels, not ephemeral comments

### Subtask strategy

Use subtasks only for child work that is tightly bound to a parent task.

Create a subtask when:

- it is not meaningful as a standalone roadmap item
- it depends directly on the parent
- it helps execution clarity without polluting top-level reporting

Do not create subtasks for:

- separate initiatives
- separate milestone-worthy outcomes
- work that different teams need to track independently at top level

Production rule:

- if the child work needs independent reporting, separate ownership, or separate milestone consideration, make it a task, not a subtask

### Estimation and reporting discipline

To keep reports useful:

- set `planHours` when a task is created or when scope becomes clear
- keep `storypoints` stable unless the scope materially changes
- update `status` as execution changes state
- update `hourRemaining` later if the workflow starts using that field consistently
- use `time.log` only for real effort tracking or explicit simulation
- always supply `kind` when logging time; use a controlled work taxonomy such as
  `DEVELOPMENT`, `TESTING`, or `PROJECTMANAGEMENT`

Recommended practice:

- set `planHours` during backlog refinement
- patch `status` during active work
- log time after meaningful work sessions, not every few minutes
- use clear time-log descriptions tied to the actual task outcome
- keep `hourBudget` at project level aligned with the sum of meaningful planned work, not wishful scope

### Reporting cadence

Use Leantime reports well by keeping the hierarchy clean:

- goals answer whether outcomes are moving
- milestones answer whether delivery slices are progressing
- tasks answer what is actively being built
- subtasks answer how a parent task is being executed
- wiki articles answer why decisions were made and what was learned

For good reports:

- avoid orphan tasks with no description
- avoid milestones with only one tiny task unless the milestone is externally meaningful
- avoid goals without a board and without measurable values

## AI Workflow Recommendations For This Boilerplate

For future app development based on this repository:

- kickoff should create the milestone, primary wiki, starter articles, and
  starter tasks together
- goals should be added only after the product outcome is clear enough to
  measure
- implementation agents should update task status and wiki articles during work
- validation agents should store findings in wiki articles and patch task status
- retros should update a stable retrospective article instead of scattering
  notes across many locations

## Dedicated Skill Decision

Decision today:

- document the operating model now
- defer a dedicated project-setup skill until the curated Leantime contract is
  stable across tasks, goals, wiki, milestones, and time logging

Why later:

- the conventions are now clear, but the API abstraction has only just become
  reliable enough to encode
- a dedicated skill is most useful after the wrappers and payload rules stop
  changing week to week

Tracking:

- Leantime task `20`: `Design Leantime delivery governance and AI workflow skill`

## Useful Create And Update Properties For AI Workflows

The sections below are the fields that are worth setting intentionally in AI
workflows. They are not meant to be every optional field supported by Leantime.
They are the fields that improve execution quality, traceability, and later
reporting.

### Project payloads

Useful fields for `project.create` and `project.patch`:

- `name`
- `clientId`
- `details`
- `assignedUsers`
- `hourBudget`
- `dollarBudget`
- `start`
- `end`
- `psettings`

Recommended AI usage:

- use `details` for project framing, scope, constraints, and success criteria
- use `assignedUsers` only when ownership is deliberate
- use `hourBudget` when a roadmap or milestone estimate exists
- keep `psettings` stable unless there is a deliberate permission change
- treat `assignedUsers` as unverified for patch flows on this instance until the
  server-side contract is understood
- treat create-time `assignedUsers` as provisionally accepted but not yet
  observable from the currently verified read APIs
- do not build AI workflow logic that depends on project-member assignment until
  the instance exposes a trustworthy read/update contract

### Task and subtask payloads

Useful fields for `task.create`, `task.update`, `task.patch`, and
`subtask.upsert`:

- `headline`
- `description`
- `acceptanceCriteria`
- `projectId`
- `status`
- `priority`
- `storypoints`
- `planHours`
- `hourRemaining`
- `tags`
- `dateToFinish`
- `dependingTicketId`
- `milestoneid`
- `type`

Recommended AI usage:

- always provide `headline`, `description`, and `acceptanceCriteria`
- use `planHours` and `storypoints` for delivery planning, not just reporting
- use `dependingTicketId` for true prerequisites, not loose relationships
- use `milestoneid` to tie execution to roadmap slices
- use `tags` for durable retrieval themes such as `auth`, `runtime`,
  `security`, `migration`, `observability`
- create subtasks only when they represent independently completable work

### Milestone payloads

Useful fields for `milestone.create`:

- `headline`
- `projectId`
- `status`
- `dateToFinish`

Recommended AI usage:

- create milestones for meaningful delivery slices, not every small task batch
- align milestone names to feature outcomes or release slices
- do not rely on milestone descriptions for important content until this
  instance proves they persist reliably
- do not rely on milestone due-date fields yet until the instance contract is
  validated more deeply

### Goal payloads

Useful fields for `goal.create`:

- `title`
- `canvasId`
- `box`
- `status`
- `startValue`
- `currentValue`
- `endValue`
- `milestoneId`
- `assignedTo`
- `tags`

Recommended AI usage:

- create the goal board first, or let the curated operation create one from
  `goalBoard` / `goalBoardTitle`
- use goals for measurable outcomes, not implementation chores
- keep one goal per meaningful user or business outcome
- use KPI fields when the goal really measures movement over time, not just
  directional intent
- connect tasks and milestones to goals conceptually in descriptions until a
  richer native linkage is added

### Wiki and wiki article payloads

Useful fields for `wiki.create`, `wiki.article.create`, and
`wiki.article.update`:

- `title`
- `projectId`
- `author`
- `category`
- `description`
- `canvasId`
- `status`
- `parent`

Recommended AI usage:

- use wiki spaces for stable project knowledge domains such as
  `Architecture`, `Implementation Notes`, `Retro`, `Incidents`, `Research`
- use articles for detailed specifications, decision records, insights, and
  validation notes
- treat the wiki as the structured fallback for ideas, blueprints, project
  briefs, and retros until native canvas automation is added

### Ideas plugin payloads

Useful fields for plugin-backed Ideas board and idea lifecycle operations:

- board payloads:
  - `projectId`
  - `boardId`
  - `title`
- idea payloads:
  - `canvasId` / `boardId`
  - `description` / `title`
  - `data` / `content`
  - `box`
  - `status`
  - `tags`

Legacy HAR-confirmed web endpoints remain useful as diagnostic evidence, but
they are no longer the normal automation path:

- board deletion:
  - `GET /ideas/delCanvas/<boardId>`
- comment create and edit:
  - `comment=1`
  - `text`
  - `father`
  - `edit-comment-helper`
  - `submitAction=Reply` for edits
- milestone linkage:
  - `newMilestone`
  - `existingMilestone`
  - `type=milestone`
  - `leancanvasitemid`
- kanban moves:
  - `action=statusUpdate`
  - `payload[idea|research|prototype|validation|implemented|deferred]`
- label editing:
  - `/setting/editBoxLabel?module=idealabels&label=<statusKey>`
  - `newLabel`
  - `submitAction=Save`
- comment reactions:
  - `/hx/comments/reactions/toggle?commentId=<id>`
  - `reaction=like`

Implemented wrappers:

- `ideas.board.create`
- `ideas.board.list`
- `ideas.board.get`
- `ideas.board.update`
- `ideas.board.delete`
- `ideas.list`
- `ideas.get`
- `ideas.create`
- `ideas.update`
- `ideas.delete`
- `ideas.comment.list`
- `ideas.comment.create`
- `ideas.comment.edit`
- `ideas.comment.delete`
- `ideas.kanban.move`
- `ideas.label.list`
- `ideas.label.update`
- `ideas.reaction.toggle`
- `ideas.milestone.create-link`
- `ideas.milestone.link-existing`
- `ideas.milestone.unlink`

Recommended AI usage:

- use Ideas before task creation when the item still needs discovery
- move ideas across kanban columns as evidence matures
- promote only sufficiently clear ideas into tasks or milestones
- use plugin-backed board and idea wrappers for normal board/idea lifecycle
  work once `AutomationApi` is deployed
- use plugin-backed comments, labels, reactions, and milestone-link wrappers for
  normal Ideas collaboration workflows
- treat destructive endpoints such as idea deletion and board deletion as
  high-risk operations; they require `confirm=true` and should stay out of
  default agent behavior

### Time logging payloads

Useful fields for `time.log`:

- `ticketId`
- `hours`
- `kind`
- `description`
- `date`
- user attribution fields supported by the instance

Recommended AI usage:

- reserve time logging for real work tracking or explicit simulation workflows
- include a short `description` that explains what changed or was investigated
- use `kind` consistently so later reporting is queryable and comparable across work sessions

## Recommended AI Workflow Conventions

These conventions keep Leantime data useful for future agents:

- Every feature should have one milestone only when it represents a real
  delivery slice.
- Every non-trivial task should include a strong description and acceptance
  criteria.
- Use goals for outcome tracking, not task duplication.
- Use wiki articles to store implementation notes, debug findings, customer
  context, and retros.
- Prefer `task.patch` for status-only updates and `task.update` for richer task
  refreshes.
- Prefer `initiative.kickoff` when a feature needs a milestone, goals, wiki
  structure, and starter tasks together.

## Next APIs To Test

The next round of API validation should focus on enrichment and governance
flows:

1. richer goal payloads with KPI values such as `startValue`, `currentValue`,
   `endValue`, `assignedTo`, and `milestoneId`
   Status: validated
2. milestone date handling and schedule fields
3. project assignment fields such as `assignedUsers`
4. report interpretation rules after more time and milestone data exists
5. any supported file-upload or richer artifact attachment workflow if exposed
6. focused cleanup validation for explicit-confirm destructive Ideas wrappers
   only when cleanup is requested

## Design Notes

- scripts authenticate with `x-api-key` against Leantime JSON-RPC
- plugin-backed `ideas.*` wrappers authenticate with the same JSON-RPC API key
  after the on-prem `AutomationApi` plugin is deployed
- repo-local wrappers keep `package.json` small while exposing a richer operational catalog
- defaults are intentionally optional so AI agents can reuse the same project/client/author context without copying IDs into every command
- raw `pnpm lt:rpc` remains available for documented Leantime methods we have not wrapped yet

## Important Gap: Native Blueprint Boards And Ideas

The current public JSON-RPC surface is strong for projects, tickets, goals, wiki, files, time, and reports.

However, the official JSON-RPC docs and source do not currently expose the same
level of create/update automation for native blueprint board creation for Value
Canvas, SWOT, Lean Canvas, Retros, Risk Analysis, Environment Analysis, and
similar canvas modules.

That means this first integration uses:

- native APIs where Leantime officially exposes them
- the local `AutomationApi` plugin for Ideas board, idea, comment, reaction,
  label, milestone-link, and kanban lifecycle operations
- verified web flows only as emergency diagnostic evidence
- wiki knowledge articles as the structured fallback for project brief,
  implementation notes, insights, and retrospective capture

Phase 2 should add either:

1. a Leantime on-prem plugin that exposes the missing canvas / ideas repository methods as supported JSON-RPC services, or
2. a controlled session/browser automation layer for those unsupported features

## Upstream Architecture Findings

Upstream Leantime currently exposes three different integration shapes, and that
distinction matters more than the UI menu labels:

### Tickets / To-Dos

Tickets are the strongest public integration surface.

- JSON-RPC maps into `Domain\\Tickets\\Services\\Tickets`
- that service exposes many `@api` methods, including practical read and write
  flows such as ticket lookup, milestone listing, ticket update, patch, and
  status/sorting updates
- there is also a separate HTTP API controller for tickets, but the real
  supported integration surface is the service layer behind JSON-RPC

This matches the live validation we already completed for tasks, subtasks, and
milestones.

### Ideas

Ideas are not modeled the same way as tickets.

- JSON-RPC only exposes a narrow service layer for idea polling and update
  polling
- create, update, comment, milestone linking, board create, and delete flows
  live upstream in classic controllers such as `IdeaDialog`, `BoardDialog`,
  `ShowBoards`, and `AdvancedBoards`
- the real write logic sits in `Domain\\Ideas\\Repositories\\Ideas`

This means upstream alone should still be treated as a fallback, not as the
target long-term architecture. The local `AutomationApi` plugin now provides a
stable custom JSON-RPC surface for board, idea, comment, reaction, label,
milestone-link, and kanban lifecycle methods. Browser-session automation should
not be used for normal Ideas workflows.

### Blueprints / Canvas Boards

Blueprints are not one module upstream. They are a family of canvas modules,
including `Valuecanvas`, `Leancanvas`, `Swotcanvas`, `Riskscanvas`,
`Minempathycanvas`, `Insightscanvas`, `Cpcanvas`, `Dbmcanvas`, `Eacanvas`,
`Emcanvas`, `Lbmcanvas`, `Obmcanvas`, `Sbcanvas`, `Smcanvas`, `Sqcanvas`, and
the special case `Goalcanvas`.

Important upstream behavior:

- each board family has an `Api\\Controllers\\*canvas` controller
- those HTTP API controllers inherit from `Domain\\Api\\Controllers\\Canvas`
- upstream `Canvas` API currently implements only `patch()`
- upstream `get()`, `post()`, and `delete()` return `501 Not implemented`
- the real generic CRUD sits in `Domain\\Canvas\\Repositories\\Canvas`
- generic browser/UI flows are handled by `Domain\\Canvas\\Controllers\\*`

The one notable exception is `Goalcanvas`, which also has its own service layer
and therefore supports meaningful JSON-RPC automation.

### Reliable Conclusion For Blueprint RPC

The upstream source is strong enough to answer this credibly:

- yes, we can infer how Blueprint HTTP API patching works
- no, we cannot infer a complete hidden JSON-RPC CRUD surface for native
  blueprint boards, because upstream does not define matching `Services`
  classes for most canvas families
- for most blueprint modules, there is no evidence of native JSON-RPC create,
  update, list, or delete support comparable to tickets
- `Goalcanvas` remains the exception and should continue to use JSON-RPC

So the trustworthy answer today is:

1. use JSON-RPC for `Goalcanvas`
2. do not assume the rest of Blueprints can be integrated cleanly through
   hidden JSON-RPC methods
3. if full automation is required, the cleanest next step is an on-prem plugin
   or custom API layer over the generic canvas repositories/controllers

## Recommended On-Prem Plugin MVP

The recommended next step is not broader browser automation. It is a narrow,
versioned on-prem plugin that exposes stable RPC methods for the unsupported
Leantime domains we care about.

### Why a plugin is the preferred design

- upstream already contains most of the real business logic in repositories and
  classic controllers
- the main missing piece is a stable, machine-friendly API contract
- a plugin keeps the automation contract close to Leantime instead of teaching
  every agent the legacy browser flow
- a plugin is easier to permission, test, and document than session emulation

### MVP scope

Phase 1 should stay intentionally small. The local MVP already covers board and
idea lifecycle methods; the rest of this list remains the next production
hardening target:

1. Ideas
   - board create/list/get/update
   - idea create/list/get/update
   - idea status move
   - comment create
   - comment edit
   - milestone create-and-link
   - milestone link-existing
   - milestone unlink
2. Generic canvas boards for Blueprints
   - board list
   - board create
   - board update
   - item list by board
   - item get
   - item create
   - item update
   - item patch
   - comment create
   - comment edit
   - milestone link-existing
   - milestone unlink
3. Goalcanvas
   - keep using upstream JSON-RPC where it already works
   - only normalize payload shapes if needed

Do not include delete flows in the first pass unless there is a strong business
reason. Keep destructive methods as phase 2.

### Proposed plugin shape

Recommended plugin/module namespace:

- `Plugins/AutomationApi`

Recommended RPC service classes:

- `Plugins\\AutomationApi\\Services\\Ideas`
- `Plugins\\AutomationApi\\Services\\Canvas`
- optional later:
  `Plugins\\AutomationApi\\Services\\BlueprintBoards`

Recommended public RPC methods:

#### Ideas

- `leantime.rpc.AutomationApi.Ideas.listBoards`
- `leantime.rpc.AutomationApi.Ideas.getBoard`
- `leantime.rpc.AutomationApi.Ideas.createBoard`
- `leantime.rpc.AutomationApi.Ideas.updateBoard`
- `leantime.rpc.AutomationApi.Ideas.deleteBoard`
- `leantime.rpc.AutomationApi.Ideas.listIdeas`
- `leantime.rpc.AutomationApi.Ideas.getIdea`
- `leantime.rpc.AutomationApi.Ideas.createIdea`
- `leantime.rpc.AutomationApi.Ideas.updateIdea`
- `leantime.rpc.AutomationApi.Ideas.deleteIdea`
- `leantime.rpc.AutomationApi.Ideas.listComments`
- `leantime.rpc.AutomationApi.Ideas.moveIdea`
- `leantime.rpc.AutomationApi.Ideas.deleteComment`
- `leantime.rpc.AutomationApi.Ideas.listLabels`
- `leantime.rpc.AutomationApi.Ideas.updateLabel`
- `leantime.rpc.AutomationApi.Ideas.toggleCommentReaction`
- `leantime.rpc.AutomationApi.Ideas.createComment`
- `leantime.rpc.AutomationApi.Ideas.editComment`
- `leantime.rpc.AutomationApi.Ideas.createAndLinkMilestone`
- `leantime.rpc.AutomationApi.Ideas.linkMilestone`
- `leantime.rpc.AutomationApi.Ideas.unlinkMilestone`

#### Generic canvas boards

- `leantime.rpc.AutomationApi.Canvas.listBoards`
- `leantime.rpc.AutomationApi.Canvas.getBoard`
- `leantime.rpc.AutomationApi.Canvas.createBoard`
- `leantime.rpc.AutomationApi.Canvas.updateBoard`
- `leantime.rpc.AutomationApi.Canvas.listItems`
- `leantime.rpc.AutomationApi.Canvas.getItem`
- `leantime.rpc.AutomationApi.Canvas.createItem`
- `leantime.rpc.AutomationApi.Canvas.updateItem`
- `leantime.rpc.AutomationApi.Canvas.patchItem`
- `leantime.rpc.AutomationApi.Canvas.createComment`
- `leantime.rpc.AutomationApi.Canvas.editComment`
- `leantime.rpc.AutomationApi.Canvas.linkMilestone`
- `leantime.rpc.AutomationApi.Canvas.unlinkMilestone`

### Contract design rules

- require explicit `projectId`
- require explicit `boardType` for generic canvas methods
- use normalized field names across all canvas families
- map plugin payloads internally to the repository-specific upstream shape
- validate role/permission server-side before calling repositories
- prefer idempotent patch-style methods for agent workflows
- return stable machine-oriented records instead of HTML or redirect semantics

Recommended `boardType` values should mirror upstream module families:

- `value`
- `lean`
- `swot`
- `risks`
- `minempathy`
- `insights`
- `cp`
- `dbm`
- `ea`
- `em`
- `lbm`
- `obm`
- `sb`
- `sm`
- `sq`

### Internal implementation strategy

Use upstream classes directly instead of reimplementing the business rules:

- Ideas should call `Domain\\Ideas\\Repositories\\Ideas`
- generic blueprints should call `Domain\\Canvas\\Repositories\\Canvas` plus the
  specific `*canvas` repositories resolved by board type
- comments should reuse the existing comments repository/service
- milestone linking should reuse the same repository fields and ticket service
  logic already used by classic controllers

This plugin should be a thin contract layer, not a duplicate workflow engine.

### Delivery order

Recommended build sequence:

1. plugin skeleton and auth guard
2. `Ideas.listBoards` and `Ideas.createBoard`
3. `Ideas.createIdea` and `Ideas.updateIdea`
4. `Ideas.moveIdea`
5. Ideas comment, reaction, label, and milestone helpers
6. wire this repository CLI to the new plugin RPC methods
   Status: complete for the practical Ideas JSON-RPC surface.
7. only use delete flows with explicit `confirm=true`
8. `Canvas.listBoards` and `Canvas.createBoard`
9. `Canvas.listItems` and `Canvas.createItem`
10. `Canvas.updateItem` and `Canvas.patchItem`

### Expected effort

Rough estimate for production-grade work:

- plugin skeleton and auth model: 0.5 to 1 day
- Ideas MVP: 1 to 2 days
- generic canvas MVP for Blueprints: 2 to 4 days
- integration tests, docs, CLI wiring, and stabilization: 2 to 4 days

That puts the realistic first production-ready version in the range of several
days to about one focused week, depending on how much validation and rollback
discipline is required.

### Recommended decision

Proceed with a plugin MVP.

Do not expand session-backed `ideas.*` fallback into the final architecture.
Use the plugin path for Ideas and reserve browser-flow evidence only for
diagnostics.

The detailed implementation skeleton for that plugin lives in
[28 - Leantime AutomationApi Plugin MVP.md](/home/wojtek/projects/nextjs-16-boilerplate/docs/features/28%20-%20Leantime%20AutomationApi%20Plugin%20MVP.md).

The production-safe deployment, backup, rollback, and manifest workflow lives in
[29 - Leantime AutomationApi Plugin Deploy Workflow.md](/home/wojtek/projects/nextjs-16-boilerplate/docs/features/29%20-%20Leantime%20AutomationApi%20Plugin%20Deploy%20Workflow.md).

## Deferred Ideas Surface

Keep this as the explicit follow-up backlog so the current implementation stays
production-safe and reviewable.

The following Ideas capabilities remain intentionally constrained rather than
missing:

- destructive board, idea, and comment deletion wrappers exist, but require
  `confirm=true` and should only be used for explicit cleanup tasks
- browser-session automation is not a normal path; keep the HAR-derived routes
  only as diagnostic evidence

Keep the following upstream gaps explicit as well so they can be revisited later:

- exact route binding for `/api/ideas`
- whether any non-Goalcanvas blueprint family gains a first-class `Services`
  layer in future upstream releases
- whether the partial HTTP API patch controller for generic canvas boards
  becomes full CRUD upstream

These should be revisited after the Blueprints plugin task starts.

For the expanded Ideas plugin deploy, the production manifest is:

- `logs/leantime-plugin-deployments/2026-04-07T12-01-46Z-AutomationApi-apply.json`

That deploy overwrote only:

- `app/Plugins/AutomationApi/README.md`
- `app/Plugins/AutomationApi/Services/Ideas.php`

Backups were created under:

- `storage/plugin-backups/AutomationApi/2026-04-07T12-01-46Z/README.md`
- `storage/plugin-backups/AutomationApi/2026-04-07T12-01-46Z/Services/Ideas.php`

## AI Agent Usage

The agent-facing command guide lives in [LEANTIME_AUTOMATION.md](/home/wojtek/projects/nextjs-16-boilerplate/docs/ai/general/LEANTIME_AUTOMATION.md).
