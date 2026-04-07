# Leantime Automation Guide

This document is the single agent-facing reference for the repository's
Leantime automation scripts.

Use it when work should be mirrored into the on-prem Leantime workspace without
forcing every agent to memorize the raw JSON-RPC method surface.

## Primary Commands

- `pnpm lt -- list`
- `pnpm lt -- run <operation-id> --input-file path/to/input.json`
- `pnpm lt:rpc -- --method leantime.rpc.<Module>.<Service>.<Method> --input '{"...": "..."}'`

## Verified Instance Defaults

Verified against the on-prem instance on `2026-04-06`:

- `LEANTIME_DEFAULT_AUTHOR_ID=1`
- `LEANTIME_DEFAULT_PROJECT_ID=2`
- `LEANTIME_DEFAULT_CLIENT_ID=1`
- project name is currently `NextJS Boileplate`

## Preferred Agent Patterns

- For repeatable repository workflows, prefer `pnpm lt -- run <operation-id>`
- For one-off documented Leantime methods not wrapped yet, use `pnpm lt:rpc`
- Use `.env.leantime` for production/on-prem Leantime automation and
  `.env.leantime-dev` for the local Podman stack; do not put optional Leantime
  integration secrets into `.env.local`.
- Prefer `--input-file` when descriptions, acceptance criteria, or wiki content are long
- Prefer env defaults (`LEANTIME_DEFAULT_PROJECT_ID`, `LEANTIME_DEFAULT_AUTHOR_ID`, `LEANTIME_DEFAULT_CLIENT_ID`) so agents do not repeat IDs unnecessarily
- For Ideas flows, deploy the `AutomationApi` plugin and use the normal
  `LEANTIME_API_KEY` JSON-RPC path. Do not use browser-session cookies for
  normal Ideas automation.

## High-Value Operations

- `project.create`
- `project.patch`
- `task.create`
- `task.update`
- `task.patch`
- `subtask.upsert`
- `milestone.create`
- `goalboard.create`
- `goal.create`
- `blueprints.types.list`
- `blueprints.type.get`
- `blueprints.board.list`
- `blueprints.board.get`
- `blueprints.board.create`
- `blueprints.board.update`
- `blueprints.board.delete`
- `blueprints.item.list`
- `blueprints.item.get`
- `blueprints.item.create`
- `blueprints.item.update`
- `blueprints.item.patch`
- `blueprints.item.delete`
- `blueprints.comment.list`
- `blueprints.comment.create`
- `blueprints.comment.edit`
- `blueprints.comment.delete`
- `blueprints.milestone.create-link`
- `blueprints.milestone.link-existing`
- `blueprints.milestone.unlink`
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
- During product planning:
  Create or reuse a goal board before creating any goals.
- During idea discovery:
  Use plugin-backed `ideas.board.*`, `ideas.create`, `ideas.list`,
  `ideas.get`, `ideas.update`, `ideas.comment.*`, `ideas.label.*`,
  `ideas.reaction.toggle`, `ideas.milestone.*`, and `ideas.kanban.move`.
  Destructive commands require explicit `confirm=true` and should stay out of
  default agent behavior.
- During blueprint discovery:
  Use plugin-backed `blueprints.types.list` and `blueprints.type.get` before
  creating any board items. The current Canvas rollout supports
  `boardType: "value"` / Project Value Canvas and `boardType: "risks"` / Risk
  Analysis. Keep production writes intentional and prefer local Podman smoke
  tests before seeding real production boards.

## Verified Commands

These commands were exercised successfully against the live instance:

