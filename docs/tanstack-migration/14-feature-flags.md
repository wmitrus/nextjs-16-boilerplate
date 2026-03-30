# Phase 13: Feature Flags – Readiness Seams

## Objective

Document and establish the architectural seams that allow feature flag evaluation to be added cleanly to the TanStack Start boilerplate. This phase does **not** implement a full feature flag system – it prepares the boundaries and patterns so that a real flag provider (Unleash, GrowthBook, PostHog, LaunchDarkly, or custom DB-based) can be added per-project without architectural changes.

**Prerequisite**: Phase 6 (Authorization) and Phase 8 (Features) complete.

---

## Design Principles

1. **Feature flags are not authorization**. A flag controls visibility/enablement of a feature. Authorization controls permission to perform an action. Both are needed and must not be conflated.
2. **Flag evaluation belongs on the server**. Client-side flag evaluation is acceptable for UI-only features, but security-sensitive features must be gated server-side.
3. **Flag evaluation must be tenant-aware**. Different tenants can have different flag states.
4. **Flags must be evaluable in server functions and route loaders**. The boilerplate establishes both patterns.
5. **Flag cleanup debt must be tracked**. Temporary flags must be labeled for removal.

---

## 1. The `FeatureFlagProvider` Contract (Reused as-is)

```ts
// src/core/contracts/feature-flags.ts (unchanged from Next.js boilerplate)
export interface FeatureFlagProvider {
  isEnabled(flagKey: string, context: FeatureFlagContext): Promise<boolean>;

  getVariant(
    flagKey: string,
    context: FeatureFlagContext,
  ): Promise<string | null>;
}

export interface FeatureFlagContext {
  userId?: string;
  tenantId?: string;
  attributes?: Record<string, unknown>;
}
```

This contract is already in `src/core/contracts/feature-flags.ts`. No change needed.

---

## 2. DI Token (Reused as-is)

```ts
// src/core/contracts/index.ts (existing)
export const FEATURE_FLAGS = {
  PROVIDER: Symbol('FEATURE_FLAGS.PROVIDER'),
} as const;
```

---

## 3. Stub Implementation (for boilerplate default)

The boilerplate ships with a no-op stub that always returns `false` (all features disabled). Per-project, this is replaced with a real implementation.

```ts
// src/modules/feature-flags/infrastructure/StubFeatureFlagProvider.ts (new – boilerplate default)
import type {
  FeatureFlagProvider,
  FeatureFlagContext,
} from '@/core/contracts/feature-flags';

/**
 * Stub implementation that disables all feature flags.
 * Replace with a real provider (Unleash, GrowthBook, PostHog, etc.) per project.
 */
export class StubFeatureFlagProvider implements FeatureFlagProvider {
  async isEnabled(
    _flagKey: string,
    _context: FeatureFlagContext,
  ): Promise<boolean> {
    return false;
  }

  async getVariant(
    _flagKey: string,
    _context: FeatureFlagContext,
  ): Promise<string | null> {
    return null;
  }
}
```

### Registration in bootstrap

```ts
// src/core/runtime/bootstrap.ts (add to createRequestContainer)
import { StubFeatureFlagProvider } from '@/modules/feature-flags/infrastructure/StubFeatureFlagProvider';
import { FEATURE_FLAGS } from '@/core/contracts';

container.register(FEATURE_FLAGS.PROVIDER, new StubFeatureFlagProvider());
```

---

## 4. Server-Side Flag Evaluation (Server Functions)

### Helper

```ts
// src/modules/feature-flags/lib/server-flags.ts (new)
import { getAppContainer } from '@/core/runtime/bootstrap';
import { FEATURE_FLAGS } from '@/core/contracts';
import type {
  FeatureFlagProvider,
  FeatureFlagContext,
} from '@/core/contracts/feature-flags';

export async function isFeatureEnabled(
  flagKey: string,
  context: FeatureFlagContext,
): Promise<boolean> {
  const container = getAppContainer();
  const provider = container.resolve<FeatureFlagProvider>(
    FEATURE_FLAGS.PROVIDER,
  );
  return provider.isEnabled(flagKey, context);
}
```

### Usage in server function

```ts
// In a feature action
export const getExperimentalFeature = createSecureServerFn({
  schema: z.object({}),
  handler: async ({ context }) => {
    const enabled = await isFeatureEnabled('experimental-feature', {
      userId: context.session.user.id,
      tenantId: context.securityContext.tenantId,
    });

    if (!enabled) {
      return { status: 'feature_disabled' as const };
    }

    return { status: 'success' as const, data: getFeatureData() };
  },
});
```

---

## 5. Route Loader Flag Evaluation

```tsx
// src/app/routes/_authed/experimental/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { getSession } from '@/modules/auth/lib/session';
import { isFeatureEnabled } from '@/modules/feature-flags/lib/server-flags';

export const Route = createFileRoute('/_authed/experimental/')({
  loader: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: '/auth/sign-in' });

    const enabled = await isFeatureEnabled('experimental-dashboard', {
      userId: session.user.id,
    });

    if (!enabled) {
      throw redirect({ to: '/app' });
    }

    return { enabled };
  },
  component: ExperimentalPage,
});
```

