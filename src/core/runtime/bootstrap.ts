import { Container } from '@/core/container';
import { INFRASTRUCTURE } from '@/core/contracts';
import type { DbConfig } from '@/core/db/types';
import { env } from '@/core/env';
import { getInfrastructure } from '@/core/runtime/infrastructure';

import { createAuthModule } from '@/modules/auth';
import type { AuthModuleConfig } from '@/modules/auth';
import { createAuthorizationModule } from '@/modules/authorization';

export { createEdgeRequestContainer } from './edge';

export interface AppConfig {
  db: DbConfig;
  auth: AuthModuleConfig;
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
  // Request scope contract:
  // - returns a fresh container per invocation (no shared mutable service graph)
  // - reuses process-scope infrastructure (DB runtime) via getInfrastructure(config)
  // This keeps request isolation while avoiding per-request DB re-initialization.
  const container = new Container();

  const { dbRuntime } = getInfrastructure(config);

  container.register(INFRASTRUCTURE.DB, dbRuntime.db);

  container.registerModule(createAuthModule(config.auth));
  container.registerModule(createAuthorizationModule({ db: dbRuntime.db }));

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
    },
  };
}

export function getAppContainer(): Container {
  // Convenience helper for default env-driven config.
  // Prefer createRequestContainer(config) in tests or multi-profile runtime setups.
  return createRequestContainer(buildConfig());
}
