import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseArgs, run, type S7CutoverDeps } from './db-s7-cutover';

const DIRECT = 'postgresql://operator:secret@ep-main.example.test/app';

function makeDeps(overrides: Partial<S7CutoverDeps> = {}): {
  deps: S7CutoverDeps;
  gatherEvidence: ReturnType<typeof vi.fn>;
  applyMigration: ReturnType<typeof vi.fn>;
} {
  const gatherEvidence = vi.fn(async () => ({
    preS7Schema: false,
    waitlistTenantIdExists: true,
    waitlistRowsWithTenantId: 0,
    policiesNullOrganizationId: 0,
    policiesOrganizationIdNullable: true,
    policiesHelperCheckExists: false,
  }));

  const applyMigration = vi.fn(async () => {});

  return {
    deps: {
      gatherEvidence,
      applyMigration,
      ...overrides,
    },
    gatherEvidence,
    applyMigration,
  };
}

describe('db:s7:cutover argument gate', () => {
  it('accepts --check', () => {
    expect(parseArgs(['--check'])).toEqual({ mode: 'check' });
  });

  it('accepts only explicit approved apply', () => {
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
  ])('fails closed for invalid argv $argv', ({ argv }) => {
    expect(() => parseArgs(argv)).toThrow();
  });
});

describe('db:s7:cutover orchestration', () => {
  const savedUnpooled = process.env.DATABASE_URL_UNPOOLED;
  const savedVercelEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    if (savedUnpooled === undefined) {
      delete process.env.DATABASE_URL_UNPOOLED;
    } else {
      process.env.DATABASE_URL_UNPOOLED = savedUnpooled;
    }

    if (savedVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = savedVercelEnv;
    }

    vi.restoreAllMocks();
  });

  it('--check gathers evidence but never mutates', async () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    delete process.env.VERCEL_ENV;
    const h = makeDeps();

    await run(['--check'], h.deps);

    expect(h.gatherEvidence).toHaveBeenCalledTimes(1);
    expect(h.gatherEvidence).toHaveBeenCalledWith(DIRECT);
    expect(h.applyMigration).not.toHaveBeenCalled();
  });

  it('approved apply gathers evidence before invoking guarded migration', async () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    delete process.env.VERCEL_ENV;
    const h = makeDeps();

    await run(['--apply', '--production-approved'], h.deps);

    expect(h.gatherEvidence).toHaveBeenCalledTimes(1);
    expect(h.applyMigration).toHaveBeenCalledTimes(1);

    expect(h.gatherEvidence.mock.invocationCallOrder[0]).toBeLessThan(
      h.applyMigration.mock.invocationCallOrder[0],
    );
  });

  it('blocks apply when waitlist tenant data still exists', async () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    delete process.env.VERCEL_ENV;

    const h = makeDeps({
      gatherEvidence: vi.fn(async () => ({
        preS7Schema: false,
        waitlistTenantIdExists: true,
        waitlistRowsWithTenantId: 1,
        policiesNullOrganizationId: 0,
        policiesOrganizationIdNullable: true,
        policiesHelperCheckExists: false,
      })),
    });

    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).rejects.toThrow(/waitlist row/i);

    expect(h.applyMigration).not.toHaveBeenCalled();
  });

  it('blocks apply when policies still contain NULL organization_id', async () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    delete process.env.VERCEL_ENV;

    const h = makeDeps({
      gatherEvidence: vi.fn(async () => ({
        preS7Schema: false,
        waitlistTenantIdExists: true,
        waitlistRowsWithTenantId: 0,
        policiesNullOrganizationId: 1,
        policiesOrganizationIdNullable: true,
        policiesHelperCheckExists: false,
      })),
    });

    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).rejects.toThrow(/policy row/i);

    expect(h.applyMigration).not.toHaveBeenCalled();
  });

  it('rejects Preview usage', async () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    process.env.VERCEL_ENV = 'preview';
    const h = makeDeps();

    await expect(run(['--check'], h.deps)).rejects.toThrow(
      /Production operator cutover CLI/i,
    );

    expect(h.gatherEvidence).not.toHaveBeenCalled();
    expect(h.applyMigration).not.toHaveBeenCalled();
  });
});