This pattern is **architecturally correct**: flag evaluation is server-side, not client-side. The page is inaccessible (redirects away) if the flag is off, regardless of client-side state.

---

## 6. Client-Side Flag Access

For UI-only feature visibility (not security-sensitive), flags can be passed via loader data:

```tsx
// Loader passes flag state to component
export const Route = createFileRoute('/_authed/dashboard/')({
  loader: async () => {
    const session = await getSession();
    const showBetaWidget = await isFeatureEnabled('beta-widget', {
      userId: session?.user.id,
    });
    return { showBetaWidget };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { showBetaWidget } = Route.useLoaderData();

  return (
    <div>
      <MainContent />
      {showBetaWidget && <BetaWidget />}
    </div>
  );
}
```

**Why this is correct**: The flag is evaluated on the server during SSR. The client receives `showBetaWidget: false` or `true` in the loader response. No client-side flag SDK is required.

---

## 7. Real Provider Integration Patterns

When a project needs a real flag provider, replace `StubFeatureFlagProvider`:

### GrowthBook example

```ts
// src/modules/feature-flags/infrastructure/GrowthBookFeatureFlagProvider.ts
import { GrowthBook } from '@growthbook/growthbook';
import type {
  FeatureFlagProvider,
  FeatureFlagContext,
} from '@/core/contracts/feature-flags';

export class GrowthBookFeatureFlagProvider implements FeatureFlagProvider {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string,
  ) {}

  async isEnabled(
    flagKey: string,
    context: FeatureFlagContext,
  ): Promise<boolean> {
    const gb = new GrowthBook({
      apiHost: this.apiUrl,
      clientKey: this.apiKey,
      attributes: {
        id: context.userId,
        company: context.tenantId,
        ...context.attributes,
      },
    });
    await gb.init({ timeout: 1000 });
    return gb.isOn(flagKey);
  }

  async getVariant(
    flagKey: string,
    context: FeatureFlagContext,
  ): Promise<string | null> {
    // ... similar
    return null;
  }
}
```

### DB-based flags (simple, built-in)

```ts
// src/modules/feature-flags/infrastructure/DrizzleFeatureFlagProvider.ts
import type { DrizzleDb } from '@/core/db';
import { featureFlags } from '@/core/db/schema';
import { eq, and } from 'drizzle-orm';
import type {
  FeatureFlagProvider,
  FeatureFlagContext,
} from '@/core/contracts/feature-flags';

export class DrizzleFeatureFlagProvider implements FeatureFlagProvider {
  constructor(private readonly db: DrizzleDb) {}

  async isEnabled(
    flagKey: string,
    context: FeatureFlagContext,
  ): Promise<boolean> {
    const flag = await this.db
      .select()
      .from(featureFlags)
      .where(
        and(
          eq(featureFlags.key, flagKey),
          eq(featureFlags.tenantId, context.tenantId ?? 'global'),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    return flag?.enabled ?? false;
  }

  async getVariant(
    flagKey: string,
    _context: FeatureFlagContext,
  ): Promise<string | null> {
    return null;
  }
}
```

---

## 8. Flag Naming Convention

```
[scope].[feature].[subfeature]

Examples:
  ui.dashboard.beta-widget
  api.users.bulk-import
  security.auth.passkey-support
  tenant.billing.usage-alerts
```

---

## 9. Flag Cleanup Discipline

Flag debt is a real risk. Every flag must have:

1. A clear owner (team/person)
2. A cleanup date or milestone
3. A tracking issue in the project tracker

```ts
// Document temporary flags with a comment
const TEMP_FLAGS = {
  /**
   * @temp Enable new user onboarding flow
   * @cleanup Q3 2026 – remove after full rollout
   * @ticket PROJ-1234
   */
  NEW_ONBOARDING: 'ui.onboarding.new-flow',
} as const;
```

---

## Risks

| Risk                                                              | Severity | Mitigation                                                                                                                                         |
| ----------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature flags used as authorization substitute                    | CRITICAL | Rule: flags control visibility, authorization contracts control permission. Never skip `createSecureServerFn` authorization because a flag is off. |
| Flag evaluation adds latency per request if external provider     | MINOR    | Use caching in provider implementation; GrowthBook/Unleash have built-in CDN caching                                                               |
| Flags not cleaned up after rollout – accumulate as dead code      | MINOR    | Mandatory cleanup date in flag declaration; periodic audit sprint                                                                                  |
| Client receives flag state in loader data – could be cached stale | MINOR    | Set appropriate `staleTime` on queries that depend on flag state                                                                                   |

---

## Validation

Phase 13 is complete when:

- [ ] `FEATURE_FLAGS.PROVIDER` is registered in DI container (stub by default)
- [ ] `isFeatureEnabled()` helper works in server function context
- [ ] Route loader flag gate redirects when flag is off
- [ ] `StubFeatureFlagProvider` always returns `false` (safe default)
- [ ] Unit test: stub provider returns false for any key
- [ ] Unit test: `isFeatureEnabled` calls provider with correct context
- [ ] `pnpm typecheck` passes
