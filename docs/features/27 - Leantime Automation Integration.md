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
- goal creation and goal polling
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

## Design Notes

- scripts authenticate with `x-api-key` against Leantime JSON-RPC
- repo-local wrappers keep `package.json` small while exposing a richer operational catalog
- defaults are intentionally optional so AI agents can reuse the same project/client/author context without copying IDs into every command
- raw `pnpm lt:rpc` remains available for documented Leantime methods we have not wrapped yet

## Important Gap: Native Blueprint Boards And Ideas

The current public JSON-RPC surface is strong for projects, tickets, goals, wiki, files, time, and reports.

However, the official JSON-RPC docs and source do not currently expose the same level of create/update automation for:

- idea board creation
- native blueprint board creation for Value Canvas, SWOT, Lean Canvas, Retros, Risk Analysis, Environment Analysis, and similar canvas modules

That means this first integration uses:

- native APIs where Leantime officially exposes them
- wiki knowledge articles as the structured fallback for project brief, implementation notes, insights, and retrospective capture

Phase 2 should add either:

1. a Leantime on-prem plugin that exposes the missing canvas / ideas repository methods as supported JSON-RPC services, or
2. a controlled session/browser automation layer for those unsupported features

## AI Agent Usage

The agent-facing command guide lives in [LEANTIME_AUTOMATION.md](/home/wojtek/projects/nextjs-16-boilerplate/docs/ai/general/LEANTIME_AUTOMATION.md).
