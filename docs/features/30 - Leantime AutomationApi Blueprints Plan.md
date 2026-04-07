# Leantime AutomationApi Blueprints Plan

This document is the task brief, architecture plan, and execution log for the
next `AutomationApi` plugin phase: Blueprints / generic Canvas automation.

`Ideas` are now closed as a production JSON-RPC surface. Blueprints must be a
separate task because upstream Leantime models them differently: they are a
family of `*canvas` modules that share a generic `Canvas` repository model, not
one native `Blueprints` JSON-RPC module.

## Objective

Expose a production-grade, machine-friendly JSON-RPC surface for Leantime
Blueprint boards and items through the existing on-prem `AutomationApi` plugin.

The result should let agents create, read, update, and validate Blueprint data
without browser-session emulation, while keeping rollout incremental: one
Blueprint type is implemented, tested, deployed, and committed before the next
type begins.

## Source Evidence

Confirmed from the local Leantime container source:

- generic repository:
  `/var/www/html/app/Domain/Canvas/Repositories/Canvas.php`
- generic controllers:
  `/var/www/html/app/Domain/Canvas/Controllers/*`
- partial HTTP API controller:
  `/var/www/html/app/Domain/Api/Controllers/Canvas.php`
- visible strategy board registry:
  `/var/www/html/app/Domain/Strategy/Controllers/ShowBoards.php`
- user-facing blueprint explanation:
  `/var/www/html/app/Domain/Help/Templates/blueprints.tpl.php`
- visible template labels:
  `/var/www/html/app/Language/en-US.ini`

Important upstream facts:

- `Domain\Api\Controllers\Canvas` implements only `patch()`.
- `get()`, `post()`, and `delete()` in the generic Canvas HTTP API return
  `501 Not implemented`.
- real CRUD lives in `Domain\Canvas\Repositories\Canvas` and each
  `Domain\*canvas\Repositories\*canvas` subclass.
- board records live in `zp_canvas`.
- item records live in `zp_canvas_items`.
- item comments use the module key `<canvasName>canvasitem`, for example
  `valuecanvasitem` or `swotcanvasitem`.

## User-Observed Visible Templates

These are the GUI templates provided during task intake and their confirmed
upstream mapping:

| GUI template               | `boardType`  | Repository         | `zp_canvas.type`   | Boxes                                                                                                                                                                        |
| -------------------------- | ------------ | ------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project Value Canvas       | `value`      | `Valuecanvas`      | `valuecanvas`      | `customersegment`, `problem`, `solution`, `uniquevalue`                                                                                                                      |
| Risk Analysis              | `risks`      | `Riskscanvas`      | `riskscanvas`      | `risks_imp_low_pro_high`, `risks_imp_high_pro_high`, `risks_imp_low_pro_low`, `risks_imp_high_pro_low`                                                                       |
| SWOT Analysis              | `swot`       | `Swotcanvas`       | `swotcanvas`       | `swot_strengths`, `swot_weaknesses`, `swot_opportunities`, `swot_threats`                                                                                                    |
| Business Model Board       | `obm`        | `Obmcanvas`        | `obmcanvas`        | `obm_kp`, `obm_ka`, `obm_kr`, `obm_vp`, `obm_cr`, `obm_ch`, `obm_cs`, `obm_fc`, `obm_fr`                                                                                     |
| Lean Canvas Board          | `lean`       | `Leancanvas`       | `leancanvas`       | `problem`, `alternatives`, `solution`, `keymetrics`, `uniquevalue`, `highlevelconcept`, `unfairadvantage`, `channels`, `customersegment`, `earlyadopters`, `cost`, `revenue` |
| Simple Empathy Map Board   | `minempathy` | `Minempathycanvas` | `minempathycanvas` | `minempathy_who`, `minempathy_struggles`, `minempathy_where`, `minempathy_why`, `minempathy_how`                                                                             |
| Project Brief              | `sb`         | `Sbcanvas`         | `sbcanvas`         | `sb_description`, `sb_industry`, `sb_st_design`, `sb_st_decision`, `sb_st_experts`, `sb_st_support`, `sb_budget`, `sb_time`, `sb_culture`, `sb_change`, `sb_principles`      |
| Environmental Analysis     | `ea`         | `Eacanvas`         | `eacanvas`         | `ea_political`, `ea_economic`, `ea_societal`, `ea_technological`, `ea_legal`, `ea_ecological`                                                                                |
| Observe / Learn - Insights | `insights`   | `Insightscanvas`   | `insightscanvas`   | `insights_oberve`, `insights_interview`, `insights_focus_groups`, `insights_secondary_research`, `insights_knowledge`                                                        |

Note: `insights_oberve` is misspelled in upstream code and should be treated as
the source-of-truth box key unless upstream changes it.

## Additional Upstream Canvas Families

These exist in code but are not part of the first visible-template rollout:

