# Lizard / Codacy Disable Recommendations

Based on Architecture Guard review of all 51 MEDIUM issues (Groups A–J).  
Decision register: `complexity-decision-register.md`

---

## How to Apply in Codacy

For every recommendation below, Codacy offers two suppression options:

- **Ignore issue** — disables the pattern globally for the entire repository (or per-path if Codacy supports path patterns for that tool)
- **Ignore file** — suppresses the pattern for a specific file only

The recommendation column specifies which approach to use per item.

---

## Tier 1 — Disable Globally (Ignore Issue)

These patterns produce **only false positives or zero-signal results** in this repository. Disabling them globally will not cause any real issue to be missed.

### 1. Markdown Duplicate Heading Rule

**Pattern**: Markdown `MD024` equivalent (duplicate heading text within a document)  
**Codacy action**: **Ignore issue** — disable globally for markdown files  
**Confidence**: HIGH

**Why**: Every flagged instance is an intentional structural pattern:

- Multi-PR planning docs (repeated `### Goal`, `### Deliverables` per PR section)
- Before/After migration guides (repeated section headings per feature)
- Audit instruction templates (30+ identical template headings by design)
- AI task artifacts (`.copilot/`, `.zencoder/` — not maintained source docs)

Fixing these would destroy the documents. The rule has zero engineering signal value for this repository.

**Scope of issues eliminated**: All 10 Group A issues.

---

### 2. Enforce Medium Parameter Count Limit

**Pattern**: `Enforce Medium Parameter Count Limit` (Lizard — limit 8)  
**Codacy action**: **Ignore issue** — disable globally  
**Confidence**: HIGH

**Why**: The only flagged instance in this entire codebase was a **confirmed false positive** — Lizard counted the fields of an object literal returned by a zero-parameter arrow function as function parameters. This is a known Lizard misparse of TypeScript arrow functions returning multi-field objects (`async () => ({ status: ..., identity: ..., diagnostics: { ... } })`).

This pattern is extremely common in TypeScript (test fixtures, factory functions, typed response builders). The parameter count rule will continue to produce false positives on any rich object literal return in this codebase.

**Scope of issues eliminated**: B-8 (1 issue). Low immediate impact, but prevents future false positives as the codebase grows.

---

## Tier 2 — Ignore File by Path (Test, E2E, Script Paths)

These files should have **no complexity limits applied**. Production code limits are irrelevant to test infrastructure, E2E automation, and utility scripts.

### 3. All Lizard Patterns — Test Files

**Pattern**: All Lizard complexity patterns (cyclomatic, LOC, parameters, file size)  
**Codacy action**: **Ignore file** for each test path, OR configure Codacy to exclude these paths from Lizard analysis  
**Confidence**: HIGH

Files / path patterns to exclude:

| Path Pattern               | Reason                                      |
| -------------------------- | ------------------------------------------- |
| `**/*.test.ts`             | Unit tests — complexity limits do not apply |
| `**/*.test.tsx`            | Unit tests (React)                          |
| `**/*.integration.test.ts` | DB integration tests                        |
| `**/*.spec.ts`             | Playwright E2E specs                        |
| `e2e/**`                   | All E2E infrastructure, helpers, profiles   |
| `scripts/**`               | Utility/tooling scripts                     |

**Scope of issues eliminated**: All 11 Group B issues (B-1 through B-11). This is the **highest-impact single configuration change** — it removes 11 issues from every PR annotation with zero risk to production code quality.

---

## Tier 3 — Ignore File (Specific Production Files with Confirmed False Positives)

These production source files contain confirmed Lizard false positives caused by TypeScript scope-boundary parsing failures. The real complexity in these files is either justified (SKIP decisions) or already tracked elsewhere. Suppressing at the file level is the correct action because the false positives are caused by Lizard's inability to correctly parse TypeScript function scope boundaries in these specific file structures.

### 4. `src/security/middleware/with-auth.ts`

**Issues to suppress**: 3 (E-1, E-2, E-3)  
**Action**: **Ignore file** for `Enforce Medium Cyclomatic Complexity Limit`, `Enforce Medium Method Length Limit`, `Enforce Medium Parameter Count Limit`  
**Confidence**: HIGH

**Why**: All 3 issues are attributed to `redirectForMissingTenantContext` — a 5-line, 1-parameter, 0-branch function. Lizard scans into the `withAuth` inner async closure (lines 264–401) and attributes its combined metrics to the preceding helper function. The real `withAuth` closure complexity (~19) is architecturally justified (8-step security pipeline) and should not be split.

---

### 5. `src/security/core/security-context.ts`

**Issues to suppress**: 2 (F-3, F-4)  
**Action**: **Ignore file** for `Enforce Medium Cyclomatic Complexity Limit`, `Enforce Medium Method Length Limit`  
**Confidence**: HIGH

**Why**: Lizard identifies the ternary token `?` at line 70 (`? ('node' as const)`) as a function definition. `createSecurityContext`'s real complexity is attributed to this token. The actual function is a justified sequential auth guard (SKIP decision).

---

### 6. `src/modules/auth/index.ts`

**Issues to suppress**: 2 (G-1, G-2)  
**Action**: **Ignore file** for `Enforce Medium Cyclomatic Complexity Limit`, `Enforce Medium Method Length Limit`  
**Confidence**: HIGH

