# Leantime AutomationApi Plugin MVP

Technical implementation skeleton for an on-prem Leantime plugin that exposes a
stable machine-friendly RPC surface for Ideas and generic canvas-based
Blueprints.

This document is intentionally implementation-oriented. It should be used when
the team starts building the plugin inside the Leantime on-prem codebase.

## Objective

Expose a first-class RPC surface for the Leantime domains that are currently
weak or missing in upstream automation:

- Ideas write automation
- generic Blueprint board automation for non-Goalcanvas `*canvas` families

Keep `Goalcanvas` on native upstream JSON-RPC unless normalization is needed.

## Local Podman Test Stack

This repository now carries a local Podman Compose stack for plugin development:

```text
compose.leantime-local.yml
.env.leantime-dev.example
.env.leantime-dev
leantime-plugins/AutomationApi/
```

The stack runs:

- MariaDB 10.11 as an isolated local Leantime database.
- the official `leantime/leantime` image selected by
  `LEANTIME_LOCAL_IMAGE`.
- Leantime on `http://localhost:8185` by default.
- the local plugin directory mounted into
  `/var/www/html/app/Plugins/AutomationApi`.

Use the package scripts instead of hand-typing the full compose command:

```bash
cp .env.leantime-dev.example .env.leantime-dev
pnpm leantime:local:up
pnpm leantime:local:ps
pnpm leantime:local:logs
pnpm leantime:local:down
```

The local `.env.leantime-dev` file is intentionally ignored by Git. Keep only
dev-only values there and never copy production Leantime credentials into it.

The default local image tag can be changed in `.env.leantime-dev`. Prefer the
latest tag when verifying release compatibility; use a smaller pinned tag when
the goal is fast plugin skeleton iteration.

The local stack exists only for plugin development and API probing. Do not make
the Next.js application depend on the local Leantime container at runtime.

## Confirmed upstream facts

The following facts are confirmed from upstream source:

- JSON-RPC resolves service classes under
  `Leantime\\Domain\\{Module}\\Services\\{Service}` and
  `Leantime\\Plugins\\{Module}\\Services\\{Service}`.
- Leantime loads plugins from `app/Plugins/<PluginName>/register.php`.
- enabled plugin paths are resolved under `app/Plugins/`.
- `Ideas` write logic currently lives in classic controllers and
  `Domain\\Ideas\\Repositories\\Ideas`.
- generic canvas CRUD currently lives in
  `Domain\\Canvas\\Repositories\\Canvas` and module-specific `*canvas`
  repositories.
- generic `Api\\Controllers\\Canvas` currently supports only `patch()`.

What is still an assumption:

- the exact preferred packaging conventions for a new custom plugin inside the
  separate Leantime plugin repository
- whether the local on-prem installation expects additional plugin metadata
  beyond `register.php`

## Recommended architecture

Preferred target namespace:

```text
Leantime\Plugins\AutomationApi\
```

Recommended scope split:

- `AutomationApi\\Services\\Ideas`
- `AutomationApi\\Services\\Canvas`
- optional later:
  `AutomationApi\\Services\\BlueprintBoards`

Do not expose one service per blueprint family in phase 1. That would duplicate
the same contract shape many times and raise long-term maintenance cost.

## Proposed plugin filesystem skeleton

The exact plugin repo layout should be aligned with the on-prem plugin
repository, but the recommended code shape is:

```text
app/Plugins/AutomationApi/
  register.php
  Services/
    Ideas.php
    Canvas.php
  Support/
    BoardTypeResolver.php
    CanvasPayloadMapper.php
    Authorization.php
    RpcResult.php
  README.md
```

If the local plugin repository expects additional metadata, add it without
changing the service namespace contract.

## register.php skeleton

Minimal expectation:

```php
<?php

namespace Leantime\Plugins\AutomationApi;

use Leantime\Core\Events\EventDispatcher;

EventDispatcher::add_event_listener('leantime.plugin.enabled', function (): void {
    // Reserved for future bootstrapping if needed.
});
```

Important note:

