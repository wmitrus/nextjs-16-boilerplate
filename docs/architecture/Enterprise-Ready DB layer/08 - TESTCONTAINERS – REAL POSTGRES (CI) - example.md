```ts
import { PostgreSqlContainer } from 'testcontainers';
import { createDb } from '@/core/db/create-db';

let container;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();

  db = createDb({
    driver: 'postgres',
    url: container.getConnectionUri(),
  });
});
```

This gives you a real PostgreSQL database, with actual migrations and 100% compatibility with production.
