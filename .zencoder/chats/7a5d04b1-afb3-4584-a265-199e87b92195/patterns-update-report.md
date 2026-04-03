# Patterns Update Report — Feature Flags Security Audit

## Session: Feature Flags Security Audit (case `3344a061`)

## New Patterns Added

### SEC-09 — Shared Mutable State in SDK Singleton Across Requests

**Added to**:

- `docs/ai/general/SECURITY_CODING_PATTERNS.md` ✅
- `AGENTS.md` (pattern index table row) ✅

**Rule summary**: Never cache an SDK instance at module level and call mutable attribute setters per-request. Cache only immutable feature definitions (HTTP response). Evaluate flags with a stateless per-request context.

**Trigger**: `GrowthBookFeatureFlagService` uses a module-level `instanceCache` and calls `gb.setAttributes(userContext)` per request — a shared mutable state pattern that enables cross-tenant attribute contamination under concurrent load.

---

### SEC-10 — Error Objects Must Be Sanitized Before Logging

**Added to**:

- `docs/ai/general/SECURITY_CODING_PATTERNS.md` ✅
- `AGENTS.md` (pattern index table row) ✅

**Rule summary**: Never pass raw `error` objects to logger calls. Extract only `errorMessage` and `errorName` as separate string fields. DB connection errors commonly embed hostnames, usernames, and connection strings in `.message`.

**Trigger**: `ResilientFeatureFlagService` logs `{ error }` directly in its catch block — serializes the full Error object into structured log output.

---

## Existing Patterns Confirmed Relevant to This Audit

| Pattern                                | Status in Implementation                                    |
| -------------------------------------- | ----------------------------------------------------------- |
| SEC-05 — `fs.*` with dynamic paths     | ❌ VIOLATED in `export.ts` and `import.ts` (MAJ-01, MAJ-02) |
| SEC-07 — UUID vs TEXT for identifiers  | ✅ Fixed in Step 17                                         |
| SEC-08 — `unique().nullsNotDistinct()` | ✅ Fixed in Step 17                                         |

---

## Files Updated

| File                                          | Change                                              |
| --------------------------------------------- | --------------------------------------------------- |
| `docs/ai/general/SECURITY_CODING_PATTERNS.md` | Added SEC-09 and SEC-10 with full pattern entries   |
| `AGENTS.md`                                   | Added SEC-09 and SEC-10 rows to pattern index table |

## Files That Should Be Updated in Next Pass

Per AGENTS.md propagation table, the following files should also be updated to include SEC-09 and SEC-10 when the implementation agent works on these fixes:

- `docs/ai/general/04 - Implementation Agents.md` — add SEC-09, SEC-10 to implementation rules
- `.github/agents/implementation-agent.agent.md` — same
- `docs/ai/general/03 - Next.js Runtime Agent.md` — add SEC-09 (shared singleton / caching risk)

These propagation updates are deferred until after the CRIT-01 fix is implemented and validated.
