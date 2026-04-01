import * as fs from 'fs';

import { eq, and, isNull } from 'drizzle-orm';

import { createDb } from '@/core/db/create-db';
import type { DbDriver, DbProvider, DrizzleDb } from '@/core/db/types';

import type { FlagsFile } from './types';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';

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

function readInput(filePath: string | undefined): FlagsFile {
  let raw: string;

  if (filePath) {
    raw = fs.readFileSync(filePath, 'utf8');
  } else {
    raw = fs.readFileSync('/dev/stdin', 'utf8');
  }

  return JSON.parse(raw) as FlagsFile;
}

async function upsertFlags(db: DrizzleDb, data: FlagsFile): Promise<void> {
  const entries = Object.entries(data.flags);

  if (entries.length === 0) {
    console.error('[flags:import] No flags found in input. Nothing to import.');
    return;
  }

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

  console.error(`[flags:import] Imported ${entries.length} flag(s) into DB.`);
}

async function run(): Promise<void> {
  const adapter = parseArg('adapter') ?? 'db';
  const filePath = parseArg('file');

  if (adapter !== 'db') {
    console.error(
      `[flags:import] Adapter "${adapter}" is not supported for import. Only "db" is writable.`,
    );
    process.exit(1);
  }

  const driver = resolveDriver();
  const provider = resolveProvider();
  const url = process.env.DATABASE_URL?.trim();

  if (driver === 'postgres' && !url) {
    console.error(
      '[flags:import] DATABASE_URL is required for postgres driver',
    );
    process.exit(1);
  }

  const data = readInput(filePath);
  const dbRuntime = createDb({ provider, driver, url });

  try {
    await upsertFlags(dbRuntime.db, data);
  } finally {
    await dbRuntime.close?.();
  }
}

run().catch((err: unknown) => {
  console.error('[flags:import] Fatal error:', err);
  process.exit(1);
});
