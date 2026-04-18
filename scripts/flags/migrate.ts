import '../load-env';

import { and, eq, isNull } from 'drizzle-orm';

import { createDb } from '@/core/db/create-db';
import type { DrizzleDb } from '@/core/db/types';

import type { FlagsFile } from './types';
import {
  isSchemaNotFoundError,
  parseArg,
  resolveDriver,
  resolveProvider,
} from './utils';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';
import { parseStaticFlagsEnv } from '@/modules/feature-flags/infrastructure/static/StaticFeatureFlagService';

export function readStaticFlags(): FlagsFile {
  const raw = process.env.FEATURE_FLAGS_STATIC;
  const parsed = parseStaticFlagsEnv(raw);
  const flags: FlagsFile['flags'] = [];
  for (const [key, enabled] of Object.entries(parsed)) {
    flags.push({ key, enabled, tenantId: null });
  }
  return { flags };
}

async function readDbFlags(db: DrizzleDb): Promise<FlagsFile> {
  const rows = await db.select().from(featureFlagsTable);
  return {
    flags: rows.map((row) => ({
      key: row.key,
      enabled: row.enabled,
      tenantId: row.tenantId ?? null,
      ...(row.description ? { description: row.description } : {}),
    })),
  };
}

async function writeToDb(db: DrizzleDb, data: FlagsFile): Promise<void> {
  for (const entry of data.flags) {
    const existing = await db
      .select({ id: featureFlagsTable.id })
      .from(featureFlagsTable)
      .where(
        and(
          eq(featureFlagsTable.key, entry.key),
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
        key: entry.key,
        tenantId: entry.tenantId ?? null,
        enabled: entry.enabled,
        description: entry.description ?? null,
      });
    }
  }

  console.error(`[flags:migrate] Migrated ${data.flags.length} flag(s) to DB.`);
}

export function writeToStaticFormat(data: FlagsFile): void {
  const pairs = data.flags
    .filter((entry) => entry.tenantId === null)
    .map((entry) => `${entry.key}=${entry.enabled}`)
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
  } catch (err) {
    if (isSchemaNotFoundError(err)) {
      console.error(
        "[flags:migrate] DB schema not ready. Run 'pnpm db:pglite:migrate' first to apply the feature_flags migration.",
      );
      process.exit(1);
    }
    throw err;
  } finally {
    await dbRuntime.close?.();
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('/migrate.ts') ||
    process.argv[1].endsWith('/migrate.js') ||
    process.argv[1].endsWith('/migrate'));

if (isMain) {
  run().catch((err: unknown) => {
    console.error('[flags:migrate] Fatal error:', err);
    process.exit(1);
  });
}
