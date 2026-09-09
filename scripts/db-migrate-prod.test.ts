import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  describeMigrationTarget,
  resolveMigrationUrl,
  resolveMigrationUrlWithSource,
  run,
} from './db-migrate-prod';

describe('db-migrate-prod migration URL resolution', () => {
  it('prefers DATABASE_URL_UNPOOLED over DATABASE_URL', () => {
    const resolved = resolveMigrationUrlWithSource(
      'postgresql://runtime:[REDACTED]@ep-main-pooler.example.test/app',
      'postgresql://direct:[REDACTED]@ep-branch.example.test/app',
    );

    expect(resolved).toEqual({
      source: 'DATABASE_URL_UNPOOLED',
      url: 'postgresql://direct:[REDACTED]@ep-branch.example.test/app',
    });
    expect(
      resolveMigrationUrl(
        'postgresql://runtime:[REDACTED]@ep-main-pooler.example.test/app',
        'postgresql://direct:[REDACTED]@ep-branch.example.test/app',
      ),
    ).toBe('postgresql://direct:[REDACTED]@ep-branch.example.test/app');
  });

  it('describes the migration target without exposing credentials', () => {
    const resolved = resolveMigrationUrlWithSource(
      'postgresql://runtime:[REDACTED]@ep-main-pooler.example.test/app',
      undefined,
    );

    expect(resolved).toBeDefined();

    if (!resolved) {
      throw new Error('Expected migration URL to resolve');
    }

    const target = describeMigrationTarget(resolved);

    expect(target).toEqual({
      source: 'DATABASE_URL',
      protocol: 'postgresql:',
      hostname: 'ep-main-pooler.example.test',
      database: 'app',
      pooled: true,
    });
    expect(JSON.stringify(target)).not.toContain('runtime');
    expect(JSON.stringify(target)).not.toContain('[REDACTED]');
  });
});

describe('db-migrate-prod fails closed on connection configuration (fix 2)', () => {
  const savedUrl = process.env.DATABASE_URL;
  const savedUnpooled = process.env.DATABASE_URL_UNPOOLED;

  afterEach(() => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    if (savedUnpooled === undefined) delete process.env.DATABASE_URL_UNPOOLED;
    else process.env.DATABASE_URL_UNPOOLED = savedUnpooled;
  });

  it('rejects a pooled migration URL BEFORE running any migration', async () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL =
      'postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/app';
    await expect(run([])).rejects.toThrow(/DIRECT \(unpooled\)/i);
  });

  it('requires a migration URL', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    await expect(run([])).rejects.toThrow(
      /DATABASE_URL_UNPOOLED or DATABASE_URL is required/i,
    );
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
    // Still fails closed on a pooled URL before anything runs.
    expect(source).toMatch(/assertDirectPostgresUrl\(connectionString/);
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
