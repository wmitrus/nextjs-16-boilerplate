# Security Review

## Task

Remediate 4 CRITICAL Codacy findings in `scripts/e2e/load-env.mjs` and `scripts/e2e/run-scenario.mjs`:

- Path traversal (CWE-22): dynamically constructed file paths used in `fs.existsSync`, `fs.readFileSync`, `fs.mkdirSync` without canonicalization guards
- SSRF (CWE-918): environment-variable-sourced URL passed directly to `fetch()` without host validation

---

## Security Surface Classification

| Category                      | Applies                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Authentication                | No — these are local dev/CI scripts                                           |
| Authorization                 | No                                                                            |
| Tenant / organization context | No                                                                            |
| Trust boundary                | **Yes** — input from env vars and CLI args used in file I/O and HTTP requests |
| Sensitive data handling       | Partial — env files containing secrets are read                               |
| Path traversal (CWE-22)       | **Yes** — primary finding                                                     |
| SSRF (CWE-918)                | **Yes** — secondary finding                                                   |

These scripts are Node.js E2E runner scripts, not Next.js App Router code. The security surface is:

- **File system trust boundary**: values from CLI args and env vars drive file path construction
- **Network trust boundary**: env var drives the HTTP fetch target

---

## Auth / Identity Surface

Not applicable. These are local scripts with no authentication or session context.

**Outcome: Not applicable**

---

## Authorization Surface

Not applicable. These are local scripts.

**Outcome: Not applicable**

---

## Tenant / Organization Surface

Not applicable. No tenant context exists in E2E runner scripts.

**Outcome: Not applicable**

---

## Provider Isolation Check

Not applicable. No provider SDKs (Clerk, Sentry, Upstash) are involved in these scripts.

---

## Trust Boundaries

### Finding 1 & 2: Path Traversal in `load-env.mjs`

**Affected code:**

```javascript
// load-env.mjs:17
if (!fs.existsSync(filePath)) {

// load-env.mjs:21
const content = fs.readFileSync(filePath, 'utf8');
```

**How `filePath` is constructed:**

- `getScenarioEnvPath(scenario)` → `path.join(ENV_DIR, `${scenario}.env`)`
- `getVariantEnvPath(variant)` → `path.join(ENV_DIR, `${variant}.env`)`
- `ENV_DIR = path.resolve(process.cwd(), 'scripts/e2e/env')` (fixed base)

**Trust boundary violation:**

- `scenario` and `variant` values come from CLI arguments validated against allowlists in `parseArgs()` in `run-scenario.mjs`
- However, `parseEnvFile(filePath)` and `loadFileIfExists(filePath)` receive arbitrary `filePath` values — no canonicalization or confinement check is performed **at the point of file access**
- If any caller passes a path with `../` traversal sequences (e.g., via misconfigured env, future code changes, or untrusted invocation), the file read would follow the traversal

**Safe resolution:**
Canonicalize and assert the resolved path remains within `ENV_DIR` before any file I/O. Use `path.resolve()` to normalize and then check prefix.

### Finding 3: SSRF in `run-scenario.mjs`

**Affected code:**

```javascript
// run-scenario.mjs:211
const response = await fetch(baseUrl, {
  redirect: 'manual',
  signal: AbortSignal.timeout(3000),
});
```

**How `baseUrl` is sourced:**

```javascript
const baseUrl = env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';
```

**Trust boundary violation:**

- `PLAYWRIGHT_TEST_BASE_URL` is loaded from env files (`.env.local`, `.env.e2e`, scenario env files, `.env.e2e.local`)
- No validation of protocol, host, or port is performed before the URL is passed to `fetch()`
- A compromised env file could set `PLAYWRIGHT_TEST_BASE_URL` to an internal service (metadata endpoint, cloud provider API, internal network resource)
- Even in CI, env files can be partially controlled by attackers who have repository write access

**Safe resolution:**
Validate the URL parses correctly and restricts the hostname to `localhost`, `127.0.0.1`, or `::1`. The E2E runner exclusively targets the local dev server — there is no legitimate need for any other host.

### Finding 4: Path Traversal in `run-scenario.mjs`

**Affected code:**

```javascript
// run-scenario.mjs:318
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
```

**How `databasePath` is constructed:**

```javascript
// load-env.mjs
export function resolveScenarioDatabaseUrl({ scenario, variant } = {}) {
  const suffix = [scenario, variant].filter(Boolean).join('-');
  return `file:./data/e2e/${suffix || 'default'}`;
}

export function resolveScenarioDatabasePath({ scenario, variant } = {}) {
  const databaseUrl = resolveScenarioDatabaseUrl({ scenario, variant });
  return path.resolve(ROOT_DIR, databaseUrl.replace(/^file:\.?\/?/, ''));
}
```

