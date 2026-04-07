# AutomationApi Leantime Plugin

Local development mount for the on-prem Leantime `AutomationApi` plugin.

This directory is mounted into the local Podman Leantime stack at:

```text
/var/www/html/app/Plugins/AutomationApi
```

The implementation plan lives in:

```text
docs/features/28 - Leantime AutomationApi Plugin MVP.md
```

Implemented local RPC slice:

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

The current Canvas slice supports:

- `boardType=value` / Project Value Canvas
- `boardType=risks` / Risk Analysis

Additional Blueprint families should be added one rollout phase at a time.

Local stack commands:

```bash
cp .env.leantime-dev.example .env.leantime-dev
pnpm leantime:local:up
pnpm leantime:local:ps
pnpm leantime:local:logs
pnpm leantime:local:down
```

Production deploy workflow:

```bash
cp .env.leantime.example .env.leantime
pnpm leantime:plugin:plan
pnpm leantime:plugin:deploy
```

The deploy workflow creates local manifests under
`logs/leantime-plugin-deployments` and backs up overwritten remote files before
copying new plugin files.

Do not put production secrets in this directory.
