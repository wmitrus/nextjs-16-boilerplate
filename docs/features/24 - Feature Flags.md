# Feature Flags

This document covers the multi-adapter feature flag system: how it works, how to configure each provider, how to migrate between providers, and how to use flags in application code.

---

## 1. Architecture Overview

The feature flag system is a contract-first module. Application code never imports a provider SDK directly — it calls a single interface:

```typescript
interface FeatureFlagService {
  isEnabled(flag: string, context: AuthorizationContext): Promise<boolean>;
}
```

**Fail-safe guarantee**: every adapter registered through the factory is wrapped in `ResilientFeatureFlagService`. If the underlying provider throws (DB unreachable, SDK timeout, network error), `isEnabled()` logs a warning and returns `false`. Callers must never wrap flag evaluation in `try/catch`.

### Layer map

```
src/
  core/contracts/feature-flags.ts          ← FeatureFlagService interface (no SDK imports)
  modules/feature-flags/
    factory.ts                             ← createFeatureFlagService() — wires the right adapter
    lib/isFeatureEnabled.ts                ← thin helper for explicit DI callsites
    infrastructure/
      static/StaticFeatureFlagService.ts   ← env-var driven, no DB, no network
      drizzle/DrizzleFeatureFlagService.ts ← DB-backed, tenant-scoped overrides
      growthbook/GrowthBookFeatureFlagService.ts ← GrowthBook SDK, server-side only
      resilient/ResilientFeatureFlagService.ts   ← fail-safe wrapper (always applied)
      memory/InMemoryFeatureFlagService.ts       ← test/development helper
```

The active adapter is selected at startup via `FEATURE_FLAG_PROVIDER`. Switching providers requires only an env-var change and a server restart — no application code changes.

---

## 2. Environment Variables

| Variable                | Required          | Default                     | Description                                     |
| ----------------------- | ----------------- | --------------------------- | ----------------------------------------------- |
| `FEATURE_FLAG_PROVIDER` | Yes               | `static`                    | Active adapter: `static`, `db`, or `growthbook` |
| `FEATURE_FLAGS_STATIC`  | When `static`     | `""`                        | Comma-separated `key=true/false` pairs          |
| `DATABASE_URL`          | When `db`         | —                           | Postgres connection string                      |
| `GROWTHBOOK_CLIENT_KEY` | When `growthbook` | —                           | GrowthBook SDK client key                       |
| `GROWTHBOOK_API_HOST`   | When `growthbook` | `https://cdn.growthbook.io` | GrowthBook API host — must use `https:`         |

---

## 3. Provider: `static`

### How it works

Flags are read from `FEATURE_FLAGS_STATIC` at server startup. The adapter parses the string once and stores the result in memory. No DB. No network. No runtime updates — a server restart is required to change flags.

Context attributes (`tenantId`, `userId`) are ignored. All requests see the same flag values.

### When to use

- Local development
- Preview deployments with a fixed feature set
- Teams that have not provisioned a database yet
- CI environments where DB connectivity is not available

### Configuration

```bash
FEATURE_FLAG_PROVIDER=static
FEATURE_FLAGS_STATIC=demo.new-dashboard-ui=true,demo.beta-exports=false,demo.experimental-analytics=true
```

Format: `flag-key=true` or `flag-key=false`, separated by commas. Spaces around the separator are trimmed. Unknown values (not `true`) are treated as `false`.

### Behavior

| Scenario                                   | Result                   |
| ------------------------------------------ | ------------------------ |
| Flag key present, value `true`             | `true`                   |
| Flag key present, value `false` or unknown | `false`                  |
| Flag key not in list                       | `false`                  |
| `FEATURE_FLAGS_STATIC` empty or unset      | all flags return `false` |

---

## 4. Provider: `db`

### How it works

Flags are stored in the `feature_flags` Postgres table and queried on every `isEnabled()` call. Flags can be global (apply to all tenants) or scoped to a specific tenant.

**Tenant resolution priority**: if a row exists for the current `tenantId`, that row wins over the global row. If neither exists, the flag returns `false`.

### When to use

- Production or staging environments that already have a database
- Per-tenant flag overrides (e.g. enable a beta feature for one tenant only)
- Operators who want to toggle flags without restarting the server

### Configuration

