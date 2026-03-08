import { describe, expect, it, vi } from 'vitest';

import {
  performPgliteReset,
  resolvePglitePathFromUrl,
} from './reset-pglite.mjs';

describe('resolvePglitePathFromUrl', () => {
  it('returns default path for undefined', () => {
    expect(resolvePglitePathFromUrl(undefined)).toBe('./data/pglite');
  });

  it('returns default path for empty string', () => {
    expect(resolvePglitePathFromUrl('')).toBe('./data/pglite');
  });

  it('strips file: prefix', () => {
    expect(resolvePglitePathFromUrl('file:./data/pglite')).toBe(
      './data/pglite',
    );
  });

  it('strips pglite:// prefix', () => {
    expect(resolvePglitePathFromUrl('pglite://./data/custom')).toBe(
      './data/custom',
    );
  });

  it('returns bare path unchanged', () => {
    expect(resolvePglitePathFromUrl('./data/mydb')).toBe('./data/mydb');
  });

  it('falls back to default when file: prefix yields empty string', () => {
    expect(resolvePglitePathFromUrl('file:')).toBe('./data/pglite');
  });
});

describe('performPgliteReset', () => {
  function makeDeps(
    overrides: Partial<Parameters<typeof performPgliteReset>[1]> = {},
  ) {
    return {
      rm: vi.fn().mockResolvedValue(undefined),
      spawnSync: vi.fn().mockReturnValue({ status: 0 }),
      log: vi.fn(),
      ...overrides,
    };
  }

  it('returns failure and does not call rm or spawnSync in production', async () => {
    const deps = makeDeps();
    const result = await performPgliteReset(
      { nodeEnv: 'production', databaseUrl: 'file:./data/pglite' },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/production/i);
    expect(deps.rm).not.toHaveBeenCalled();
    expect(deps.spawnSync).not.toHaveBeenCalled();
  });

  it('calls rm with correct path and options on success', async () => {
    const deps = makeDeps();
    const result = await performPgliteReset(
      { nodeEnv: 'development', databaseUrl: 'file:./data/pglite' },
      deps,
    );

    expect(deps.rm).toHaveBeenCalledWith('./data/pglite', {
      recursive: true,
      force: true,
    });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/seeded/);
  });

  it('calls spawnSync with pnpm db:migrate:dev on success', async () => {
    const deps = makeDeps();
    await performPgliteReset(
      { nodeEnv: 'development', databaseUrl: 'file:./data/pglite' },
      deps,
    );

    expect(deps.spawnSync).toHaveBeenCalledWith(
      'pnpm',
      ['db:migrate:dev'],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('calls spawnSync with pnpm db:seed after successful migrate', async () => {
    const deps = makeDeps();
    await performPgliteReset(
      { nodeEnv: 'development', databaseUrl: 'file:./data/pglite' },
      deps,
    );

    expect(deps.spawnSync).toHaveBeenCalledWith(
      'pnpm',
      ['db:seed'],
      expect.objectContaining({ stdio: 'inherit' }),
    );
    expect(deps.spawnSync).toHaveBeenCalledTimes(2);
  });

  it('does not call seed when migrate exits with non-zero status', async () => {
    const deps = makeDeps({
      spawnSync: vi.fn().mockReturnValue({ status: 1 }),
    });
    await performPgliteReset(
      { nodeEnv: 'development', databaseUrl: 'file:./data/pglite' },
      deps,
    );

    expect(deps.spawnSync).toHaveBeenCalledTimes(1);
    expect(deps.spawnSync).not.toHaveBeenCalledWith(
      'pnpm',
      ['db:seed'],
      expect.anything(),
    );
  });

  it('returns failure when seed exits with non-zero status', async () => {
    const deps = makeDeps({
      spawnSync: vi
        .fn()
        .mockReturnValueOnce({ status: 0 })
        .mockReturnValueOnce({ status: 1 }),
    });
    const result = await performPgliteReset(
      { nodeEnv: 'development', databaseUrl: 'file:./data/pglite' },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/db:seed exited with status 1/);
  });

  it('returns failure when seed yields an error object', async () => {
    const deps = makeDeps({
      spawnSync: vi
        .fn()
        .mockReturnValueOnce({ status: 0 })
        .mockReturnValueOnce({
          error: new Error('seed not found'),
          status: null,
        }),
    });
    const result = await performPgliteReset(
      { nodeEnv: 'development', databaseUrl: 'file:./data/pglite' },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/seed not found/);
  });

  it('returns failure and skips spawnSync when rm rejects', async () => {
    const deps = makeDeps({
      rm: vi.fn().mockRejectedValue(new Error('EACCES: permission denied')),
    });
    const result = await performPgliteReset(
      { nodeEnv: 'development', databaseUrl: 'file:./data/pglite' },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/EACCES/);
    expect(deps.spawnSync).not.toHaveBeenCalled();
  });

  it('returns failure when spawnSync exits with non-zero status', async () => {
    const deps = makeDeps({
      spawnSync: vi.fn().mockReturnValue({ status: 1 }),
    });
    const result = await performPgliteReset(
      { nodeEnv: 'development', databaseUrl: 'file:./data/pglite' },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/exited with status 1/);
  });

  it('returns failure when spawnSync yields an error object', async () => {
    const deps = makeDeps({
      spawnSync: vi.fn().mockReturnValue({
        error: new Error('command not found'),
        status: null,
      }),
    });
    const result = await performPgliteReset(
      { nodeEnv: 'development', databaseUrl: 'file:./data/pglite' },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/command not found/);
  });

  it('resolves path from pglite:// prefix', async () => {
    const deps = makeDeps();
    await performPgliteReset(
      { nodeEnv: 'development', databaseUrl: 'pglite://./data/custom' },
      deps,
    );

    expect(deps.rm).toHaveBeenCalledWith('./data/custom', expect.any(Object));
  });

  it('uses default path when databaseUrl is undefined', async () => {
    const deps = makeDeps();
    await performPgliteReset({ nodeEnv: 'development' }, deps);

    expect(deps.rm).toHaveBeenCalledWith('./data/pglite', expect.any(Object));
  });
});
