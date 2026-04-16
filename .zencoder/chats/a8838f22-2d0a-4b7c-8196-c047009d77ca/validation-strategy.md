# Validation Strategy

**Task ID**: 43 (Leantime)
**Step**: Validation Strategy Agent
**Date**: 2026-04-12
**Status**: complete

---

## Change Risk Classification

### Changes in Scope for This Implementation Step

| Change                              | File(s)                                                        | Type            | Risk     |
| ----------------------------------- | -------------------------------------------------------------- | --------------- | -------- |
| Add optional env vars to schema     | `src/core/env.ts`                                              | Additive schema | **Low**  |
| Update env.test.ts for new vars     | `src/core/env.test.ts`                                         | Test update     | **Low**  |
| Suppress Vercel warning (log level) | `src/app/observability/new-relic-browser.js/route.ts`          | Behavior change | **Low**  |
| Update `.env.example`               | `.env.example`                                                 | Documentation   | **None** |
| Update `docs/features/26 - ...`     | `docs/features/26 - New Relic Server & Browser Integration.md` | Documentation   | **None** |
| Create `docs/features/27 - ...`     | `docs/features/27 - Observability Multi-Provider Design.md`    | New document    | **None** |

**Overall risk**: **Low** — no existing behavior changes except the Vercel warning demotion.

---

## Minimum Required Validation

### 1. Type Check

Must pass without errors after env schema additions.

```bash
pnpm typecheck
```

**Rationale**: New Zod schema entries and optional fields must typecheck cleanly. T3-Env validators run at module load time — any schema error surfaces immediately.

---

### 2. Unit Tests

The existing `env.test.ts` already covers `validateNewRelicConfigValues`. Any new env vars with validation logic need companion tests.

```bash
pnpm test -- --reporter=verbose src/core/env.test.ts
```

**Rationale**: `src/core/env.ts` is a composition root for all environment configuration. Regressions here are high-blast-radius.

**Specific cases to cover**:

- `NEW_RELIC_BROWSER_ENABLED=true` with missing `NEW_RELIC_BROWSER_LICENSE_KEY` or `NEW_RELIC_BROWSER_APP_ID` — should warn or throw if validation is added
- All existing `validateNewRelicConfigValues` cases must still pass unchanged

---

### 3. Route Handler Tests

```bash
pnpm test -- --reporter=verbose src/app/observability/new-relic-browser.js/route.test.ts
```

**Rationale**: The route behavior changes slightly — the Vercel warning path is being suppressed. Existing test expectations for the warning must be updated to match the new conditional behavior.

---

### 4. Lint

```bash
pnpm lint --fix
```

**Rationale**: New env vars added to schema and usage sites must follow existing import/format conventions.

---

### 5. Full Unit Test Suite

```bash
pnpm test
```

**Rationale**: Env schema changes affect any module that imports from `@/core/env`. A full unit run confirms no import-time regressions.

---

## Optional Additional Validation

### Architecture Lint

```bash
pnpm arch:lint
```

**When needed**: Only if any new files are added that could affect module boundary rules. For this change set (doc + env + small route tweak), arch lint is optional but recommended.

---

### Targeted Route Integration Test

Not yet applicable — no new route created in this step. The NR Browser CDN route changes are deferred to the multi-provider implementation task.

---

## Validation NOT Required

| Skipped                 | Reason                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| E2E Playwright          | No user-facing behavior changes; browser monitoring path unchanged |
| DB integration tests    | No persistence concerns                                            |
| MSW handlers            | No new HTTP adapters                                               |
| Storybook               | No UI components added or changed                                  |
| `pnpm test:integration` | No infrastructure changes                                          |

---

## Validation Commands (Ordered)

```bash
# 1. Type check — fastest signal
pnpm typecheck

# 2. Lint and auto-fix
pnpm lint --fix

# 3. Architecture boundaries
pnpm arch:lint

# 4. Full unit suite
pnpm test
```

---

## Acceptance Criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint --fix` exits 0 with no unfixed errors
- [ ] `pnpm test` exits 0, all tests pass
- [ ] `src/core/env.test.ts` — all existing NR tests still pass
- [ ] `src/app/observability/new-relic-browser.js/route.test.ts` — updated for warning change
- [ ] No new lint disable comments introduced

---

## Notes on the Deferred Implementation

When the **multi-provider observability implementation task** runs (Better Stack + NR Browser CDN full implementation), the validation strategy should be expanded to include:

- Integration tests for new pino stream factory functions
- Unit tests for new `src/core/observability/new-relic-browser.ts` and `src/core/observability/better-stack.ts`
- `src/proxy.ts` test coverage for `/_betterstack/*` allowlist
- E2E or smoke test for `layout.tsx` conditional injection
