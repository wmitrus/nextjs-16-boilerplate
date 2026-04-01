import { and, eq, isNull } from 'drizzle-orm';

import { createDb } from '@/core/db/create-db';
import type { DbDriver, DbProvider, DrizzleDb } from '@/core/db/types';

import type { FlagsFile } from './types';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';
import { parseStaticFlagsEnv } from '@/modules/feature-flags/infrastructure/static/StaticFeatureFlagService';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function resolveDriver(): DbDriver {
  const explicit = process.env.DB_DRIVER?.trim();
  if (explicit === 'postgres' || explicit === 'pglite') return explicit;
  return process.env.NODE_ENV === 'production' ? 'postgres' : 'pglite';
}

function resolveProvider(): DbProvider {
  return (
    (process.env.DB_PROVIDER?.trim() as DbProvider | undefined) ?? 'drizzle'
  );
}

function readStaticFlags(): FlagsFile {
  const raw = process.env.FEATURE_FLAGS_STATIC;
  const parsed = parseStaticFlagsEnv(raw);
  const flags: FlagsFile['flags'] = {};
  for (const [key, enabled] of Object.entries(parsed)) {
    flags[key] = { enabled, tenantId: null };
  }
  return { flags };
}

async function readDbFlags(db: DrizzleDb): Promise<FlagsFile> {
  const rows = await db.select().from(featureFlagsTable);
  const flags: FlagsFile['flags'] = {};
  for (const row of rows) {
    flags[row.key] = {
      enabled: row.enabled,
      tenantId: row.tenantId ?? null,
      ...(row.description ? { description: row.description } : {}),
    };
  }
  return { flags };
}

async function writeToDb(db: DrizzleDb, data: FlagsFile): Promise<void> {
  const entries = Object.entries(data.flags);

  for (const [key, entry] of entries) {
    const existing = await db
      .select({ id: featureFlagsTable.id })
      .from(featureFlagsTable)
      .where(
        and(
          eq(featureFlagsTable.key, key),
          entry.tenantId
            ? eq(featureFlagsTable.tenantId, entry.tenantId)
            : isNull(featureFlagsTable.tenantId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(featureFlagsTable)
        .set({
          enabled: entry.enabled,
          description: entry.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(featureFlagsTable.id, existing[0]!.id));
    } else {
      await db.insert(featureFlagsTable).values({
        key,
        tenantId: entry.tenantId ?? null,
        enabled: entry.enabled,
        description: entry.description ?? null,
      });
    }
  }

  console.error(`[flags:migrate] Migrated ${entries.length} flag(s) to DB.`);
}

function writeToStaticFormat(data: FlagsFile): void {
  const pairs = Object.entries(data.flags)
    .filter(([, entry]) => entry.tenantId === null)
    .map(([key, entry]) => `${key}=${entry.enabled}`)
    .join(',');

  process.stdout.write(`FEATURE_FLAGS_STATIC=${pairs}\n`);
  console.error(
    '[flags:migrate] Output above is in FEATURE_FLAGS_STATIC format. ' +
      'Copy the value into your .env file to switch to the static adapter.',
  );
}

async function run(): Promise<void> {
  const from = parseArg('from') ?? 'static';
  const to = parseArg('to') ?? 'db';

  const driver = resolveDriver();
  const provider = resolveProvider();
  const url = process.env.DATABASE_URL?.trim();

  if ((from === 'db' || to === 'db') && driver === 'postgres' && !url) {
    console.error(
      '[flags:migrate] DATABASE_URL is required for postgres driver',
    );
    process.exit(1);
  }

  const dbRuntime = createDb({ provider, driver, url });

  try {
    if (from === 'static' && to === 'db') {
      const data = readStaticFlags();
      await writeToDb(dbRuntime.db, data);
    } else if (from === 'db' && to === 'static') {
      const data = await readDbFlags(dbRuntime.db);
      writeToStaticFormat(data);
    } else {
      console.error(
        `[flags:migrate] Unsupported migration path: --from=${from} --to=${to}. ` +
          'Supported: --from=static --to=db | --from=db --to=static',
      );
      process.exit(1);
    }
  } finally {
    await dbRuntime.close?.();
  }
}

run().catch((err: unknown) => {
  console.error('[flags:migrate] Fatal error:', err);
  process.exit(1);
});
