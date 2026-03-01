```ts
// core/db/drivers/create-pglite.ts

import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';

export function createPglite() {
  const client = new PGlite('file:dev.db');
  return drizzle(client);
}
```

For tests you can use :memory:
