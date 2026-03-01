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

function resolveDbDriver(): DbConfig['driver'] {
  const legacyProvider = process.env.DB_PROVIDER?.trim();
  const configuredDriver = env.DB_DRIVER;

  if (legacyProvider && !configuredDriver) {
    throw new Error(
      '[bootstrap] Detected legacy DB_PROVIDER without DB_DRIVER. DB_PROVIDER is no longer used. Set DB_DRIVER to pglite or postgres.',
    );
  }

  if (legacyProvider && configuredDriver && env.NODE_ENV !== 'test') {
    process.emitWarning(
      '[bootstrap] DB_PROVIDER is legacy and ignored. Using DB_DRIVER for runtime DB selection.',
      {
        code: 'LEGACY_DB_PROVIDER_IGNORED',
      },
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
