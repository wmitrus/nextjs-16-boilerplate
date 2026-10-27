import type { TestProject } from 'vitest/node';

import {
  startIsolatedPostgres,
  type IsolatedPostgres,
} from './isolated-postgres';

let database: IsolatedPostgres;

export async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  database = await startIsolatedPostgres();

  project.provide('TEST_DATABASE_URL', database.url);

  return teardown;
}

async function teardown(): Promise<void> {
  await database.stop();
}
