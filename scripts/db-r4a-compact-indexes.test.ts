import { describe, expect, it, vi } from 'vitest';

import {
  redactR4aCliError,
  runR4aCompactIndexesCli,
  type R4aCliDeps,
} from './db-r4a-compact-indexes';

function deps() {
  const end = vi.fn(async () => undefined);
  const open = vi.fn(async () => ({
    runner: { query: vi.fn(), queryWithParams: vi.fn() } as never,
    close: end,
  }));
  const inspect = vi.fn(async () => ({ decision: 'eligible-to-create' }));
  const execute = vi.fn(async () => []);
  const recover = vi.fn(async () => []);
  const log = vi.fn();
  return {
    value: { open, inspect, execute, recover, log } as unknown as R4aCliDeps,
    open,
    inspect,
    execute,
    recover,
    log,
    end,
  };
}
const URL = 'postgres://user:super-secret@db.example.test:5432/app';

describe('db-r4a-compact-indexes CLI', () => {
  it('redacts a connection string from an entrypoint error', () => {
    expect(
      redactR4aCliError(new Error(`connect failed for ${URL}`)),
    ).not.toContain('super-secret');
  });

  it('runs --check read-only and closes the client', async () => {
    const d = deps();
    await runR4aCompactIndexesCli(['--check'], URL, d.value);
    expect(d.inspect).toHaveBeenCalledTimes(2);
    expect(d.execute).not.toHaveBeenCalled();
    expect(d.end).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d.log.mock.calls)).not.toContain('super-secret');
  });
  it('runs approved apply only', async () => {
    const d = deps();
    await runR4aCompactIndexesCli(
      ['--apply', '--production-approved'],
      URL,
      d.value,
    );
    expect(d.execute).toHaveBeenCalledTimes(1);
    expect(d.inspect).not.toHaveBeenCalled();
    expect(d.recover).not.toHaveBeenCalled();
  });
  it.each([
    [['feature_flags']],
    [['feature_flags', 'audit_log_settings']],
    [['audit_log_settings']],
  ])('runs INVALID recovery only for the named tables %j', async (tables) => {
    const d = deps();
    await runR4aCompactIndexesCli(
      [
        '--recover-invalid',
        ...tables.flatMap((table) => ['--table', table]),
        '--production-approved',
      ],
      URL,
      d.value,
    );
    expect(d.recover).toHaveBeenCalledTimes(1);
    expect(d.recover.mock.calls[0]).toEqual([expect.anything(), tables]);
    expect(d.execute).not.toHaveBeenCalled();
    expect(d.inspect).not.toHaveBeenCalled();
    expect(d.log.mock.calls[0]?.[0]).toMatchObject({
      mode: 'recover-invalid',
      tables,
    });
    expect(d.end).toHaveBeenCalledTimes(1);
  });
  it.each([
    {
      label: 'recovery without a table',
      args: ['--recover-invalid', '--production-approved'],
      error: 'at least one --table',
    },
    {
      label: 'recovery without its approval',
      args: ['--recover-invalid', '--table', 'feature_flags'],
      error: 'requires its own --production-approved',
    },
    {
      label: 'recovery of an unknown table',
      args: [
        '--recover-invalid',
        '--table',
        'audit_events',
        '--production-approved',
      ],
      error: 'accepts only distinct --table',
    },
    {
      label: 'recovery of a repeated table',
      args: [
        '--recover-invalid',
        '--table',
        'feature_flags',
        '--table',
        'feature_flags',
        '--production-approved',
      ],
      error: 'accepts only distinct --table',
    },
    {
      label: 'standard apply combined with recovery',
      args: [
        '--apply',
        '--recover-invalid',
        '--table',
        'feature_flags',
        '--production-approved',
      ],
      error: 'usage',
    },
    {
      label: 'standard apply with a table',
      args: ['--apply', '--production-approved', '--table', 'feature_flags'],
      error: 'usage',
    },
  ])('rejects $label without opening a client', async ({ args, error }) => {
    const d = deps();
    await expect(runR4aCompactIndexesCli(args, URL, d.value)).rejects.toThrow(
      error,
    );
    expect(d.open).not.toHaveBeenCalled();
    expect(d.execute).not.toHaveBeenCalled();
    expect(d.recover).not.toHaveBeenCalled();
  });
  it.each([
    { args: [] },
    { args: ['--apply'] },
    { args: ['--wat'] },
    { args: ['--check', '--apply'] },
  ])('rejects invalid arguments without opening a client', async ({ args }) => {
    const d = deps();
    await expect(runR4aCompactIndexesCli(args, URL, d.value)).rejects.toThrow(
      'usage',
    );
    expect(d.open).not.toHaveBeenCalled();
  });
  it('rejects missing URL before opening a client', async () => {
    const d = deps();
    await expect(
      runR4aCompactIndexesCli(['--check'], undefined, d.value),
    ).rejects.toThrow('DATABASE_URL_UNPOOLED');
    expect(d.open).not.toHaveBeenCalled();
  });
  it('rejects a known pooler before opening a client without leaking secret', async () => {
    const d = deps();
    const url = 'postgres://user:secret@pooler.supabase.com:6543/app';
    await expect(
      runR4aCompactIndexesCli(['--check'], url, d.value),
    ).rejects.toThrow();
    expect(d.open).not.toHaveBeenCalled();
  });
  it('closes the client when check inspection fails without invoking DDL', async () => {
    const d = deps();
    d.inspect.mockRejectedValueOnce(new Error('catalog unavailable'));
    await expect(
      runR4aCompactIndexesCli(['--check'], URL, d.value),
    ).rejects.toThrow('catalog unavailable');
    expect(d.execute).not.toHaveBeenCalled();
    expect(d.end).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d.log.mock.calls)).not.toContain('super-secret');
  });
  it('closes the client when executor fails', async () => {
    const d = deps();
    d.execute.mockRejectedValueOnce(new Error('executor failure'));
    await expect(
      runR4aCompactIndexesCli(
        ['--apply', '--production-approved'],
        URL,
        d.value,
      ),
    ).rejects.toThrow('executor failure');
    expect(d.end).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d.log.mock.calls)).not.toContain('super-secret');
  });
});
