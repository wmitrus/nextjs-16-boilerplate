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

## Phase 1 Implementation Log

Phase 1 was implemented on 2026-04-07 for `boardType=value` / Project Value
Canvas only.

Implemented plugin RPC methods:

- `leantime.rpc.AutomationApi.Canvas.listBoardTypes`
- `leantime.rpc.AutomationApi.Canvas.getBoardType`
- `leantime.rpc.AutomationApi.Canvas.listBoards`
- `leantime.rpc.AutomationApi.Canvas.getBoard`
- `leantime.rpc.AutomationApi.Canvas.createBoard`
- `leantime.rpc.AutomationApi.Canvas.updateBoard`
- `leantime.rpc.AutomationApi.Canvas.deleteBoard`
- `leantime.rpc.AutomationApi.Canvas.listItems`
- `leantime.rpc.AutomationApi.Canvas.getItem`
- `leantime.rpc.AutomationApi.Canvas.createItem`
- `leantime.rpc.AutomationApi.Canvas.updateItem`
- `leantime.rpc.AutomationApi.Canvas.patchItem`

Implemented CLI wrappers:

- `blueprints.types.list`
- `blueprints.type.get`
- `blueprints.board.list`
- `blueprints.board.get`
- `blueprints.board.create`
- `blueprints.board.update`
- `blueprints.item.list`
- `blueprints.item.get`
- `blueprints.item.create`
- `blueprints.item.update`
- `blueprints.item.patch`

Local write smoke test against the Podman Leantime stack:

- created local board `#14`: `CLI Project Value Canvas`
- created local item `#4` in box `problem`
- patched local item `#4` to `status_valid`
- read local item `#4` back and confirmed the patched status and conclusion

Production deploy evidence:

- apply manifest:
  `logs/leantime-plugin-deployments/2026-04-07T13-27-25Z-AutomationApi-apply.json`
- post-deploy plan manifest:
  `logs/leantime-plugin-deployments/2026-04-07T13-27-50Z-AutomationApi-plan.json`
- deployment actions: `create: 1`, `overwrite: 1`, `skip-same: 4`
- post-deploy plan result: `skip-same: 6`
- overwritten file backup:
  `storage/plugin-backups/AutomationApi/2026-04-07T13-27-25Z/README.md`

Production read-only smoke test:

- `blueprints.types.list` returned Project Value Canvas metadata, translated box
  labels, and status labels.
- `blueprints.board.list` for project `2` and `boardType=value` returned `[]`,
  confirming the endpoint works and that no real production Project Value Canvas
  board has been seeded yet.

Phase 1 residual scope:

- production write smoke is intentionally deferred until we decide whether to
  seed final boilerplate Blueprint boards or use temporary production boards.
- comments, milestone linking, and delete-confirm flows remain phase 2.
- other board types remain phase 3+.

## Phase 2 Implementation Log

Phase 2 was implemented on 2026-04-07 for `boardType=value` / Project Value
Canvas shared item operations.

Implemented plugin RPC methods:

- `leantime.rpc.AutomationApi.Canvas.deleteItem`
- `leantime.rpc.AutomationApi.Canvas.listComments`
- `leantime.rpc.AutomationApi.Canvas.createComment`
- `leantime.rpc.AutomationApi.Canvas.editComment`
- `leantime.rpc.AutomationApi.Canvas.deleteComment`
- `leantime.rpc.AutomationApi.Canvas.createAndLinkMilestone`
- `leantime.rpc.AutomationApi.Canvas.linkMilestone`
- `leantime.rpc.AutomationApi.Canvas.unlinkMilestone`

Implemented CLI wrappers:

- `blueprints.board.delete`
- `blueprints.item.delete`
- `blueprints.comment.list`
- `blueprints.comment.create`
- `blueprints.comment.edit`
- `blueprints.comment.delete`
- `blueprints.milestone.create-link`
- `blueprints.milestone.link-existing`
- `blueprints.milestone.unlink`

Local write smoke test against the Podman Leantime stack:

