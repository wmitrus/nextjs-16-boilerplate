# 02 - Security & Auth - Summary

## Task Context

- Task ID: 8c1599ca-52c3-418e-bdca-fef0919199ec
- Task Objective: Triage and remediate 17 HIGH static analysis findings in `scripts/` and `.github/workflows/`
- Current Run Scope: Security review of all 17 findings; classification and constraint derivation
- Status: COMPLETED
- Last Updated: 2026-03-25
- Related Control Artifacts:
  - `incident-intake.md`
  - `plan.md`

---

## Scope Handled

- auth surfaces reviewed: None — no auth logic is touched by any affected file
- authorization surfaces reviewed: None — these are developer tooling scripts and CI workflows
- trust-boundary questions in scope:
  - Trust boundary between env-var-sourced input and filesystem operations
  - Trust boundary between parsed `.env` file content and `process.env`
  - Trust boundary between CI workflow definitions and third-party GitHub Action code

---

## Inputs Reviewed

- code paths reviewed:
  - `scripts/compose-db-local.mjs` (full file)
  - `scripts/e2e/load-env.mjs` (full file)
  - `scripts/e2e/run-scenario.mjs` (full file)
  - `scripts/check-e2e-auth-env.mjs` (full file)
  - `scripts/check-env-consistency.mjs` (full file)
  - All `.github/workflows/*.yml` files (full audit)
