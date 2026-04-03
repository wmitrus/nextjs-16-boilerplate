# 02 - Security & Auth - Summary

## Task Context

- **Task ID**: `feature-flags-security-audit` (case `3344a061-a328-46f4-b51b-c72a67b7df06`)
- **Task Objective**: Proactive security audit of the complete feature-flags implementation delivered across Steps 1–21 of the `3344a061` plan. Verify compliance with all repository security rules. Identify any auth, tenant, trust-boundary, or sensitive-data risks.
- **Current Run Scope**: Full audit — all adapters, factory, bootstrap wiring, scripts, demo page, schema, tests.
- **Status**: COMPLETED
- **Last Updated**: 2026-04-02
- **Related Control Artifacts**:
  - `.zencoder/chats/3344a061-a328-46f4-b51b-c72a67b7df06/plan.md`
  - `.zencoder/chats/3344a061-a328-46f4-b51b-c72a67b7df06/EXTENDED_SUMMARY.md`
  - `docs/ai/general/SECURITY_CODING_PATTERNS.md`
  - `AGENTS.md`

---

## 1. Objective

Conduct a full-depth security and auth review of the feature-flags system. Determine:

- Whether the implementation complies with all repository security rules.
- Whether any auth, tenant isolation, trust-boundary, or sensitive-data violations exist.
- What must be fixed before this feature can be considered production-secure.

---

## 2. Current-State Findings

### Scope Handled

- Auth surfaces reviewed: proxy (`src/proxy.ts`), `withAuth`, route-policy, demo page RSC.
- Authorization surfaces reviewed: `FeatureFlagService` contract, factory, all adapters, bootstrap wiring.
- Trust-boundary questions in scope: client vs. server, GrowthBook SDK outbound HTTP, script file I/O, env-var sources.

### Inputs Reviewed

- `src/modules/feature-flags/**` — all adapters, factory, schema, tests
- `src/app/feature-flags-demo/page.tsx` — demo page RSC
- `src/core/runtime/bootstrap.ts` — DI wiring
- `src/core/env.ts` — env schema for feature-flag vars
- `src/security/middleware/with-auth.ts` — auth enforcement logic
- `src/security/middleware/route-classification.ts` and `route-policy.ts` — route classification
- `scripts/flags/export.ts`, `import.ts`, `migrate.ts`, `utils.ts`, `types.ts`
- `.zencoder/chats/3344a061-*` — all plan steps and summary artifacts

---

## CRITICAL Findings

### CRIT-01 — GrowthBook Singleton Shared Mutable State (Cross-Tenant Attribute Contamination Risk)

**File**: `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`

**Code**:

```typescript
const instanceCache = new Map<string, CacheEntry>();

function getOrCreateInstance(clientKey: string, apiHost: string): CacheEntry {
  const existing = instanceCache.get(clientKey);
  if (existing) return existing;
  const gb = new GrowthBook({ clientKey, apiHost });
  const ready = gb.init({ timeout: 2000 }).then(() => undefined);
  instanceCache.set(clientKey, entry);
  return entry;
}

export class GrowthBookFeatureFlagService implements FeatureFlagService {
  async isEnabled(
    flag: string,
    context: AuthorizationContext,
  ): Promise<boolean> {
    const { gb, ready } = getOrCreateInstance(this.clientKey, this.apiHost);
    await ready;
    await gb.setAttributes({
      // ← mutates shared singleton
      id: context.subject.id,
      company: context.tenant.tenantId,
    });
    return gb.isOn(flag); // ← reads from shared mutable state
  }
}
```

**Risk**: The module-level `instanceCache` holds a single `GrowthBook` instance per `clientKey`. Every call to `isEnabled()` mutates the shared `gb` instance's attribute state with the current request's `userId` and `tenantId`. Under concurrent load:

1. Request A (tenant-A): `gb.setAttributes({ company: 'tenant-a' })` — awaits
2. Before the `await` resolves, Node.js event loop may process another request
3. Request B (tenant-B): `gb.setAttributes({ company: 'tenant-b' })` — overwrites
4. Request A: `gb.isOn(flag)` — evaluates with tenant-B's attributes

Even if `setAttributes()` is synchronous in the current SDK version, this architecture **violates request isolation as a design principle** and is brittle under any future SDK changes that introduce async attribute propagation.

**Classification**: CRITICAL — cross-tenant attribute contamination, design-level trust boundary violation.