- created local comment `#2` on item `#4`
- edited local comment `#2`
- listed comments for item `#4` and confirmed edited text
- deleted local comment `#2` with `confirm=true`
- created and linked local milestone `#12` to item `#4`
- unlinked milestone from item `#4`
- created temporary local item `#5` for destructive delete testing
- deleted local item `#5` with `confirm=true`
- read local item `#4` back and confirmed `milestoneId` was empty after unlink

Production deploy evidence:

- apply manifest:
  `logs/leantime-plugin-deployments/2026-04-07T13-43-02Z-AutomationApi-apply.json`
- post-deploy plan manifest:
  `logs/leantime-plugin-deployments/2026-04-07T13-43-29Z-AutomationApi-plan.json`
- deployment actions: `overwrite: 2`, `skip-same: 4`
- post-deploy plan result: `skip-same: 6`
- overwritten file backup:
  `storage/plugin-backups/AutomationApi/2026-04-07T13-43-02Z/README.md`
- overwritten file backup:
  `storage/plugin-backups/AutomationApi/2026-04-07T13-43-02Z/Services/Canvas.php`

Production read-only smoke test:

- `pnpm lt -- list --format=json` showed the new phase 2 `blueprints.*`
  commands.
- `blueprints.types.list` still loaded the `AutomationApi.Canvas` service after
  the new `Comments` and `Tickets` dependencies were added.
- `blueprints.board.list` for project `2` and `boardType=value` still returned
  `[]`.

Phase 2 residual scope:

- production write/delete smoke remains intentionally deferred until real
  Project Value Canvas boards are seeded or temporary production boards are
  explicitly approved.
- `risks` / Risk Analysis remains phase 3.

## Phase 3 Implementation Log

Phase 3 was implemented on 2026-04-07 for `boardType=risks` / Risk Analysis.

Implementation summary:

- added `Riskscanvas` repository support to `AutomationApi.Canvas`
- expanded `blueprints.*` CLI validation to accept `boardType=risks`
- kept the existing generic Canvas command set instead of adding risk-specific
  commands
- confirmed `risks` uses the same shared item, comment, milestone, and
  confirm-delete helpers as `value`

Risk Analysis metadata confirmed from local upstream code and live smoke:

- canvas type: `riskscanvas`
- comment module: `riskscanvasitem`
- boxes:
  - `risks_imp_low_pro_low`
  - `risks_imp_low_pro_high`
  - `risks_imp_high_pro_low`
  - `risks_imp_high_pro_high`
- data labels:
  - `conclusion`: risk description
  - `data`: supporting data
  - `assumptions`: planned mitigation measures
- relation labels come from the shared Canvas base repository, including
  `relates_none`, `relates_customers`, `relates_offerings`,
  `relates_capabilities`, `relates_financials`, `relates_markets`,
  `relates_environment`, and `relates_firm`

Local write smoke test against the Podman Leantime stack:

- `blueprints.types.list` returned both `risks` and `value`
- created local Risk Analysis board `#15`: `CLI Risk Analysis`
- created local Risk Analysis item `#6` in box `risks_imp_high_pro_high`
- wrote `relates=relates_capabilities`
- patched local item `#6` to `status_review`
- read local item `#6` back and confirmed status, conclusion, and relation
  persisted

Production deploy evidence:

- apply manifest:
  `logs/leantime-plugin-deployments/2026-04-07T14-04-40Z-AutomationApi-apply.json`
- post-deploy plan manifest:
  `logs/leantime-plugin-deployments/2026-04-07T14-05-11Z-AutomationApi-plan.json`
- deployment actions: `overwrite: 2`, `skip-same: 4`
- post-deploy plan result: `skip-same: 6`
- overwritten file backup:
  `storage/plugin-backups/AutomationApi/2026-04-07T14-04-40Z/README.md`
- overwritten file backup:
  `storage/plugin-backups/AutomationApi/2026-04-07T14-04-40Z/Services/Canvas.php`

Production read-only smoke test:

- `blueprints.types.list` returned `risks` metadata, translated box labels,
  shared relation labels, and shared status labels.
- `blueprints.board.list` for project `2` and `boardType=risks` returned `[]`,
  confirming the endpoint works and that no real production Risk Analysis board
  has been seeded yet.
- `blueprints.board.list` for project `2` and `boardType=value` still returned
  `[]`, confirming the existing Project Value Canvas path still loads after the
  `Riskscanvas` dependency was added.