```bash
FEATURE_FLAG_PROVIDER=db
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

### Database schema

Table: `feature_flags`

| Column        | Type                             | Notes                                                   |
| ------------- | -------------------------------- | ------------------------------------------------------- |
| `id`          | `uuid`                           | Primary key, auto-generated                             |
| `key`         | `text NOT NULL`                  | Flag identifier, e.g. `demo.new-dashboard-ui`           |
| `tenant_id`   | `text NULL`                      | `NULL` = global flag; non-null = tenant-scoped override |
| `enabled`     | `boolean NOT NULL DEFAULT false` | Flag state                                              |
| `description` | `text NULL`                      | Optional human-readable description                     |
| `created_at`  | `timestamptz`                    | Auto-set on insert                                      |
| `updated_at`  | `timestamptz`                    | Auto-set on insert, updated on change                   |

Unique constraint: `(key, tenant_id)` with `NULLS NOT DISTINCT` — each `(key, NULL)` pair is unique, and each `(key, specific_tenant_id)` pair is unique.

### Running migrations

The `feature_flags` table is created by a Drizzle migration. Apply it before switching to the `db` provider:

```bash
pnpm db:pglite:migrate
```

### Behavior

| Scenario                                     | Result                              |
| -------------------------------------------- | ----------------------------------- |
| Tenant-scoped row exists                     | returns that row's `enabled` value  |
| Only global row (`tenant_id IS NULL`) exists | returns global `enabled` value      |
| No rows for this flag                        | `false`                             |
| DB unreachable                               | `false` (fail-safe, warning logged) |

---

## 5. Provider: `growthbook`

### How it works

Uses the official `@growthbook/growthbook` SDK via the stateless `GrowthBookClient` API. The client instance is cached at module level per `clientKey` and `apiHost` combination to avoid repeated initialization overhead. Using both ensures instances targeting different GrowthBook backends are never confused with each other.

On every `isEnabled()` call:

1. The cached client is retrieved (or created on first call).
2. `await ready` ensures the initial `init()` has completed.
3. `await client.refreshFeatures()` is called to ensure freshness:
   - If the SDK's internal cache is younger than 60 seconds → returns cached data immediately (near-zero overhead, no HTTP call).
   - If the SDK's internal cache is stale (> 60 seconds old) → makes one HTTP call to GrowthBook to fetch the latest features. Concurrent callers at the TTL boundary are deduplicated by the SDK via an internal `activeFetches` map.
4. `client.isOn(flag, { attributes })` evaluates the flag against the fetched payload, applying any force rules or targeting rules configured in GrowthBook.

`streaming: true` is passed to `init()`. This subscribes the instance to background refresh events and enables SSE real-time push if the GrowthBook server sends `x-sse-support: enabled`. `cdn.growthbook.io` does not currently support SSE — in that case, `refreshFeatures()` (step 3) is the sole freshness mechanism.

### When to use

- Production environments that need real-time flag updates without restarting the server
- Teams using the GrowthBook UI for flag management
- A/B testing or gradual rollouts that require user/tenant targeting rules

### Configuration

```bash
FEATURE_FLAG_PROVIDER=growthbook
GROWTHBOOK_CLIENT_KEY=sdk-your-key-here
GROWTHBOOK_API_HOST=https://cdn.growthbook.io   # optional, this is the default
```

`GROWTHBOOK_API_HOST` must use the `https:` protocol. The factory validates this at startup and throws if the protocol is invalid.

### GrowthBook project setup

1. Sign in to [app.growthbook.io](https://app.growthbook.io) (or your self-hosted instance).
2. Go to **SDK Connections** → **Add SDK Connection**.
3. Select **JavaScript / TypeScript (Server-side)**.
4. Copy the **Client Key** (starts with `sdk-`).
5. Set `GROWTHBOOK_CLIENT_KEY` in your `.env.local`.
6. Create features in GrowthBook using the naming convention described in section 7.

### Behavior

| Scenario                              | Result                                   |
| ------------------------------------- | ---------------------------------------- |
| Flag exists, force rule matches       | rule value                               |
| Flag exists, no rule matches          | `defaultValue`                           |
| Flag does not exist in GrowthBook     | `false`                                  |
| GrowthBook unreachable, SDK times out | `false` (fail-safe, warning logged)      |
| Flag within 60s SDK cache             | cached result returned instantly         |
| Flag stale (> 60s)                    | one HTTP call to refresh, then evaluated |

### Context attributes passed to GrowthBook

Each `isEnabled()` call passes the following attributes from `AuthorizationContext`:

```typescript
{
  id: context.subject.id,       // ← user ID
  company: context.tenant.tenantId,  // ← tenant ID
}
```

GrowthBook targeting rules can match on `id` (for user-level rollouts) or `company` (for tenant-level rollouts).

### Freshness guarantees

| Condition                            | Latency                       | Freshness             |
| ------------------------------------ | ----------------------------- | --------------------- |
| First request after startup          | ~2s (init timeout) + ~network | Fresh from GrowthBook |
| Subsequent requests within 60s TTL   | ~0ms                          | Cached SDK payload    |
| Request after 60s TTL expires        | ~network RTT                  | Fresh from GrowthBook |
| SSE enabled (self-hosted GrowthBook) | push-driven                   | Real-time             |

---

## 6. Migration Tooling

Three CLI scripts manage flag data across providers. All scripts load `.env.local` automatically.

### `pnpm flags:migrate` — migrate flag data between providers

```bash
# Copy flags from FEATURE_FLAGS_STATIC env var into the DB
pnpm flags:migrate --from=static --to=db

