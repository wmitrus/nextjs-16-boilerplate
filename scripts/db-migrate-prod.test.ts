import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  describeMigrationTarget,
  resolveMigrationUrl,
  resolveMigrationUrlWithSource,
  run,
} from './db-migrate-prod';

describe('db-migrate-prod migration URL resolution (Codex P1: DATABASE_URL_UNPOOLED only)', () => {
  it('accepts DATABASE_URL_UNPOOLED with a custom hostname such as direct-db.internal', () => {
    const resolved = resolveMigrationUrlWithSource(
      'postgresql://direct:[REDACTED]@direct-db.internal/app',
    );

    expect(resolved).toEqual({
      source: 'DATABASE_URL_UNPOOLED',
      url: 'postgresql://direct:[REDACTED]@direct-db.internal/app',
    });
    expect(
      resolveMigrationUrl(
        'postgresql://direct:[REDACTED]@direct-db.internal/app',
      ),
    ).toBe('postgresql://direct:[REDACTED]@direct-db.internal/app');
  });

  it('resolves to undefined when DATABASE_URL_UNPOOLED is absent, regardless of DATABASE_URL', () => {
    expect(resolveMigrationUrlWithSource(undefined)).toBeUndefined();
    expect(resolveMigrationUrl(undefined)).toBeUndefined();
  });

  it('describes the migration target without exposing credentials', () => {
    const resolved = resolveMigrationUrlWithSource(
      'postgresql://direct:[REDACTED]@ep-branch.example.test/app',
    );

    expect(resolved).toBeDefined();

    if (!resolved) {
      throw new Error('Expected migration URL to resolve');
    }

    const target = describeMigrationTarget(resolved);

    expect(target).toEqual({
      source: 'DATABASE_URL_UNPOOLED',
      protocol: 'postgresql:',
      hostname: 'ep-branch.example.test',
      database: 'app',
      pooled: false,
    });
    expect(JSON.stringify(target)).not.toContain('direct');
    expect(JSON.stringify(target)).not.toContain('[REDACTED]');
  });
});

describe('db-migrate-prod fails closed on connection configuration (fix 2 / Codex P1)', () => {
  const savedUrl = process.env.DATABASE_URL;
  const savedUnpooled = process.env.DATABASE_URL_UNPOOLED;

  afterEach(() => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    if (savedUnpooled === undefined) delete process.env.DATABASE_URL_UNPOOLED;
    else process.env.DATABASE_URL_UNPOOLED = savedUnpooled;
  });

  it('only DATABASE_URL present -> fails before running any migration (no DATABASE_URL fallback)', async () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL =
      'postgresql://u:p@direct-looking.example.test/app';
    await expect(run([])).rejects.toThrow(/DATABASE_URL_UNPOOLED is required/i);
  });

  it('only DATABASE_URL present -> also fails on --check, before opening any DB connection', async () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL =
      'postgresql://u:p@direct-looking.example.test/app';
    await expect(run(['--check'])).rejects.toThrow(
      /DATABASE_URL_UNPOOLED is required/i,
    );
  });

  it('requires a migration URL when neither var is set', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    await expect(run([])).rejects.toThrow(/DATABASE_URL_UNPOOLED is required/i);
  });

  it('DATABASE_URL_UNPOOLED containing a known pooler marker -> rejected', async () => {
    delete process.env.DATABASE_URL;
    process.env.DATABASE_URL_UNPOOLED =
      'postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/app';
    await expect(run([])).rejects.toThrow(/pooler/i);
  });

  it('when both vars are set, DATABASE_URL_UNPOOLED is the only target used (DATABASE_URL is ignored)', () => {
    process.env.DATABASE_URL =
      'postgresql://runtime:[REDACTED]@ep-main-pooler.example.test/app';
    process.env.DATABASE_URL_UNPOOLED =
      'postgresql://direct:[REDACTED]@direct-db.internal/app';

    const resolved = resolveMigrationUrlWithSource(
      process.env.DATABASE_URL_UNPOOLED,
    );

    expect(resolved).toEqual({
      source: 'DATABASE_URL_UNPOOLED',
      url: 'postgresql://direct:[REDACTED]@direct-db.internal/app',
    });
  });
});

describe('db-migrate-prod no longer runs AUD·A convergence (Codex P1)', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'scripts/db-migrate-prod.ts'),
    'utf8',
  );

  it('does not import or call the convergence executor', () => {
    // The long-running AUD·A convergence (CREATE INDEX CONCURRENTLY / VALIDATE
    // CONSTRAINT) moved to the operator-gated `db:aud-a:converge` CLI.
    expect(source).not.toMatch(/runAudAConvergenceStep/);
    expect(source).not.toMatch(/runAudAPostMigrateSteps/);
    expect(source).not.toMatch(/sqlRunnerFrom/);
    expect(source).not.toMatch(/ConvergenceEnforcement/);
    // No direct `postgres(` client is opened here any more — the migrator owns
    // its own connection via drizzle.prod.ts.
    expect(source).not.toMatch(/from 'postgres'/);
  });

  it('still runs the ordinary migrator + journal repair/validation on both paths', () => {
    expect(source).toMatch(/runDrizzleMigrate\(\)/);
    expect(source).toMatch(/drizzle-kit', 'migrate'/);
    expect(source).toMatch(/repairKnownMigrationJournalDrift/);
    expect(source).toMatch(/validateMigrationJournal/);
    expect(source).toMatch(/assertMigrationJournalComplete/);
    // Still fails closed on a known pooler marker (defense-in-depth) before
    // anything runs — the actual trust boundary is DATABASE_URL_UNPOOLED,
    // enforced earlier by resolveMigrationUrlWithSource.
    expect(source).toMatch(/assertNoKnownPoolerMarker\(connectionString/);
  });

  it('resolves the migration URL from DATABASE_URL_UNPOOLED only (no DATABASE_URL fallback)', () => {
    expect(source).toMatch(
      /resolveMigrationUrlWithSource\(\s*process\.env\.DATABASE_URL_UNPOOLED,?\s*\)/,
    );
    expect(source).not.toMatch(/process\.env\.DATABASE_URL,/);
  });

  it('points operators at the dedicated convergence CLI', () => {
    expect(source).toMatch(/db:aud-a:converge --check/);
    expect(source).toMatch(/db:aud-a:converge --apply --production-approved/);
  });

  it('--check performs no schema mutation: dry-run path is repair-dry-run + validate only', async () => {
    // `repairKnownMigrationJournalDrift({ dryRun: true })` + validate are the
    // only journal touch-points, and `--check` returns before the migrator.
    const start = source.indexOf('if (dryRun) {');
    const dryRunBlock = source.slice(
      start,
      source.indexOf('\n    return;\n  }', start),
    );
    expect(dryRunBlock).toMatch(/repairKnownMigrationJournalDrift/);
    expect(dryRunBlock).toMatch(/dryRun: true/);
    expect(dryRunBlock).toMatch(/validateMigrationJournal/);
    expect(dryRunBlock).not.toMatch(/runDrizzleMigrate/);
    expect(dryRunBlock).not.toMatch(/CREATE INDEX|VALIDATE CONSTRAINT/i);
  });
});
