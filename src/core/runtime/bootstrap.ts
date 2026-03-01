import { Container } from '@/core/container';
import { INFRASTRUCTURE } from '@/core/contracts';
import { createDb } from '@/core/db/create-db';
import type { DbConfig } from '@/core/db/types';
import { env } from '@/core/env';

import { createAuthModule } from '@/modules/auth';
import type { AuthModuleConfig } from '@/modules/auth';
import { createAuthorizationModule } from '@/modules/authorization';

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

export function createApp(config: AppConfig): Container {
  const container = new Container();

  const db = createDb(config.db);
  container.register(INFRASTRUCTURE.DB, db);

  container.registerModule(createAuthModule(config.auth));
  container.registerModule(createAuthorizationModule({ db }));

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
  return createApp(buildConfig());
}
