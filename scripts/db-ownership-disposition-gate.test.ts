import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  OwnershipDispositionEvidence,
  OwnershipDispositionTableEvidence,
} from '@/core/db/ownership-disposition-gate';
import type { SqlRunner } from '@/core/db/post-migrate-steps';

import type { OwnershipDispositionCliDeps } from './db-ownership-disposition-gate';
import {
  formatEvidence,
  parseArgs,
  run,
} from './db-ownership-disposition-gate';
import type { validateMigrationJournal } from './validate-migration-journal';

function table(
  name: 'feature_flags' | 'audit_log_settings' | 'audit_events',
  ready: boolean,
): OwnershipDispositionTableEvidence {
  const gate = name === 'audit_events' ? 'r4b1' : 'r4a';

  return {
    table: name,
    gate,
    counts: {
      total: 0,
      canonicalOrganization: 0,
      intentionalGlobal: 0,
      unresolvedLegacy: ready ? 0 : 1,
      quarantined: 0,
      organizationOwnedOrphaned: 0,
    },
    invalidCombinationCount: 0,
    constraint: {
      name: `ck_${name}_ownership_state_org`,
      exists: true,
      validated: ready,
      currentExpression: 'expected',
      expectedExpression: 'expected',
      definitionMatches: true,
      state: ready ? 'exact-validated' : 'exact-unvalidated',
    },
    dispositionSettled: ready,
    gateReady: ready,
    plannedAction: ready ? 'no-op' : 'blocked-unsettled-rows',
  };
}

function evidence(): OwnershipDispositionEvidence {
  return {
    featureFlags: table('feature_flags', true),
    auditLogSettings: table('audit_log_settings', true),
    auditEvents: table('audit_events', false),
  };
}

describe('db-ownership-disposition-gate parseArgs', () => {
  it('accepts exactly the two approved invocation shapes', () => {
    expect(parseArgs(['--check'])).toEqual({ mode: 'check' });
    expect(parseArgs(['--apply', '--production-approved'])).toEqual({
      mode: 'apply',
    });
  });

  it.each([
    { argv: [] },
    { argv: ['--apply'] },
    { argv: ['--production-approved'] },
    { argv: ['--check', '--apply'] },
    { argv: ['--check', '--production-approved'] },
    { argv: ['--wat'] },
  ] as const)('fails closed for invalid argv $argv', ({ argv }) => {
    expect(() => parseArgs(argv)).toThrow();
  });
});

describe('db-ownership-disposition-gate reporting', () => {
  it('reports R4a independently from audit_events R4b-1', () => {
    const text = formatEvidence(evidence(), 'check');

    expect(text).toContain('feature_flags R4a       : GO');
    expect(text).toContain('audit_log_settings R4a  : GO');
    expect(text).toContain('audit_events R4b-1      : NO-GO');
    expect(text).toContain(
      'audit_events R4b-1 readiness does NOT gate the independent',
    );
  });
});

