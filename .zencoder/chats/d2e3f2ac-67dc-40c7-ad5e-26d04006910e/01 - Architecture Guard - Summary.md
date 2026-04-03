# 01 - Architecture Guard - Summary

## Task Context

- Task ID: d2e3f2ac-67dc-40c7-ad5e-26d04006910e
- Task Objective: Assess architectural impact of FlagsFile format change and GrowthBook cache key fix
- Current Run Scope: Post-implementation review pass — runtime input validation gap and docs drift
- Status: COMPLETED
- Last Updated: 2026-04-03
- Related Control Artifacts: `incident-intake.md`, `02 - Security & Auth - Summary.md`, `implementation-plan.md`

---

## Scope Handled

- modules / layers reviewed: `scripts/flags/` (tooling scripts), `src/modules/feature-flags/infrastructure/growthbook/`, `docs/features/24 - Feature Flags.md`
- change surface reviewed: `FlagsFile` type definition, import script input validation, feature flags documentation
- architecture questions in scope: Runtime input validation for format-breaking change, documentation accuracy

---

## Inputs Reviewed

- code paths reviewed:
  - `scripts/flags/types.ts` — `FlagsFile` now `FlagEntry[]` (array format, confirmed correct)
  - `scripts/flags/import.ts` — `readInput()` blind `JSON.parse()` with no runtime validation
  - `scripts/flags/export.ts` — array format confirmed in place
  - `scripts/flags/migrate.ts` — array format confirmed in place
  - `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts` — composite cache key confirmed
  - `docs/features/24 - Feature Flags.md` — stale format examples at lines ~146 and ~254
- earlier task artifacts reviewed: all prior workflow artifacts from d2e3f2ac-67dc-40c7-ad5e-26d04006910e

---

## Actions Performed

- repository inspection performed: Second-pass review of implementation output against external architecture review
- boundary checks performed: Confirmed `scripts/flags/` is still fully internal; no application layer dependency
- docs-vs-code checks performed: Identified two concrete drift points in `docs/features/24 - Feature Flags.md`

---

## Current-State Findings

### CONFIRMED FROM PRIOR RUN: Array Format Fixes Are Correct

All four script files (`types.ts`, `export.ts`, `import.ts`, `migrate.ts`) correctly use `FlagEntry[]`. The GrowthBook adapter correctly caches per `clientKey|apiHost`. These findings stand; no regression found.

---

### MAJOR (New): `scripts/flags/import.ts` — No Runtime Input Validation

**File**: `scripts/flags/import.ts`, `readInput()` at line 22

`readInput()` does `return JSON.parse(raw) as FlagsFile;`. The TypeScript `as` cast provides zero runtime guarantee. The follow-on call `data.flags.length` at line 36 and `for (const entry of data.flags)` at line 38 are unsafe if an operator feeds in a pre-fix backup in the old object-map format:

```json
{ "flags": { "my-flag": { "enabled": true, "tenantId": null } } }
```

With the old format, `data.flags` is a plain object. `data.flags.length` returns `undefined` (falsy, skips the early-return guard — the guard passes). `for (const entry of data.flags)` then throws `TypeError: data.flags is not iterable` as an uncontrolled runtime crash rather than a controlled operator error.

**Architectural concern**: The format change was a deliberate breaking change. Breaking changes to operator-facing tooling must be protected by explicit input validation with clear error messages, not left as silent runtime crashes. This is a DX and operational safety gap, not a security gap.

**Required fix**: In `readInput()`, after `JSON.parse`, validate that `data.flags` is an `Array`. If it is an object (old format), emit a specific, actionable error message and `process.exit(1)`. Do not silently convert or coerce the old format.

**Validation approach**: Manual `Array.isArray()` check. Do NOT introduce Zod into scripts — scripts are intentionally dependency-light. A targeted structural check is sufficient and idiomatic for this codebase's tooling layer.

---

### MINOR (Confirmed): Docs Drift in `docs/features/24 - Feature Flags.md`

Two confirmed drift points:

**Drift point 1 — Line 146**: States "The client instance is cached at module level per `clientKey`". Code now caches per `clientKey|apiHost`. Must be updated to "per `clientKey` and `apiHost` combination" with a brief note on why (prevents wrong-backend selection if same key targets different hosts).

**Drift point 2 — Lines ~254–264**: Export format example shows the old object-map JSON:

```json
{
  "flags": {
    "demo.new-dashboard-ui": { "enabled": true, "tenantId": null },
    "demo.beta-exports": { "enabled": false, "tenantId": "org_acme" }
  }
}
```

Must be replaced with the current array format:

```json
{
  "flags": [
    { "key": "demo.new-dashboard-ui", "enabled": true, "tenantId": null },
    {
      "key": "demo.beta-exports",
      "enabled": false,
      "tenantId": "org_acme",
      "description": "Beta exports for Acme tenant only"
    }
  ]
}
```

Stale docs for operator-facing scripts are a meaningful operational risk — an operator following the docs to construct a manual import file will produce an unvalidated object that either crashes at runtime (before the fix) or fails with a controlled error (after the fix). The docs must reflect reality.

---

## Boundary And Dependency Assessment

- module ownership assessment: No change — `scripts/flags/` remains internal tooling with no application-layer dependency
- dependency direction assessment: No violations introduced or found
- DI / composition assessment: Not affected by these follow-up items
- cross-module coupling assessment: None

---

## Architectural Decisions / Constraints

**For the input validation fix:**

- Validate in `readInput()` immediately after `JSON.parse`, before returning. This is the right place — closest to the untrusted input.
- Use `Array.isArray(parsed?.flags)` to detect the old format.
- If `!Array.isArray(parsed?.flags)`, check `typeof parsed?.flags === 'object' && parsed?.flags !== null` to distinguish "old object-map format" from "invalid/corrupt JSON". Emit distinct error messages for each case.
- `process.exit(1)` on validation failure. Do not throw — scripts use exit codes, not exceptions, for operator errors.
- Do NOT add Zod to scripts. Manual structural check is the correct pattern for tooling scripts.
- Do NOT silently migrate or coerce old format to new — operators must know to regenerate backups.
- Add a unit test for old-format rejection in an appropriate test file (can extend `migrate.test.ts` pattern in a new `import.test.ts` or add to existing test coverage).

**For the docs update:**

- Minimum accurate update — fix the two drift points exactly, do not rewrite surrounding content.
- The export format example must become array format with realistic values.
- The GrowthBook caching description must reflect the `clientKey|apiHost` composite key.
- No other doc sections are in scope for this follow-up.

**What is NOT approved:**

- Backward-compatible shims that convert old format silently — hides the breaking change from operators
- Zod validation in `scripts/flags/` — wrong dependency for tooling layer
- Broad documentation rewrites — minimum drift correction only
- Addressing the MINOR GrowthBook outbound-allowlist posture note in this pass — it is hardening follow-up, not a blocker for production-readiness

---

## Open Questions / Blockers

- unresolved questions: None blocking this follow-up
- blockers: None
- evidence still needed: None

---

## Handoff Notes

- what the next agent should rely on: `implementation-plan.md` in this directory is the authoritative task plan for the follow-up
- what should not be re-decided without new evidence: The fix is manual `Array.isArray()` not Zod; docs update is minimum accurate correction only
- recommended next specialist or step: Implementation Agent (follow `implementation-plan.md`)

---

## Update Log

### Update Entry — Initial Architecture Review

- Date: 2026-04-02
- Trigger: Incident workflow step 4
- Summary of change: Confirmed bounded scope of both fixes; recommended array format for FlagsFile; identified writeToStaticFormat edge case
- Sections refreshed: All

### Update Entry — Post-Implementation Follow-Up Review

- Date: 2026-04-03
- Trigger: External architecture review identifying remaining gaps after incident closure
- Summary of change: Identified MAJOR runtime input validation gap in `scripts/flags/import.ts`; confirmed two MINOR docs drift points in `docs/features/24 - Feature Flags.md`; created `implementation-plan.md` for follow-up
- Sections refreshed: Current-State Findings, Architectural Decisions / Constraints, Open Questions, Handoff Notes