**Required Fix**: Either (a) create a new GrowthBook instance per request (simpler, CPU cost), or (b) use `gb.evalFeature()` with an explicit `GrowthBookClient` context that does not mutate shared state (SDK v2+ stateless pattern). Do not share mutable `GrowthBook` instances across requests.

---

### CRIT-02 — `/feature-flags-demo` Not in `PUBLIC_ROUTE_PREFIXES` — Auth Enforcement Mismatch

**Files**: `src/security/middleware/route-policy.ts`, `src/app/feature-flags-demo/page.tsx`

**Code** (route-policy.ts):

```typescript
export const PUBLIC_ROUTE_PREFIXES = [
  '/',
  '/waitlist',
  '/env-summary',
  '/security-showcase',
  '/sentry-example-page',
  '/monitoring',
  '/api/security-test/ssrf',
  '/api/logs',
] as const;
// /feature-flags-demo is ABSENT
```

**Code** (with-auth.ts `rejectUnauthenticatedPrivateRoute`):

```typescript
const isE2eRoute =
  req.nextUrl.pathname.startsWith('/e2e-error') ||
  req.nextUrl.pathname.startsWith('/users');

if (userId || ctx.isPublicRoute || (env.E2E_ENABLED && isE2eRoute)) {
  return null; // allow
}
// Falls through to: redirect unauthenticated users to /sign-in
```

**Risk**:

- The demo page was designed as public (uses a synthetic hardcoded `demoAuthContext`, no real user identity).
- The E2E spec (`e2e/feature-flags-demo.spec.ts`) explicitly documents: "Demo pages are public (no auth required). Tests must NOT depend on Clerk credentials."
- In **production** (`E2E_ENABLED=false`), unauthenticated users hitting `/feature-flags-demo` are redirected to `/sign-in`. The `/feature-flags-demo` path is NOT in the E2E bypass list (`isE2eRoute` only covers `/e2e-error` and `/users`).
- The E2E spec is **invalid against a production-config server** — all 5 tests would fail because the browser is redirected to `/sign-in`.

**Secondary Risk**: Developers see the E2E spec passing in CI (which may run with mocked auth or a dev server config) and assume the page is public. If they add the route to `PUBLIC_ROUTE_PREFIXES` later, the page becomes public without a deliberate review of what is exposed.

**Classification**: CRITICAL — design intent contradicts actual enforcement; E2E spec is non-validating against production config.

**Required Fix**: Make a deliberate decision:

- **If the page should be public**: Add `/feature-flags-demo` to `PUBLIC_ROUTE_PREFIXES`. Verify no sensitive data is exposed (currently safe — synthetic context).
- **If the page should require auth**: Update the page RSC to use real auth context (not synthetic), and document this decision. Update the E2E spec to use authenticated state.

---

## MAJOR Findings

### MAJ-01 — CWE-22 Path Traversal: `scripts/flags/export.ts` — `--out` without Confinement

**File**: `scripts/flags/export.ts`

**Code**:

```typescript
const outFile = parseArg('out'); // parseArg reads from process.argv: --out=<any-path>

if (outFile) {
  fs.writeFileSync(outFile, json, 'utf8'); // ← no path.resolve, no confinement check
}
```

**Risk**: The `--out` argument accepts any file path provided on the command line. A user or CI script can write the exported JSON to any location accessible to the process: `--out=/etc/cron.d/malicious`, `--out=../../sensitive-config.json`, etc. No `path.resolve()` is applied. No base-directory confinement check exists.

**Violation**: AGENTS.md Hard Security Rule:

> "dynamically constructed file paths used in `fs` operations without `path.resolve()` and base-directory confinement check (CWE-22 — path traversal)"
> "confinement checks must be at the point of file access — not only at the upstream caller"

**Classification**: MAJOR — mandatory rule violation in script tooling.

---

### MAJ-02 — CWE-22 Path Traversal: `scripts/flags/import.ts` — `--file` without Confinement

**File**: `scripts/flags/import.ts`

**Code**:

```typescript
const filePath = parseArg('file'); // reads from process.argv: --file=<any-path>

function readInput(filePath: string | undefined): FlagsFile {
  if (filePath) {
    raw = fs.readFileSync(filePath, 'utf8'); // ← no confinement check
  } else {
    raw = fs.readFileSync('/dev/stdin', 'utf8');
  }
  return JSON.parse(raw) as FlagsFile; // ← also no runtime schema validation
}
```