- `pnpm lt -- run users.list --input '{"activeOnly":true}' --format=json`
- `pnpm lt -- run clients.list --format=json`
- `pnpm lt -- run projects.list --format=json`
- `pnpm lt -- run projects.find --input '{"term":"NextJS Boileplate"}' --format=json`
- `pnpm lt -- run project.get --input '2' --format=json`
- `pnpm lt -- run tasks.list --input '{"projectId":2}' --format=json`
- `pnpm lt -- run task.get --input '11' --format=json`
- `pnpm lt -- run goalboard.create --input '{"title":"AI Workflow Goals","projectId":2,"author":1}' --format=json`
- `pnpm lt -- run wiki.list --input '{"projectId":2}' --format=json`
- `pnpm lt -- run wiki.get --input '5' --format=json`
- `pnpm lt -- run goals.list --input '{"projectId":2}' --format=json`
- `pnpm lt -- run milestones.list --input '{"projectId":2}' --format=json`
- `pnpm lt -- run reports.full --input '{"projectId":2}' --format=json`
- `pnpm lt -- run time.log --input '{"ticketId":17,"hours":0.5,"kind":"DEVELOPMENT","description":"Validated task, patch, milestone, goal, wiki, and subtask API flows.","date":"2026-04-06"}' --format=json`
- `pnpm lt -- run reports.realtime --input '{"projectId":2}' --format=json`
- `pnpm lt -- run project.patch --input '{"id":2,"fields":{"details":"<p>Production-grade Next.js boilerplate with Leantime automation validation in progress.</p>","hourBudget":120}}' --format=json`
- `pnpm lt -- run project.create --input '{"name":"Leantime API Sandbox Project","clientId":1,"details":"Temporary project created to validate project.create from the automation CLI.","hourBudget":16}' --format=json`
- `pnpm lt -- run goal.create --input '{"title":"Increase delivery predictability","projectId":2,"canvasId":9,"status":"status_ontrack","startValue":"0","currentValue":"20","endValue":"100","metricType":"percent","assignedTo":1,"milestoneId":18,"tags":"delivery,automation"}' --format=json`
- `pnpm lt -- run task.update --input '{"id":17,"headline":"Validate Leantime task.create API","projectId":2,"description":"Updated through task.update full payload validation.","acceptanceCriteria":"- updateTicket accepts the wrapper payload\n- changed fields persist after update","priority":3,"status":1,"storypoints":2,"planHours":2,"tags":"api-test,automation,update"}' --format=json`

These plugin-backed Ideas commands were exercised successfully against the
local Podman Leantime stack on `http://localhost:8185`:

- `pnpm lt -- run ideas.board.create --input '{"title":"CLI Plugin Board"}' --format=json`
- `pnpm lt -- run ideas.create --input '{"boardId":3,"title":"CLI plugin idea","content":"<p>Created from pnpm lt plugin RPC.</p>","tags":"cli,plugin"}' --format=json`
- `pnpm lt -- run ideas.get --input '{"ideaId":3}' --format=json`
- `pnpm lt -- run ideas.list --input '{"boardId":3}' --format=json`
- `pnpm lt -- run ideas.kanban.move --input '{"ideaId":3,"toStatus":"research"}' --format=json`
- `pnpm lt -- run ideas.comment.list --input '{"ideaId":3}' --format=json`
- `pnpm lt -- run ideas.comment.create --input '{"ideaId":3,"text":"<p>Plugin RPC comment smoke test</p>","author":2}' --format=json`
- `pnpm lt -- run ideas.reaction.toggle --input '{"commentId":1,"reaction":"like","author":2}' --format=json`
- `pnpm lt -- run ideas.milestone.create-link --input '{"ideaId":3,"title":"Plugin RPC Milestone Smoke","author":2}' --format=json`
- `pnpm lt -- run ideas.milestone.unlink --input '{"ideaId":3}' --format=json`
- `pnpm lt -- run ideas.label.update --input '{"projectId":1,"statusKey":"deferred","newLabel":"Deferred"}' --format=json`

The expanded plugin-backed Ideas surface was deployed to the on-prem instance
and read-only validated on `2026-04-07`:

- `pnpm lt:rpc -- --method leantime.rpc.AutomationApi.AutomationApi.ping --input '{}' --format=json`
- `pnpm lt -- run ideas.label.list --input '{"projectId":2}' --format=json`
- `pnpm lt -- run ideas.board.list --input '{"projectId":2}' --format=json`
- `pnpm lt -- run ideas.list --input '{"boardId":3}' --format=json`
- `pnpm lt -- run ideas.get --input '{"ideaId":10}' --format=json`
- `pnpm lt -- run ideas.comment.list --input '{"ideaId":10}' --format=json`

