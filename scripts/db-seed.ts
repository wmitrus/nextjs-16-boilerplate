import './load-env';

import { createDb } from '@/core/db/create-db';
import type { DbDriver, DbProvider, DrizzleDb } from '@/core/db/types';

import { seedAuthorization } from '@/modules/authorization/infrastructure/drizzle/seed';
import { seedBilling } from '@/modules/billing/infrastructure/drizzle/seed';
import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';

const DEFAULT_PGLITE_URL = 'file:./data/pglite';
const FILE_URL_PREFIX = 'file:';
const PGLITE_URL_PREFIX = 'pglite://';

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

export function resolveDatabaseUrl(
  driver: DbDriver,
  rawUrl: string | undefined,
): string | undefined {
  if (driver === 'postgres') {
    return rawUrl?.trim();
  }

  const trimmed = rawUrl?.trim();

  if (!trimmed) {
    return DEFAULT_PGLITE_URL;
  }

  if (
    trimmed.startsWith(FILE_URL_PREFIX) ||
    trimmed.startsWith(PGLITE_URL_PREFIX)
  ) {
    return trimmed;
  }

  return DEFAULT_PGLITE_URL;
}

async function seedAll(db: DrizzleDb) {
  const users = await seedUsers(db);
  const authorization = await seedAuthorization(db, { users });
  const billing = await seedBilling(db, { tenants: authorization.tenants });

  return { users, authorization, billing };
}

export async function run(): Promise<void> {
  const provider = resolveProvider();
  const driver = resolveDriver();
  const rawUrl = process.env.DATABASE_URL?.trim();
  const url = resolveDatabaseUrl(driver, rawUrl);

  if (provider === 'prisma') {
    console.error(
      '[db-seed] DB_PROVIDER=prisma is configured, but Prisma seed provider is not implemented yet.',
    );
    process.exit(1);
  }

  if (driver === 'postgres' && !url) {
    console.error('[db-seed] DATABASE_URL is required for postgres driver');
    process.exit(1);
  }

  console.log('[db-seed] Starting seed');
  console.log(`  provider : ${provider}`);
  console.log(`  driver : ${driver}`);
  console.log(`  target : ${url ?? './data/pglite'}`);

  const dbRuntime = createDb({ provider, driver, url });

  let result: Awaited<ReturnType<typeof seedAll>>;
  try {
    result = await seedAll(dbRuntime.db);
  } finally {
    await dbRuntime.close?.();
  }

  console.log('[db-seed] Seed complete');
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

const isMain =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/db-seed.ts');

if (isMain) {
  run().catch((err: unknown) => {
    console.error('[db-seed] Fatal error:', err);
    process.exit(1);
  });
}
