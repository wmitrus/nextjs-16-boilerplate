# Incident Intake — 17 High-Severity Static Analysis Findings

## Title

Security Scanner Remediation: 17 HIGH findings across `scripts/` and `.github/workflows/`

---

## Objective

Triage, design, and resolve 17 HIGH-severity static analysis findings across Node.js tooling scripts and GitHub Actions workflows. For each finding: verify whether a matching ESLint rule exists, establish why it is not catching the problem in this project, and apply the minimum safe fix. Implementation proceeds one issue at a time with explicit operator approval before each step.

---

## Problem Statement

A static analysis scanner reported 17 HIGH findings across five files:

- `scripts/e2e/run-scenario.mjs`
- `scripts/e2e/load-env.mjs`
- `scripts/check-e2e-auth-env.mjs`
- `scripts/check-env-consistency.mjs`
- `scripts/compose-db-local.mjs`
- `.github/workflows/e2e-matrix.yml`
- `.github/workflows/db-tests.yml`

Findings span three categories: **File Access** (non-literal path arguments), **Object Injection** (dynamic property access), and **Insecure Modules** (unpinned GitHub Actions). Not all 17 findings represent real vulnerabilities — several are scanner false positives triggered by patterns that already have upstream validation guards. The design phase must distinguish real risks from false positives before any code change is made.

**Current ESLint gap:** The project has no `eslint-plugin-security` installed and no security-oriented rules configured for `.mjs` script files. The scripts block in `eslint.config.mjs` only enforces `prettier/prettier`, `semi`, and `importX/order`. GitHub Actions YAML files have no linting coverage at all.

---

## Scope

- Triage and classify all 17 findings as: real risk / false positive / partially real
- For each finding: identify the relevant ESLint rule and root cause of why it is not working
- Apply minimum safe fixes for real and partially-real issues
- Suppress or document false positives with explicit justification
- No changes to `src/` application code
- No changes to test infrastructure beyond scripts touched by findings

---

## Out Of Scope

- Broad `eslint-plugin-security` adoption across all project files
- Refactoring script architecture beyond the minimum safe fix
- Changes to Playwright specs, Vitest tests, or CI jobs beyond the two YAML files affected
- Changes to `src/proxy.ts`, auth flows, or application modules

---

## Execution Control

`manual-handoff` — Operator must confirm before each implementation step. Do not proceed to the next issue without explicit approval.

---

## Issue Design: 17 Findings Grouped into 8 Logical Issues

### A. CWE-22 — Path Traversal: env-var-sourced compose file path (REAL)

**Scanner findings (1):**

- `scripts/compose-db-local.mjs:68` — `existsSync(explicitFile)` where `explicitFile = process.env.DB_COMPOSE_FILE?.trim()`

**Root cause:** `DB_COMPOSE_FILE` is read directly from the environment with no validation that the resulting path stays within the repository root or a known safe directory. An attacker or misconfigured environment could point this at arbitrary filesystem locations (e.g., `/etc/passwd`).

**ESLint rule:** `security/detect-non-literal-fs-filename` from `eslint-plugin-security`.

**Why not catching it:** `eslint-plugin-security` is not installed in this project. No security rules are configured for `.mjs` files in `eslint.config.mjs`.

**Fix direction:** Apply `assertPathWithinBase(path.resolve(explicitFile), process.cwd())` before passing `explicitFile` to `existsSync`. Import or inline the guard from the existing canonical pattern in `docs/ai/general/02 - Security & Auth Agent.md`.

---

### B. CWE-22 — False Positive: hardcoded-array candidate paths (FALSE POSITIVE)

**Scanner findings (1):**

- `scripts/compose-db-local.mjs:77` — `existsSync(candidate)` inside `COMPOSE_FILE_CANDIDATES.find(...)`

**Root cause:** `COMPOSE_FILE_CANDIDATES` is a hardcoded `const` array of three literal strings: `'compose.yml'`, `'podman-compose.yml'`, `'docker-compose.yml'`. The variable `candidate` holds a value derived entirely from this literal array. The scanner cannot statically prove this and flags the dynamic argument.

**ESLint rule:** Same `security/detect-non-literal-fs-filename` — would also flag this as a false positive.

**Why not catching it:** Not installed.