# Export DB flags as a FEATURE_FLAGS_STATIC env string (printed to stdout)
pnpm flags:migrate --from=db --to=static
```

**`--from=static --to=db`**: reads `FEATURE_FLAGS_STATIC`, upserts each flag into the `feature_flags` table. Existing rows are updated; missing rows are inserted. Tenant-scoped rows from the static format are not produced (static flags are always global).

**`--from=db --to=static`**: reads all rows from the DB and prints a `FEATURE_FLAGS_STATIC=...` line to stdout. Only global rows (`tenant_id IS NULL`) are included. Copy the output into your `.env` file to switch to the static adapter.

### `pnpm flags:export` — export flags to JSON

```bash
# Export static flags to stdout
pnpm flags:export --adapter=static

# Export DB flags to stdout
pnpm flags:export --adapter=db

# Export to a file
pnpm flags:export --adapter=db --out=flags-backup.json
```

Output format:

```json
{
  "flags": [
    {
      "key": "demo.new-dashboard-ui",
      "enabled": true,
      "tenantId": null
    },
    {
      "key": "demo.beta-exports",
      "enabled": false,
      "tenantId": "org_acme",
      "description": "Beta exports for Acme tenant only"
    }
  ]
}
```

### `pnpm flags:import` — import flags from JSON into the DB

```bash
# Import from a file
pnpm flags:import --file=flags-backup.json

# Import from stdin (pipe)
pnpm flags:export --adapter=static | pnpm flags:import
```

`flags:import` only writes to the DB. Each flag is upserted: existing rows are updated, missing rows are inserted. Tenant-scoped entries in the JSON are preserved.

### Switching providers: step-by-step

**Static → DB**:

```bash
# 1. Apply DB migration (once)
pnpm db:pglite:migrate

# 2. Seed the DB from current static config
pnpm flags:migrate --from=static --to=db

# 3. Update .env.local
FEATURE_FLAG_PROVIDER=db

# 4. Restart the server
```

**DB → Static**:

```bash
# 1. Export current DB state as a static string
pnpm flags:migrate --from=db --to=static
# → prints: FEATURE_FLAGS_STATIC=demo.new-dashboard-ui=true,...

# 2. Copy the output into .env.local
FEATURE_FLAG_PROVIDER=static
FEATURE_FLAGS_STATIC=demo.new-dashboard-ui=true,...

# 3. Restart the server
```

**Static or DB → GrowthBook**:

```bash
# 1. Create matching features in the GrowthBook UI
# 2. Add credentials to .env.local
FEATURE_FLAG_PROVIDER=growthbook
GROWTHBOOK_CLIENT_KEY=sdk-your-key-here

# 3. Restart the server
```

**GrowthBook → Static or DB**:

```bash
# 1. In .env.local, set the target provider
FEATURE_FLAG_PROVIDER=static   # or db
FEATURE_FLAGS_STATIC=...       # if switching to static

# 2. Restart the server
# GrowthBook requires no cleanup — the SDK client is module-level and disappears on restart
```

---

## 7. Flag Naming Conventions

| Prefix        | Purpose                  | Example                  |
| ------------- | ------------------------ | ------------------------ |
| `demo.*`      | Showcase and demo pages  | `demo.new-dashboard-ui`  |
| _(no prefix)_ | Production feature flags | `extended-security-form` |

Flag names are strings matched exactly. Use lowercase kebab-case. Namespace with dots to group related flags.

Demo flags shown on `/feature-flags-demo`:

- `demo.new-dashboard-ui`
- `demo.beta-exports`
- `demo.experimental-analytics`

---

## 8. Using Flags in Application Code

Flags are evaluated **server-side only**. Never evaluate flags in client components — this would require exposing `GROWTHBOOK_CLIENT_KEY` as a public env var and would bypass the `FeatureFlagService` contract.

### In a Server Component or page

```typescript
import { FEATURE_FLAGS } from '@/core/contracts';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import { getAppContainer } from '@/core/runtime/bootstrap';
import { connection } from 'next/server';

