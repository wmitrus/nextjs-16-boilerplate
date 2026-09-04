import '../load-env';

import * as fs from 'fs';
import path from 'node:path';

import { and, eq, isNull } from 'drizzle-orm';

import { createDb } from '@/core/db/create-db';
import type { DrizzleDb } from '@/core/db/types';

import type { FlagEntry, FlagsFile } from './types';
import {
  isSchemaNotFoundError,
  parseArg,
  readTextFileWithinBase,
  resolveDriver,
  resolveProvider,
} from './utils';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';

export class FlagsInputError extends Error {
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
    raw = readTextFileWithinBase(resolved, process.cwd());
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

type ImportPlanItem =
  | {
      readonly entry: FlagEntry;
      readonly action: 'update';
      readonly id: string;
    }
  | { readonly entry: FlagEntry; readonly action: 'insert-global' };

/**
 * Upsert legacy-format flag entries into `feature_flags`.
 *
 * Post-FF·B writer invariant (OZI-71): every NEW `feature_flags` row must carry
 * canonical ownership — `flags:import` can only produce that for a GLOBAL row
 * (`tenant_id IS NULL` -> `ownership_state = 'intentional_global'`). It NEVER
 * relies on the `unresolved_legacy` schema default and NEVER creates a new
 * organization-scoped row, because it cannot authoritatively resolve the
 * canonical organization from a legacy `tenantId`. Existing rows are
 * update-only: their `organization_id` / `ownership_state` are left to FF·C's
 * evidence-based historical classification.
 *
 * Fails CLOSED before any write: if any entry would create a new scoped row,
 * nothing is inserted or updated.
 *
 * Duplicate legacy identities `(key, tenantId)` in one input collapse to a
 * single operation with LAST-WRITE-WINS values for `enabled` / `description`,
 * preserving the historical sequential-upsert behavior (a second occurrence
 * used to see the row the first one wrote and UPDATE it).
 */
export async function upsertFlags(
  db: DrizzleDb,
  data: FlagsFile,
): Promise<void> {
  if (data.flags.length === 0) {
    console.error('[flags:import] No flags found in input. Nothing to import.');
    return;
  }

  // Collapse duplicate identities to last-write-wins. Key on a JSON tuple so a
  // key/tenantId containing the separator can't forge a collision.
  const byIdentity = new Map<string, FlagEntry>();
  for (const entry of data.flags) {
    byIdentity.set(JSON.stringify([entry.key, entry.tenantId]), entry);
  }
  const uniqueEntries = [...byIdentity.values()];

  // Classify EVERY identity against the DB first — fail closed before mutating.
  const plan: ImportPlanItem[] = [];
  const rejectedScopedKeys: string[] = [];

  for (const entry of uniqueEntries) {
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

    const [existingRow] = existing;

    if (existingRow !== undefined) {
      plan.push({ entry, action: 'update', id: existingRow.id });
    } else if (entry.tenantId === null) {
      plan.push({ entry, action: 'insert-global' });
    } else {
      rejectedScopedKeys.push(entry.key);
    }
  }

  if (rejectedScopedKeys.length > 0) {
    throw new FlagsInputError(
      `[flags:import] Refusing to create ${rejectedScopedKeys.length} brand-new ` +
        `organization-scoped feature flag(s): ${rejectedScopedKeys.join(', ')}.\n` +
        '  After canonical dual-write activation (OZI-71 FF·B) a NEW feature_flags ' +
        'row must carry canonical ownership (organization_id + ownership_state = ' +
        "'canonical_organization'), and flags:import cannot resolve the canonical " +
        'organization from a legacy tenantId. Create scoped flags through the ' +
        'organization-aware admin creation path instead.\n' +
        '  (Updating EXISTING scoped rows via flags:import is still allowed; ' +
        'GLOBAL rows are still created as intentional_global.)',
    );
  }

  for (const item of plan) {
    if (item.action === 'update') {
      await db
        .update(featureFlagsTable)
        .set({
          enabled: item.entry.enabled,
          description: item.entry.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(featureFlagsTable.id, item.id));
    } else {
      await db.insert(featureFlagsTable).values({
        key: item.entry.key,
        tenantId: null,
        organizationId: null,
        ownershipState: 'intentional_global',
        enabled: item.entry.enabled,
        description: item.entry.description ?? null,
      });
    }
  }

  console.error(
    `[flags:import] Imported ${uniqueEntries.length} flag(s) into DB.`,
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
    if (err instanceof FlagsInputError) {
      console.error(err.message);
      process.exit(1);
    }
    if (isSchemaNotFoundError(err)) {
      const migrationCommand =
        driver === 'postgres'
          ? 'pnpm db:dev:migrate'
          : 'pnpm db:pglite:migrate';

      console.error(
        `[flags:import] DB schema not ready. Run '${migrationCommand}' first to apply the feature_flags migration.`,
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