**Fix direction:** No code change needed. Add an inline `// eslint-disable-next-line security/detect-non-literal-fs-filename` suppression with a justification comment explaining that values are statically typed to the three known literal strings. This makes the rationale explicit and suppresses future scanner noise when the rule is eventually added.

---

### C. CWE-22 — Validation Depth Gap: `parseEnvFile` accepts unguarded paths (PARTIALLY REAL)

**Scanner findings (2):**

- `scripts/e2e/load-env.mjs:17` — `fs.existsSync(filePath)` in `parseEnvFile`
- `scripts/e2e/load-env.mjs:21` — `fs.readFileSync(filePath, 'utf8')` in `parseEnvFile`

**Root cause:** `parseEnvFile` is a general-purpose helper that accepts any `filePath`. Some call sites validate paths upstream via `assertPathWithinBase` (the `getScenarioEnvPath` / `getVariantEnvPath` paths). However, the six hardcoded `path.resolve(ROOT_DIR, ...)` call sites do not pass through `assertPathWithinBase` before reaching `parseEnvFile`. The validation gap is real in the sense that `parseEnvFile` offers no point-of-use protection: a future new call site could bypass the invariant silently.

**ESLint rule:** `security/detect-non-literal-fs-filename` — not installed.

**Why not catching it:** Not installed.

**Fix direction:** Add `assertPathWithinBase(filePath, ROOT_DIR)` as the first line of `parseEnvFile`. This is already available in the same file. The hardcoded call sites are all within `ROOT_DIR`, so the guard will pass them without change. This makes `parseEnvFile` safe by default regardless of future call sites. Alternatively, add an explanatory comment documenting why the hardcoded call sites are safe and suppress the false-positive lines only — operator to decide preferred approach.

---

### D. CWE-22 — False Positive: pre-validated path passed to `mkdirSync` (FALSE POSITIVE)

**Scanner findings (1):**

- `scripts/e2e/run-scenario.mjs:318` — `fs.mkdirSync(path.dirname(databasePath), { recursive: true })`

**Root cause:** `databasePath` is returned by `resolveScenarioDatabasePath()`, which internally calls `assertPathWithinBase(resolvedPath, path.resolve(ROOT_DIR, 'data/e2e'))` before returning. The scanner cannot follow the validation through the function call boundary and flags the dynamic argument.

**ESLint rule:** `security/detect-non-literal-fs-filename` — not installed.

**Why not catching it:** Not installed.

**Fix direction:** No code change needed. Add a comment at the call site documenting the upstream validation chain (`resolveScenarioDatabasePath` → `assertPathWithinBase`). Optionally add a suppression comment if `eslint-plugin-security` is later added.

---

### E. CWE-94 — Prototype Pollution Risk: env file content written to object and `process.env` (REAL)

**Scanner findings (2):**

- `scripts/e2e/load-env.mjs:41` — `env[key] = value` in `parseEnvFile` (building env object from file content)
- `scripts/e2e/load-env.mjs:91` — `target[key] = value` in `applyEnv` (writing to `process.env`)

**Root cause:** Keys are parsed directly from `.env` file content. A crafted `.env` file could include `__proto__`, `constructor`, or `toString` as keys. Writing these to a plain object literal (`{}`) or to `process.env` could corrupt the object prototype chain or pollute `process.env` in unexpected ways. While the `.env` files are developer-controlled, the canonical security standard requires point-of-use key sanitization.

**ESLint rule:** `security/detect-object-injection` from `eslint-plugin-security`.

**Why not catching it:** `eslint-plugin-security` is not installed. Even if installed, `detect-object-injection` is known to produce high false-positive rates and is often suppressed broadly — the real fix is code-level sanitization.

**Fix direction:** In `parseEnvFile`, guard before `env[key] = value`:

```js
if (Object.prototype.hasOwnProperty.call(Object.prototype, key)) continue;
```

Or more simply: skip any key that matches `/^(__proto__|constructor|prototype)$/`. In `applyEnv`, apply the same guard before `target[key] = value`. This is a minimal safe fix with no behavioral change for legitimate keys.

---

### F. CWE-94 — False Positives: hardcoded-key dynamic property access (FALSE POSITIVES)

**Scanner findings (5):**