The Project Value Canvas slice of `AutomationApi.Canvas` was deployed to the
on-prem instance and read-only validated on `2026-04-07`:

- `pnpm lt -- run blueprints.types.list --format=json`
- `pnpm lt -- run blueprints.board.list --input '{"projectId":2,"boardType":"value"}' --format=json`

These plugin-backed Project Value Canvas commands were exercised successfully
against the local Podman Leantime stack on `http://localhost:8185`:

- `pnpm lt -- run blueprints.types.list --format=json`
- `pnpm lt -- run blueprints.board.create --input '{"boardType":"value","title":"CLI Project Value Canvas","description":"Local phase 1 smoke test board."}' --format=json`
- `pnpm lt -- run blueprints.item.create --input '{"boardType":"value","boardId":14,"box":"problem","title":"Slow project setup","data":"<p>Observed in local smoke test.</p>","assumptions":"Teams lose time before coding."}' --format=json`
- `pnpm lt -- run blueprints.item.patch --input '{"boardType":"value","itemId":4,"fields":{"status":"status_valid","conclusion":"Project setup speed is a real value-driver."}}' --format=json`
- `pnpm lt -- run blueprints.item.get --input '{"boardType":"value","itemId":4}' --format=json`
- `pnpm lt -- run blueprints.comment.create --input '{"boardType":"value","itemId":4,"text":"<p>Phase 2 local comment smoke test.</p>","author":2}' --format=json`
- `pnpm lt -- run blueprints.comment.edit --input '{"commentId":2,"text":"<p>Phase 2 local comment edited.</p>"}' --format=json`
- `pnpm lt -- run blueprints.comment.list --input '{"boardType":"value","itemId":4}' --format=json`
- `pnpm lt -- run blueprints.comment.delete --input '{"commentId":2,"confirm":true}' --format=json`
- `pnpm lt -- run blueprints.milestone.create-link --input '{"boardType":"value","itemId":4,"title":"Phase 2 Blueprint Local Milestone","author":2}' --format=json`
- `pnpm lt -- run blueprints.milestone.unlink --input '{"boardType":"value","itemId":4}' --format=json`
- `pnpm lt -- run blueprints.item.delete --input '{"boardType":"value","itemId":5,"confirm":true}' --format=json`

The shared Project Value Canvas helpers for comments, milestone linkage, and
confirm-delete controls were deployed to the on-prem instance and read-only
validated on `2026-04-07`:

- `pnpm lt -- list --format=json`
- `pnpm lt -- run blueprints.types.list --format=json`
- `pnpm lt -- run blueprints.board.list --input '{"projectId":2,"boardType":"value"}' --format=json`

The Risk Analysis slice of `AutomationApi.Canvas` was exercised successfully
against the local Podman Leantime stack on `http://localhost:8185`:

- `pnpm lt -- run blueprints.types.list --format=json`
- `pnpm lt -- run blueprints.board.create --input '{"boardType":"risks","title":"CLI Risk Analysis","description":"Local phase 3 smoke test board."}' --format=json`
- `pnpm lt -- run blueprints.item.create --input '{"boardType":"risks","boardId":15,"box":"risks_imp_high_pro_high","title":"Cache model migration risk","data":"<p>Next.js cache behavior can invalidate assumptions.</p>","assumptions":"Use explicit validation before rollout.","relates":"relates_capabilities"}' --format=json`
- `pnpm lt -- run blueprints.item.patch --input '{"boardType":"risks","itemId":6,"fields":{"status":"status_review","conclusion":"Treat as active architecture/runtime risk until validated."}}' --format=json`
- `pnpm lt -- run blueprints.item.get --input '{"boardType":"risks","itemId":6}' --format=json`

The Risk Analysis slice was deployed to the on-prem instance and read-only
validated on `2026-04-07`:

