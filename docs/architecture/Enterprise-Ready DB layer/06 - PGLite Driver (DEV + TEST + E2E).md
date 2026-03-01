```ts
// src/core/db/drivers/create-pglite.ts

import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';

export function createPglite(url?: string): DbRuntime {
  const pglite = new PGlite(url ?? './data/pglite');
  const db = drizzle(pglite);

  return {
    db,
    close: async () => {
      await pglite.close();
    },
  };
}
```

For tests you can use an isolated file path or in-memory mode depending on profile.