describe('db-ownership-disposition-gate run', () => {
  const originalUnpooled = process.env.DATABASE_URL_UNPOOLED;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalVercelEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    if (originalUnpooled === undefined) {
      delete process.env.DATABASE_URL_UNPOOLED;
    } else {
      process.env.DATABASE_URL_UNPOOLED = originalUnpooled;
    }

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }

    vi.restoreAllMocks();
  });

  it('rejects Preview before opening a database connection', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.DATABASE_URL_UNPOOLED =
      'postgresql://user:pass@db.example.test/app';

    const openRunner = vi.fn();

    await expect(
      run(['--check'], {
        gatherEvidence: vi.fn(),
        converge: vi.fn(),
        validateJournal: vi.fn(),
        assertJournalComplete: vi.fn(),
        openRunner,
      }),
    ).rejects.toThrow(/preview is not an allowed target/);

    expect(openRunner).not.toHaveBeenCalled();
  });

  it('requires DATABASE_URL_UNPOOLED and never falls back to DATABASE_URL', async () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL = 'postgresql://user:pass@pooled.example.test/app';

    const openRunner = vi.fn();

    await expect(
      run(['--check'], {
        gatherEvidence: vi.fn(),
        converge: vi.fn(),
        validateJournal: vi.fn(),
        assertJournalComplete: vi.fn(),
        openRunner,
      }),
    ).rejects.toThrow(/DATABASE_URL_UNPOOLED is required/);

    expect(openRunner).not.toHaveBeenCalled();
  });

  it('--check gathers evidence only and never calls journal validation or convergence', async () => {
    delete process.env.VERCEL_ENV;
    process.env.DATABASE_URL_UNPOOLED =
      'postgresql://user:pass@db.example.test/app';

    const runner: SqlRunner = {
      query: vi.fn(async () => []),
    };
    const close = vi.fn(async () => undefined);
    const gatherEvidence = vi.fn(async () => evidence());
    const converge = vi.fn();
    const validateJournal = vi.fn();

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const deps: OwnershipDispositionCliDeps = {
      gatherEvidence,
      converge,
      validateJournal,
      assertJournalComplete: vi.fn(),
      openRunner: () => ({ runner, close }),
    };

    await run(['--check'], deps);

    expect(gatherEvidence).toHaveBeenCalledOnce();
    expect(validateJournal).not.toHaveBeenCalled();
    expect(converge).not.toHaveBeenCalled();
    expect(runner.query).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('--apply validates the migration journal before convergence', async () => {
    delete process.env.VERCEL_ENV;
    process.env.DATABASE_URL_UNPOOLED =
      'postgresql://user:pass@db.example.test/app';

    const runner: SqlRunner = {
      query: vi.fn(async () => []),
    };
    const close = vi.fn(async () => undefined);
    const callOrder: string[] = [];
    const current = evidence();

    const gatherEvidence = vi.fn(async () => {
      callOrder.push('evidence');
      return current;
    });

    const validateJournal = vi.fn(async () => {
      callOrder.push('journal');
      return {
        expectedCount: 26,
        recordedCount: 26,
        missing: [],
        duplicateHashes: [],
        unknownHashes: [],
      } satisfies Awaited<ReturnType<typeof validateMigrationJournal>>;
    });

    const assertJournalComplete = vi.fn(() => {
      callOrder.push('journal-assert');
    });

    const converge = vi.fn(async () => {
      callOrder.push('converge');
      return {
        before: current,
        outcomes: [
          { table: 'feature_flags', action: 'no-op' },
          { table: 'audit_log_settings', action: 'no-op' },
          { table: 'audit_events', action: 'blocked-unsettled-rows' },
        ] as const,
        after: current,
      };
    });

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run(['--apply', '--production-approved'], {
      gatherEvidence,
      converge,
      validateJournal,
      assertJournalComplete,
      openRunner: () => ({ runner, close }),
    });

    expect(callOrder).toEqual([
      'evidence',
      'journal',
      'journal-assert',
      'converge',
    ]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('--apply never converges when the migration journal gate fails', async () => {
    delete process.env.VERCEL_ENV;
    process.env.DATABASE_URL_UNPOOLED =
      'postgresql://user:pass@db.example.test/app';

    const runner: SqlRunner = {
      query: vi.fn(async () => []),
    };
    const close = vi.fn(async () => undefined);
    const converge = vi.fn();

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      run(['--apply', '--production-approved'], {
        gatherEvidence: vi.fn(async () => evidence()),
        converge,
        validateJournal: vi.fn(
          async () =>
            ({
              expectedCount: 26,
              recordedCount: 26,
              missing: [],
              duplicateHashes: [],
              unknownHashes: [],
            }) satisfies Awaited<ReturnType<typeof validateMigrationJournal>>,
        ),
        assertJournalComplete: vi.fn(() => {
          throw new Error('journal incomplete');
        }),
        openRunner: () => ({ runner, close }),
      }),
    ).rejects.toThrow('journal incomplete');

    expect(converge).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