- `pnpm lt -- run blueprints.types.list --format=json`
- `pnpm lt -- run blueprints.board.list --input '{"projectId":2,"boardType":"risks"}' --format=json`
- `pnpm lt -- run blueprints.board.list --input '{"projectId":2,"boardType":"value"}' --format=json`

## Fields Agents Should Prefer

### Projects

- `name`
- `clientId`
- `details`
- `assignedUsers`
- `hourBudget`
- `start`
- `end`

### Tasks

- `headline`
- `description`
- `acceptanceCriteria`
- `status`
- `priority`
- `storypoints`
- `planHours`
- `tags`
- `dateToFinish`
- `dependingTicketId`
- `milestoneid`

### Goals

- `title`
- `canvasId`
- `box`
- `status`
- measurable KPI fields such as `startValue`, `currentValue`, `endValue`

### Ideas

- `canvasId`
- `description` or `title`
- `data` or `content`
- `box`
- `tags`
- `commentId` for comment edits and reactions
- `existingMilestoneId` for idea-to-milestone linkage

### Blueprints

- `boardType`, currently `value` for Project Value Canvas or `risks` for Risk
  Analysis
- `boardId` or `canvasId`
- item `box`; for `value`, one of `customersegment`, `problem`, `solution`,
  `uniquevalue`; for `risks`, one of `risks_imp_low_pro_low`,
  `risks_imp_low_pro_high`, `risks_imp_high_pro_low`,
  `risks_imp_high_pro_high`
- item `description` or `title`
- item evidence fields: `assumptions`, `data`, `conclusion`
- item `status`, currently one of the shared upstream Canvas status keys such as
  `status_draft`, `status_review`, `status_valid`, `status_hold`,
  `status_invalid`
- item `relates` for relation-aware boards such as `risks`; common values
  include `relates_none`, `relates_customers`, `relates_offerings`,
  `relates_capabilities`, `relates_financials`, `relates_markets`,
  `relates_environment`, and `relates_firm`
- `commentId` for comment edits and deletes
- `existingMilestoneId` or `milestoneId` for linking an existing milestone
- `confirm: true` for destructive `blueprints.board.delete`,
  `blueprints.item.delete`, and `blueprints.comment.delete`

### Wiki

- `title`
- `projectId`
- `author`
- article `description`
- article `canvasId`
- article `status`

### Time logs

- `ticketId`
- `hours`
- `kind`
- `description`
- `date`

## Current Read Semantics

- `project.get`, `task.get`, and `wiki.get` accept either a bare numeric id or
  an object with `id`.
- `tasks.list` and `milestones.list` accept top-level `projectId` and do not
  require nested `searchCriteria`.
- On this instance, `milestones.list` falls back to milestone overview because
  `getAllMilestones` returns a server error.
- `goal.create` is board-first: provide `canvasId` / `boardId`, or supply a
  `goalBoard` definition so the wrapper can create the board first.
- `ideas.board.create`, `ideas.board.list`, `ideas.board.get`,
  `ideas.board.update`, `ideas.board.delete`, `ideas.list`, `ideas.get`,
  `ideas.create`, `ideas.update`, `ideas.delete`, `ideas.comment.list`,
  `ideas.comment.create`, `ideas.comment.edit`, `ideas.comment.delete`,
  `ideas.kanban.move`, `ideas.label.list`, `ideas.label.update`,
  `ideas.reaction.toggle`, `ideas.milestone.create-link`,
  `ideas.milestone.link-existing`, and `ideas.milestone.unlink` are backed by
  the `AutomationApi` plugin JSON-RPC surface.
- `ideas.create` and `ideas.update` normalize friendly aliases such as
  `title` -> `description`, `content` -> `data`, and `boardId` -> `canvasId`.
- `ideas.list` should be treated as a board-summary read; the local plugin
  validation showed that `tags` are available from `ideas.get`, but not from the
  upstream board-list repository method.
- `ideas.board.delete`, `ideas.delete`, and `ideas.comment.delete` require
  explicit `confirm=true`; they are implemented but intentionally not used by
  default agent workflows.
