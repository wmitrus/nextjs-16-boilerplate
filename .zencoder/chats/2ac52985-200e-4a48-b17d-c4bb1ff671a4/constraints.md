# Constraints Summary

## Task

Fix 4 CRITICAL Codacy security findings in `scripts/e2e/load-env.mjs` and `scripts/e2e/run-scenario.mjs` (path traversal CWE-22 + SSRF CWE-918), and add AI governance rules to prevent recurrence.

---

## Scope

1. Fix path traversal risk in `scripts/e2e/load-env.mjs` (functions `getScenarioEnvPath`, `getVariantEnvPath`)
2. Fix path traversal risk in `scripts/e2e/run-scenario.mjs` (function `preparePgliteDatabase` / `resolveScenarioDatabasePath`)
3. Fix SSRF risk in `scripts/e2e/run-scenario.mjs` (function `isBaseUrlReachable`)
4. Add secure coding rules to AI governance files:
   - `AGENTS.md`
   - `docs/ai/general/02 - Security & Auth Agent.md`
   - `docs/ai/general/04 - Implementation Agents.md`
   - `docs/ai/copilot/02 - Security & Auth Agent.md`
   - `docs/ai/copilot/04 - Implementation Agents.md`
   - `docs/ai/zencoder/02 - Security & Auth Agent.md`
   - `docs/ai/zencoder/04 - Implementation Agents.md`

---

## Out of Scope

- Do not refactor unrelated script logic
- Do not change the E2E scenario runner's CLI interface
- Do not touch `src/` application code
- Do not add new runtime dependencies
- Do not change `.env.example` or environment variable schema
- Do not restructure `scripts/e2e/` directory

---

## Architecture Constraints

- Scripts are standalone Node.js scripts — no module boundary rules apply
- Use only `node:path` and `node:url` (already imported) for the guards
- Add guard helper functions at the top of each file where needed (or a shared `scripts/lib/path-guard.mjs` if the same guard is needed in both files)
- Do not import application code from `src/` into scripts

---

## Security/Auth Constraints

1. **Path confinement guard (CWE-22)**:
   - Resolve path with `path.resolve()` first
   - Check that the normalized path starts with the normalized base directory + `path.sep`
   - Throw a clear error with path information (no file contents in error)
   - Guard must be at the point of use, not only at the caller

2. **SSRF guard (CWE-918)**:
   - Parse URL with `new URL()` — throw if invalid
   - Reject protocols other than `http:` or `https:`
   - Restrict hostname to `localhost`, `127.0.0.1`, `::1`
   - Throw a clear error with the rejected hostname (never log URL parameters that might contain secrets)

3. **Fixed paths** (`path.resolve(ROOT_DIR, '.env.local')`, `path.resolve(ROOT_DIR, '.env.e2e')`, etc.) in `loadScenarioEnv` do not use user input — no guard needed for those.

4. **Error messages** must never include file contents or env variable values — only path/URL metadata.

---

## Runtime Constraints

- Not applicable (Node.js CLI scripts, no App Router, no edge/node split)

---

## Validation Constraints

- Minimum: `pnpm typecheck` and `pnpm lint` must pass after changes
- Minimum: the scripts must parse/execute without error for valid inputs
- Minimum: the path guard must throw for path traversal input (manual spot-check or unit test)
- Optional: unit tests for the guard helper functions
- Not required: E2E test run (requires full environment setup)

---

## Explicitly Allowed Changes

- Add `assertPathWithinBase(resolvedPath, baseDir)` helper function to `load-env.mjs`
- Add `assertSafeLocalUrl(url)` helper function to `run-scenario.mjs`
- Call `assertPathWithinBase` inside `getScenarioEnvPath` and `getVariantEnvPath`
- Call `assertPathWithinBase` inside `resolveScenarioDatabasePath` in `load-env.mjs`
- Call `assertSafeLocalUrl` before the `fetch(baseUrl, ...)` call in `isBaseUrlReachable`
- Add secure coding rules to specified AI governance files

---

## Explicitly Forbidden Changes

- Do not remove or weaken the upstream allowlist validation in `parseArgs`
- Do not make guards silently swallow errors — they must throw
- Do not restrict fixed/hardcoded paths (`.env.local`, `.env.e2e`, `base.env`) — those don't use user input
- Do not change function signatures used by callers outside `scripts/e2e/`
- Do not log sensitive env values in error messages

---

## Protected Invariants

- `SCENARIO_NAMES` and `VARIANT_NAMES` allowlists in `load-env.mjs` must remain the source of truth for valid values
- CLI argument validation in `parseArgs` (run-scenario.mjs) must remain intact
- The E2E scenario runner must continue to work correctly for valid scenario + variant combinations
- Env file loading precedence (`.env.local` → `.env.e2e` → `base.env` → scenario → variant → `.env.e2e.local`) must not change

---

## Open Questions / Blocks

None. All constraints are clear. Implementation can proceed.