**Risk**: The `--file` argument accepts any file path. An operator could inadvertently (or deliberately) pass sensitive system files: `--file=/etc/passwd`, `--file=../../.env.local`, etc. The content is then JSON-parsed (failing gracefully for non-JSON) and imported into the database. No `path.resolve()`. No base-directory confinement.

**Classification**: MAJOR — mandatory rule violation. Same CWE-22 class as MAJ-01.

---

### MAJ-03 — CWE-918 SSRF: `GROWTHBOOK_API_HOST` Without Point-of-Use Allowlist

**Files**: `src/core/env.ts`, `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`, `src/modules/feature-flags/factory.ts`

**Code** (env.ts):

```typescript
GROWTHBOOK_API_HOST: z.url().optional(),  // validates URL format only
```

**Code** (factory.ts):

```typescript
return new GrowthBookFeatureFlagService({
  clientKey: opts.growthbookClientKey,
  apiHost: opts.growthbookApiHost ?? 'https://cdn.growthbook.io', // ← env-var-sourced
});
```

**Code** (GrowthBookFeatureFlagService.ts):

```typescript
const gb = new GrowthBook({ clientKey, apiHost }); // SDK makes outbound HTTP to apiHost
```

**Risk**: `GROWTHBOOK_API_HOST` is an env-var-sourced URL passed directly to the GrowthBook SDK which makes outbound HTTP calls to `{apiHost}/api/features/{clientKey}`. The `z.url()` Zod validation only checks URL format — it does NOT validate:

- Protocol (allows `file://`, `ftp://`, non-HTTP protocols)
- Hostname (allows cloud metadata endpoints like `169.254.169.254`, internal VPC services, etc.)

In cloud deployments (AWS, GCP, Azure, Vercel), an adversary with the ability to influence environment variables (compromised CI, insider, misconfigured secrets manager) can point `GROWTHBOOK_API_HOST` to the instance metadata endpoint to exfiltrate cloud credentials.

**Violation**: AGENTS.md Forbidden Security Pattern:

> "environment-variable-sourced or user-controlled URLs passed directly to `fetch()` or any HTTP client without protocol and hostname allowlist validation (CWE-918 — SSRF)"
> "upstream allowlist validation of CLI args or config values as a substitute for point-of-use guards in file path construction or HTTP calls"

The `z.url()` check is upstream validation — it does not substitute for a point-of-use allowlist.

**Classification**: MAJOR — mandatory rule violation.

---

### MAJ-04 — `ResilientFeatureFlagService` Logs Raw `error` Object

**File**: `src/modules/feature-flags/infrastructure/resilient/ResilientFeatureFlagService.ts`

**Code**:

```typescript
logger.warn(
  {
    event: 'feature-flag:evaluation-error',
    flag,
    error, // ← raw error object
  },
  'Feature flag evaluation failed; defaulting to false (fail-safe)',
);
```

**Risk**: The raw `error` object is serialized into structured log output. Database connection errors from `DrizzleFeatureFlagService` commonly embed connection strings in their messages:

```
Error: connection to server at "db.internal" (10.0.0.5), port 5432 failed:
FATAL: password authentication failed for user "dbuser"
```

This exposes:

- Internal hostnames/IPs
- Database usernames
- Potentially fragments of connection strings including passwords

**Classification**: MAJOR — sensitive data exposure via logging. Violates the principle: "do not emit telemetry that leaks secrets, tokens, or unnecessary private data."

---

## MINOR Findings

### MIN-01 — Factory Default Fallback Uses `console.warn`

**File**: `src/modules/feature-flags/factory.ts`

**Code**:

```typescript
default: {
  console.warn(
    `[feature-flags] Unknown FEATURE_FLAG_PROVIDER value. Falling back to static (all flags off).`,
  );
  return new StaticFeatureFlagService({});
}
```

**Risk**: `console.warn` bypasses the structured Pino logger. This security-relevant configuration event (unknown provider falling back silently) will not appear in Logflare, will not carry correlation IDs, and cannot be queried or alerted on in production observability tooling.

**Classification**: MINOR — inconsistent with logging patterns; reduces security auditability.

---

### MIN-02 — `JSON.parse(raw) as FlagsFile` Without Runtime Schema Validation

**Files**: `scripts/flags/import.ts`, `scripts/flags/migrate.ts`

**Code**:

```typescript
return JSON.parse(raw) as FlagsFile; // TypeScript cast, no runtime validation
```

**Risk**: A malformed or malicious `flags.json` file passes through without any runtime shape validation. Unexpected fields, malicious `tenantId` values (SQL injection attempt if Drizzle parameterization fails), or type mismatches could cause:

- Silent garbage data import to production DB
- Runtime errors during `upsertFlags` that may expose DB internals in error messages
- If `key` field contains unexpected content, it becomes a DB row

For scripts that write to production databases, this is an elevated concern.

**Classification**: MINOR — incomplete input validation in data-mutating tooling.

---

### MIN-03 — `export.ts` and `import.ts` Lack `isMain` Guard

**Files**: `scripts/flags/export.ts`, `scripts/flags/import.ts`

**Code**:

```typescript
// export.ts — no isMain guard:
run().catch((err: unknown) => {
  console.error('[flags:export] Fatal error:', err);
  process.exit(1);
});
```

**Risk**: If any test file imports `export.ts` or `import.ts` (e.g., to access a utility), the `run()` function executes unconditionally. `migrate.ts` correctly uses an `isMain` guard; the other two scripts do not. The risk is low since neither exports functions that tests would import, but it violates Pattern D in AGENTS.md.

**Classification**: MINOR — inconsistency with Pattern D; low immediate risk.

---

## 3. Trust Boundary Assessment

| Boundary                     | Assessment                                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Provider isolation**       | ✅ SAFE — `FeatureFlagService` contract is clean. No provider SDK types leak into contracts, core, or domain. Adapters import only from `@/core/contracts/*` and `@/core/db`. GrowthBook types are confined to the adapter file. |
| **Auth context propagation** | ⚠️ CONCERN — `GrowthBookFeatureFlagService` leaks the request's `AuthorizationContext` into a process-level singleton via `setAttributes()`. This crosses the request isolation boundary.                                        |
| **DI wiring**                | ✅ SAFE — `FEATURE_FLAGS.SERVICE` is registered correctly in `createRequestContainer()`. The factory produces the service; only the contract type is exposed to callers.                                                         |
| **Server-side enforcement**  | ✅ SAFE — All flag evaluation is server-side (RSC, route handler, server action). The demo page evaluates flags in an async RSC, not a client component.                                                                         |
| **Tenant context source**    | ✅ SAFE — `AuthorizationContext` is the evaluation context. No client-submitted tenant identifiers are trusted as authority. The demo page uses a hardcoded synthetic context (appropriate for demo).                            |
| **Env-var to HTTP**          | ❌ VIOLATION — `GROWTHBOOK_API_HOST` flows from env → factory → SDK without hostname allowlist. (MAJ-03)                                                                                                                         |
| **CLI arg to fs**            | ❌ VIOLATION — `--out` and `--file` CLI args flow to `fs.*` without path confinement. (MAJ-01, MAJ-02)                                                                                                                           |
| **Route access control**     | ❌ VIOLATION — `/feature-flags-demo` intent (public) contradicts enforcement (auth-required). (CRIT-02)                                                                                                                          |
| **Logging trust boundary**   | ❌ VIOLATION — Raw error objects with potential DB connection strings logged. (MAJ-04)                                                                                                                                           |

---

## 4. Docs vs. Code Drift

| Claim                                                                                                                          | Source                                        | Reality                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Demo pages are public (no auth required). Tests must NOT depend on Clerk credentials."                                        | `3344a061/plan.md` Step 20, E2E spec comments | `/feature-flags-demo` is NOT in `PUBLIC_ROUTE_PREFIXES`. In production, unauthenticated users are redirected to `/sign-in`. **Code does not match stated intent.**                                              |
| "All quality gates passing (typecheck ✅, lint ✅, 128 test files / 852 tests ✅)"                                             | `EXTENDED_SUMMARY.md`                         | E2E tests were typechecked only — not executed against a real production-config server. The E2E spec would fail in production because the route requires auth.                                                  |
| "GrowthBook SDK instance must be cached per process (singleton pattern via module-level cache), not instantiated per request." | `3344a061/plan.md` Architecture Decision      | The singleton is implemented as specified, but the specification itself is security-deficient. Shared mutable attribute state across requests violates request isolation. Architecture decision needs revision. |

---

## 5. Risks

### Risk Summary by Severity