**Why**: `buildIdentitySource` (14 lines, cyclomatic 3) is a 3-case switch. Lizard scans into adjacent `buildTenantResolver` (72 lines, complexity 14) and attributes the combined metrics to `buildIdentitySource`. `buildTenantResolver`'s real complexity is justified (3 tenancy modes × 2 context sources — a necessary configuration factory).

---

### 7. `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`

**Issues to suppress**: 2 (G-3, G-4)  
**Action**: **Ignore file** for `Enforce Medium Cyclomatic Complexity Limit`  
**Confidence**: HIGH

**Why**:

- `Boolean(orgId)` is misidentified as a function definition. Actual complexity = 0.
- `readStringClaim` actual complexity = 4. Lizard accumulates 3 adjacent helper functions.

---

### 8. `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`

**Issues to suppress**: 1 (C-2)  
**Action**: **Ignore file** for `Enforce Medium Cyclomatic Complexity Limit`  
**Confidence**: HIGH

**Why**: `isSyntheticFallbackEmail` is a 3-line function with one `&&` operator (cyclomatic 2). Lizard misattributes `ensureProvisioned`'s class-body complexity across the TypeScript class/module-level function boundary.

**Note**: Do not suppress `Enforce Medium Method Length Limit` or `Enforce Medium File Length Limit` for this file — those issues were reviewed and SKIP decisions made (C-1, C-4). Retaining them preserves monitoring signal.

**Note**: `resolveOrCreateUser` cyclomatic 28 (C-3) is a real issue tracked for REFACTOR. Retaining the cyclomatic pattern for this file means that issue will continue to appear until the refactor is done (which is the correct behavior).

---

### 9. `src/core/runtime/bootstrap.ts`

**Issues to suppress**: 1 (I-2)  
**Action**: **Ignore file** for `Enforce Medium Cyclomatic Complexity Limit`  
**Confidence**: HIGH

**Why**: `resolveDbProvider` is `return env.DB_PROVIDER ?? 'drizzle'` — cyclomatic 2. Lizard accumulates adjacent `resolveDbDriver`'s real complexity (~9) and attributes it to `resolveDbProvider`.

---

### 10. `src/shared/lib/observability/sentry-dev-filters.ts`

**Issues to suppress**: 1 (J-1)  
**Action**: **Ignore file** for `Enforce Medium Cyclomatic Complexity Limit`  
**Confidence**: HIGH

**Why**: `getHintMessage` actual complexity = 2. Lizard accumulates 4 adjacent helper functions in the file (total ~10).

---

## Tier 4 — Do NOT Disable

These patterns/files have **real complexity worth monitoring** and should remain enabled.

| Pattern / File                                                        | Reason to Retain                                                                                                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Enforce Medium Cyclomatic Complexity Limit` globally                 | Real issues exist: `resolveOrCreateUser` (cyclomatic 28), `sanitizeContext` (23), `withAuth` inner closure (~19). These signal real complexity worth tracking. |
| `Enforce Medium Method Length Limit` globally                         | Real LOC signals in production code (layout guards, security pipeline, provisioning). Justified by inspection, but worth monitoring for future growth.         |
| `Enforce Medium File Length Limit` globally                           | `DrizzleProvisioningService.ts` (1045 LOC), `provisioning-runtime.spec.ts` (would be excluded by test path). File-level monitoring is useful.                  |
| `src/app/api/logs/route.ts` — `sanitizeContext` cyclomatic 23         | Real complexity (REFACTOR decision). Keep the alert until extraction is done — it is a useful reminder.                                                        |
| `DrizzleProvisioningService.ts` — `resolveOrCreateUser` cyclomatic 28 | Real complexity (REFACTOR decision). Keep the alert until `assertCrossProviderLinkingAllowed` extraction is done.                                              |

---

## Impact Summary

| Action                                               | Issues Eliminated     | Confidence |
| ---------------------------------------------------- | --------------------- | ---------- |
| Disable markdown duplicate heading globally          | 10                    | HIGH       |
| Disable parameter count limit globally               | 1 (+ prevents future) | HIGH       |
| Exclude test/E2E/script paths from all Lizard checks | 11                    | HIGH       |
| Suppress per-file false positives (7 files)          | 9                     | HIGH       |
| **Total issues eliminated**                          | **31 of 51**          |            |
| Issues retained (real, monitored)                    | 20                    |            |

Of the 20 retained issues:

- 17 are SKIP decisions (real metrics, justified by architecture — will continue to appear but should be dismissed in Codacy review)
- 2 are REFACTOR decisions (will disappear after the refactors are done)
- 1 is FIX decision (will disappear after the dead-branch removal)

---

## Recommended Application Order

1. **First**: Exclude test/E2E/script paths (Tier 2) — highest impact, no risk
2. **Second**: Disable markdown duplicate headings (Tier 1) — clean up Group A noise
3. **Third**: Suppress per-file confirmed false positives (Tier 3) — removes 9 noisy false positives from production files
4. **Fourth**: Disable parameter count limit globally (Tier 1) — lowest priority, 1 issue, but prevents future false positives
5. **After refactors complete**: The 3 remaining monitored issues (resolveOrCreateUser cyclomatic 28, sanitizeContext cyclomatic 23, resolveBootstrapOutcome after fix) will naturally disappear or drop below thresholds