| Canvas family                    | `boardType` | Initial decision                                                 |
| -------------------------------- | ----------- | ---------------------------------------------------------------- |
| Lightweight Business Model       | `lbm`       | Defer; hidden in the strategy registry.                          |
| Detailed Business Model          | `dbm`       | Defer; hidden and broader than the visible Business Model Board. |
| Competitive Canvas               | `cp`        | Defer; hidden and not in current GUI intake.                     |
| Strategy Messaging / Positioning | `sm`        | Defer; hidden and specialized.                                   |
| Strategy Questions               | `sq`        | Defer; hidden and specialized.                                   |
| Full Empathy Map                 | `em`        | Defer; hidden; use `minempathy` first.                           |
| Retrospective Canvas             | `retros`    | Defer; separate retrospective workflow.                          |
| Goal Canvas                      | `goal`      | Already handled through native `Goalcanvas` JSON-RPC.            |

If a hidden family becomes important, it should be added after the visible
families are stable.

## Generic Canvas Data Model

Boards should expose:

- `id`
- `title`
- `description`
- `author`
- `created`
- `projectId`
- `type`
- `authorFirstname`
- `authorLastname`
- `boxItems`

Items should expose:

- `id`
- `title`
- `description`
- `assumptions`
- `data`
- `conclusion`
- `box`
- `author`
- `created`
- `modified`
- `canvasId`
- `sortindex`
- `status`
- `relates`
- `milestoneId`
- `parent`
- `tags`
- KPI and metric fields: `kpi`, `data1`, `data2`, `data3`, `data4`, `data5`,
  `startDate`, `endDate`, `setting`, `metricType`, `startValue`,
  `currentValue`, `endValue`, `impact`, `effort`, `probability`, `action`,
  `assignedTo`

Do not require all fields for every canvas type. Most visible templates should
start with:

- `description`
- `box`
- `conclusion`
- `data`
- `assumptions`
- `status` only when the repository exposes status labels
- `relates` only when the repository exposes relation labels
- `milestoneId` only when a board item should be linked to delivery tracking

## Architecture Decision

Add a generic plugin service:

```text
Leantime\Plugins\AutomationApi\Services\Canvas
```

Add support classes only if needed to keep the service clean:

```text
Leantime\Plugins\AutomationApi\Support\BoardTypeResolver
Leantime\Plugins\AutomationApi\Support\CanvasPayloadMapper
```

The service should resolve `boardType` to the correct upstream repository and
metadata. It must not create one service per Blueprint family in phase 1 because
that would duplicate the same contract and make future maintenance harder.

Recommended RPC methods:

```text
leantime.rpc.AutomationApi.Canvas.listBoardTypes
leantime.rpc.AutomationApi.Canvas.getBoardType
leantime.rpc.AutomationApi.Canvas.listBoards
leantime.rpc.AutomationApi.Canvas.getBoard
leantime.rpc.AutomationApi.Canvas.createBoard
leantime.rpc.AutomationApi.Canvas.updateBoard
leantime.rpc.AutomationApi.Canvas.deleteBoard
leantime.rpc.AutomationApi.Canvas.listItems
leantime.rpc.AutomationApi.Canvas.getItem
leantime.rpc.AutomationApi.Canvas.createItem
leantime.rpc.AutomationApi.Canvas.updateItem
leantime.rpc.AutomationApi.Canvas.patchItem
leantime.rpc.AutomationApi.Canvas.deleteItem
leantime.rpc.AutomationApi.Canvas.listComments
leantime.rpc.AutomationApi.Canvas.createComment
leantime.rpc.AutomationApi.Canvas.editComment
leantime.rpc.AutomationApi.Canvas.deleteComment
leantime.rpc.AutomationApi.Canvas.createAndLinkMilestone
leantime.rpc.AutomationApi.Canvas.linkMilestone
leantime.rpc.AutomationApi.Canvas.unlinkMilestone
```

Delete methods must require explicit `confirm=true`, mirroring the completed
Ideas implementation.

## Production Rollout Phases

Each phase should be implemented, locally tested, deployed, production
read-only validated, documented, and committed before the next phase starts.

| Phase | Scope                                                                  | Why this order                                                                                  |
| ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 0     | Discovery, architecture, plan, Leantime tracking artifacts             | Prevents mixing Blueprint implementation with unresolved product mapping.                       |
| 1     | `value` / Project Value Canvas                                         | Smallest visible canvas, official "start here" path, ideal for proving generic board/item CRUD. |
| 2     | Generic comments, milestone links, delete-confirm controls for `value` | Validates shared item collaboration before broadening to more board types.                      |
| 3     | `risks` / Risk Analysis                                                | Introduces risk quadrants and useful `relates` semantics for production planning.               |
| 4     | `swot` / SWOT Analysis                                                 | Similar four-box shape, validates another relation-aware board.                                 |
| 5     | `obm` / Business Model Board                                           | Broader business model with nine boxes.                                                         |
| 6     | `lean` / Lean Canvas                                                   | Startup/product hypothesis structure with overlapping keys from `value`.                        |
| 7     | `minempathy` / Simple Empathy Map                                      | Customer research view, short visible board.                                                    |
| 8     | `sb` / Project Brief                                                   | Planning/RACI style project context.                                                            |
| 9     | `ea` / Environmental Analysis                                          | PESTLE with explicit status and relation labels.                                                |
| 10    | `insights` / Observe / Learn                                           | Research evidence capture; includes upstream typo `insights_oberve`.                            |
| 11    | Hidden/specialized families decision                                   | Decide whether `lbm`, `dbm`, `cp`, `sm`, `sq`, `em`, `retros` are worth implementing.           |

