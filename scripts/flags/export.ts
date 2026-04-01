import * as fs from 'fs';

import { createDb } from '@/core/db/create-db';
import type { DbDriver, DbProvider } from '@/core/db/types';

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

async function exportStatic(): Promise<FlagsFile> {
  const raw = process.env.FEATURE_FLAGS_STATIC;
  const parsed = parseStaticFlagsEnv(raw);

  const flags: FlagsFile['flags'] = {};
  for (const [key, enabled] of Object.entries(parsed)) {
    flags[key] = { enabled, tenantId: null };
  }

  return { flags };
}

async function exportDb(): Promise<FlagsFile> {
  const driver = resolveDriver();
  const provider = resolveProvider();
  const url = process.env.DATABASE_URL?.trim();

  if (driver === 'postgres' && !url) {
    console.error(
      '[flags:export] DATABASE_URL is required for postgres driver',
    );
    process.exit(1);
  }

  const dbRuntime = createDb({ provider, driver, url });

  try {
    const rows = await dbRuntime.db.select().from(featureFlagsTable);
    const flags: FlagsFile['flags'] = {};

    for (const row of rows) {
      flags[row.key] = {
        enabled: row.enabled,
        tenantId: row.tenantId ?? null,
        ...(row.description ? { description: row.description } : {}),
      };
    }

    return { flags };
  } finally {
    await dbRuntime.close?.();
  }
}

async function run(): Promise<void> {
  const adapter = parseArg('adapter') ?? 'static';
  const outFile = parseArg('out');

  let result: FlagsFile;

  if (adapter === 'db') {
    result = await exportDb();
  } else {
    result = await exportStatic();
  }

  const json = JSON.stringify(result, null, 2);

  if (outFile) {
    fs.writeFileSync(outFile, json, 'utf8');
    console.error(`[flags:export] Written to ${outFile}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

run().catch((err: unknown) => {
  console.error('[flags:export] Fatal error:', err);
  process.exit(1);
});