- `scripts/check-env-consistency.mjs:44` — `effectiveEnv[key]` where `key` ∈ `CLERK_REDIRECT_VARS` (hardcoded `const` array)
- `scripts/check-e2e-auth-env.mjs:54` — `process.env[key]` where `key` ∈ `BASE_REQUIREMENTS` (hardcoded `const` array)
- `scripts/check-e2e-auth-env.mjs:265` — `REQUIRED_GROUPS[groupName]` where `groupName` ∈ Set populated from hardcoded strings
- `scripts/check-e2e-auth-env.mjs:297` — `REQUIRED_ORGS[orgName]` where `orgName` ∈ Set populated from hardcoded strings
- `scripts/e2e/run-scenario.mjs:31` — `rest[index]` — numeric array index in a bounded for loop
- `scripts/check-e2e-auth-env.mjs:15` — `argv[index]` — numeric array index in a bounded for loop

**Root cause:** `security/detect-object-injection` triggers on all dynamic bracket-notation property accesses regardless of whether the keys are statically known. Numeric array access and iteration over hardcoded sets are idiomatic JavaScript patterns, not injection risks.

**ESLint rule:** `security/detect-object-injection` — not installed.

**Why not catching it:** Not installed. If installed without per-rule configuration, it would flag all six of these and require per-line suppressions.

**Fix direction:** No code changes. These findings represent scanner noise. Document each one explicitly. When `eslint-plugin-security` is adopted, these will need `// eslint-disable-next-line security/detect-object-injection` suppressions with justification comments.

---

### G. CWE-390 — Empty catch blocks in async function (PARTIALLY REAL)

**Scanner findings (2):**

- `scripts/e2e/run-scenario.mjs:196` — `for (const pid of pids)` loop in `terminateProcesses`
- `scripts/e2e/run-scenario.mjs:210` — `try { process.kill(pid, 'SIGTERM') } catch { }` — empty catch

**Root cause:** The two catch blocks in `terminateProcesses` are intentionally empty (`// Ignore already-exited processes.`). The scanner treats all empty or comment-only catch blocks in async functions as "unhandled errors." The concern is partially valid: empty catch blocks silence errors that could indicate unexpected conditions, making debugging harder. However, in this case the pattern is correct — `process.kill` throws `EPERM`/`ESRCH` for already-exited PIDs, which should be silently swallowed.

**ESLint rule:** There is no dedicated ESLint rule for empty catch blocks in async functions. Closest candidates:

- `no-empty` (built-in ESLint) — flags empty block statements, but allows blocks with a comment. The current blocks have a comment, so `no-empty` would NOT flag them.
- `@typescript-eslint/no-floating-promises` — unrelated; targets unawaited promises.
- The `.mjs` files are not covered by any TypeScript ESLint rules in the current config.

**Why not catching it:** The scripts block in `eslint.config.mjs` (`files: ['**/*.mjs']`) has no `no-empty` rule and no TypeScript-ESLint rules. Even if `no-empty` were added, the comment inside the catch body exempts it.

**Fix direction:** Two options (operator to choose):

1. Rename the caught error to `_e` or `_err` to explicitly signal the intentional discard, which is a widely recognised convention: `catch (_e) { /* already-exited process */ }`. This documents intent at the language level.
2. Add minimal logging: `catch { /* ignore EPERM/ESRCH for already-exited PIDs */ }` — already present; no change needed, just suppress the scanner finding.

Preferred: option 1 (use `_e` naming) because it makes the intentional discard explicit and matches the project's `caughtErrorsIgnorePattern: '^_'` convention already configured in `@typescript-eslint/no-unused-vars`.

---

### H. CWE-829 — Supply Chain: GitHub Actions unpinned to full-length commit SHA (REAL)

**Scanner findings (2):**

- `.github/workflows/e2e-matrix.yml:18` — `uses: pnpm/action-setup@v4`
- `.github/workflows/db-tests.yml:30` — `uses: pnpm/action-setup@v4`

**Root cause:** `pnpm/action-setup@v4` references a mutable version tag. If the tag is force-pushed to point at a different commit (malicious or accidental), CI would silently execute the new code with full runner access. Pinning to a full-length commit SHA (`@<40-char-sha>`) makes the reference immutable.

