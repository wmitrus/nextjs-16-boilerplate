# Leantime AutomationApi Retrospectives Plan

This document is the task brief and execution log for the Retrospectives slice
of the on-prem Leantime `AutomationApi` plugin.

## Objective

Expose Retrospectives through the same stable JSON-RPC automation layer used for
Blueprints, while keeping the product model clear: Retrospectives are not a
hidden Blueprint family. They are a separate upstream Leantime module named
`Retroscanvas`.

## Source Evidence

Confirmed from the local Leantime container source:

- repository:
  `/var/www/html/app/Domain/Retroscanvas/Repositories/Retroscanvas.php`
- canvas name:
  `retros`
- box keys:
  `well`, `notwell`, `startdoing`
- templates and controllers:
  `/var/www/html/app/Domain/Retroscanvas/Templates/*`
  `/var/www/html/app/Domain/Retroscanvas/Controllers/*`

## Board Model

| GUI column                                     | Box key      | Meaning                                        |
| ---------------------------------------------- | ------------ | ---------------------------------------------- |
| Continue - What went well?                     | `well`       | Practices or decisions to continue.            |
| Stop - What should we stop doing?              | `notwell`    | Waste, friction, or unsafe habits to remove.   |
| Start - What should we start doing to improve? | `startdoing` | Improvements or experiments for the next loop. |

Retrospectives expose no upstream `statusLabels` or `relatesLabels`, so item
payloads should not require status or relation fields.

## Implementation Decision

Use the existing `AutomationApi.Canvas` service with a new `boardType=retros`
entry. This avoids duplicating board/item/comment/milestone logic while keeping
Retrospectives documented as a separate product board.

Initial CLI usage:

```bash
pnpm lt -- run blueprints.board.create --input '{"boardType":"retros","title":"Sprint Retrospective","projectId":2}' --format=json
pnpm lt -- run blueprints.item.create --input '{"boardType":"retros","boardId":123,"box":"well","title":"Deployment flow worked well"}' --format=json
```

A future `retrospectives.*` alias can be added if the command namespace becomes
confusing for operators.

## Leantime Tracking

- milestone `#34`: `AutomationApi Retrospectives / Retroscanvas JSON-RPC MVP`
- task `#35`: `Retrospectives phase 1 - AutomationApi Retroscanvas JSON-RPC support`
- task `#35` starts as `W toku` while implementation is active

## Acceptance Criteria

- `boardType=retros` is available in `AutomationApi.Canvas`
- metadata returns `well`, `notwell`, and `startdoing`
- local Podman smoke test creates one board and one item in each box
- CLI tests cover the `retros` board type
- production deploy uses the existing backup/manifest workflow
- production read-only smoke test confirms `boardType=retros`