- `ideas.kanban.move` is the correct way to move an idea between `idea`,
  `research`, `prototype`, `validation`, `implemented`, and `deferred`.
- `wiki.article.create` and `wiki.article.update` should use `title`,
  `description`, and `canvasId`. Legacy aliases like `headline` and `content`
  are normalized by the wrapper, but the real Leantime contract is the source
  of truth.
- `time.log` requires `kind`; missing it causes a generic server error.
- `reports.realtime` is verified and currently depends on the wrapper defaulting
  `sprintId` to `0` for backlog-style reporting on this instance.
- richer KPI-style goal payloads are verified and persist `metricType`,
  `startValue`, `currentValue`, `endValue`, `assignedTo`, `milestoneId`, and
  `tags`.
- `task.update` is verified as the full-payload update path.
- milestone due-date handling is still not reliable on this instance; the
  tested `dateToFinish` value did not persist.
- project assignment patching via `assignedUsers` currently throws a server
  error and remains unverified.
- `project.create` accepts `assignedUsers`, but the currently verified
  `project.get` response does not expose assignment state, so assignment-on-create
  is still only provisionally validated.
- `leantime.rpc.Projects.Projects.getProjectUsers` is not available on this
  instance.
- `leantime.rpc.Projects.Projects.getUsersAssignedToProject` exists but returned
  `[]` for the tested project after create-time `assignedUsers` was accepted.
- `leantime.rpc.Projects.Projects.getProject` ignores `includeUsers: true` in
  the tested instance.
- `projects.find` returns a composite id string such as
  `2-2026-04-05 11:15:40`; use `project.get` or `projects.list` for the stable
  integer id.
- Ticket-like entities currently appear under the effective API identity on this
  instance, even when an `author` value is passed.

## Operating Conventions

- Create one Leantime project per product built from this boilerplate.
- Use one primary wiki space for the product unless content lifecycle or audience
  clearly requires a separate wiki.
- Create a new goal board only for a new planning horizon, outcome stream, or
  ownership boundary, not for every feature.
- Create milestones only for reviewable delivery slices.
- Use tasks as the main execution unit and subtasks only for tightly bound child work.
- Write tasks as professional delivery records: clear outcome headline, useful
  description, explicit acceptance criteria, meaningful tags, and planned hours
  once the work is real.
- Set `planHours` during refinement and keep task status current if reports are important.
- Use goals for measurable outcomes, never as a duplicate task list.
- Keep one active goal board per current release horizon; replace it when the
  planning horizon or owner set changes.
- Use wiki articles as the stable place for product brief, architecture notes,
  implementation notes, validation evidence, and retros.
- Always supply `kind` on time logs and keep time descriptions tied to the real
  work performed so reports stay readable.
- Prefer `task.update` when a task body is being refreshed materially; prefer
  `task.patch` when only a few fields need to move.
- Treat project assignment automation as experimental until a reliable read or
  update contract is identified.

## Dedicated Skill Decision