**ESLint rule:** Not an ESLint domain. GitHub Actions YAML files are not covered by ESLint. Relevant tooling:

- `actionlint` — GitHub Actions–specific linter; not installed in this project
- `zizmor` — security scanner for GitHub Actions
- Dependabot `update-config` with `pin-actions: true`
- `step-security/harden-runner` action — runtime pinning aid

**Why not catching it:** No `actionlint` or GitHub Actions linter is installed. No Dependabot config for Actions pinning exists. The YAML-specific ESLint plugin (`eslint-plugin-jsonc`) only covers JSON/JSONC files, not YAML.

**Fix direction:** Look up the current full-length commit SHA for `pnpm/action-setup@v4` and pin both workflow files to `uses: pnpm/action-setup@<sha> # v4`. Also check all other `@v4` or short-tag action references across all `.github/workflows/*.yml` files for the same issue.

---

## Requirements Package

| #   | Issue                                           | Classification | Files                                  | Real Risk |
| --- | ----------------------------------------------- | -------------- | -------------------------------------- | --------- |
| A   | Path traversal — env-var compose file path      | REAL           | `compose-db-local.mjs:68`              | Yes       |
| B   | False positive — hardcoded array in existsSync  | FALSE POSITIVE | `compose-db-local.mjs:77`              | No        |
| C   | Validation depth gap — parseEnvFile no guard    | PARTIALLY REAL | `load-env.mjs:17,21`                   | Partial   |
| D   | False positive — pre-validated mkdirSync path   | FALSE POSITIVE | `run-scenario.mjs:318`                 | No        |
| E   | Prototype pollution — env file key assignment   | REAL           | `load-env.mjs:41,91`                   | Yes       |
| F   | False positives — hardcoded-key property access | FALSE POSITIVE | 5 findings across 3 files              | No        |
| G   | Empty catch in async — terminateProcesses       | PARTIALLY REAL | `run-scenario.mjs:196,210`             | Partial   |
| H   | Unpinned GitHub Actions — pnpm/action-setup     | REAL           | `e2e-matrix.yml:18`, `db-tests.yml:30` | Yes       |

---

## Implementation Plan

> **Rule:** Operator must approve before proceeding to each item. Do not implement more than one item per approval.

### Chapter 1 — Real Vulnerabilities (must fix)

- [ ] **1.1 Issue A — Add `assertPathWithinBase` guard for `DB_COMPOSE_FILE` env-var path in `compose-db-local.mjs`**
  - File: `scripts/compose-db-local.mjs`
  - Guard: resolve the path, validate it starts within `process.cwd()`
  - ESLint: note absence of `security/detect-non-literal-fs-filename`

- [ ] **1.2 Issue E — Add prototype pollution guard in `parseEnvFile` and `applyEnv` in `load-env.mjs`**
  - File: `scripts/e2e/load-env.mjs`
  - Guard: skip keys matching `__proto__`, `constructor`, `prototype`
  - ESLint: note absence of `security/detect-object-injection`

- [ ] **1.3 Issue H — Pin `pnpm/action-setup` to full commit SHA in both workflow files**
  - Files: `.github/workflows/e2e-matrix.yml`, `.github/workflows/db-tests.yml`
  - Action: resolve current SHA for `pnpm/action-setup@v4`, pin both occurrences
  - ESLint: confirm `actionlint` is not installed; no ESLint rule covers YAML actions

### Chapter 2 — Partially Real Issues (fix or suppress with justification)

- [ ] **2.1 Issue C — Decide: add `assertPathWithinBase` inside `parseEnvFile` OR document and suppress**
  - File: `scripts/e2e/load-env.mjs`
  - Operator decision required before implementation

- [ ] **2.2 Issue G — Rename caught error to `_e` in `terminateProcesses` empty catch blocks**
  - File: `scripts/e2e/run-scenario.mjs`
  - Makes intentional discard explicit per project convention

### Chapter 3 — False Positives (suppress with justification)

- [ ] **3.1 Issue B — Add suppression comment for `compose-db-local.mjs:77` hardcoded array**
  - File: `scripts/compose-db-local.mjs`
  - Comment must state: values are statically typed to three known literal strings

- [ ] **3.2 Issue D — Add documentation comment for `run-scenario.mjs:318` pre-validated path**
  - File: `scripts/e2e/run-scenario.mjs`
  - Comment must reference `resolveScenarioDatabasePath` → `assertPathWithinBase` chain