Phase 3 residual scope:

- production Risk Analysis write smoke remains intentionally deferred until real
  boilerplate Blueprint boards are seeded or a temporary production board is
  explicitly approved.
- `swot` / SWOT Analysis remains phase 4.

Leantime status corrections applied after phase 3:

- status map confirmed from production `Tickets.getStatusLabels`:
  - `0`: `Zrobione`
  - `1`: `Zablokowane`
  - `2`: `Oczekuje na akceptację`
  - `3`: `Nowe`
  - `4`: `W toku`
- task `#27` was patched to `status=0` after phase 0 completion.
- task `#26` was patched to `status=0` after phase 1 completion.
- task `#29` was patched to `status=0` after phase 2 completion.
- task `#28` was patched to `status=0` after phase 3 completion.
- task `#32` was patched to `status=4` before phase 4 implementation started.

Operational correction: future Blueprint phases must patch the active Leantime
task to `status=4` before code changes begin and to `status=0` after local
smoke, production deploy, and production read-only validation complete. Future
phase tasks remain `status=3` until their phase starts.

## Phase 4 Implementation Log

Phase 4 was implemented on 2026-04-07 for `boardType=swot` / SWOT Analysis.

Implementation summary:

- added `Swotcanvas` repository support to `AutomationApi.Canvas`
- expanded `blueprints.*` CLI validation to accept `boardType=swot`
- kept SWOT on the same generic Canvas command set rather than adding
  SWOT-specific commands
- adjusted item defaulting so board types with empty upstream `statusLabels`
  keep an empty status instead of forcing `status_draft`

SWOT metadata confirmed from local upstream code and live smoke:

- canvas type: `swotcanvas`
- comment module: `swotcanvasitem`
- boxes:
  - `swot_strengths`
  - `swot_weaknesses`
  - `swot_opportunities`
  - `swot_threats`
- data labels:
  - `conclusion`: description
  - `data`: supporting data
  - `assumptions`: assumptions, inactive upstream
- `statusLabels` is intentionally empty upstream for SWOT
- relation labels come from the shared Canvas base repository, including
  `relates_none`, `relates_customers`, `relates_offerings`,
  `relates_capabilities`, `relates_financials`, `relates_markets`,
  `relates_environment`, and `relates_firm`

Local write smoke test against the Podman Leantime stack:

- `blueprints.types.list` returned `swot`, `risks`, and `value`
- created local SWOT board `#16`: `CLI SWOT Analysis`
- created local SWOT item `#7` in box `swot_strengths`
- wrote `relates=relates_capabilities`
- confirmed local item `#7` persisted with empty `status`, matching upstream
  empty `statusLabels`
- patched local item `#7` conclusion and relation
- read local item `#7` back and confirmed conclusion and relation persisted

Production deploy evidence:

- apply manifest:
  `logs/leantime-plugin-deployments/2026-04-07T14-19-16Z-AutomationApi-apply.json`
- post-deploy plan manifest:
  `logs/leantime-plugin-deployments/2026-04-07T14-19-39Z-AutomationApi-plan.json`
- deployment actions: `overwrite: 2`, `skip-same: 4`
- post-deploy plan result: `skip-same: 6`
- overwritten file backup:
  `storage/plugin-backups/AutomationApi/2026-04-07T14-19-16Z/README.md`
- overwritten file backup:
  `storage/plugin-backups/AutomationApi/2026-04-07T14-19-16Z/Services/Canvas.php`

Production read-only smoke test:

- `blueprints.types.list` returned `swot` metadata, translated box labels,
  shared relation labels, and an empty `statusLabels` map.
- `blueprints.board.list` for project `2` and `boardType=swot` returned `[]`,
  confirming the endpoint works and that no real production SWOT board has been
  seeded yet.
- `blueprints.board.list` for project `2` and `boardType=risks` still returned
  `[]`, confirming the existing Risk Analysis path still loads after the
  `Swotcanvas` dependency was added.

Phase 4 residual scope:

- production SWOT write smoke remains intentionally deferred until real
  boilerplate Blueprint boards are seeded or a temporary production board is
  explicitly approved.
- `obm` / Business Model Board and `lean` / Lean Canvas remain phase 5.