## Production Motives By Blueprint

Use these as real project reasons to create each board, not as generic demo
content.

| Blueprint                  | Production motive                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project Value Canvas       | Quickly align who the customer is, what problem matters, what solution is proposed, and what benefit differentiates it. Use before creating detailed task plans. |
| Risk Analysis              | Make delivery, product, operational, and security risks explicit by impact/probability so mitigation work can be promoted into milestones or tasks.              |
| SWOT Analysis              | Capture internal strengths/weaknesses and external opportunities/threats before committing to product or platform direction.                                     |
| Business Model Board       | Describe the operating model around customer segments, value proposition, channels, relationships, partners, activities, resources, cost, and revenue.           |
| Lean Canvas Board          | Validate uncertain product hypotheses: problem, alternatives, solution, unique value, unfair advantage, metrics, channels, early adopters, costs, and revenue.   |
| Simple Empathy Map Board   | Keep customer/user empathy grounded before requirements become tasks. Useful for UX, onboarding, and support-heavy features.                                     |
| Project Brief              | Capture mission, summary, RACI-style stakeholders, budget, timeline, culture, change capacity, and guiding principles.                                           |
| Environmental Analysis     | Track PESTLE-style external forces that may influence architecture, compliance, market timing, and operational constraints.                                      |
| Observe / Learn - Insights | Store evidence from observations, interviews, focus groups, secondary research, and derived knowledge before it becomes a decision.                              |

## Boilerplate-Specific Later Use

After the API implementation is stable, create Blueprint boards for this
Next.js boilerplate project:

- Project Value Canvas:
  customer segments, core boilerplate problems, solution framing, and benefit
  over generic starters.
- Risk Analysis:
  Next.js 16 cache model risk, auth/provider risk, observability risk,
  deployment and environment risk, and agent workflow risk.
- SWOT:
  strengths such as strict architecture and automation, weaknesses such as
  integration complexity, opportunities around reusable AI workflows, and
  threats from framework churn.
- Project Brief:
  mission, maintainers, decision owners, budget/time expectations, and guiding
  principles for future apps generated from this boilerplate.
- Observe / Learn:
  evidence gathered from local Leantime, production deploys, HAR captures, and
  lessons learned from plugin development.

Do not seed all these boards until the relevant `Canvas` methods are
implemented and validated for the matching board types.

## Validation Strategy

Minimum validation per phase:

- PHP syntax check for plugin files.
- unit tests for resolver, payload mapper, and CLI wrapper contracts.
- local Podman JSON-RPC smoke tests against `http://localhost:8185`.
- production deploy plan before apply.
- production deploy apply with backup manifest.
- post-deploy plan must return `skip-same` for deployed files.
- production read-only smoke tests after deploy.
- write smoke tests should happen locally first; production writes only when
  intentionally creating real project artifacts.

Validation explicitly not required per individual board type:

- full browser E2E for every canvas family, unless an API/UI drift is suspected.
- destructive delete execution in production, unless cleanup is explicitly
  requested.

## Leantime Tracking Artifacts

This section is updated whenever production Leantime artifacts are created for
this task. The initial tracking artifacts were created on 2026-04-07 via the
production `pnpm lt` CLI against project `2`.

Created artifacts:

- milestone `#25`: `AutomationApi Blueprints / Canvas JSON-RPC MVP`
- task `#27`: `Blueprints phase 0 - discovery, architecture, and plan`
- task `#26`: `Blueprints phase 1 - Project Value Canvas RPC implementation`
- task `#29`: `Blueprints phase 2 - shared Canvas comments, milestones, and confirm-delete controls`
- task `#28`: `Blueprints phase 3 - Risk Analysis RPC implementation`
- task `#32`: `Blueprints phase 4 - SWOT Analysis RPC implementation`
- task `#30`: `Blueprints phase 5 - Business Model and Lean Canvas RPC implementation`
- task `#33`: `Blueprints phase 6 - Empathy, Project Brief, Environment, and Insights RPC implementation`
- task `#31`: `Blueprints phase 7 - hidden canvas family decision`

Operational note: task IDs are not ordered by phase because several task creates
were run in parallel after the milestone was created.

## Open Questions

- Whether production writes should create a dedicated temporary Blueprint board
  per phase or use final boilerplate boards directly after each type is proven.
- Whether `retros` belongs in the Blueprints task or should remain part of a
  separate Retrospectives workflow.
- Whether hidden families (`lbm`, `dbm`, `cp`, `sm`, `sq`, `em`) should be
  implemented immediately after visible families or kept as explicit backlog.
- Whether the plugin should expose translated labels from Leantime language
  service or stable English labels from our resolver. Initial recommendation:
  return both stable keys and current translated labels where available.
