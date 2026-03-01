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

export function createApp(config: AppConfig): Container {
  const container = new Container();

  const db = createDb(config.db);
  container.register(INFRASTRUCTURE.DB, db);

  container.registerModule(createAuthModule(config.auth));
  container.registerModule(createAuthorizationModule());

  return container;
}

function buildConfig(): AppConfig {
  return {
    db: {
      driver:
        env.DB_DRIVER ??
        (env.NODE_ENV === 'production' ? 'postgres' : 'pglite'),
      url: env.DATABASE_URL,
    },
    auth: {
      authProvider: env.AUTH_PROVIDER,
    },
  };
}

export const appContainer: Container = createApp(buildConfig());