- security/auth docs reviewed:
  - `docs/ai/general/02 - Security & Auth Agent.md` (canonical guards section)
  - `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- earlier task artifacts reviewed:
  - `incident-intake.md`

---

## Actions Performed

- identity flow tracing performed: N/A — no user identity flows involved
- authorization enforcement review performed: N/A — no authorization surfaces involved
- tenant / org context review performed: N/A — scripts are pre-auth tooling
- sensitive-data exposure review performed:
  - Reviewed whether env keys/values from `.env` file parsing could leak to logs or child processes
  - Reviewed whether path traversal could expose sensitive file content
  - Reviewed GitHub Actions trust surface for supply chain compromise

---

## Current-State Findings

### Finding 1 — REAL: Path Traversal via `DB_COMPOSE_FILE` env var (CWE-22) — SEVERITY: HIGH

- `scripts/compose-db-local.mjs:68`
- `process.env.DB_COMPOSE_FILE?.trim()` is used as `existsSync(explicitFile)` and later as the `-f` argument to `spawnSync` (compose command)
- No `assertPathWithinBase` guard exists
- An environment variable pointing to `/etc/shadow` or any other path outside the project would be silently accepted
- **Confirmed real risk.** The canonical pattern (`assertPathWithinBase`) is already implemented in `scripts/e2e/load-env.mjs` lines 7–23 and can be directly applied or imported.

### Finding 2 — FALSE POSITIVE: `COMPOSE_FILE_CANDIDATES` array in existsSync (CWE-22)

- `scripts/compose-db-local.mjs:77`
- All three values are hardcoded string literals in a `const` array at module scope
- Zero trust-boundary concern; scanner cannot prove static origin of the value
- **Confirmed false positive.** Suppression comment required.

### Finding 3 — PARTIALLY REAL: `parseEnvFile` has no point-of-use path guard (CWE-22) — SEVERITY: MEDIUM

- `scripts/e2e/load-env.mjs:17,21`
- Some callers (`getScenarioEnvPath`, `getVariantEnvPath`) validate via `assertPathWithinBase` before calling `loadFileIfExists`
- Six other callers pass hardcoded `path.resolve(ROOT_DIR, ...)` paths — these are safe today but the function offers no defence-in-depth
- Operator decision: add `assertPathWithinBase(filePath, ROOT_DIR)` inside `parseEnvFile` as a defensive-by-default guard
- **Partially real; defensive fix required.** The guard will accept all current call sites (all resolve within `ROOT_DIR`).

### Finding 4 — FALSE POSITIVE: pre-validated `mkdirSync` path (CWE-22)

- `scripts/e2e/run-scenario.mjs:318`
- `databasePath` is returned from `resolveScenarioDatabasePath()` which validates via `assertPathWithinBase` before returning
- `path.dirname(databasePath)` stays within `data/e2e`
- **Confirmed false positive.** Documentation comment required.

### Finding 5 — REAL: Prototype pollution risk in `parseEnvFile` and `applyEnv` (CWE-94) — SEVERITY: MEDIUM

- `scripts/e2e/load-env.mjs:41,91`
- Raw keys from parsed `.env` file content are written to a plain `{}` object and to `process.env`
- Keys like `__proto__`, `constructor`, or `prototype` from a crafted `.env` file would silently corrupt the object prototype or `process.env`
- While `.env` files are developer-controlled, defence-in-depth requires point-of-use key sanitization
- **Confirmed real risk.** Minimum fix: guard against prototype-polluting keys before assignment.

### Findings 6–10 — FALSE POSITIVES: Dynamic property access with statically-known keys (CWE-94)

- `check-env-consistency.mjs:44` — keys from `CLERK_REDIRECT_VARS` (hardcoded `const` array)
- `check-e2e-auth-env.mjs:54` — keys from `BASE_REQUIREMENTS` (hardcoded `const` array)
- `check-e2e-auth-env.mjs:265` — keys from a Set populated with hardcoded string literals
- `check-e2e-auth-env.mjs:297` — keys from a Set populated with hardcoded string literals
- `run-scenario.mjs:31` — numeric array index in a bounded `for` loop
- `check-e2e-auth-env.mjs:15` — numeric array index in a bounded `for` loop
- **All confirmed false positives.** Scanner cannot statically prove origin of dynamic property keys. Suppression comments required when `eslint-plugin-security` is added.

### Findings 11–12 — PARTIALLY REAL: Empty catch blocks in async function (CWE-390) — SEVERITY: LOW

- `scripts/e2e/run-scenario.mjs:196,210`
- Empty catch blocks in `terminateProcesses` intentionally discard `EPERM`/`ESRCH` errors from `process.kill` on already-exited PIDs
- Behaviour is correct but the discard intent is not explicit at language level
- Project convention: `caughtErrorsIgnorePattern: '^_'` in `@typescript-eslint/no-unused-vars` provides the idiom for intentional discards
- **Partially real.** Rename caught error to `_e` to signal intentional discard per project convention.

### Findings 13–14 (and full audit extension) — REAL: GitHub Actions unpinned (CWE-829) — SEVERITY: HIGH

- Originally flagged: `pnpm/action-setup@v4` in `e2e-matrix.yml` and `db-tests.yml`
- Full audit (operator-approved scope expansion) reveals: **every single `uses:` reference across all 12 workflow files uses a mutable version tag, not a full commit SHA**
- Affected actions (unique):
  - `actions/checkout` (@v4 in 10 files, @v5 in deployChromatic.yml)
  - `pnpm/action-setup@v4` (in 7 files)
  - `actions/setup-node` (@v4 in 9 files, @v6 in deployChromatic.yml)
  - `actions/upload-artifact@v4` (in 2 files)
  - `actions/labeler@v5` (label.yml)
  - `treosh/lighthouse-ci-action@v12` (lighthouse.yml)
  - `actions/create-github-app-token@v2` (release.yml)
  - `chromaui/action@v15` (deployChromatic.yml)
  - `kentaro-m/auto-assign-action@v2.0.1` (auto-assign.yml)
  - `gitleaks/gitleaks-action@v2` (security-scan.yml)
- **All confirmed real supply chain risk.** Must resolve SHA for each unique action and pin all occurrences.

---

## Trust Boundary Assessment

- where identity is established: N/A — no user identity involved
- where authorization is enforced: N/A — these are pre-auth tooling scripts
- where tenant or org context is derived: N/A
- what claims or inputs are trusted:
  - **Not trusted (must validate):** `process.env.DB_COMPOSE_FILE` — env-var-sourced path
  - **Not trusted (must filter):** keys parsed from `.env` file content
  - **Not trusted (must pin):** third-party GitHub Action version tags

---

## Sensitive Data And Exposure Notes

- logging / telemetry review: No sensitive data logged in affected scripts; `applyEnv` writes to `process.env` which may contain secrets, but no extra logging introduced
- response exposure review: N/A — these are CLI scripts
- client exposure review: N/A — scripts run in Node.js, not in browser
- cache exposure review: N/A

---

## Security Decisions / Constraints

1. **`eslint-plugin-security` must be installed and configured globally** in `eslint.config.mjs` as the first implementation step — this is a prerequisite for all subsequent code changes (operator decision confirmed)
2. **Issue C: `parseEnvFile` must gain a defensive guard** — `assertPathWithinBase(filePath, ROOT_DIR)` added as the first operation in the function (operator decision confirmed)
3. **Issue H scope: all workflow files** — pin every `uses:` reference to a full commit SHA, not only the two originally flagged files (operator decision confirmed)
4. **Prototype-polluting keys must be filtered** before assignment in `parseEnvFile` and `applyEnv`
5. **False positives must receive suppression comments with explicit justification** rather than silent discard
6. **No changes to `src/`** — all changes are confined to `scripts/` and `.github/workflows/`

- approved controls or constraints:
  - `assertPathWithinBase` guard in `parseEnvFile` and for `DB_COMPOSE_FILE`
  - Prototype-polluting key filter (`__proto__`, `constructor`, `prototype`) in `parseEnvFile` and `applyEnv`
  - SHA pinning for all GitHub Actions `uses:` references
  - `_e` rename for intentional empty catch blocks
  - Suppression comments with justification for confirmed false positives
- rejected directions:
  - Do not refactor `parseEnvFile` beyond adding the guard
  - Do not add `assertSafeLocalUrl` to `compose-db-local.mjs` — it makes HTTP calls only via `spawnSync` to the compose binary, not via `fetch`
  - Do not centralize env-file parsing logic into a new shared module — out of scope
- required enforcement points:
  - `eslint-plugin-security` global config (enforced via pre-commit + pre-push hooks automatically once added to `eslint.config.mjs`)
  - Path guard at `parseEnvFile` entry
  - Key filter at `env[key] = value` and `target[key] = value` assignments

---

## Artifact Synchronization

- `plan.md` updates: Security Review step checkbox to be ticked by master agent after this artifact is confirmed
- `intake.md` updates: Open questions resolved by operator; no further changes needed
- `implementation-plan.md` updates: Not yet created; Constraints Summary and Validation Strategy steps will feed it
- specialist artifact updates: This file is the output

---

## Open Questions / Blockers

- unresolved questions:
  - The SHA lookup for each GitHub Action must be done at implementation time by fetching the latest commit SHA for each `@vX` tag from GitHub. This requires network access or a tool like `pin-github-action`. The implementation agent must resolve SHAs manually for each action.
- blockers: None
- evidence still needed: SHA values for all unique GitHub Actions tags

---

## Handoff Notes

- what the next agent should rely on:
  - All 17 findings classified (real / false positive / partially real)
  - Implementation order confirmed: `eslint-plugin-security` first, then Chapter 1 (real issues), then Chapter 2 (partial), then Chapter 3 (false positives)
  - Full audit of unpinned actions: 10 unique action identities across 12 workflow files
  - Canonical `assertPathWithinBase` pattern available in `scripts/e2e/load-env.mjs` lines 7–23
  - Project convention for intentional error discard: `_e` naming (per `caughtErrorsIgnorePattern: '^_'`)
- what should not be re-decided without new evidence:
  - Classification of false positives (B, D, F)
  - Use of `assertPathWithinBase` as the canonical path guard pattern
  - Scope of Issue H (all workflow files, all actions)
  - `eslint-plugin-security` as a prerequisite step
- recommended next specialist or step: Constraints Summary (Runtime Review and Architecture Review are not applicable — incident is confined to `scripts/` and CI YAML files)

---

## Update Log

### Update Entry

- Date: 2026-03-25
- Trigger: Initial security review following Incident Intake completion
- Summary of change: Full classification of all 17 findings; trust boundary assessment; security constraints derived; operator decisions recorded
- Sections refreshed: All sections
