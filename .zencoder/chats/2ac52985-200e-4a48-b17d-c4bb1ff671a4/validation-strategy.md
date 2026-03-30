# Validation Review

## Task

Validate the fix for 4 CRITICAL Codacy security findings in `scripts/e2e/`:

- CWE-22 path traversal in `load-env.mjs` (lines 17, 21) and `run-scenario.mjs` (line 318)
- CWE-918 SSRF in `run-scenario.mjs` (line 211)

## Mode

Change Validation

## Validation Objective

Confirm that:

1. The guard functions produce correct behavior for valid inputs (no regression)
2. The guard functions throw for invalid/traversal inputs (security behavior confirmed)
3. TypeScript/lint passes
4. The Codacy pattern is resolved (guards at point of use)

---

## Current Validation Surfaces

| Surface             | Exists                                                       |
| ------------------- | ------------------------------------------------------------ |
| Unit tests (Vitest) | Not for `scripts/e2e/` — these scripts lack unit tests       |
| Integration tests   | Not applicable                                               |
| E2E tests           | Not applicable (these are the E2E runner scripts themselves) |
| Storybook/Vitest    | Not applicable                                               |
| Lint (ESLint)       | **Yes** — `pnpm lint` covers `scripts/`                      |
| Typecheck (tsc)     | **Yes** — `pnpm typecheck`                                   |
| Architecture lint   | Not applicable (scripts, not src/)                           |
| Dependency checks   | Not applicable                                               |
| CI workflows        | `pr-validation.yml` runs typecheck + lint                    |

---

## Risk Areas

| Risk                                                                 | Level                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| Path traversal regression (guard too aggressive, breaks valid paths) | Low — allowlists upstream already constrain valid inputs       |
| Path traversal not caught (guard too weak)                           | Medium — must verify prefix check handles both separator forms |
| SSRF guard rejecting valid localhost variants                        | Low — must cover `localhost`, `127.0.0.1`, `::1`               |
| Guard helper throws in valid scenario                                | Low                                                            |
| Lint failures from code changes                                      | Low                                                            |

---

## Validation-Risk Assessment

Current validation is **too weak** for these security guard functions specifically:

- No unit tests exist for `scripts/e2e/` helpers
- Security-sensitive guard behavior has zero automated test coverage

However, given that:

- These scripts are not application code
- Inputs are validated upstream against allowlists (SCENARIO_NAMES, VARIANT_NAMES)
- The guard functions use only standard Node.js `path` and `URL` built-ins
- The fix is well-understood canonical patterns

Lightweight validation is acceptable for this specific change. A full unit test suite for E2E runner helpers is optional, not mandatory.

---

## Minimum Required Validation

1. **`pnpm typecheck`** — must pass with no errors after changes
2. **`pnpm lint`** — must pass with no errors or warnings added by the changes
3. **Manual guard behavior spot-check** — run node in-script to confirm:
   - `assertPathWithinBase('/safe/base/dir/file.env', '/safe/base/dir')` — no throw
   - `assertPathWithinBase('/safe/base/dir/../etc/passwd', '/safe/base/dir')` — throws
   - `assertSafeLocalUrl('http://localhost:3000')` — no throw
   - `assertSafeLocalUrl('http://attacker.com')` — throws
   - `assertSafeLocalUrl('ftp://localhost')` — throws
4. **Codacy pattern check** — confirm the Codacy pattern concern is addressed (guard at point of use, not only in caller)

---

## Optional Additional Validation

- Add Vitest unit tests for `assertPathWithinBase` and `assertSafeLocalUrl` in `scripts/e2e/` (or `scripts/lib/`)
- Verify the E2E runner invocation works end-to-end with a dry `--list` flag: `node scripts/e2e/run-scenario.mjs single --list`

---

## Validation Not Required

- E2E Playwright browser run — not needed to validate the guard functions
- Integration tests — not applicable
- Architecture lint (`pnpm skott:check`) — scripts are not part of the src module graph
- Full scenario database setup — not needed to confirm guard behavior

---

## Commands / Checks

```bash
pnpm typecheck
pnpm lint
node --eval "
import path from 'node:path';
// inline spot-check of assertPathWithinBase logic
const base = path.resolve('/tmp/base');
const safe = path.resolve('/tmp/base/file.env');
const traversal = path.resolve('/tmp/base/../etc/passwd');
const sep = path.sep;
const isWithin = (p, b) => p === b || p.startsWith(b.endsWith(sep) ? b : b + sep);
console.assert(isWithin(safe, base), 'safe path should pass');
console.assert(!isWithin(traversal, base), 'traversal path should fail');
console.log('spot-check passed');
"
```

For dry-run of the runner script (requires SCENARIO_NAMES to match):

```bash
node scripts/e2e/run-scenario.mjs single --list
```

---

## Validation Gaps

- No automated unit tests for path guard helpers — risk is accepted for scripts
- No automated unit tests for SSRF guard — risk is accepted for scripts
- If the guards are extracted to `scripts/lib/`, consider adding unit tests there (optional)

---

## Recommendation

**Validation plan is minimal but acceptable.**

The changes are confined to scripts with well-understood canonical patterns. TypeScript + lint + manual spot-check provides sufficient confidence. Full unit test suite for E2E runner scripts is optional and deferred.

## Recommended Next Action

Proceed to Implementation. Run `pnpm typecheck` and `pnpm lint` after changes.
