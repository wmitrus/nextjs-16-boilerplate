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

class FlagsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlagsInputError';
  }
}

export function parseFlagsJson(raw: string): FlagsFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FlagsInputError(
      '[flags:import] Failed to parse input as JSON. Ensure the file contains valid JSON.',
    );
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('flags' in (parsed as object))
  ) {
    throw new FlagsInputError(
      '[flags:import] Invalid input: missing top-level "flags" field.\n' +
        '  Expected format: { "flags": [{ "key": "...", "enabled": true, "tenantId": null }] }',
    );
  }

  const { flags } = parsed as { flags: unknown };

  if (!Array.isArray(flags)) {
    if (typeof flags === 'object' && flags !== null) {
      throw new FlagsInputError(
        '[flags:import] Old export format detected.\n' +
          '  The "flags" field is an object map (pre-array format), but the current format requires an array.\n' +
          '  Regenerate your backup with: pnpm flags:export --adapter=db --out=flags-backup.json',
      );
    }
    throw new FlagsInputError(
      '[flags:import] Invalid input: "flags" must be an array.\n' +
        '  Expected format: { "flags": [{ "key": "...", "enabled": true, "tenantId": null }] }',
    );
  }

  return parsed as FlagsFile;
}

function readInput(filePath: string | undefined): FlagsFile {
  let raw: string;

  if (filePath) {
    const resolved = path.resolve(filePath);
    assertPathWithinBase(resolved, process.cwd());
    raw = fs.readFileSync(resolved, 'utf8');
  } else {
    raw = fs.readFileSync('/dev/stdin', 'utf8');
  }

  try {
    return parseFlagsJson(raw);
  } catch (err) {
    if (err instanceof FlagsInputError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

async function upsertFlags(db: DrizzleDb, data: FlagsFile): Promise<void> {
  if (data.flags.length === 0) {
    console.error('[flags:import] No flags found in input. Nothing to import.');
    return;
  }

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

  console.error(
    `[flags:import] Imported ${data.flags.length} flag(s) into DB.`,
  );
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
        "[flags:import] DB schema not ready. Run 'pnpm db:pglite:migrate' first to apply the feature_flags migration.",
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
  (process.argv[1].endsWith('/import.ts') ||
    process.argv[1].endsWith('/import.js') ||
    process.argv[1].endsWith('/import'));

if (isMain) {
  run().catch((err: unknown) => {
    console.error('[flags:import] Fatal error:', err);
    process.exit(1);
  });
}
