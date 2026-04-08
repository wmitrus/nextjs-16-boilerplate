# Constraints Summary

## Task

pnpm audit fix + override review + coverage threshold fix

## Architecture Constraints

- Do NOT change architecture or module boundaries
- Coverage config changes limited to `vitest.unit.config.ts`
- Package updates must not change public APIs or break existing imports
- No new dependencies; only updating existing ones

## Security and Auth Constraints

- **drizzle-orm MUST be updated to >=0.45.2** — production SQL injection risk
- **vite MUST be updated to >=7.3.2** — dev-environment path traversal and file read vulnerabilities
- All 4 `pnpm audit` findings must be resolved after updates
- Overrides must not be removed unless verified safe via `pnpm why` and `pnpm audit`
- After drizzle-orm update, run integration tests to confirm no behavioral regression

## Runtime Constraints

- N/A — no Next.js runtime changes

## Validation Constraints

- `pnpm audit` must return 0 vulnerabilities after fixes
- `pnpm test` must pass (coverage above threshold)
- `pnpm typecheck` must pass after any config or code changes
- `pnpm lint --fix` must pass

## Explicitly Allowed Changes

1. `pnpm update vite drizzle-orm` — patch version updates within existing semver ranges
2. Modify `vitest.unit.config.ts` — add coverage exclusions for:
   - `scripts/leantime/**` — operational Leantime automation scripts; not unit-testable in isolation
   - `scripts/new-relic/**` — operational New Relic scripts; external API dependent
   - `scripts/lib/**` — utility infrastructure scripts (db reset, etc.)
   - `scripts/db-seed.ts` — database seed script; integration-test territory
   - `src/core/contracts/**` — pure TypeScript type definitions and interfaces; no runtime logic
   - `src/security/core/security-dependencies.ts` — pure interface types only
   - `src/modules/provisioning/domain/tenancy-mode.ts` — pure type alias
   - `src/modules/authorization/domain/permission.ts` — re-export barrel only
3. Lower coverage threshold from 80% to 75% — acknowledges project growth and integration-heavy modules
4. Add targeted unit tests for the most impactful weak `src/` files
5. Remove stale overrides ONLY IF `pnpm audit --fix` or `pnpm why` confirms they are no longer needed

## Explicitly Forbidden Changes

- DO NOT remove overrides that are still in the transitive dependency tree (all current overrides are still used)
- DO NOT lower threshold below 75%
- DO NOT exclude genuinely testable `src/` modules from coverage to game the threshold
- DO NOT change production code to fix coverage (only add tests)
- DO NOT skip running `pnpm typecheck` and `pnpm lint --fix` after changes

## Protected Invariants

- Module boundaries: `src/core/`, `src/modules/`, `src/security/`, `src/features/` must remain intact
- Existing passing tests must not be broken by coverage config changes
- drizzle-orm API compatibility: patch update (0.45.1 → 0.45.2) is expected non-breaking

## Open Questions / Blocks

- After `pnpm update vite drizzle-orm`, must re-run `pnpm audit` to confirm 0 findings
- Some 0% files in `src/security/core/` (`node-provisioning-runtime.ts`) have real logic but depend on DB — consider integration test rather than unit test
