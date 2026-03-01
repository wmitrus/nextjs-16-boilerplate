import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type { DrizzleDb } from '../types';

export function createPostgres(url: string): DrizzleDb {
  return drizzle(postgres(url)) as unknown as DrizzleDb;
}
