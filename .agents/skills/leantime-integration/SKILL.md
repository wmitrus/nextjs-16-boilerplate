---
name: leantime-integration
description: Leantime task lifecycle authority for this repository. Use this skill at the start and end of every non-trivial task to create milestones and tasks in Leantime, manage status lifecycle (Nowe → W toku → Zrobione), log time at task close, and seed boards when required. This skill must be invoked by the Workflow Orchestrator at task open and task close.
---

# Leantime Integration Agent

This is the Codex-native counterpart to:

- `docs/ai/general/10 - Leantime Integration Agent.md`
- `.github/agents/leantime-integration.agent.md`

Use this skill to mirror repository work into the on-prem Leantime workspace
at every task boundary.

## Startup

Before any Leantime operation:

1. Read `AGENTS.md`.
2. Read `docs/ai/general/LEANTIME_AUTOMATION.md`.
3. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
4. Do not infer that `.env.leantime` is absent from default file search alone;
   gitignored env files may be omitted from normal search results, so use an
   exact-path check when diagnosing setup.
5. If terminal execution is unavailable in the current session, treat that as a
   tooling limitation and not as proof that the repository Leantime integration
   is broken.

## Mission

At task open:

- Check for existing milestones and tasks (no duplicates).
- Create or locate milestone.
- Create main task with HTML description.
- Patch status to W toku (4).
- Record IDs in intake.md or plan.md.

At task close:

- Patch status to Zrobione (0).
- Log time with `pnpm lt -- run time.log`.
- Update wiki if applicable.
- Seed production boards if explicitly in scope.

## CLI

```shell
pnpm lt -- list
pnpm lt -- run <operation-id> --input '{"...": "..."}' --format=json
pnpm lt -- run retrospectives.board.create --input '{"title":"Sprint Retrospective","projectId":2}' --format=json
pnpm lt -- run retrospectives.item.create --input '{"boardId":<id>,"box":"well","title":"..."}' --format=json
```

## Constraints

- Never create duplicate tasks — always check first.
- Never use browser-session automation.
- Log time only at task close, not per handoff.
- Never invoke delete flows without explicit `confirm=true`.
- Never implement hidden canvas families (`lbm`, `dbm`, `cp`, `sm`, `sq`, `em`).
- Never put real credentials in artifacts.

## Diagnostic Discipline

When Leantime appears blocked:

1. verify the CLI entrypoint in `package.json`
2. verify the env file by exact path, not only by default search
3. verify `LEANTIME_URL` and `LEANTIME_API_KEY` expectations from the env file
4. run the smallest falsifying command available
5. if commands cannot be run in the current session, record that limitation precisely

## Full Reference

`docs/ai/general/LEANTIME_AUTOMATION.md`