- Defer a dedicated project-setup skill for now.
- First stabilize the curated Leantime contract and operating conventions.
- Track the follow-up in Leantime task `20`.

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
  "goalBoardTitle": "Leantime Agent Workflow Goals",
  "milestone": {
    "headline": "Agent Workflow MVP"
  },
  "goals": [
    {
      "title": "Keep project knowledge in Leantime"
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

Ideas now have a plugin-backed JSON-RPC slice that covers the practical Ideas
lifecycle:

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
- `leantime.rpc.AutomationApi.Ideas.createComment`
- `leantime.rpc.AutomationApi.Ideas.editComment`
- `leantime.rpc.AutomationApi.Ideas.deleteComment`
- `leantime.rpc.AutomationApi.Ideas.moveIdea`
- `leantime.rpc.AutomationApi.Ideas.listLabels`
- `leantime.rpc.AutomationApi.Ideas.updateLabel`
- `leantime.rpc.AutomationApi.Ideas.toggleCommentReaction`
- `leantime.rpc.AutomationApi.Ideas.createAndLinkMilestone`
- `leantime.rpc.AutomationApi.Ideas.linkMilestone`
- `leantime.rpc.AutomationApi.Ideas.unlinkMilestone`

The original HAR-confirmed browser endpoints remain documented as diagnostic
evidence only:

- `POST /ideas/ideaDialog/{id}` for comment create/edit, milestone linking, or
  emergency legacy idea updates
- `POST /setting/editBoxLabel?module=idealabels&label=<statusKey>` for column label edits
- `POST /hx/comments/reactions/toggle?commentId=<id>` for comment reactions

Normal board, idea, comment, reaction, label, milestone-link, and kanban status
operations should prefer plugin RPC where the `AutomationApi` plugin is
available.

Verified internal Ideas status keys:

- `idea`
- `research`
- `prototype`
- `validation`
- `implemented`
- `deferred`

## Upstream Surface Model

Upstream Leantime is not consistent across modules. Treat the surface model
below as the decision rule for future automation work.

### Tickets / To-Dos

Tickets are a real API-first module.

- JSON-RPC maps to `Domain\\Tickets\\Services\\Tickets`
- that service exposes many `@api` methods, including practical write flows
- this is why `task.*`, `subtask.*`, milestone, and related wrappers are viable
  through JSON-RPC

### Ideas

Ideas are not a comparable API-first module.

- JSON-RPC appears limited to polling/update-polling methods in
  `Domain\\Ideas\\Services\\Ideas`
- create, edit, comment, milestone linking, board create, and delete flows live
  in classic controllers and repositories
- the local `AutomationApi` plugin now exposes the practical board, idea,
  comment, reaction, label, milestone-link, and status-move surface as a stable
  custom JSON-RPC contract
- destructive wrappers exist only with explicit `confirm=true` and should not
  be used by default agents

### Blueprints / Canvas Families

Blueprints are implemented upstream as many `*canvas` modules, not one shared
blueprint module. Examples include:

- `Valuecanvas`
- `Leancanvas`
- `Swotcanvas`
- `Riskscanvas`
- `Minempathycanvas`
- `Insightscanvas`
- `Cpcanvas`
- `Dbmcanvas`
- `Eacanvas`
- `Emcanvas`
- `Lbmcanvas`
- `Obmcanvas`
- `Sbcanvas`
- `Smcanvas`
- `Sqcanvas`
- `Goalcanvas`

Important practical distinction:

- `Domain\\Api\\Controllers\\Canvas` implements only `patch()` for generic
  canvas HTTP API access
- upstream generic canvas `get()`, `post()`, and `delete()` return
  `501 Not implemented`
- generic CRUD lives in `Domain\\Canvas\\Repositories\\Canvas` and browser-side
  controllers
- `Goalcanvas` is the exception because it also has a dedicated `Services`
  layer and therefore meaningful JSON-RPC support

### Reliable Rule For Blueprint RPC

Do not assume hidden JSON-RPC CRUD exists for blueprint boards.

The current evidence supports only this:

- `Goalcanvas` is a real JSON-RPC candidate
- other blueprint families may support partial HTTP API patching
- most native blueprint board CRUD is still controller/repository driven rather
  than service-driven JSON-RPC

## Recommended Plugin MVP

Preferred target architecture:

- keep upstream JSON-RPC for modules that already support it well
- add a narrow on-prem plugin for unsupported Ideas and generic canvas writes
- use the local `AutomationApi` plugin for Ideas automation
- keep the HAR-confirmed browser endpoints as emergency evidence only, not as
  normal CLI automation

### MVP scope

Implement first:

1. `AutomationApi.Ideas`
   - list/get/create/update boards
   - list/get/create/update ideas
   - move idea status
   - create/list/edit/delete comments
   - create/link/unlink milestones
   - list/update labels
   - toggle comment reactions
2. `AutomationApi.Canvas`
   - list/get/create/update boards
   - list/get/create/update/patch items
   - create/edit comments
   - link/unlink milestones
3. keep `Goalcanvas` on upstream JSON-RPC unless payload normalization is needed

### Contract rules

- require explicit `projectId`
- require explicit `boardType` for generic canvas methods
- normalize payload names across board families
- perform role checks in the plugin service layer
- return stable machine-oriented JSON records, never HTML fragments
- avoid delete methods in phase 1 unless truly required

### Suggested RPC surface

- `leantime.rpc.AutomationApi.Ideas.*`
- `leantime.rpc.AutomationApi.Canvas.*`

Core method families:

- `listBoards`
- `getBoard`
- `createBoard`
- `updateBoard`
- `listItems`
- `getItem`
- `createItem`
- `updateItem`
- `patchItem`
- `createComment`
- `editComment`
- `linkMilestone`
- `unlinkMilestone`

Ideas also need:

- `moveIdea`
- `createAndLinkMilestone`

### Internal reuse

Do not reimplement business logic.

- Ideas should delegate to `Domain\\Ideas\\Repositories\\Ideas`
- generic blueprints should delegate to `Domain\\Canvas\\Repositories\\Canvas`
  and the specific `*canvas` repositories by board type
- comments and milestone flows should reuse existing upstream services where
  possible

### Recommended execution order

1. plugin skeleton and auth guard
2. Ideas board and idea CRUD
3. Ideas move/comment/milestone helpers
4. generic canvas board CRUD
5. generic canvas item CRUD
6. comment/milestone helpers for canvas
7. repository CLI rewiring to the new plugin methods
8. delete flows only with explicit confirmation and focused validation

For the implementation-oriented skeleton, see
[28 - Leantime AutomationApi Plugin MVP.md](/home/wojtek/projects/nextjs-16-boilerplate/docs/features/28%20-%20Leantime%20AutomationApi%20Plugin%20MVP.md).

For the active Blueprints / Canvas task brief, architecture plan, rollout
phases, and production Leantime tracking IDs, see
[30 - Leantime AutomationApi Blueprints Plan.md](/home/wojtek/projects/nextjs-16-boilerplate/docs/features/30%20-%20Leantime%20AutomationApi%20Blueprints%20Plan.md).

For production plugin deployment, backup, rollback, and manifest rules, see
[29 - Leantime AutomationApi Plugin Deploy Workflow.md](/home/wojtek/projects/nextjs-16-boilerplate/docs/features/29%20-%20Leantime%20AutomationApi%20Plugin%20Deploy%20Workflow.md).

## Deferred Or Missing Surface

Keep this section as the explicit backlog for future Leantime automation work.

Ideas still have a small validation backlog:

- destructive board, idea, and comment deletion are implemented with
  `confirm=true`, but should not be exercised in production unless explicitly
  requested for cleanup
- browser-session automation is intentionally not part of the normal Ideas
  path; keep the HAR-derived endpoints only as emergency diagnostic evidence

Native API or documented stable automation coverage is currently weak or missing for:

- native blueprint board creation / editing
- retrospective board automation
- generic blueprint JSON-RPC CRUD outside `Goalcanvas`

Until the on-prem `AutomationApi` plugin grows the remaining unsupported flows,
agents should use:

- plugin-backed `ideas.*` flows for board, idea, comment, reaction, label,
  milestone-link, and kanban movement
- no web-session fallback for normal Ideas automation
- wiki articles for structured project briefs, insights, and retros
- goals plus milestones plus tasks for execution tracking
- `pnpm lt:rpc` only for officially documented methods

Keep this follow-up list explicit:

- resolve the exact route binding behind `/api/ideas`
- watch upstream for new `Services` classes in non-Goalcanvas blueprint modules
- reassess whether generic `Api\\Controllers\\Canvas` grows beyond patch-only
  behavior in a future Leantime release

## Next APIs To Validate

- richer KPI goal payloads such as `startValue`, `currentValue`, `endValue`,
  `assignedTo`, and `milestoneId`
  Status: validated
- milestone date handling and scheduling fields
- project assignment fields such as `assignedUsers`
- supported file-upload or richer attachment workflows if exposed by the instance
- destructive Ideas cleanup commands only when explicitly requested
