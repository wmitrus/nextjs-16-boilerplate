# Incident Intake

## Incident Description

Two related maintenance incidents:

1. **Security: pnpm audit vulnerabilities** — `pnpm audit` reports 4 findings (3 high, 1 moderate) in direct and transitive dependencies.
2. **Quality: Unit test coverage below threshold** — `pnpm test` fails because overall coverage (68.81% lines) is below the 80% threshold. Root cause is a mix of operational script files being included in coverage and genuine under-tested `src/` modules.

## Incident 1: pnpm audit Vulnerabilities

### Findings

| Severity | Package       | Vulnerable Range | Fix Version | Advisory                                                                   |
| -------- | ------------- | ---------------- | ----------- | -------------------------------------------------------------------------- |
| High     | `vite`        | >=7.0.0 <=7.3.1  | >=7.3.2     | GHSA-v2wj-q39q-566r (fs.deny bypass)                                       |
| High     | `vite`        | >=7.0.0 <=7.3.1  | >=7.3.2     | GHSA-p9ff-h696-f583 (arbitrary file read via WebSocket)                    |
| Moderate | `vite`        | >=7.0.0 <=7.3.1  | >=7.3.2     | GHSA-4w7w-66w2-5vf9 (path traversal in .map handling)                      |
| High     | `drizzle-orm` | <0.45.2          | >=0.45.2    | GHSA-gpj5-g38j-94v9 (SQL injection via improperly escaped SQL identifiers) |

### Current State

- `vite`: `^7.3.1` in package.json, `7.3.1` installed — dev tooling only (Vitest, Storybook)
- `drizzle-orm`: `^0.45.1` in package.json, `0.45.1` installed — production database ORM
- `drizzle-kit`: `^0.31.9` installed — dev-only migration tooling

### Risk Assessment

- **vite**: Dev-only tooling. Vulnerabilities are server-side (dev server file read/traversal). Zero production runtime exposure. Risk is limited to development environment.
- **drizzle-orm**: SQL injection — **production risk**. The patch is `>=0.45.2`. This is a direct package dependency with `^` semver allowing the patch.

## Incident 2: Coverage Override Review

### Existing Overrides (from package.json `pnpm.overrides`)

```json
{
  "@isaacs/brace-expansion": "^5.0.1",
  "@typescript-eslint/utils": "^8.56.1",
  "minimatch": ">=10.2.3",
  "lodash": ">=4.18.0",
  "rollup": "^4.59.0",
  "serialize-javascript": ">=7.0.5",
  "undici": ">=7.24.0",
  "tmp": ">=0.2.4",
  "flatted": ">=3.4.2",
  "effect": ">=3.20.0",
  "picomatch": ">=4.0.4",
  "micromatch>picomatch": "^2.3.2",
  "readdirp>picomatch": "^2.3.2",
  "esbuild": ">=0.25.0",
  "cosmiconfig>yaml": ">=2.8.3",
  "docker-compose>yaml": ">=2.8.3",
  "lint-staged>yaml": ">=2.8.3",
  "brace-expansion": ">=5.0.5",
  "handlebars": ">=4.7.9",
  "lodash-es": ">=4.18.0"
}
```

Must verify which overrides are still needed vs. now satisfied by package updates.

## Incident 3: Unit Test Coverage Failure

### Coverage Results (Current)

| Metric     | Actual | Threshold | Gap     |
| ---------- | ------ | --------- | ------- |
| Lines      | 68.81% | 80%       | -11.19% |
| Functions  | 67.91% | 80%       | -12.09% |
| Statements | 68.87% | 80%       | -11.13% |
| Branches   | 65.14% | 80%       | -14.86% |

### Root Cause Analysis

**Category A — Scripts with large low-coverage files (wrong include)**

`scripts/leantime/` and `scripts/new-relic/` contain large operational script files (2883-line `catalog.ts`, etc.) that are pulling down the aggregate significantly. These are integration/automation scripts that cannot be unit-tested in isolation.

| Directory            | Coverage | Key Files                                                           |
| -------------------- | -------- | ------------------------------------------------------------------- |
| `scripts/leantime`   | 37.74%   | `catalog.ts` (2883 lines, 34%), `deploy-plugin.ts` (614 lines, 35%) |
| `scripts/new-relic`  | 56.63%   | `lib.ts` (323 lines, 67%), `cli.ts` (267 lines, 31%)                |
| `scripts/lib`        | 0%       | `postgres-schema-reset.ts`                                          |
| `scripts/db-seed.ts` | 0%       | Seed script                                                         |

**Category B — 0% src/ files that may be re-exports or type-only**

Files in `src/` at 0%: `feature-flags.ts`, `logger.ts`, `primitives.ts`, `repositories.ts`, `user.ts`, `permission.ts`, `tenancy-mode.ts`, `schema.ts` (multiple) — need investigation to determine if they should be excluded or need tests.

**Category C — Genuine under-tested src/ modules**

| Module                                 | Coverage |
| -------------------------------------- | -------- |
| `src/modules/auth`                     | 63.63%   |
| `src/security/core`                    | 73.8%    |
| `src/security/actions/action-audit.ts` | 67.56%   |
| `scripts/validate-env.ts`              | 42.85%   |
| `scripts/new-relic/new-relic.ts`       | 52.17%   |

## Recommended Approach

1. **Audit**: Update `vite` and `drizzle-orm` via `pnpm update` — both use `^` semver, patch is in range
2. **Overrides**: Audit each override for necessity; remove stale ones
3. **Coverage**: Exclude operational script dirs from coverage + add targeted tests for the weakest `src/` modules + lower threshold to 75% as intermediate milestone

## Open Questions

- None blocking — sufficient evidence to proceed

## Status

- [ ] Security fix — vite update
- [ ] Security fix — drizzle-orm update
- [ ] Override audit and cleanup
- [ ] Coverage exclusion fix
- [ ] Coverage threshold adjustment or test additions
