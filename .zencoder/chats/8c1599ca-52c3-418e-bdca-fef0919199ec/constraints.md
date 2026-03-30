# Constraints Summary

## Task

Remediate 17 HIGH static analysis findings across `scripts/` and `.github/workflows/`. Install `eslint-plugin-security` globally first, then fix real issues chapter by chapter with operator approval before each step.

## Scope

- `scripts/compose-db-local.mjs`
- `scripts/e2e/load-env.mjs`
- `scripts/e2e/run-scenario.mjs`
- `scripts/check-e2e-auth-env.mjs`
- `scripts/check-env-consistency.mjs`
- `.github/workflows/*.yml` (all 12 files — full action pin audit)
- `eslint.config.mjs` (add `eslint-plugin-security` globally)
- `package.json` (add `eslint-plugin-security` to devDependencies)

## Out of Scope

- Any file under `src/`
- Next.js runtime behavior
- Module boundaries, DI, composition root
- Auth, authorization, tenant, or session logic
- Playwright specs or Vitest tests
- Broad refactoring of script architecture

---

## Architecture Constraints

- No new modules or shared helpers may be created for this task
- `assertPathWithinBase` must be used as-is from its existing implementation in `scripts/e2e/load-env.mjs` lines 7–23; do not move or centralize it
- The prototype-pollution key filter must be inlined at the assignment site, not extracted to a shared utility

## Security/Auth Constraints

- `eslint-plugin-security` must be installed and configured globally (for all files) in `eslint.config.mjs` **before any other code change**. This is a hard prerequisite.
- After `eslint-plugin-security` is configured, `pnpm lint` must pass before proceeding to any subsequent issue
- Path guards must use the canonical `assertPathWithinBase` pattern: resolve both paths, check `normalizedPath.startsWith(normalizedBase + path.sep)`, throw on violation
- Prototype-polluting key filter must reject: `__proto__`, `constructor`, `prototype` — guard must be applied before assignment in both `parseEnvFile` (`env[key] = value`) and `applyEnv` (`target[key] = value`)
- `DB_COMPOSE_FILE` env-var path must be validated via `assertPathWithinBase(path.resolve(explicitFile), process.cwd())` before `existsSync` or `spawnSync` use
- GitHub Actions `uses:` references must be pinned to the full 40-character commit SHA for every unique action across all 12 workflow files
- SHA values must be traced from the public GitHub repository of each action at the tag version currently used
- False-positive suppression comments must include a clear justification explaining why the flagged pattern is safe

## Runtime Constraints

- Not applicable. All affected files are Node.js CLI scripts (`*.mjs`) or GitHub Actions YAML files. No Next.js App Router, server actions, route handlers, edge/node runtime, or caching concerns apply.

## Validation Constraints

- Minimum required validation: `pnpm lint` must pass after every individual issue fix
- `pnpm typecheck` must pass after the `eslint.config.mjs` change (it is a `.mjs` file, not TypeScript, but ensure no config errors)
- No new unit or integration tests are required for script-level guards; the fixes are too simple to warrant test infrastructure
- Manual smoke test for path guard (Issue A): confirm that an invalid `DB_COMPOSE_FILE` value causes a clear error, not silent acceptance

---

## Explicitly Allowed Changes

| File                                | Change                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                      | Add `eslint-plugin-security` to `devDependencies`                                                                                                                                                        |
| `eslint.config.mjs`                 | Import and configure `eslint-plugin-security` rules globally for all JS/TS/MJS files                                                                                                                     |
| `scripts/compose-db-local.mjs`      | Add `assertPathWithinBase` guard for `DB_COMPOSE_FILE` path; add suppression comment for `existsSync(candidate)` false positive                                                                          |
| `scripts/e2e/load-env.mjs`          | Add `assertPathWithinBase(filePath, ROOT_DIR)` guard at start of `parseEnvFile`; add prototype-pollution key filter before `env[key] = value`; add key filter before `target[key] = value` in `applyEnv` |
| `scripts/e2e/run-scenario.mjs`      | Rename caught error to `_e` in `terminateProcesses` catch blocks; add documentation comment before `mkdirSync` call referencing upstream validation                                                      |
| `scripts/check-e2e-auth-env.mjs`    | Add suppression comments for five false-positive object injection findings                                                                                                                               |
| `scripts/check-env-consistency.mjs` | Add suppression comment for `effectiveEnv[key]` false positive                                                                                                                                           |
| `.github/workflows/*.yml` (all 12)  | Pin every `uses:` action reference to full 40-char commit SHA with version tag comment                                                                                                                   |

## Explicitly Forbidden Changes

- Do not modify any file under `src/`
- Do not change script logic beyond the minimum required for each fix
- Do not add new imports beyond what is needed (e.g., `assertPathWithinBase` is already available in `load-env.mjs`; for `compose-db-local.mjs` it must be inlined or imported locally)
- Do not change the behaviour of `loadScenarioEnv`, `applyEnv`, or `parseEnvFile` beyond adding guards
- Do not create a new shared utility file
- Do not add `eslint-disable-file` or file-level disables — only targeted line-level suppression with justification
- Do not use `@v4`, `@v5`, `@latest`, or any mutable tag format when pinning GitHub Actions

---

## Protected Invariants

- `parseEnvFile` must continue to return `{}` for non-existent files (no error thrown when the file is missing)
- `applyEnv` must continue to set `target[key] = value` for all legitimate env keys (prototype-polluting keys are the only ones filtered)
- `resolveScenarioDatabasePath` already validates via `assertPathWithinBase`; the new guard in `parseEnvFile` must not break the call chain
- The `terminateProcesses` function must continue to silently ignore `EPERM`/`ESRCH` errors from `process.kill` on already-exited PIDs
- All six callers that pass hardcoded `path.resolve(ROOT_DIR, ...)` paths to `loadFileIfExists` → `parseEnvFile` must continue to work without error after the new guard is added (all resolve within `ROOT_DIR`)

---

## Open Questions / Blocks

1. **SHA resolution for GitHub Actions:** Implementation agent must resolve the current commit SHA for each unique action tag at implementation time. Required for each:
   - `actions/checkout@v4` and `@v5`
   - `pnpm/action-setup@v4`
   - `actions/setup-node@v4` and `@v6`
   - `actions/upload-artifact@v4`
   - `actions/labeler@v5`
   - `treosh/lighthouse-ci-action@v12`
   - `actions/create-github-app-token@v2`
   - `chromaui/action@v15`
   - `kentaro-m/auto-assign-action@v2.0.1`
   - `gitleaks/gitleaks-action@v2`

2. **`assertPathWithinBase` in `compose-db-local.mjs`:** The function is defined in `scripts/e2e/load-env.mjs`. For `compose-db-local.mjs` it must be either inlined (preferred — avoids cross-script import coupling) or imported. Inline is preferred to keep blast radius low.

3. **`eslint-plugin-security` rule selection:** After install, which rules to enable? Recommendation: enable `security/detect-non-literal-fs-filename` and `security/detect-object-injection` for scripts; evaluate `security/detect-unsafe-regex` and others. False-positive rules (`detect-object-injection`) may need targeted suppressions immediately after enabling.
