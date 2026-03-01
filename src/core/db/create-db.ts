import { createPglite } from './drivers/create-pglite';
import { createPostgres } from './drivers/create-postgres';
import type { DbConfig, DrizzleDb } from './types';

export function createDb(config: DbConfig): DrizzleDb {
  if (config.provider === 'drizzle') {
    if (config.driver === 'pglite') {
      return createPglite(config.url);
    }

    if (config.driver === 'postgres') {
      if (!config.url) {
        throw new Error('DATABASE_URL is required for postgres driver');
      }
      return createPostgres(config.url);
    }

    throw new Error(
      `[createDb] Unsupported drizzle DB driver: ${String(config.driver)}`,
    );
  }

  if (config.provider === 'prisma') {
    throw new Error(
      '[createDb] DB_PROVIDER=prisma is configured, but Prisma provider is not implemented yet.',
    );
  }

  throw new Error(
    `[createDb] Unsupported DB provider: ${String(config.provider)}`,
  );
}