- [ ] **3.3 Issue F — Add suppression comments for five false-positive object injection findings**
  - Files: `check-env-consistency.mjs:44`, `check-e2e-auth-env.mjs:54,265,297`, `run-scenario.mjs:31`, `check-e2e-auth-env.mjs:15`
  - Each comment must state why the key is safe

### Chapter 4 — ESLint Coverage Gap (post-fix consideration)

- [ ] **4.1 Document the absence of `eslint-plugin-security` for `.mjs` script files**
  - The security rules that would catch Issues A–F are: `security/detect-non-literal-fs-filename`, `security/detect-object-injection`
  - Root cause confirmed: `eslint-plugin-security` is not installed; `.mjs` rule block has no security rules
  - Operator to decide: add `eslint-plugin-security` to dev dependencies and enable for `scripts/**/*.mjs` as a follow-up task (out of scope for this incident)

- [ ] **4.2 Document the absence of `actionlint` / GitHub Actions linter**
  - Root cause confirmed: no `actionlint`, no Dependabot config for actions pinning
  - Operator to decide: add Dependabot config for Actions pinning as a follow-up task

---

## Verification Sources

- `docs/ai/general/02 - Security & Auth Agent.md` — canonical `assertPathWithinBase` and `assertSafeLocalUrl` patterns
- `scripts/e2e/load-env.mjs` — existing `assertPathWithinBase` implementation (lines 7–23)
- `eslint.config.mjs` — confirms `eslint-plugin-security` is not installed and `.mjs` rule block
- `package.json` devDependencies — confirms no `eslint-plugin-security` entry
- GitHub: `pnpm/action-setup` releases page for current SHA of `v4` tag

---

## Constraints / Assumptions

- **Architecture constraint:** Changes are confined to `scripts/` and `.github/workflows/`. No `src/` application code is touched.
- **Security constraint:** The canonical `assertPathWithinBase` pattern (resolve, normalize, `startsWith(base + sep)`) must be used for path validation, matching the existing implementation in `load-env.mjs`.
- **Script constraint:** Scripts are Node.js `.mjs` (ESM) files; no TypeScript ESLint rules apply to them.
- **Assumption:** The `.env` files read by `load-env.mjs` are developer-controlled. The prototype pollution fix is a defence-in-depth measure, not a primary attack vector defence.
- **Assumption:** `pnpm/action-setup@v4` is the only unpinned action that the scanner flagged. Other workflows should be audited for the same pattern as a follow-up.
- **Execution control:** Manual handoff. Operator approves each implementation step before proceeding.

---

## Open Questions

1. **Issue C decision:** Should `parseEnvFile` gain an internal `assertPathWithinBase(filePath, ROOT_DIR)` guard (stronger, defensive-by-default), or should call sites remain responsible and the function just receive suppression comments? Operator must decide before step 2.1.

2. **Issue H scope:** Should all GitHub Actions workflow files be audited for unpinned actions in this task, or only the two flagged files? Recommend full audit while the change is being made.

3. **`eslint-plugin-security` adoption:** Is adding `eslint-plugin-security` for `scripts/**/*.mjs` in scope for this incident, or a separate follow-up ticket?

4. **`actionlint` / Dependabot pinning:** Is adding `actionlint` to the pre-push hook or CI in scope for this incident, or a separate task?

---

## Evidence Expectations

- Each implemented fix must be verified with `pnpm lint` passing (no ESLint errors introduced)
- `pnpm typecheck` must pass for TypeScript files (scripts are `.mjs`, so this only applies to any type-adjacent changes)
- Path guard in Issue A must be manually verified with a test call using a path outside `cwd()`
- GitHub Actions SHA pins must be traceable to the public `pnpm/action-setup` repository tag

---

## Recommended Next Action

**Pause here for operator review of the design.**

Before any implementation begins, the operator must:

1. Confirm the issue classification (real / false positive / partially real) for each group
2. Answer the open questions (particularly Issue C approach and Issue H scope)
3. Approve the start of **Chapter 1, Step 1.1** (Issue A — compose-db-local.mjs path guard)

Do not proceed to implementation without explicit operator confirmation.
