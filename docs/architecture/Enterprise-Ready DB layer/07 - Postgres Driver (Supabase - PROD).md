```ts
// core/db/drivers/create-postgres.ts

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export function createPostgres(url: string) {
  const pool = new Pool({ connectionString: url });
  return drizzle(pool);
}
```
