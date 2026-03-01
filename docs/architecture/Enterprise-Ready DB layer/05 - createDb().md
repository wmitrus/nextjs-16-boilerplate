```ts
// src/core/db/create-db.ts

import { createPglite } from './drivers/create-pglite';
import { createPostgres } from './drivers/create-postgres';

export function createDb(config: DbConfig): DbRuntime {
  if (config.provider === 'drizzle') {
    if (config.driver === 'pglite') return createPglite(config.url);
    if (config.driver === 'postgres') return createPostgres(config.url!);
    throw new Error('Unsupported drizzle DB driver');
  }

  if (config.provider === 'prisma') {
    throw new Error('Prisma provider is not implemented yet.');
  }

  throw new Error('Unsupported DB provider');
}
```

No singletons.