- JSON-RPC discovery does not require an HTTP route here.
- the main requirement is that the plugin namespace is autoloadable and the
  service classes exist under `Leantime\\Plugins\\AutomationApi\\Services\\...`.

## Service design

### Ideas service

Recommended methods:

```text
listBoards(projectId)
getBoard(boardId)
createBoard(projectId, title, description = null)
updateBoard(boardId, title, description = null)
listIdeas(projectId, boardId = null)
getIdea(ideaId)
createIdea(values)
updateIdea(values)
moveIdea(ideaId, statusKey)
createComment(ideaId, text, parentId = 0)
editComment(commentId, text)
createAndLinkMilestone(ideaId, headline)
linkMilestone(ideaId, milestoneId)
unlinkMilestone(ideaId)
```

Internal dependencies:

- `Domain\\Ideas\\Repositories\\Ideas`
- existing comments repository/service
- `Domain\\Tickets\\Services\\Tickets` for milestone creation

### Canvas service

Recommended methods:

```text
listBoards(projectId, boardType)
getBoard(boardId, boardType)
createBoard(projectId, boardType, title, description = '')
updateBoard(boardId, boardType, title, description = '')
listItems(boardId, boardType)
getItem(itemId, boardType)
createItem(values)
updateItem(values)
patchItem(itemId, boardType, fields)
createComment(itemId, boardType, text, parentId = 0)
editComment(commentId, text)
linkMilestone(itemId, boardType, milestoneId)
unlinkMilestone(itemId, boardType)
```

Internal dependencies:

- `Domain\\Canvas\\Repositories\\Canvas`
- specific `Domain\\{StudlyBoardType}canvas\\Repositories\\{StudlyBoardType}canvas`
- existing comments repository/service
- `Domain\\Tickets\\Services\\Tickets`

## Board type normalization

The plugin should not expose Leantime’s raw class naming awkwardness directly to
agents. Use a normalized external `boardType`, then resolve it internally.

Recommended external values:

```text
value
lean
swot
risks
minempathy
insights
cp
dbm
ea
em
lbm
obm
sb
sm
sq
```

Recommended resolver behavior:

```php
<?php

namespace Leantime\Plugins\AutomationApi\Support;

use Illuminate\Support\Str;
use InvalidArgumentException;

final class BoardTypeResolver
{
    private const MAP = [
        'value' => 'Valuecanvas',
        'lean' => 'Leancanvas',
        'swot' => 'Swotcanvas',
        'risks' => 'Riskscanvas',
        'minempathy' => 'Minempathycanvas',
        'insights' => 'Insightscanvas',
        'cp' => 'Cpcanvas',
        'dbm' => 'Dbmcanvas',
        'ea' => 'Eacanvas',
        'em' => 'Emcanvas',
        'lbm' => 'Lbmcanvas',
        'obm' => 'Obmcanvas',
        'sb' => 'Sbcanvas',
        'sm' => 'Smcanvas',
        'sq' => 'Sqcanvas',
    ];

    public static function repositoryClass(string $boardType): string
    {
        $key = Str::lower(trim($boardType));

        if (! isset(self::MAP[$key])) {
            throw new InvalidArgumentException("Unsupported boardType: {$boardType}");
        }

        $module = self::MAP[$key];

        return "Leantime\\Domain\\{$module}\\Repositories\\{$module}";
    }
}
```

## Payload normalization

One of the plugin’s main jobs is to hide upstream shape differences from the AI
workflows.

### Ideas normalized payload

```json
{
  "title": "Refine customer interview loop",
  "projectId": 2,
  "boardId": 13,
  "content": "<p>Capture discovery notes and expected outcomes.</p>",
  "tags": "discovery,research",
  "status": "idea"
}
```

Suggested internal mapping:

- `title` -> upstream `description`
- `content` -> upstream `data`
- `boardId` -> upstream `canvasId`
- `status` -> upstream `status`

### Canvas normalized payload

