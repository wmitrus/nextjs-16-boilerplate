import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

import { runMigrations } from '../../src/core/db/migrations/run-migrations';
import type { DrizzleDb } from '../../src/core/db/types';

let container: StartedPostgreSqlContainer;

export async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();

  const url = container.getConnectionUri();

  const client = postgres(url, { max: 1 });
  const db = drizzle(client) as unknown as DrizzleDb;
  await runMigrations(db, 'postgres');
  await client.end({ timeout: 5 });

  project.provide('TEST_DATABASE_URL', url);

  return teardown;
}

async function teardown(): Promise<void> {
  await container.stop();
}