| ID      | Severity | Finding                                                                                | Exploitability                                                                                                                                  |
| ------- | -------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| CRIT-01 | CRITICAL | GrowthBook singleton cross-tenant attribute contamination                              | Medium — requires concurrent load; GrowthBook SDK v1.x `setAttributes` is likely synchronous (lower immediate risk) but architecture is fragile |
| CRIT-02 | CRITICAL | `/feature-flags-demo` not in PUBLIC_ROUTE_PREFIXES — E2E spec is invalid in production | High — E2E suite gives false confidence; route behavior contradicts documented intent                                                           |
| MAJ-01  | MAJOR    | CWE-22: `--out` CLI arg → `fs.writeFileSync` without path confinement                  | Low in normal use; High if script is called from automated pipelines with user-influenced args                                                  |
| MAJ-02  | MAJOR    | CWE-22: `--file` CLI arg → `fs.readFileSync` without path confinement                  | Low in normal use; Medium — attacker with filesystem access can chain this to read sensitive files                                              |
| MAJ-03  | MAJOR    | CWE-918: `GROWTHBOOK_API_HOST` → GrowthBook SDK HTTP without hostname allowlist        | Low — requires env-var compromise; metadata endpoint SSRF in cloud deployments if exploited                                                     |
| MAJ-04  | MAJOR    | Raw `error` object logged — potential DB connection string exposure                    | Medium — any DB connection error triggers this; connection strings commonly include credentials                                                 |
| MIN-01  | MINOR    | `console.warn` in factory fallback — not auditable                                     | Low                                                                                                                                             |
| MIN-02  | MINOR    | `JSON.parse(raw) as FlagsFile` without schema validation                               | Low in isolation; elevated if combined with path traversal (MAJ-02)                                                                             |
| MIN-03  | MINOR    | `export.ts`/`import.ts` lack `isMain` guard                                            | Low                                                                                                                                             |

---

## 6. Recommended Next Action

### Must Fix Before Claiming Production-Secure

**CRIT-01**: Eliminate shared mutable GrowthBook state. Create a GrowthBook client context per request instead of mutating a shared instance:

```typescript
// Safe pattern: use GrowthBookClient per-request context (SDK v2+ stateless API)
// OR create a fresh GrowthBook instance per evaluation call (simpler):
async isEnabled(flag: string, context: AuthorizationContext): Promise<boolean> {
  const gb = new GrowthBook({
    clientKey: this.clientKey,
    apiHost: this.apiHost,
    attributes: {
      id: context.subject.id,
      company: context.tenant.tenantId,
    },
  });
  await gb.init({ timeout: 2000 });
  const result = gb.isOn(flag);
  gb.destroy();
  return result;
}
```

If the per-request init cost is unacceptable, fetch features once (module-level or build-time), then create scoped eval contexts per request from the cached feature payload. Do not share mutable attribute state.

**CRIT-02**: Add `/feature-flags-demo` to `PUBLIC_ROUTE_PREFIXES` in `route-policy.ts`. The demo page exposes no sensitive data (synthetic context, no real user info). Make the intent explicit. Re-validate the E2E spec against a real server after this change.

**MAJ-01 + MAJ-02**: Apply path confinement guards in both scripts per the canonical pattern in AGENTS.md:

```typescript
function assertPathWithinBase(resolvedPath: string, baseDir: string): void {
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
        `  Allowed base : ${normalizedBase}\n  Resolved path: ${normalizedPath}\n`,
    );
  }
}
// Use process.cwd() as the base for export.ts output paths
// Use process.cwd() or a known input dir as the base for import.ts file reads
```

**MAJ-03**: Add a point-of-use allowlist check in `GrowthBookFeatureFlagService` constructor or in `factory.ts` before instantiating the service:

```typescript
const ALLOWED_GROWTHBOOK_HOSTNAMES = new Set([
  'cdn.growthbook.io',
  'growthbook.io',
]);

function assertSafeGrowthBookApiHost(apiHost: string): void {
  let parsed: URL;
  try {
    parsed = new URL(apiHost);
  } catch {
    throw new Error(`[feature-flags] Invalid GROWTHBOOK_API_HOST: ${apiHost}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `[feature-flags] GROWTHBOOK_API_HOST must use https: ${apiHost}`,
    );
  }
  if (
    !ALLOWED_GROWTHBOOK_HOSTNAMES.has(parsed.hostname) &&
    !parsed.hostname.endsWith('.growthbook.io')
  ) {
    throw new Error(
      `[feature-flags] GROWTHBOOK_API_HOST hostname not in allowlist: ${parsed.hostname}`,
    );
  }
}
```

**MAJ-04**: Sanitize the error before logging. Log only `error.message` and `error.name`, not the full error object:

```typescript
logger.warn(
  {
    event: 'feature-flag:evaluation-error',
    flag,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorName: error instanceof Error ? error.name : 'UnknownError',
  },
  'Feature flag evaluation failed; defaulting to false (fail-safe)',
);
```

### Should Fix in Follow-Up

- **MIN-01**: Replace `console.warn` in factory default fallback with the structured logger.
- **MIN-02**: Add Zod schema validation for `FlagsFile` in `import.ts` and `migrate.ts` before importing.
- **MIN-03**: Add `isMain` guards to `export.ts` and `import.ts` for consistency with Pattern D.

### Architecture Decision Revision Needed

The plan's binding architecture decision "GrowthBook SDK instance must be cached per process (singleton pattern via module-level cache), not instantiated per request" was specified without security review. That decision must be revised. The singleton pattern is valid for caching feature definitions (the HTTP call result), but **mutable user/tenant attributes must never be stored on a shared instance**. The revised design must separate feature definition caching from per-request context evaluation.

---

## Actions Performed

- Full trace of identity/context flow through all three adapters ✅
- Authorization enforcement review: confirmed server-side only ✅
- Tenant context source review: `AuthorizationContext` is the correct propagation path ✅
- Trust boundary map: provider isolation verified clean ✅
- Sensitive data exposure review: error logging and log structure reviewed ✅
- Script security review: CWE-22 path traversal assessed in all three flag scripts ✅
- Route classification: `route-policy.ts` vs. demo page intent verified ✅
- SSRF assessment: `GROWTHBOOK_API_HOST` flow traced from env → factory → SDK ✅
- Pattern compliance: checked against SEC-01 through SEC-08 in `SECURITY_CODING_PATTERNS.md` ✅

---

## Security Patterns Compliance Check

| Pattern                                            | Status                                               |
| -------------------------------------------------- | ---------------------------------------------------- |
| SEC-01 — DI mock with Map<symbol>                  | Not applicable (no DI mock added by this feature)    |
| SEC-02 — `new URL('/literal', req.url)` safe       | Not applicable                                       |
| SEC-03 — `sanitizeRedirectUrl()` before forwarding | Not applicable (no redirects in feature-flags code)  |
| SEC-04 — No `obj[dynamicKey]()` dispatch           | ✅ Clean — no dynamic dispatch present               |
| SEC-05 — `fs.*` with static literal paths          | ❌ MAJ-01, MAJ-02 — CLI args are not static literals |
| SEC-06 — No `Math.random()` for security values    | ✅ Clean — no cryptographic random usage             |
| SEC-07 — `uuid` only for DB-generated PKs          | ✅ Fixed in Step 17 — `tenant_id` changed to `text`  |
| SEC-08 — `unique().nullsNotDistinct()`             | ✅ Fixed in Step 17 — correct constraint applied     |

---

## Update — Open Questions Resolved (2026-04-02)

### Question 1 — GROWTHBOOK_API_HOST Allowlist Scope: RESOLVED

**Decision**: Validate **protocol only** (`https:` required). Do NOT restrict hostname.

**Rationale**: GrowthBook officially supports self-hosted/on-prem deployments. The `apiHost` env var is designed for this use case. Restricting to `*.growthbook.io` would break legitimate enterprise use. A protocol-only check (`https:` required) still blocks the primary SSRF vector (cloud metadata endpoints at `169.254.169.254` use `http://`, not `https://`).

The MAJ-03 fix in `factory.ts` should use:

```typescript
if (parsed.protocol !== 'https:') {
  throw new Error(
    `[feature-flags] GROWTHBOOK_API_HOST must use https: protocol`,
  );
}
// No hostname restriction — on-prem is valid
```

### Question 2 — GrowthBook Per-Request Init Cost: RESOLVED — NOT a concern

**Discovery**: The SDK v1.6.5 already ships `GrowthBookClient` (the modern stateless API).

`GrowthBookClient.isOn(key, userContext)` takes `userContext` as a per-call argument — there is **no shared mutable attribute state**. The client caches feature definitions at the SDK level with TTL-based refresh. **Zero per-request HTTP cost.**

**CRIT-01 fix**: Switch from the legacy `GrowthBook` class to `GrowthBookClient`. Cache the client at module level (safe). Pass user context per-call. No per-request `init()` needed.

SDK confirmed:

- `GrowthBookClient.isOn(key, userContext): boolean` ← synchronous, no shared state ✅
- `setAttributes(): Promise<void>` on old `GrowthBook` class ← async, confirms race condition is REAL ✅
