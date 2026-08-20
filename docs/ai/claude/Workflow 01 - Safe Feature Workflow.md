> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Claude Code skill that controls behavior is:
> **`.claude/skills/safe-feature-workflow/SKILL.md`**
> (Codex's equivalent: `.agents/skills/safe-feature-workflow/SKILL.md`.)

## What it does

Real Claude skill file: [`.claude/skills/safe-feature-workflow/SKILL.md`](../../../.claude/skills/safe-feature-workflow/SKILL.md) (Codex equivalent: [`.agents/skills/safe-feature-workflow/SKILL.md`](../../../.agents/skills/safe-feature-workflow/SKILL.md))

- wraps the repository's safe feature workflow for Claude Code
- coordinates constraint-first feature delivery
- supports a fast path for clearly small, low-risk feature work

## When to use it

- medium-sized features
- non-trivial behavior changes
- feature work that may touch boundaries, auth, runtime, caching, or tests

## When not to use it

- trivial or obviously isolated edits
- behavior-preserving refactors
- messy requests that still need brief normalization first