**Trust boundary violation:**

- Same root cause as Findings 1 & 2: `scenario` and `variant` are validated upstream in `parseArgs`, but `resolveScenarioDatabasePath` itself has no path confinement check
- If called with unvalidated inputs, `scenario = '../../../etc/passwd'` would resolve outside `ROOT_DIR/data/e2e/`
- The `fs.rmSync` at line 317 could also destroy arbitrary files if traversal is possible

**Safe resolution:**
Assert resolved `databasePath` starts with `ROOT_DIR/data/e2e/` before any file I/O (rmSync or mkdirSync).

---

## Sensitive Data Handling

- `load-env.mjs` reads `.env.local`, `.env.e2e`, and scenario `.env` files that contain secrets (Clerk keys, database URLs, API keys)
- These files are read with `fs.readFileSync` — the content is returned as key-value maps
- No secrets are logged in the current code
- Path traversal could cause secrets from outside the intended directory to be read and silently merged into `process.env` — this is the real risk of Finding 1 & 2

---

## Server Action / Route Handler Enforcement

Not applicable. These are Node.js CLI scripts.

---

## Security Constraints

Implementation must respect all of the following:

1. **Path confinement for env file reads** — all file paths in `load-env.mjs` must be resolved and validated to start within `ENV_DIR` before `existsSync` or `readFileSync` is called.
2. **Path confinement for database path** — `databasePath` in `run-scenario.mjs` must be resolved and validated to start within `ROOT_DIR/data/e2e/` before `rmSync` or `mkdirSync`.
3. **URL allowlist for SSRF** — `baseUrl` in `run-scenario.mjs` must be validated: only `http:` or `https:` protocol, only `localhost`, `127.0.0.1`, or `::1` hostname.
4. **No secrets in error messages** — error messages may include the rejected path/URL but must never include file content or secret values.
5. **No external dependencies** — use only Node.js built-ins (`path`, `URL`).
6. **Throw errors rather than silently returning** — path traversal and invalid URL attempts must throw; they must not silently return empty results.
7. **Guards must be at the point of use** — not only in upstream callers.

---

## Recommendation

**Safe to implement with constraints.**

The fixes are straightforward, well-understood defensive patterns:

- **CWE-22 (path traversal)**: use `path.resolve()` + string prefix check against the expected base directory
- **CWE-918 (SSRF)**: use the `URL` constructor for parsing + explicit hostname allowlist check

No architecture redesign is needed. No authentication or authorization changes are needed. The blast radius is entirely contained to `scripts/e2e/`.

Follow-up: AI governance rules documenting these patterns must be added to prevent recurrence in future script authoring by agents and Copilot.

---

## Safe Fix Patterns (Canonical Reference)

### Path Traversal Defense (CWE-22)

```javascript
/**
 * Asserts that a resolved file path remains within the expected base directory.
 * Throws if the path escapes the base directory (path traversal attempt).
 * @param {string} resolvedPath - Already-resolved (path.resolve'd) path to check
 * @param {string} baseDir - The base directory that must contain resolvedPath
 */
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

**Usage in `parseEnvFile` / `loadFileIfExists`:**

```javascript
function parseEnvFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  // Guard: must be called with ENV_DIR or ROOT_DIR as base depending on caller
  // Callers should assert before calling, or parseEnvFile accepts a base parameter
  ...
}
```

Better design — validate in each public path-building function:

```javascript
export function getScenarioEnvPath(scenario) {
  const filePath = path.join(ENV_DIR, `${scenario}.env`);
  assertPathWithinBase(filePath, ENV_DIR);
  return filePath;
}

export function getVariantEnvPath(variant) {
  const filePath = path.join(ENV_DIR, `${variant}.env`);
  assertPathWithinBase(filePath, ENV_DIR);
  return filePath;
}
```

And for the fixed paths in `loadScenarioEnv` (`.env.local`, `.env.e2e`, `base.env`, `.env.e2e.local`), those are hardcoded constructions — no traversal risk since no user input flows into them. No guard needed there.

### SSRF Defense (CWE-918)

```javascript
const ALLOWED_E2E_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Asserts that a URL targets a local host only (safe for E2E reachability checks).
 * Throws if the URL is invalid, uses a non-http/https protocol, or targets a non-local host.
 * @param {string} url
 */
function assertSafeLocalUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Security: invalid URL for reachability check: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Security: URL must use http or https protocol: ${url}`);
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
