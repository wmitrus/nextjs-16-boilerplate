import { Container } from '@/core/container';
import { INFRASTRUCTURE, PROVISIONING } from '@/core/contracts';
import type { DbConfig } from '@/core/db/types';
import { env, validateTenancyConfigValues } from '@/core/env';
import { getInfrastructure } from '@/core/runtime/infrastructure';

import { createAuthModule } from '@/modules/auth';
import type { AuthModuleConfig } from '@/modules/auth';
import { createAuthorizationModule } from '@/modules/authorization';
import { DrizzleMembershipRepository } from '@/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository';
import { DrizzleProvisioningService } from '@/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService';

export { createEdgeRequestContainer } from './edge';

export interface AppConfig {
  db: DbConfig;
  auth: Omit<AuthModuleConfig, 'membershipRepository'>;
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
    PROVISIONING.SERVICE,
    new DrizzleProvisioningService(dbRuntime.db, env.FREE_TIER_MAX_USERS),
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
  };
}

export function getAppContainer(): Container {
  return createRequestContainer(buildConfig());
}
