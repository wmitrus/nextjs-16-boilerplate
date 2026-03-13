# arch:lint Failure Analysis

**Agent**: Architecture Guard Agent  
**Date**: 2026-03-13  
**Scope**: src/core/db/seed.ts, src/core/runtime/bootstrap.ts, src/core/runtime/edge.ts

---

## 1. Objective

Classify each file flagged by the `core must not import app/features/security/modules outside composition root` rule. Determine whether each is a true violation, an approved composition-root exception the rule doesn't model, a candidate for relocation, or a rule adjustment case.

---

## 2. The Lint Rule

```bash
fail_matches \
  "core must not import app/features/security/modules outside composition root" \
  "from '@/(app|features|security|modules)/" \
  src/core \
  --glob '!src/core/container/**' \
  --glob '!**/*.test.*'
```

Excludes `src/core/container/**` (the DI Container class) and test files. Does **not** exclude `src/core/runtime/**` or `src/core/db/seed.ts`. The rule intent is clear from its label — the exclusion set is simply too narrow relative to the documented composition root boundary.

---

## 3. File-by-File Analysis

### `src/core/runtime/bootstrap.ts`

**Function**: Node runtime composition root. Exports `createRequestContainer(config)` and `getAppContainer()`. Wires:

- `createAuthModule()` from `@/modules/auth`
- `createAuthorizationModule()` from `@/modules/authorization`
- `DrizzleMembershipRepository` from `@/modules/authorization/infrastructure/drizzle/`
- `DrizzleProvisioningService` from `@/modules/provisioning/infrastructure/drizzle/`

**Architecture doc support**:

- Doc 02 (`Composition Root Architecture`) explicitly shows `Boot["Bootstrap (Node)"]` as a top-level composition root entity
- Doc 15 (`Edge vs Node Composition Root Boundary`) names `getAppContainer()` and `createRequestContainer(config)` as the Node composition root entry points

**Verdict**: ✅ **Approved composition-root exception — lint rule exclusion is too narrow**

The `!src/core/container/**` glob covers only the DI Container class definition. The entry-point wiring files in `src/core/runtime/` are equally part of the composition root and must import from modules to wire concrete implementations. No code change needed.

**Action**: Extend lint exclusion to include `src/core/runtime/bootstrap.ts`.

**MINOR observation**: `bootstrap.ts` imports `DrizzleMembershipRepository` and `DrizzleProvisioningService` from internal module sub-paths rather than module public indexes. Composition roots that wire concrete implementations routinely do this — accepted pattern. Non-blocking.

---

### `src/core/runtime/edge.ts`

**Function**: Edge runtime composition root. Exports `createEdgeRequestContainer(config)`. Wires:

- `createEdgeAuthModule()` from `@/modules/auth/edge`

**Architecture doc support**: Doc 02 shows `EdgeBoot["Bootstrap (Edge)"]` as the peer Edge composition root entity. Doc 15 names `createEdgeRequestContainer(config)` as the Edge composition root used by `src/proxy.ts`.

**Verdict**: ✅ **Approved composition-root exception — lint rule exclusion is too narrow**

Identical rationale to `bootstrap.ts`. The Edge composition root must import from `@/modules/auth/edge` to wire the edge-safe auth module.

**Action**: Extend lint exclusion to include `src/core/runtime/edge.ts`.

---

### `src/core/db/seed.ts`

**Function**: Cross-module seed orchestrator. Chains `seedUsers → seedAuthorization → seedBilling` with the correct dependency ordering.

**Sole consumer**: `scripts/db-seed.ts` — a CLI script outside `src/`. Confirmed: no imports of `core/db/seed` or `seedAll` exist anywhere inside `src/` (neither in production code nor in test infrastructure). Individual module seed functions are used directly by module-local DB tests without going through this orchestrator.

**Character**: Unlike `bootstrap.ts`/`edge.ts`, this is NOT a DI container composition root. It does not build a Container. It is a seed orchestration utility called exclusively from a script.

**Verdict**: ⚠️ **Structural smell — different character from bootstrap.ts/edge.ts; sole consumer is a CLI script outside src/**

Two options:

**Option A — Move orchestration to `scripts/db-seed.ts` directly (recommended)**  
Delete `src/core/db/seed.ts`. Inline the `seedUsers → seedAuthorization → seedBilling` call chain into the script. Since `scripts/` is outside `src/`, the arch:lint rule does not apply. Removes the violation entirely without any lint rule change. Zero blast radius inside `src/`.

**Option B — Add lint exclusion with annotation (acceptable)**  
Add `--glob '!src/core/db/seed.ts'` to the rule and add a comment in the file marking it as an approved seed orchestration root. Lower effort but leaves the semantic oddity (a cross-module orchestrator sitting among DB infrastructure utilities).

---

## 4. Docs vs Code Drift

The lint rule's label says "outside composition root" but its exclusion only covers `src/core/container/**`. Architecture doc 02 establishes the composition root as spanning:

- `src/core/container/` — Container class
- `src/core/runtime/bootstrap.ts` — Node wiring entry point
- `src/core/runtime/edge.ts` — Edge wiring entry point

The lint rule exclusion does not match the documented composition root boundary. This is a **lint rule misconfiguration** — the code is correct, the rule is underspecified.

---

## 5. Risk Summary

| Severity      | Finding                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MINOR         | Lint rule gives false positives for legitimate composition root files — obscures real future violations                                                                                         |
| MINOR         | `seed.ts` in `core/db/` is semantically misleading among DB infrastructure utilities; could attract future `src/` consumers that inadvertently pull module infrastructure into production paths |
| INFORMATIONAL | `bootstrap.ts` imports concrete infrastructure classes from module sub-paths rather than public indexes — accepted composition-root pattern, creates minor fragility                            |

---

## 6. Recommended Actions

**Action 1 — Lint rule fix (required, both bootstrap.ts and edge.ts)**

Add to the first `fail_matches` block in `scripts/architecture-lint.sh`:

```bash
--glob '!src/core/runtime/bootstrap.ts' \
--glob '!src/core/runtime/edge.ts' \
```

With a comment: `# composition root entry points — intentionally import from modules`

**Action 2a — seed.ts: move to scripts (preferred)**  
Move the `seedAll` orchestration body out of `src/core/db/seed.ts` into `scripts/db-seed.ts` directly. Delete `src/core/db/seed.ts`. Zero blast radius inside `src/`.

**Action 2b — seed.ts: lint exclusion (alternative)**  
Add `--glob '!src/core/db/seed.ts'` to the lint rule with an annotation. Lower effort. Accept the semantic oddity.

After either action set, `pnpm arch:lint` will pass cleanly with no false positives.
