# Implementation Report

## Status: IMPLEMENTED

## Objective

Remediate 4 CRITICAL Codacy security findings:

- CWE-22 (path traversal) in `scripts/e2e/load-env.mjs` lines 17, 21
- CWE-918 (SSRF) in `scripts/e2e/run-scenario.mjs` line 211
- CWE-22 (path traversal) in `scripts/e2e/run-scenario.mjs` line 318

Add AI governance rules to prevent recurrence.

---

## Affected Files

| File                                             | Change                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `scripts/e2e/load-env.mjs`                       | Added `assertPathWithinBase` guard; applied to `getScenarioEnvPath`, `getVariantEnvPath`, `resolveScenarioDatabasePath` |
| `scripts/e2e/run-scenario.mjs`                   | Added `assertSafeLocalUrl` guard; applied before `fetch(baseUrl, ...)` in `isBaseUrlReachable`                          |
| `AGENTS.md`                                      | Added CWE-22 + CWE-918 hard rules + script/tooling security section                                                     |
| `docs/ai/general/02 - Security & Auth Agent.md`  | Added SCRIPT AND TOOLING SECURITY RULES section with canonical guard patterns                                           |
| `docs/ai/general/04 - Implementation Agents.md`  | Added CWE-22 + CWE-918 to forbidden patterns + SCRIPT AND TOOLING SECURITY RULES section                                |
| `docs/ai/copilot/02 - Security & Auth Agent.md`  | Added Script and Tooling Security section                                                                               |
| `docs/ai/copilot/04 - Implementation Agents.md`  | Added Script and Tooling Security section                                                                               |
| `docs/ai/zencoder/02 - Security & Auth Agent.md` | Added Script and Tooling Security section + use case                                                                    |
| `docs/ai/zencoder/04 - Implementation Agents.md` | Added Script and Tooling Security section                                                                               |

---

## Implementation Plan Followed

1. Add `assertPathWithinBase(resolvedPath, baseDir)` in `load-env.mjs` — canonical CWE-22 defense using `path.resolve()` + prefix check with `path.sep`
2. Guard `getScenarioEnvPath` and `getVariantEnvPath` at point of path construction (addresses Codacy findings at lines 17 and 21 — the `filePath` is built in these functions)
3. Guard `resolveScenarioDatabasePath` — addresses finding at line 318 (the path is resolved here, then consumed by `mkdirSync` and `rmSync` in run-scenario.mjs)
4. Add `assertSafeLocalUrl(url)` in `run-scenario.mjs` — canonical CWE-918 defense: `new URL()` parse + protocol check + hostname allowlist
5. Call `assertSafeLocalUrl(baseUrl)` at the start of `isBaseUrlReachable` — addresses finding at line 211
6. Propagate rules to all AI governance files

---

## Changes Made

### `scripts/e2e/load-env.mjs`

Added after imports and SCENARIO/VARIANT exports:

```javascript
function assertPathWithinBase(resolvedPath, baseDir) {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(resolvedPath);
  const expectedPrefix = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;
  if (
    normalizedPath !== normalizedBase &&
    !normalizedPath.startsWith(expectedPrefix)
  ) {
    throw new Error(
      `Security: file path escapes the allowed directory.\n` +
        `  Allowed base : ${normalizedBase}\n` +
        `  Resolved path: ${normalizedPath}\n`,
    );
  }
}
```

Modified `getScenarioEnvPath`:

```javascript
export function getScenarioEnvPath(scenario) {
  const filePath = path.join(ENV_DIR, `${scenario}.env`);
  assertPathWithinBase(filePath, ENV_DIR);
  return filePath;
}
```

Modified `getVariantEnvPath`:

```javascript
export function getVariantEnvPath(variant) {
  const filePath = path.join(ENV_DIR, `${variant}.env`);
  assertPathWithinBase(filePath, ENV_DIR);
  return filePath;
}
```

Modified `resolveScenarioDatabasePath`:

```javascript
export function resolveScenarioDatabasePath({ scenario, variant } = {}) {
  const databaseUrl = resolveScenarioDatabaseUrl({ scenario, variant });
  const resolvedPath = path.resolve(
    ROOT_DIR,
    databaseUrl.replace(/^file:\.?\/?/, ''),
  );
  assertPathWithinBase(resolvedPath, path.resolve(ROOT_DIR, 'data/e2e'));
  return resolvedPath;
}
```

### `scripts/e2e/run-scenario.mjs`

Added after `getRepoRoot()`:

```javascript
const ALLOWED_E2E_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function assertSafeLocalUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Security: invalid URL for E2E reachability check: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Security: URL must use http or https protocol for E2E reachability check: ${url}`,
    );
  }
  if (!ALLOWED_E2E_HOSTNAMES.has(parsed.hostname)) {
    throw new Error(
      `Security: URL must target localhost only for E2E reachability checks.\n` +
        `  Received: ${parsed.hostname}\n` +
        `  Allowed : ${[...ALLOWED_E2E_HOSTNAMES].join(', ')}\n`,
    );
  }
}
```

Modified `isBaseUrlReachable`:

```javascript
async function isBaseUrlReachable(baseUrl) {
  assertSafeLocalUrl(baseUrl);
  try {
    const response = await fetch(baseUrl, { ... });
    ...
  }
}
```

### AI Governance Files

- **`AGENTS.md`**: Added CWE-22 and CWE-918 to hard security rules + Script and Tooling Security subsection
- **`docs/ai/general/02 - Security & Auth Agent.md`**: Added CWE-22 + CWE-918 to forbidden patterns list + full SCRIPT AND TOOLING SECURITY RULES section with canonical guard patterns
- **`docs/ai/general/04 - Implementation Agents.md`**: Added CWE-22 + CWE-918 to FORBIDDEN IMPLEMENTATION PATTERNS + SCRIPT AND TOOLING SECURITY RULES section referencing canonical patterns
- **`docs/ai/copilot/02 - Security & Auth Agent.md`**: Added Script and Tooling Security section
- **`docs/ai/copilot/04 - Implementation Agents.md`**: Added Script and Tooling Security section
- **`docs/ai/zencoder/02 - Security & Auth Agent.md`**: Added use case + Script and Tooling Security section
- **`docs/ai/zencoder/04 - Implementation Agents.md`**: Added Script and Tooling Security section

---

## Invariants Preserved

- `SCENARIO_NAMES` and `VARIANT_NAMES` allowlists unchanged
- CLI argument validation in `parseArgs` unchanged
- Env file loading precedence unchanged
- Function signatures unchanged
- No new npm dependencies introduced
- Scripts continue to work correctly for valid scenario + variant combinations

---

## Risks / Follow-ups

- No unit tests were added for the guard helpers (accepted per validation strategy — scripts lack a test suite)
- If `scripts/e2e/` ever gets a Vitest config, add unit tests for `assertPathWithinBase` and `assertSafeLocalUrl`
- Other scripts in `scripts/` directory may have similar patterns — a broader audit pass is recommended but deferred
