# 05 - Validation Strategy - Summary

## Task Context

- Task ID: 8c1599ca-52c3-418e-bdca-fef0919199ec
- Task Objective: Remediate 17 HIGH static analysis findings in `scripts/` and `.github/workflows/`
- Current Run Scope: Define minimum validation required per issue; no new test infrastructure
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-03-25
- Related Control Artifacts:
  - `incident-intake.md`
  - `02 - Security & Auth - Summary.md`
  - `constraints.md`

---

## Scope Handled

- change surfaces assessed:
  - `eslint.config.mjs` + `package.json` (eslint-plugin-security install)
  - `scripts/compose-db-local.mjs` (Issue A path guard + Issue B suppression)
  - `scripts/e2e/load-env.mjs` (Issue C path guard + Issue E prototype filter)
  - `scripts/e2e/run-scenario.mjs` (Issue D comment + Issue G catch rename)
  - `scripts/check-e2e-auth-env.mjs` (Issue F suppressions)
  - `scripts/check-env-consistency.mjs` (Issue F suppression)
  - `.github/workflows/*.yml` (Issue H — all 12 files, all actions)
- validation questions in scope:
  - Does `pnpm lint` pass cleanly after each change?
  - Does the path guard in `parseEnvFile` correctly allow all existing call sites?
  - Does the path guard for `DB_COMPOSE_FILE` correctly reject out-of-bounds paths?
  - Does the prototype filter correctly pass all legitimate env keys?
  - Are SHA-pinned actions syntactically valid YAML?
- excluded validation areas:
  - E2E test runs (no runtime behavior is changed)
  - Vitest unit tests (no application logic is changed)
  - `pnpm build` (no `src/` code is changed)
  - Playwright auth flows (not touched)

---

## Inputs Reviewed

- code paths reviewed:
  - All affected scripts (full file reads in intake phase)
  - `eslint.config.mjs` (current rule structure confirmed)
  - `package.json` (devDependencies confirmed; `eslint-plugin-security` absent)
- tests / configs / workflows reviewed:
  - `.husky/pre-commit` and `.husky/pre-push` (lint is already wired into hooks)
  - All 12 `.github/workflows/*.yml` files (action audit)
- earlier task artifacts reviewed:
  - `incident-intake.md`, `02 - Security & Auth - Summary.md`, `constraints.md`

---

## Actions Performed

- validation posture review performed: confirmed that no new test infrastructure is warranted
- risk analysis performed: assessed what could break from each guard addition
- test-level recommendations prepared: lint-only validation for code fixes; SHA verification for CI YAML
- command recommendations prepared: see Validation Commands section

---

## Current-State Findings

- Confirmed:
  - `pnpm lint` is the primary quality gate for all script changes
  - `eslint-plugin-security` is not installed — this is the root cause of scanner findings not being caught by ESLint
  - Pre-commit runs `eslint --fix` + `prettier` on JS/TS files (via `lint-staged`); pre-push runs `pnpm typecheck`
  - Adding `eslint-plugin-security` globally means the pre-commit hook will automatically enforce it from the next commit onward
- Risks:
  - The prototype-pollution key filter in `parseEnvFile` could silently drop legitimate env keys if the filter is too broad; must be limited exactly to `__proto__`, `constructor`, `prototype`
  - `assertPathWithinBase` added to `parseEnvFile` could break a call site that resolves outside `ROOT_DIR` — unlikely given all six hardcoded sites are within ROOT_DIR but must be verified
  - SHA pinning in YAML could introduce typos or wrong SHAs; must be verified against public GitHub repository tags
- Drift:
  - None detected between docs and code for affected files

---

## Validation-Risk Assessment

- primary risks:
  - Path guard regression in `parseEnvFile` blocking legitimate `.env.local` / `.env.e2e.local` reads (low — all hardcoded paths are within ROOT_DIR)
  - Prototype filter blocking an env key named `constructor` or `__proto__` from a legitimate `.env` file (negligible — no legitimate env key should use these names)
  - SHA pin typos causing workflow failures in CI (medium — requires careful lookup and copy)