Leantime status update:

- task `#32` was patched from `status=4` to `status=0` after phase 4 local
  smoke, production deploy, and production read-only validation completed.
- task `#30` remains the next phase task and should be patched to `status=4`
  only when phase 5 actually starts.

## Phase 5 Implementation Log

Phase 5 was implemented on 2026-04-07 for `boardType=obm` / Business Model
Board and `boardType=lean` / Lean Canvas.

Implementation summary:

- added `Obmcanvas` repository support to `AutomationApi.Canvas`
- added `Leancanvas` repository support to `AutomationApi.Canvas`
- expanded `blueprints.*` CLI validation to accept `boardType=obm` and
  `boardType=lean`
- kept both wide boards on the same generic Canvas command set

Business Model Board metadata confirmed from local upstream code and live smoke:

- canvas type: `obmcanvas`
- comment module: `obmcanvasitem`
- boxes:
  - `obm_kp`
  - `obm_kr`
  - `obm_ka`
  - `obm_vp`
  - `obm_ch`
  - `obm_cr`
  - `obm_cs`
  - `obm_fc`
  - `obm_fr`
- data labels:
  - `assumptions`
  - `data`
  - `conclusion`
- `relatesLabels` is intentionally empty upstream for OBM
- status labels are inherited from the shared Canvas base repository

Lean Canvas metadata confirmed from local upstream code and live smoke:

- canvas type: `leancanvas`
- comment module: `leancanvasitem`
- boxes:
  - `problem`
  - `alternatives`
  - `solution`
  - `keymetrics`
  - `uniquevalue`
  - `highlevelconcept`
  - `unfairadvantage`
  - `channels`
  - `customersegment`
  - `earlyadopters`
  - `cost`
  - `revenue`
- data labels:
  - `assumptions`
  - `data`
  - `conclusion`
- `relatesLabels` is intentionally empty upstream for Lean Canvas
- status labels are inherited from the shared Canvas base repository

Local write smoke test against the Podman Leantime stack:

- `blueprints.types.list` returned `obm`, `lean`, `swot`, `risks`, and `value`
- created local Business Model Board `#17`: `CLI Business Model Board`
- created local OBM item `#8` in box `obm_vp`
- patched local OBM item `#8` to `status_valid`
- read local OBM item `#8` back and confirmed status and conclusion persisted
- created local Lean Canvas board `#18`: `CLI Lean Canvas`
- created local Lean item `#9` in box `problem`
- patched local Lean item `#9` to `status_review`
- read local Lean item `#9` back and confirmed status and conclusion persisted

Production deploy evidence:

- apply manifest:
  `logs/leantime-plugin-deployments/2026-04-07T17-07-39Z-AutomationApi-apply.json`
- post-deploy plan manifest:
  `logs/leantime-plugin-deployments/2026-04-07T17-08-02Z-AutomationApi-plan.json`
- deployment actions: `overwrite: 2`, `skip-same: 4`
- post-deploy plan result: `skip-same: 6`
- overwritten file backup:
  `storage/plugin-backups/AutomationApi/2026-04-07T17-07-39Z/README.md`
- overwritten file backup:
  `storage/plugin-backups/AutomationApi/2026-04-07T17-07-39Z/Services/Canvas.php`

Production read-only smoke test:

- `blueprints.types.list` returned `obm` and `lean` metadata, translated box
  labels, disclaimers, shared status labels, and empty relation labels.
- `blueprints.board.list` for project `2` and `boardType=obm` returned `[]`,
  confirming the endpoint works and that no real production Business Model Board
  has been seeded yet.
- `blueprints.board.list` for project `2` and `boardType=lean` returned `[]`,
  confirming the endpoint works and that no real production Lean Canvas board
  has been seeded yet.
- `blueprints.board.list` for project `2` and `boardType=swot` still returned
  `[]`, confirming the existing SWOT path still loads after the `Obmcanvas` and
  `Leancanvas` dependencies were added.

Phase 5 residual scope:

- production OBM/Lean write smoke remains intentionally deferred until real
  boilerplate Blueprint boards are seeded or a temporary production board is
  explicitly approved.
- `minempathy`, `sb`, `ea`, and `insights` remain phase 6.

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
