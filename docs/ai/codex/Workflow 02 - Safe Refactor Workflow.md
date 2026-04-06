> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/safe-refactor-workflow/SKILL.md`**
> All workflow changes must be applied to that file and the shared authority docs.

## What it does

Real Codex skill file: [`.agents/skills/safe-refactor-workflow/SKILL.md`](../../../.agents/skills/safe-refactor-workflow/SKILL.md)

- Runs the repository's behavior-preserving refactor workflow inside Codex
- Starts with architecture constraints before any refactor implementation
- Adds conditional security and Next.js runtime review when the touched surface
  requires it
- Preserves protected invariants, then validates the refactor with focused checks
- Keeps `.copilot/tasks/{task_id}/` artifacts synchronized for non-trivial work

## When to use it

- When the user asks for cleanup, reorganization, extraction, consolidation, or a
  safer equivalent pattern without changing intended behavior
- When a refactor may cross module boundaries, touch DI/composition, or needs
  explicit invariant protection
- When the work should follow the repository's safe-refactor sequence instead of an
  ad hoc implementation pass

## Startup Note

The skill reads the shared workflow sources first:

- `AGENTS.md`
- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`

If the refactor touches auth or runtime-sensitive paths, it also reads the relevant
specialist source docs before proceeding.

## Workflow Shape

The skill follows this order:

1. Intake and refactor classification
2. Architecture Guard pass first
3. Conditional Security/Auth pass
4. Conditional Next.js Runtime pass
5. Constraint summary
6. Minimum safe implementation
7. Focused validation

## Artifact Expectations

For non-trivial or workflow-managed work, the skill keeps these artifacts updated:

- `.copilot/tasks/{task_id}/plan.md`
- `.copilot/tasks/{task_id}/intake.md`
- `.copilot/tasks/{task_id}/01 - Architecture Guard - Summary.md`
- `.copilot/tasks/{task_id}/04 - Implementation Agent - Summary.md`
- `.copilot/tasks/{task_id}/validation-report.md`

It also adds specialist summary artifacts when the security or runtime specialist pass
is materially performed.

Those specialist summaries are mandatory for artifact-backed runs, and each specialist
updates the same persistent summary file on later runs instead of creating duplicates.

## Example prompts to try

- "Run a safe refactor for this service extraction and keep behavior unchanged."
- "Clean up this module boundary without changing the public contract."
- "Move this code out of `shared` safely and preserve the existing tests and API."
