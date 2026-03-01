import { createDb } from '@/core/db/create-db';
import { seedAll } from '@/core/db/seed';
import type { DbDriver, DbProvider } from '@/core/db/types';

function resolveProvider(): DbProvider {
  const explicit = process.env.DB_PROVIDER?.trim();

  if (explicit === 'drizzle' || explicit === 'prisma') {
    return explicit;
  }

  return 'drizzle';
}

function resolveDriver(): DbDriver {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const explicit = process.env.DB_DRIVER?.trim();

  if (explicit === 'postgres' || explicit === 'pglite') return explicit;

  return nodeEnv === 'production' ? 'postgres' : 'pglite';
}

async function run(): Promise<void> {
  const provider = resolveProvider();
  const driver = resolveDriver();
  const url = process.env.DATABASE_URL?.trim();

  if (provider === 'prisma') {
    console.error(
      '[db:seed] DB_PROVIDER=prisma is configured, but Prisma seed provider is not implemented yet.',
    );
    process.exit(1);
  }

  if (driver === 'postgres' && !url) {
    console.error('[db:seed] DATABASE_URL is required for postgres driver');
    process.exit(1);
  }

  console.log('[db:seed] Starting seed');
  console.log(`  provider : ${provider}`);
  console.log(`  driver : ${driver}`);
  console.log(
    `  target : ${driver === 'postgres' && url ? url : (url ?? './data/pglite')}`,
  );

  const dbRuntime = createDb({ provider, driver, url });

  let result: Awaited<ReturnType<typeof seedAll>>;
  try {
    result = await seedAll(dbRuntime.db);
  } finally {
    await dbRuntime.close?.();
  }

  console.log('[db:seed] Seed complete');
  console.log(`  users         : ${Object.keys(result.users).join(', ')}`);
  console.log(
    `  tenants       : ${Object.keys(result.authorization.tenants).join(', ')}`,
  );
  console.log(
    `  roles         : ${Object.keys(result.authorization.roles).join(', ')}`,
  );
  console.log(
    `  subscriptions : ${Object.keys(result.billing.subscriptions).join(', ')}`,
  );
}

run().catch((err: unknown) => {
  console.error('[db:seed] Fatal error:', err);
  process.exit(1);
});