```json
{
  "projectId": 2,
  "boardType": "value",
  "boardId": 31,
  "box": "customersegment",
  "title": "Primary SMB buyer",
  "description": "Ops or founder-led buyer profile",
  "assumptions": "<p>Budget owner is usually the founder.</p>",
  "data": "<p>Interview notes and evidence.</p>",
  "conclusion": "<p>Need stronger proof for channel fit.</p>",
  "status": "status_draft",
  "relates": "relates_customers",
  "milestoneId": 22,
  "tags": "persona,validation"
}
```

Suggested internal mapping:

- preserve normalized external field names when they already match canvas repo
  expectations
- let the mapper fill defaults for board-specific optional fields
- keep board-family-specific fields additive rather than required

## Auth and authorization

Do not trust the caller because it is “internal automation”.

Required checks:

- caller must be authenticated through the same Leantime JSON-RPC auth path as
  any other API consumer
- service methods must verify project access before operating on board or item
  IDs
- write methods should require at least editor-level permissions
- cross-project board or item access must be rejected explicitly

Recommended helper:

```php
<?php

namespace Leantime\Plugins\AutomationApi\Support;

use Leantime\Domain\Auth\Models\Roles;
use Leantime\Domain\Auth\Services\Auth;

final class Authorization
{
    public static function requireEditor(): void
    {
        Auth::authOrRedirect([Roles::$owner, Roles::$admin, Roles::$manager, Roles::$editor]);
    }
}
```

Adjust exact behavior to the plugin runtime expectations. The key rule is that
authorization must happen inside the service layer, not in the caller.

## Response shape

Prefer stable machine records instead of leaking raw upstream arrays where the
shape is inconsistent.

Suggested board response:

```json
{
  "id": 13,
  "projectId": 2,
  "boardType": "value",
  "title": "Project Value Canvas",
  "description": "",
  "authorId": 1,
  "created": "2026-04-07T10:00:00Z"
}
```

Suggested item response:

```json
{
  "id": 91,
  "projectId": 2,
  "boardId": 13,
  "boardType": "value",
  "box": "customersegment",
  "title": "Primary SMB buyer",
  "description": "Ops or founder-led buyer profile",
  "status": "status_draft",
  "relates": "relates_customers",
  "milestoneId": 22,
  "tags": "persona,validation",
  "created": "2026-04-07T10:00:00Z",
  "modified": "2026-04-07T10:00:00Z"
}
```

## Example JSON-RPC calls

### Create idea board

```json
{
  "method": "leantime.rpc.AutomationApi.Ideas.createBoard",
  "jsonrpc": "2.0",
  "id": "ideas-create-board-1",
  "params": {
    "projectId": 2,
    "title": "AI Discovery"
  }
}
```

### Create idea

```json
{
  "method": "leantime.rpc.AutomationApi.Ideas.createIdea",
  "jsonrpc": "2.0",
  "id": "ideas-create-1",
  "params": {
    "values": {
      "projectId": 2,
      "boardId": 13,
      "title": "Validate onboarding pain",
      "content": "<p>Discovery hypothesis for onboarding.</p>",
      "status": "idea"
    }
  }
}
```

### Create generic canvas item

```json
{
  "method": "leantime.rpc.AutomationApi.Canvas.createItem",
  "jsonrpc": "2.0",
  "id": "canvas-create-item-1",
  "params": {
    "values": {
      "projectId": 2,
      "boardType": "lean",
      "boardId": 31,
      "box": "problem",
      "title": "Fragmented onboarding",
      "description": "SMB buyers lose context between signup and setup"
    }
  }
}
```

## CLI integration plan

Once the plugin exists in a target Leantime instance, this repository should
stop preferring session-backed Ideas calls for every method the plugin owns.

Current sequence:

1. keep current wrappers during plugin development
   Status: done.
2. add a capability flag in the local Leantime catalog if production needs
   mixed plugin / non-plugin instances.
   Status: deferred; the current local target assumes the plugin is present for
   implemented Ideas methods.
3. rewire `ideas.*` wrappers to plugin RPC methods first
   Status: complete for the practical Ideas surface: boards, ideas, comments,
   labels, reactions, milestone links, and kanban moves.
4. add new `canvas.*` wrappers for blueprint boards
   Status: pending.