- confidence gaps:
  - Cannot confirm SHA lookup values without live network access at implementation time
  - Cannot run `pnpm lint` against the changes without actually making them
- over-validation or under-validation concerns:
  - No unit tests are needed — the guards are simple one-liner conditionals on CLI scripts
  - E2E tests are not appropriate here — no user-facing behavior is changed
  - Adding tests would add more complexity than the fixes themselves

---

## Recommended Validation Scope

- minimum required validation:
  1. `pnpm lint` passes after each individual issue fix (run after each step)
  2. `pnpm typecheck` passes after `eslint.config.mjs` change
  3. Manual dry-run of `scripts/compose-db-local.mjs` with an invalid `DB_COMPOSE_FILE` path to confirm the guard throws correctly
  4. Visual inspection of all SHA-pinned workflow YAML files to confirm syntax is correct
  5. Confirm all six existing `parseEnvFile` call sites still resolve within `ROOT_DIR` before adding the guard

- optional additional validation:
  - Run `node scripts/check-env-consistency.mjs` locally to confirm the script still operates correctly after suppressions
  - Run `node scripts/check-e2e-auth-env.mjs --scenario single` in a dev environment to confirm no regression

- validation explicitly not required:
  - Vitest unit tests — no application logic changed
  - Playwright E2E tests — no runtime behavior changed
  - `pnpm build` — no `src/` code changed
  - Integration tests — not applicable

---

## Validation Commands / Checks

Run after **each individual issue fix** (not once at the end):

```bash
pnpm lint
```

Run after the `eslint.config.mjs` change:

```bash
pnpm typecheck
```

Run after Issue A (path guard for `DB_COMPOSE_FILE`) to manually test the guard:

```bash
DB_COMPOSE_FILE=../../../../etc/passwd node scripts/compose-db-local.mjs up -d 2>&1 | head -5
# Expected: error mentioning "file path escapes" or similar, process.exit(1)
```

Run after Issue C (path guard in `parseEnvFile`) to confirm existing call sites still work:

```bash
node -e "
import('./scripts/e2e/load-env.mjs').then(m => {
  const env = m.loadScenarioEnv({ scenario: 'single', includeLocal: false });
  console.log('OK — keys loaded:', Object.keys(env).length);
}).catch(e => { console.error('FAIL', e.message); process.exit(1); });
"
```

After Issue H SHA pinning — visually confirm each `uses:` line has the format:

```yaml
uses: owner/repo@<40-char-hex-sha> # vX
```

- environment prerequisites: Node.js 24, pnpm installed, project dependencies installed
- expected evidence:
  - `pnpm lint` exits 0 after each step
  - `pnpm typecheck` exits 0 after `eslint.config.mjs` change
  - Guard test for Issue A exits non-zero with clear error message
  - `loadScenarioEnv` smoke test exits 0
  - All workflow YAML files have syntactically valid SHA pins

---

## Artifact Synchronization

- `plan.md` updates: Validation Strategy step checkbox to be ticked by master agent
- `intake.md` updates: No further changes needed
- `implementation-plan.md` updates: Not yet created; Implementation agent will produce it
- specialist artifact updates: This file is the output

---

## Open Questions / Blockers

- unresolved questions: None for validation strategy
- blockers: SHA resolution for GitHub Actions (requires network access at implementation time)
- dependencies on architecture / security / runtime decisions: All resolved — see `constraints.md`

---

## Handoff Notes

- what the next agent should rely on:
  - Validation is lint-first: `pnpm lint` after each step is the primary gate
  - No new tests required; manual smoke tests for path guard suffice
  - SHA pins must be traceable to public GitHub repo commits
  - The prototype filter must be exactly `['__proto__', 'constructor', 'prototype']` — no broader
- what should not be re-decided without new evidence:
  - No unit tests needed for these fixes
  - E2E tests are out of scope
- recommended next specialist or step: Implementation Agent — proceed chapter by chapter with operator approval before each issue

---

## Update Log

### Update Entry

- Date: 2026-03-25
- Trigger: Initial validation strategy definition after Security Review and Constraints Summary
- Summary of change: Defined minimum validation scope; identified lint as primary gate; no new test infrastructure needed
- Sections refreshed: All sections
