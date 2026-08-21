import '../load-env';

import { createDb } from '@/core/db/create-db';
import type { DbDriver, DbProvider } from '@/core/db/types';

import { purgeExpiredAuditEvents } from '@/modules/audit-log/infrastructure/drizzle/purge-expired-events';

const DEFAULT_PGLITE_URL = 'file:./data/pglite';
const FILE_URL_PREFIX = 'file:';
const PGLITE_URL_PREFIX = 'pglite://';

function resolveProvider(): DbProvider {
  const explicit = process.env.DB_PROVIDER?.trim();
  return explicit === 'drizzle' || explicit === 'prisma' ? explicit : 'drizzle';
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
  if (!trimmed) return DEFAULT_PGLITE_URL;

  if (
    trimmed.startsWith(FILE_URL_PREFIX) ||
    trimmed.startsWith(PGLITE_URL_PREFIX)
  ) {
    return trimmed;
  }

  return DEFAULT_PGLITE_URL;
}

export async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const provider = resolveProvider();
  const driver = resolveDriver();
  const rawUrl = process.env.DATABASE_URL?.trim();
  const url = resolveDatabaseUrl(driver, rawUrl);

  if (provider === 'prisma') {
    console.error(
      '[audit-log:purge] DB_PROVIDER=prisma is configured, but Prisma provider is not implemented yet.',
    );
    process.exit(1);
  }

  if (driver === 'postgres' && !url) {
    console.error(
      '[audit-log:purge] DATABASE_URL is required for postgres driver',
    );
    process.exit(1);
  }

  console.log(`[audit-log:purge] Starting${dryRun ? ' (dry run)' : ''}`);
  console.log(`  provider : ${provider}`);
  console.log(`  driver   : ${driver}`);
  console.log(`  target   : ${url ?? './data/pglite'}`);

  const dbRuntime = createDb({ provider, driver, url });

  try {
    const results = await purgeExpiredAuditEvents(dbRuntime.db, { dryRun });

    let totalDeleted = 0;
    for (const { pair, retentionDays, deleted } of results) {
      totalDeleted += deleted;
      console.log(
        `  ${pair.category} / tenant=${pair.tenantId ?? '(none)'} : retention=${retentionDays}d, ${dryRun ? 'would delete' : 'deleted'}=${deleted}`,
      );
    }

    console.log(
      `[audit-log:purge] Done. ${results.length} (category, tenant) pair(s) checked, ${totalDeleted} row(s) ${dryRun ? 'would be' : ''} deleted.`,
    );
  } finally {
    await dbRuntime.close?.();
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/purge-expired.ts');

if (isMain) {
  run().catch((err: unknown) => {
    console.error('[audit-log:purge] Fatal error:', err);
    process.exit(1);
  });
}