export default async function MyPage() {
  await connection(); // required before getAppContainer() — see RSC dynamic rendering note

  const container = getAppContainer().createChild();
  const flagService = container.resolve<FeatureFlagService>(FEATURE_FLAGS.SERVICE);

  const isEnabled = await flagService.isEnabled('my-flag', authContext);

  return isEnabled ? <NewFeature /> : <OldFeature />;
}
```

**`await connection()` is required** before calling `getAppContainer()` in async RSC pages. Omitting it causes a Next.js 16 prerender error because the DI initializer uses Pino which calls `Date.now()`.

### In a Server Action or Route Handler

```typescript
import { FEATURE_FLAGS } from '@/core/contracts';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import { getAppContainer } from '@/core/runtime/bootstrap';

export async function myAction(input: Input) {
  const container = getAppContainer().createChild();
  const flagService = container.resolve<FeatureFlagService>(
    FEATURE_FLAGS.SERVICE,
  );

  if (!(await flagService.isEnabled('my-flag', authContext))) {
    throw new Error('Feature not available');
  }

  // ... proceed
}
```

### AuthorizationContext

Every `isEnabled()` call requires an `AuthorizationContext`. Use the real security context in authenticated surfaces:

```typescript
import { getSecurityContext } from '@/security/core/security-context';

const { user } = await getSecurityContext(dependencies);

const authContext: AuthorizationContext = {
  tenant: { tenantId: user.tenantId },
  subject: { id: user.id },
  resource: { type: 'feature' },
  action: 'feature:read',
};
```

For demo or public pages with no authenticated user, use a synthetic context (context carries no security significance for the `static` adapter, and GrowthBook/DB will return `false` for unknown IDs unless a global flag is configured):

```typescript
const demoContext: AuthorizationContext = {
  tenant: { tenantId: 'demo' },
  subject: { id: 'anonymous' },
  resource: { type: 'demo' },
  action: 'demo:view',
};
```

---

## 9. Demo Page

`/feature-flags-demo` is a public page (no authentication required) that demonstrates all three adapters live.

It shows:

- Which adapter is currently active (`FEATURE_FLAG_PROVIDER`)
- The resolved state of the three demo flags
- UI components gated by each flag
- Instructions for switching adapters

The page always re-renders on every request (`await connection()` opts it out of static prerendering). There is no Next.js cache layer between the browser and flag evaluation.

---

## 10. Testing

### Unit tests

Use `InMemoryFeatureFlagService` or mock `FeatureFlagService` directly. Do not import provider SDKs in unit tests.

```typescript
import { InMemoryFeatureFlagService } from '@/modules/feature-flags';

const flags = new InMemoryFeatureFlagService({ 'my-flag': true });
const result = await flags.isEnabled('my-flag', ctx);
expect(result).toBe(true);
```

### DB integration tests (`*.db.test.ts`)

Use `resolveTestDb()` from `@/testing/db/create-test-db` (PGlite in-memory):

```typescript
/** @vitest-environment node */
import { resolveTestDb } from '@/testing/db/create-test-db';
import { DrizzleFeatureFlagService } from '@/modules/feature-flags';

let testDb: Awaited<ReturnType<typeof resolveTestDb>>;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

it('returns false for unknown flag', async () => {
  const svc = new DrizzleFeatureFlagService(testDb.db);
  const ctx = {
    tenant: { tenantId: 'acme' },
    subject: { id: 'u1' },
    resource: { type: 'feature' },
    action: 'feature:read',
  };
  expect(await svc.isEnabled('unknown', ctx)).toBe(false);
});
```

### GrowthBook unit tests

Use the module-level `vi.mock('@growthbook/growthbook', ...)` pattern. See `GrowthBookFeatureFlagService.test.ts` for the reference implementation including the `refreshFeatures` mock and call-order assertion.

MSW handlers for GrowthBook HTTP interception are available in `src/modules/feature-flags/infrastructure/growthbook/__mocks__/handlers.ts` for future integration test contexts.

### E2E tests

The `/feature-flags-demo` page has a Playwright spec. Run it with:

```bash
pnpm e2e
```

---

## 11. Security Notes

- **`GROWTHBOOK_CLIENT_KEY` is a server-only secret.** It must never be prefixed with `NEXT_PUBLIC_`. Exposing it to the client would allow external callers to query your GrowthBook feature payload directly.
- **`GROWTHBOOK_API_HOST` is validated at startup.** The factory rejects non-`https:` URLs with a startup error. Do not disable this validation.
- **Flag evaluation is always server-side.** The `FeatureFlagService` contract is not exported to client bundles. Security-sensitive flags (e.g. `extended-security-form`) remain server-controlled.
- **The fail-safe guarantee means flags default to `false` on error.** This is intentional — it is safer to hide a feature than to expose it when the flag system is unhealthy.
- **Tenant isolation in the DB adapter**: tenant-scoped rows are only visible to that tenant's `tenantId`. A global row is the fallback, not a bypass. A tenant-scoped `enabled: false` wins over a global `enabled: true`.
