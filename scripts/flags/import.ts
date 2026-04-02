import '../load-env';

import * as fs from 'fs';
import path from 'node:path';

import { and, eq, isNull } from 'drizzle-orm';

import { createDb } from '@/core/db/create-db';
import type { DrizzleDb } from '@/core/db/types';

import type { FlagsFile } from './types';
import {
  assertPathWithinBase,
  isSchemaNotFoundError,
  parseArg,
  resolveDriver,
  resolveProvider,
} from './utils';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';

function readInput(filePath: string | undefined): FlagsFile {
  let raw: string;

  if (filePath) {
    const resolved = path.resolve(filePath);
    assertPathWithinBase(resolved, process.cwd());
    raw = fs.readFileSync(resolved, 'utf8');
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
  } catch (err) {
    if (isSchemaNotFoundError(err)) {
      console.error(
        "[flags:import] DB schema not ready. Run 'pnpm db:migrate:dev' first to apply the feature_flags migration.",
      );
      process.exit(1);
    }
    throw err;
  } finally {
    await dbRuntime.close?.();
  }
}

run().catch((err: unknown) => {
  console.error('[flags:import] Fatal error:', err);
  process.exit(1);
});
