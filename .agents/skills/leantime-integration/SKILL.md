---
name: leantime-integration
description: Legacy/explicit-use-only Leantime operational authority for this repository. Leantime is NOT part of the active AI task lifecycle (Linear is canonical — see root instructions / `Linear Task Operating Model`). Use this skill only when the user explicitly requests a Leantime operation, or for an explicitly scoped historical-task migration into Leantime.
---

# Leantime Integration (Legacy / Explicit-Use Only)

**Leantime is not part of the repository's active AI task lifecycle.** Do not
invoke this skill automatically, and do not invoke it merely because a task is
non-trivial. Use it only when the user explicitly requests a Leantime
operation, or when performing an explicitly scoped Leantime migration task.
For active task tracking, follow `AGENTS.md` — Linear is canonical.

Own Leantime task lifecycle operations without replacing architecture, security, runtime, implementation, or validation authority.

## Context Loading

Inherit active repository invariants from `AGENTS.md`.

Do not preload `docs/ai/general/00 - Agent Interaction Protocol.md`,
`docs/ai/general/REPOSITORY_AI_CONTEXT.md`, or the full
`docs/ai/general/LEANTIME_AUTOMATION.md` for normal task open/close operations.

Load only what the current operation needs:

- new task → `Task Description Template`;
- before constructing or executing a `time.log` payload → `Time Tracking Policy`;
- integration diagnosis when the local steps below are insufficient → `Diagnostic Rule`;
- board/canvas/retrospective/Ideas or uncommon automation → the relevant operation/type section;
- broad Leantime automation/governance audit → full reference only when whole-document interpretation is required.

Prefer the live CLI catalogue (`pnpm lt -- list`) over historical command lists.

## Task Open

At the start of every non-trivial task:

1. List existing milestones and tasks; never create duplicates.
2. Reuse an appropriate existing milestone/task.
3. Create a milestone or main task only when no matching one exists.
4. For a new task, use the targeted `Task Description Template` from `LEANTIME_AUTOMATION.md`.
5. Patch the active task to `W toku` (`status: 4`).
6. For artifact-backed work, record task and milestone IDs in `intake.md` or `plan.md`.
7. For artifact-backed work, create or update `10 - Leantime Integration Agent - Summary.md`; reuse the same file on later invocations instead of creating duplicates.

Use repository-configured project/author/client defaults rather than inventing IDs.

## Task Close

After required repository validation is complete and before final closure:

1. Patch the tracked task to `Zrobione` (`status: 0`).
2. Log time once with `time.log`; never log partial time at specialist handoffs.
3. Update the relevant wiki article only when findings or implementation notes should persist.
4. Perform production board seeding only when explicitly in scope.
5. For artifact-backed work, update the existing Leantime summary artifact with the close result and any residual limitation.

Do not close the Leantime task before the repository task has satisfied its required validation/closure conditions.

## CLI

Use repository wrappers, not browser-session automation.

```shell
pnpm lt -- list
pnpm lt -- run <operation-id> --input '{"...":"..."}' --format=json
pnpm lt -- run <operation-id> --input-file path/to/input.json --format=json
```

Prefer `--input-file` for long descriptions, acceptance criteria, or wiki content.

Use `pnpm lt:rpc` only for an officially documented method not available through the repository operation catalogue.

Normal lifecycle operations include `milestones.list`, `milestone.create`,
`tasks.list`, `task.create`, `task.patch`, `time.log`, and wiki operations when needed.
Confirm uncommon operation names with `pnpm lt -- list`.

## Diagnostic Discipline

Before claiming Leantime is unavailable, broken, or misconfigured:

1. Verify the CLI entrypoint in `package.json`.
2. Check `.env.leantime` or `.env.leantime-dev` by exact path when environment evidence is required; gitignored files may be absent from normal search.
3. Verify required keys for the intended operation, especially `LEANTIME_URL` and `LEANTIME_API_KEY`, without exposing secret values.
4. Run the smallest falsifying command, normally `pnpm lt -- list` or a focused list operation.
5. If command execution is unavailable, report a session/tool limitation rather than a repository integration failure.

Use `.env.leantime` for on-prem/production automation and `.env.leantime-dev`
for the local Podman stack. Do not move optional Leantime integration secrets
into `.env.local`.

Do not read or print unrelated `.env*` contents.

## Safety

- Never create duplicate tasks or milestones.
- Never put credentials, tokens, or credential-shaped values in artifacts.
- Never use browser-session cookies for normal automation.
- Never invoke delete operations unless explicitly requested and the required `confirm=true` is used.
- Seed production Blueprint/Canvas/Retrospective/Ideas structures only when explicitly requested.
- Perform any repository-required local Podman smoke test before a production board write.
- Do not implement unsupported canvas families (`lbm`, `dbm`, `cp`, `sm`, `sq`, `em`).

## Source and Compatibility

`docs/ai/general/10 - Leantime Integration Agent.md` is the neutral cross-tool role source.
`docs/ai/general/LEANTIME_AUTOMATION.md` is the governing operational reference.

They remain the semantic and operational authorities. For Codex, the `Context Loading` rules in this skill control how those authorities are retrieved: use targeted sections instead of the legacy mandatory full-file startup reads. This changes context-loading mechanics, not shared Leantime behavior.

If shared Leantime semantics change, propagate the semantic change to required cross-tool surfaces according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary task open/close operations.
