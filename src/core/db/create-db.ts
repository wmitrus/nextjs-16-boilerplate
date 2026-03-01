import { createPglite } from './drivers/create-pglite';
import { createPostgres } from './drivers/create-postgres';
import type { DbConfig, DrizzleDb } from './types';

export function createDb(config: DbConfig): DrizzleDb {
  if (config.driver === 'pglite') {
    return createPglite(config.url);
  }

  if (config.driver === 'postgres') {
    if (!config.url) {
      throw new Error('DATABASE_URL is required for postgres driver');
    }
    return createPostgres(config.url);
  }

  throw new Error(`Unsupported DB driver: ${String(config.driver)}`);
}
