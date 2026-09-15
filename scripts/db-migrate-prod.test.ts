import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

const mockSpawnSync = vi.hoisted(() =>
  vi.fn(() => ({ status: 0, error: null })),
);

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  return {
    ...actual,
    spawnSync: mockSpawnSync,
    default: { ...actual.default, spawnSync: mockSpawnSync },
  };
});

vi.mock('./reconcile-known-migration-state', () => ({
  reconcileKnownMigrationState: vi.fn(async () => ({
    journalTablePresent: true,
    dryRun: false,
    decisions: [],
    appliedTags: [],
  })),
}));

vi.mock('./validate-migration-journal', () => ({
  repairKnownMigrationJournalDrift: vi.fn(async () => ({
    dryRun: false,
    repaired: [],
    skipped: [],
  })),
  validateMigrationJournal: vi.fn(async () => ({
    expectedCount: 1,
    recordedCount: 1,
    missing: [],
    duplicateHashes: [],
    unknownHashes: [],
  })),
  assertMigrationJournalComplete: vi.fn(() => {}),
  formatMigrationJournalSummary: vi.fn(() => 'ok'),
}));

import {
  describeMigrationTarget,
  resolveMigrationUrl,
  resolveMigrationUrlWithSource,
  run,
  type MigrateProdDeps,
} from './db-migrate-prod';
import {
  assertMigrationJournalComplete,
  validateMigrationJournal,
} from './validate-migration-journal';

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

  it('describes the migration target without exposing credentials or claiming a verified "direct" endpoint (Codex P1)', () => {
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
      knownPoolerMarker: false,
      trust: 'explicitly operator-configured unpooled endpoint',
    });
    expect(JSON.stringify(target)).not.toContain('direct:');
    expect(JSON.stringify(target)).not.toContain('[REDACTED]');
    // Never claims the endpoint is verified "direct" — only that no KNOWN
    // pooler marker matched.
    expect(JSON.stringify(target)).not.toMatch(/"direct"/);
  });

  it('reports knownPoolerMarker: true for a URL carrying a known pooler marker — same predicate the reject path uses', () => {
    const resolved = resolveMigrationUrlWithSource(
      'postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/app',
    )!;
    expect(describeMigrationTarget(resolved).knownPoolerMarker).toBe(true);
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

// ── Preview auto-convergence (Codex P2 restore) ────────────────────────────
function makeConvergeDeps() {
  const runner = { query: vi.fn(async () => []) };
  const close = vi.fn(async () => {});
  const openConvergenceRunner = vi.fn((_url: string) => ({ runner, close }));
  const runConvergence = vi.fn(async () => ({ indexes: [], foreignKeys: [] }));
  const deps: MigrateProdDeps = { runConvergence, openConvergenceRunner };
  return { deps, runner, close, runConvergence, openConvergenceRunner };
}

describe('db-migrate-prod VERCEL_ENV=preview auto-convergence (Codex P2 restore)', () => {
  const savedUnpooled = process.env.DATABASE_URL_UNPOOLED;
  const savedVercelEnv = process.env.VERCEL_ENV;
  const DIRECT = 'postgresql://u:p@ep-preview.us-east-1.aws.neon.tech/app';

  afterEach(() => {
    if (savedUnpooled === undefined) delete process.env.DATABASE_URL_UNPOOLED;
    else process.env.DATABASE_URL_UNPOOLED = savedUnpooled;
    if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = savedVercelEnv;
    vi.clearAllMocks();
    mockSpawnSync.mockReturnValue({ status: 0, error: null });
  });

  it('VERCEL_ENV=preview runs the SHARED convergence executor exactly once, after migration + exact journal validation succeed', async () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    process.env.VERCEL_ENV = 'preview';
    const h = makeConvergeDeps();

    await run([], h.deps);

    expect(h.openConvergenceRunner).toHaveBeenCalledTimes(1);
    expect(h.openConvergenceRunner).toHaveBeenCalledWith(DIRECT);
    expect(h.runConvergence).toHaveBeenCalledTimes(1);
    expect(h.runConvergence).toHaveBeenCalledWith(h.runner, 'concurrent', {
      enforcement: 'enforce',
    });
    expect(h.close).toHaveBeenCalledTimes(1);

    // "after migration + journal success": the journal gate ran, and ran
    // strictly BEFORE the convergence call.
    const journalOrder = (assertMigrationJournalComplete as unknown as Mock)
      .mock.invocationCallOrder[0]!;
    const convergeOrder = h.runConvergence.mock.invocationCallOrder[0]!;
    expect(journalOrder).toBeLessThan(convergeOrder);
  });

  it('VERCEL_ENV=production never auto-runs convergence — stays the operator-gated db:aud-a:converge path', async () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    process.env.VERCEL_ENV = 'production';
    const h = makeConvergeDeps();

    await run([], h.deps);

    expect(h.openConvergenceRunner).not.toHaveBeenCalled();
    expect(h.runConvergence).not.toHaveBeenCalled();
  });

  it('no VERCEL_ENV (ordinary local/CI/manual run) never auto-runs convergence', async () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    delete process.env.VERCEL_ENV;
    const h = makeConvergeDeps();

    await run([], h.deps);

    expect(h.openConvergenceRunner).not.toHaveBeenCalled();
    expect(h.runConvergence).not.toHaveBeenCalled();
  });

  it('--check never auto-runs convergence even when VERCEL_ENV=preview (dry-run mutates nothing)', async () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    process.env.VERCEL_ENV = 'preview';
    const h = makeConvergeDeps();

    await run(['--check'], h.deps);

    expect(h.openConvergenceRunner).not.toHaveBeenCalled();
    expect(h.runConvergence).not.toHaveBeenCalled();
  });

  it('validateMigrationJournal target: the SAME DATABASE_URL_UNPOOLED, not a second resolution', async () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    process.env.VERCEL_ENV = 'preview';
    const h = makeConvergeDeps();

    await run([], h.deps);

    const calls = (validateMigrationJournal as unknown as Mock).mock.calls;
    expect(calls.at(-1)![0]).toEqual({ connectionString: DIRECT });
  });
});

describe('db-migrate-prod: AUD·A convergence is conditional (Preview only), never inline for Production (Codex P1/P2)', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'scripts/db-migrate-prod.ts'),
    'utf8',
  );

  it('reuses the SAME shared convergence executor — no second implementation', () => {
    expect(source).toMatch(/runAudAPostMigrateSteps/);
    expect(source).toMatch(/sqlRunnerFromPostgres/);
  });

  it("gates the executor behind VERCEL_ENV === 'preview'", () => {
    expect(source).toMatch(/VERCEL_ENV\s*!==\s*'preview'/);
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

  it('points operators at the dedicated convergence CLI for ordinary Production', () => {
    expect(source).toMatch(/db:aud-a:converge --check/);
    expect(source).toMatch(/db:aud-a:converge --apply --production-approved/);
  });

  it('never reports an unverified endpoint as "direct" (Codex P1)', () => {
    expect(source).not.toMatch(/pooled\s*\?\s*'POOLED'\s*:\s*'direct'/);
    expect(source).not.toMatch(/:\s*\/pooler\/i\.test/);
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
    expect(dryRunBlock).not.toMatch(/runPreviewConvergence/);
  });
});
