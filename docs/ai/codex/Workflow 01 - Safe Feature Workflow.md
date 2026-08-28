> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/safe-feature-workflow/SKILL.md`**

## What it does

Real Codex skill file: [`.agents/skills/safe-feature-workflow/SKILL.md`](../../../.agents/skills/safe-feature-workflow/SKILL.md)

- wraps the repository's safe feature workflow for Codex
- coordinates constraint-first feature delivery
- supports a fast path for clearly small, low-risk feature work

## When to use it

- medium-sized features
- non-trivial behavior changes
- feature work that may touch boundaries, auth, runtime, caching, or tests

## High-risk work

For high-risk work (production-facing tooling, trust boundaries, credentials,
persisted evidence/integrity artifacts, tenancy isolation, CI/deployment
safety gates), the workflow layers on a High-Risk Path: a pre-implementation
invariant map, a pre-close falsification pass, a proportional post-implementation
Security/Auth recheck, current-state documentation reconciliation, and a final
self-review before requesting external review — with a stop condition so
fresh review isn't re-requested for self-referential documentation
bookkeeping. See the skill file for full detail.

## When not to use it

- trivial or obviously isolated edits
- behavior-preserving refactors
- messy requests that still need brief normalization first
