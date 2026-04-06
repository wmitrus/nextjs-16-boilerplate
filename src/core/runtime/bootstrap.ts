import 'server-only';

import { cache } from 'react';

import { Container } from '@/core/container';
import { FEATURE_FLAGS, INFRASTRUCTURE, PROVISIONING } from '@/core/contracts';
import type { DbConfig } from '@/core/db/types';
import {
  env,
  validateAuthProviderConfigValues,
  validateTenancyConfigValues,
} from '@/core/env';
import {
  recordContainerCreated,
  withContainerCreationSpan,
} from '@/core/observability/new-relic';
import { getInfrastructure } from '@/core/runtime/infrastructure';

import { createAuthModule } from '@/modules/auth';
import type { AuthModuleConfig } from '@/modules/auth';
import { createAuthorizationModule } from '@/modules/authorization';
import { DrizzleMembershipRepository } from '@/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository';
import { createFeatureFlagService } from '@/modules/feature-flags/factory';
import { DrizzleProvisioningService } from '@/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService';

export { createEdgeRequestContainer } from './edge';

export interface AppConfig {
  db: DbConfig;
  auth: Omit<AuthModuleConfig, 'membershipRepository'>;
  provisioning: {
    freeTierMaxUsers: number;
    crossProviderEmailLinking: 'disabled' | 'verified-only';
  };
}

function resolveDbProvider(): DbConfig['provider'] {
  return env.DB_PROVIDER ?? 'drizzle';
}

function resolveDbDriver(): DbConfig['driver'] {
  const provider = resolveDbProvider();
  const configuredDriver = env.DB_DRIVER;

  if (provider === 'prisma' && configuredDriver === 'pglite') {
    throw new Error(
      '[bootstrap] DB_PROVIDER=prisma cannot be used with DB_DRIVER=pglite. Use postgres or leave DB_DRIVER unset.',
    );
  }

  if (
    provider === 'prisma' &&
    env.NODE_ENV === 'production' &&
    !env.DATABASE_URL
  ) {
    throw new Error(
      '[bootstrap] DB_PROVIDER=prisma in production requires DATABASE_URL.',
    );
  }

  return (
    configuredDriver ?? (env.NODE_ENV === 'production' ? 'postgres' : 'pglite')
  );
}

export function createRequestContainer(config: AppConfig): Container {
  validateAuthProviderConfigValues(
    config.auth.authProvider,
    env.CLERK_SECRET_KEY,
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
  validateTenancyConfigValues(
    config.auth.tenancyMode,
    config.auth.defaultTenantId,
    config.auth.tenantContextSource,
  );

  const container = new Container();
  const { dbRuntime } = getInfrastructure(config);

  container.register(INFRASTRUCTURE.DB, dbRuntime.db);

  const membershipRepository =
    config.auth.tenancyMode === 'org' &&
    config.auth.tenantContextSource === 'db'
      ? new DrizzleMembershipRepository(dbRuntime.db)
      : undefined;

  container.registerModule(
    createAuthModule({ ...config.auth, membershipRepository }),
  );
  container.registerModule(createAuthorizationModule({ db: dbRuntime.db }));

  container.register(
    FEATURE_FLAGS.SERVICE,
    createFeatureFlagService(env.FEATURE_FLAG_PROVIDER, {
      staticFlags: env.FEATURE_FLAGS_STATIC,
      db: dbRuntime.db,
      growthbookClientKey: env.GROWTHBOOK_CLIENT_KEY,
      growthbookApiHost: env.GROWTHBOOK_API_HOST,
    }),
  );

  container.register(
    PROVISIONING.SERVICE,
    new DrizzleProvisioningService(
      dbRuntime.db,
      config.provisioning.freeTierMaxUsers,
      config.provisioning.crossProviderEmailLinking,
    ),
  );

  return container;
}

function buildConfig(): AppConfig {
  return {
    db: {
      provider: resolveDbProvider(),
      driver: resolveDbDriver(),
      url: env.DATABASE_URL,
    },
    auth: {
      authProvider: env.AUTH_PROVIDER,
      tenancyMode: env.TENANCY_MODE,
      defaultTenantId: env.DEFAULT_TENANT_ID,
      tenantContextSource: env.TENANT_CONTEXT_SOURCE,
      tenantContextHeader: env.TENANT_CONTEXT_HEADER,
      tenantContextCookie: env.TENANT_CONTEXT_COOKIE,
    },
    provisioning: {
      freeTierMaxUsers: env.FREE_TIER_MAX_USERS,
      crossProviderEmailLinking: env.CROSS_PROVIDER_EMAIL_LINKING,
    },
  };
}

// Module-level constant — MUST remain at module scope.
// React.cache() creates a single memoized function reference shared by all
// callers. Moving this inside getAppContainer() would create a new cache()
// scope on every call, silently breaking per-request deduplication.
//
// Lifecycle:
//   RSC render pass  → same Container returned on every call within the pass
//   Server Action    → per-invocation Container (cache() is invocation-scoped)
//   New request      → React invalidates the cache, new Container is created
const getRequestScopedContainer = cache((): Container => {
  const instanceId = crypto.randomUUID();

  const container = withContainerCreationSpan(() =>
    createRequestContainer(buildConfig()),
  );

  recordContainerCreated(instanceId, 'rsc');

  return container;
});

export function getAppContainer(): Container {
  return getRequestScopedContainer();
}
