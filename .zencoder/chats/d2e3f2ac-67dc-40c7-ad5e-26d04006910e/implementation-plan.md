# Implementation Plan — flags:import Validation + Docs Drift Fix

## Context

This plan addresses two remaining gaps identified in the post-implementation architecture review of incident task `d2e3f2ac-67dc-40c7-ad5e-26d04006910e`.

The original incident fixes (FlagsFile array format, GrowthBook composite cache key) are confirmed correct in code. This plan closes the operational safety gap and the documentation drift that were left open.

## Required Reading Before Starting

- `AGENTS.md` (repository root)
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/d2e3f2ac-67dc-40c7-ad5e-26d04006910e/01 - Architecture Guard - Summary.md` — authoritative architectural constraints for this follow-up
- `scripts/flags/import.ts` — the file being modified
- `scripts/flags/types.ts` — the current `FlagsFile` type
- `docs/features/24 - Feature Flags.md` — the doc being corrected

## Execution Control

`straight-through` — no pause between steps required; both steps are independent.

---

## Workflow Steps

### [x] Step 1: Runtime Input Validation for `flags:import`

**Owner**: Implementation Agent

**What**: Add structured input validation to `readInput()` in `scripts/flags/import.ts` so that feeding an old-format backup file produces a controlled, operator-actionable error instead of a runtime crash.

**Scope**:

- `scripts/flags/import.ts` — modify `readInput()` after `JSON.parse`
- Add a new test file or extend existing coverage to cover the old-format rejection scenario

**Constraints (from Architecture Guard — do not deviate)**:

- Validate immediately after `JSON.parse` in `readInput()`, before returning
- Use manual `Array.isArray()` check — do NOT use Zod or any external validation library in scripts
- Do NOT silently convert or coerce old format — operators must be explicitly told to regenerate
- If `parsed?.flags` is a plain object (old format detected): emit a specific error naming the old format, naming the new format, and naming the command to regenerate: `pnpm flags:export --adapter=db`
- If `parsed` is structurally invalid (missing `flags`, null, not an object): emit a different "invalid or corrupt JSON" error
- Use `process.exit(1)` on all validation failures — do not throw
- If `parsed?.flags` is an array, return `parsed as FlagsFile` (existing behavior, no change to the happy path)
- The test must cover at minimum: old object-map format input, corrupt/missing-flags input, and valid array format input

**Output file**: None required (code change only). Run `pnpm typecheck` and targeted `vitest run` to confirm.

---

### [x] Step 2: Docs Drift Correction in `docs/features/24 - Feature Flags.md`

**Owner**: Implementation Agent

**What**: Fix two confirmed drift points in the feature flags documentation to match the current code behaviour.

**Scope**:

- `docs/features/24 - Feature Flags.md` — two targeted edits only

**Drift point 1 — GrowthBook caching description (line ~146)**:

Current text:

```
The client instance is cached at module level per `clientKey` to avoid repeated initialization overhead.
```

Must become (exact wording may vary, meaning must not):

```
The client instance is cached at module level per `clientKey` and `apiHost` combination to avoid repeated initialization overhead. Using both ensures that instances targeting different GrowthBook backends are never confused with each other.
```

**Drift point 2 — Export format example (lines ~254–264)**:

Current JSON example (object-map format — stale):

```json
{
  "flags": {
    "demo.new-dashboard-ui": {
      "enabled": true,
      "tenantId": null
    },
    "demo.beta-exports": {
      "enabled": false,
      "tenantId": "org_acme",
      "description": "Beta exports for Acme tenant only"
    }
  }
}
```

Must become (array format — current):

```json
{
  "flags": [
    {
      "key": "demo.new-dashboard-ui",
      "enabled": true,
      "tenantId": null
    },
    {
      "key": "demo.beta-exports",
      "enabled": false,
      "tenantId": "org_acme",
      "description": "Beta exports for Acme tenant only"
    }
  ]
}
```

**Constraints**:

- Minimum accurate correction — do not rewrite surrounding paragraphs
- Do not add new sections or restructure the document
- Do not fix anything outside these two drift points in this task

**Output file**: None required (doc change only).

---

## Validation After Both Steps

After completing both steps, run:

```shell
pnpm typecheck
pnpm exec vitest run --config vitest.unit.config.ts scripts/flags/
```

Both must pass. The new validation test(s) must be in the passing count.

Confirm by eyeballing:

- `readInput()` in `import.ts` now has an explicit check before returning
- The docs JSON example is array format
- The GrowthBook caching paragraph no longer says "per `clientKey`" alone

---

## What Is Out of Scope for This Plan

- GrowthBook outbound-allowlist posture hardening (MINOR follow-up deferred)
- Any other section of `docs/features/24 - Feature Flags.md` beyond the two drift points
- Changes to `scripts/flags/export.ts` or `scripts/flags/migrate.ts` — they are correct
- Changes to any application-layer code
- Changes to `SECURITY_CODING_PATTERNS.md` — already updated in the prior workflow run