5. keep session-based code only as emergency diagnostic evidence
   Status: browser-session automation is no longer a normal Ideas path.
6. remove fallback dependency if the plugin becomes the supported standard
   Status: no normal CLI wrappers depend on it for Ideas anymore.

## Implemented local MVP slice

The local plugin mount currently contains the first working PHP slice:

```text
leantime-plugins/AutomationApi/
  composer.json
  register.php
  Services/
    AutomationApi.php
    Ideas.php
```

Implemented RPC methods:

```text
leantime.rpc.AutomationApi.AutomationApi.ping
leantime.rpc.AutomationApi.Ideas.listBoards
leantime.rpc.AutomationApi.Ideas.getBoard
leantime.rpc.AutomationApi.Ideas.createBoard
leantime.rpc.AutomationApi.Ideas.updateBoard
leantime.rpc.AutomationApi.Ideas.deleteBoard
leantime.rpc.AutomationApi.Ideas.listIdeas
leantime.rpc.AutomationApi.Ideas.getIdea
leantime.rpc.AutomationApi.Ideas.createIdea
leantime.rpc.AutomationApi.Ideas.updateIdea
leantime.rpc.AutomationApi.Ideas.deleteIdea
leantime.rpc.AutomationApi.Ideas.listComments
leantime.rpc.AutomationApi.Ideas.createComment
leantime.rpc.AutomationApi.Ideas.editComment
leantime.rpc.AutomationApi.Ideas.deleteComment
leantime.rpc.AutomationApi.Ideas.moveIdea
leantime.rpc.AutomationApi.Ideas.listLabels
leantime.rpc.AutomationApi.Ideas.updateLabel
leantime.rpc.AutomationApi.Ideas.toggleCommentReaction
leantime.rpc.AutomationApi.Ideas.createAndLinkMilestone
leantime.rpc.AutomationApi.Ideas.linkMilestone
leantime.rpc.AutomationApi.Ideas.unlinkMilestone
```

Local validation on `http://localhost:8185` with
`docker.io/leantime/leantime:3.7.1` confirmed:

- plugin service autoloads from `/var/www/html/app/Plugins/AutomationApi`
- `AutomationApi.ping` works through `/api/jsonrpc`
- `Ideas.createBoard` created a local board
- `Ideas.listBoards` returned the created board
- `Ideas.createIdea` created an idea with `description`, `data`, `tags`,
  `status`, and `box`
- `Ideas.listIdeas` returned the board item list
- `Ideas.getIdea` returned the full item, including `tags`
- `Ideas.updateIdea` persisted `description`, `data`, and `tags`
- `Ideas.moveIdea` persisted the Kanban column by updating the upstream `box`
  field
- `Ideas.listComments` returned comments for an idea
- `Ideas.createComment` created an idea comment and returned the new comment id
- `Ideas.toggleCommentReaction` toggled a `like` reaction on the comment
- `Ideas.createAndLinkMilestone` created a milestone and linked it to the idea
- `Ideas.unlinkMilestone` removed the milestone link
- `Ideas.updateLabel` persisted an Ideas column label through project settings
- delete wrappers are implemented with explicit `confirm=true`, but were not
  exercised as default production behavior
- repository CLI wrappers now call the plugin RPC surface locally:
  - `pnpm lt -- run ideas.board.create` created board `3`
  - `pnpm lt -- run ideas.create` created idea `3` with `tags`
  - `pnpm lt -- run ideas.get` returned the full idea record with `tags`
  - `pnpm lt -- run ideas.list` returned the board summary without `tags`
  - `pnpm lt -- run ideas.kanban.move` moved idea `3` to `box: research`
  - `pnpm lt -- run ideas.comment.create` created comment `1`
  - `pnpm lt -- run ideas.reaction.toggle` returned reaction state for comment
    `1`
  - `pnpm lt -- run ideas.milestone.create-link` linked a new milestone
  - `pnpm lt -- run ideas.milestone.unlink` removed that milestone link
  - `pnpm lt -- run ideas.label.update` returned the updated label map

Important implementation note:

- upstream `IdeasRepository::addCanvasItem()` does not persist `tags`, so
  `AutomationApi.Ideas.createIdea` performs a follow-up `patchCanvasItem()` when
  optional `tags` or `sortindex` are provided.
- upstream `IdeasRepository::getCanvasItemsById()` does not include `tags` in
  the list response, while `getSingleCanvasItem()` does. Treat `listIdeas` as a
  board summary and `getIdea` as the full record read.

## Delivery order

Recommended build order from the current local MVP state:

1. plugin skeleton and autoload confirmation
   Status: complete locally.
2. `Ideas.listBoards`
   Status: complete locally.
3. `Ideas.createBoard`
   Status: complete locally.
4. `Ideas.createIdea`
   Status: complete locally.
5. `Ideas.updateIdea`
   Status: complete locally.
6. `Ideas.moveIdea`
   Status: complete locally.
7. Ideas comments, reactions, labels, and milestone helpers
   Status: complete locally.
8. CLI rewiring
   Status: complete for the practical Ideas JSON-RPC surface.
9. explicit-confirm delete wrappers
   Status: implemented; not used by default agents.
10. `Canvas.listBoards`
11. `Canvas.createBoard`
12. `Canvas.listItems`
13. `Canvas.createItem`
14. `Canvas.updateItem`
15. `Canvas.patchItem`

## Estimated effort

Reasonable production-grade estimate:

- plugin skeleton and auth: 0.5 to 1 day
- Ideas MVP: 1 to 2 days
- generic canvas MVP: 2 to 4 days
- tests, CLI wiring, and docs hardening: 2 to 4 days

This is not a one-hour patch. It is also not an unbounded rewrite. Treated as a
small internal platform project, it is a realistic several-day implementation.

## Recommended first implementation slice

The first implementation slice has now been built and locally validated:

- plugin skeleton
- `Ideas.listBoards`
- `Ideas.createBoard`
- `Ideas.createIdea`
- `Ideas.updateIdea`
- `Ideas.getBoard`
- `Ideas.updateBoard`
- `Ideas.deleteBoard`
- `Ideas.listIdeas`
- `Ideas.getIdea`
- `Ideas.moveIdea`
- `Ideas.deleteIdea`
- `Ideas.listComments`
- `Ideas.createComment`
- `Ideas.editComment`
- `Ideas.deleteComment`
- `Ideas.listLabels`
- `Ideas.updateLabel`
- `Ideas.toggleCommentReaction`
- `Ideas.createAndLinkMilestone`
- `Ideas.linkMilestone`
- `Ideas.unlinkMilestone`

That slice is enough to prove:

- plugin loading works
- JSON-RPC resolution into plugin services works
- permissions are correct
- repository reuse is viable
- the session-backed Ideas fallback can be avoided for normal automation

Production deployment state:

- expanded `AutomationApi.Ideas` was deployed to the on-prem instance on
  `2026-04-07`
- the post-deploy plan returned `skip-same: 5`
- read-only smoke validation passed for plugin ping, label listing, board
  listing, idea listing, idea fetch, and comment listing
- destructive Ideas wrappers remain available only with explicit `confirm=true`

Next implementation slice:

- keep destructive Ideas wrappers behind explicit cleanup tasks
- continue `AutomationApi.Canvas` / Blueprints with phase 6 Empathy, Project
  Brief, Environmental Analysis, and Insights after the Project Value Canvas,
  Risk Analysis, SWOT, Business Model, and Lean Canvas slices

The dedicated Blueprints / Canvas task brief, architecture plan, rollout phases,
and production Leantime tracking IDs are documented in
[30 - Leantime AutomationApi Blueprints Plan.md](/home/wojtek/projects/nextjs-16-boilerplate/docs/features/30%20-%20Leantime%20AutomationApi%20Blueprints%20Plan.md).

The production deploy workflow is documented separately in
[29 - Leantime AutomationApi Plugin Deploy Workflow.md](/home/wojtek/projects/nextjs-16-boilerplate/docs/features/29%20-%20Leantime%20AutomationApi%20Plugin%20Deploy%20Workflow.md).
