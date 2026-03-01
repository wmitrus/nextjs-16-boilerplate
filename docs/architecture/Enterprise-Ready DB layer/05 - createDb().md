```ts
// core/db/create-db.ts

import { createPglite } from './drivers/create-pglite';
import { createPostgres } from './drivers/create-postgres';

export function createDb(config: DbConfig) {
  if (config.driver === 'pglite') {
    return createPglite();
  }

  if (config.driver === 'postgres') {
    return createPostgres(config.url!);
  }

  throw new Error('Unsupported DB driver');
}
```

No singletons.
