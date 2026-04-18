import '../load-env';

import path from 'node:path';

import { createDb } from '@/core/db/create-db';

import type { FlagsFile } from './types';
import {
  parseArg,
  resolveDriver,
  resolveProvider,
  writeTextFileWithinBase,
} from './utils';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';
import { parseStaticFlagsEnv } from '@/modules/feature-flags/infrastructure/static/StaticFeatureFlagService';

async function exportStatic(): Promise<FlagsFile> {
  const raw = process.env.FEATURE_FLAGS_STATIC;
  const parsed = parseStaticFlagsEnv(raw);

  const flags: FlagsFile['flags'] = [];
  for (const [key, enabled] of Object.entries(parsed)) {
    flags.push({ key, enabled, tenantId: null });
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

    const flags: FlagsFile['flags'] = rows.map((row) => ({
      key: row.key,
      enabled: row.enabled,
      tenantId: row.tenantId ?? null,
      ...(row.description ? { description: row.description } : {}),
    }));

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
    const resolved = path.resolve(outFile);
    writeTextFileWithinBase(resolved, process.cwd(), json);
    console.error(`[flags:export] Written to ${resolved}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('/export.ts') ||
    process.argv[1].endsWith('/export.js') ||
    process.argv[1].endsWith('/export'));

if (isMain) {
  run().catch((err: unknown) => {
    console.error('[flags:export] Fatal error:', err);
    process.exit(1);
  });
}
