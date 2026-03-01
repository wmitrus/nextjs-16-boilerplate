import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type { DbRuntime } from '../types';

export function createPostgres(url: string): DbRuntime {
  const client = postgres(url);
  const db = drizzle(client);

  return {
    db,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}
