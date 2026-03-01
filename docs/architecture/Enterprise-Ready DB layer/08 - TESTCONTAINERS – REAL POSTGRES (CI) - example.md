```ts
import { PostgreSqlContainer } from 'testcontainers';
import { createDb } from '@/core/db/create-db';

let container;
let dbRuntime;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();

  dbRuntime = createDb({
    provider: 'drizzle',
    driver: 'postgres',
    url: container.getConnectionUri(),
  });
});

afterAll(async () => {
  await dbRuntime?.close?.();
  await container?.stop();
});
```

This gives you a real PostgreSQL database, with actual migrations and 100% compatibility with production.
