import { afterEach, describe, expect, it, vi } from 'vitest';

import { readLocalDbSystemIdentifier } from './local-db-identity.mjs';

/**
 * OZI-219 — the local compose identity is read INSIDE the named container
 * (its local socket), never through the URL it is later compared against.
 */
type Spawn = Parameters<typeof readLocalDbSystemIdentifier>[1];

function spawnReturning(
  ...results: { status: number; stdout: string }[]
): ReturnType<typeof vi.fn> & NonNullable<Spawn> {
  const spawn = vi.fn();
  for (const result of results) spawn.mockReturnValueOnce(result);
  return spawn as ReturnType<typeof vi.fn> & NonNullable<Spawn>;
}

describe('readLocalDbSystemIdentifier', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('execs psql inside the dev compose container over its local socket', () => {
    const spawn = spawnReturning({
      status: 0,
      stdout: '7619451615054913566\n',
    });

    expect(readLocalDbSystemIdentifier('dev', spawn)).toBe(
      '7619451615054913566',
    );
    const [bin, args] = spawn.mock.calls[0]!;
    expect(bin).toBe('podman');
    expect(args).toEqual([
      'exec',
      'nextjs16_dev_db',
      'psql',
      '-U',
      'postgres',
      '-d',
      'app_dev',
      '-tAc',
      'SELECT system_identifier::text FROM pg_control_system()',
    ]);
    expect(args).not.toContain('-h');
  });

  it('auto engine falls back to docker for the test container', () => {
    vi.stubEnv('DB_COMPOSE_ENGINE', 'auto');
    const spawn = spawnReturning(
      { status: 125, stdout: '' },
      { status: 0, stdout: '42\n' },
    );

    expect(readLocalDbSystemIdentifier('test', spawn)).toBe('42');
    expect(spawn.mock.calls.map(([bin]) => bin)).toEqual(['podman', 'docker']);
    expect(spawn.mock.calls[1]![1]).toContain('nextjs16_test_db');
  });

  it.each([
    ['the container is not running', { status: 125, stdout: '' }],
    ['the output is not an identifier', { status: 0, stdout: 'ERROR\n' }],
  ])('fails closed when %s', (_label, result) => {
    expect(() =>
      readLocalDbSystemIdentifier('dev', spawnReturning(result)),
    ).toThrow(/BLOCKED: cannot read the cluster identity/);
  });

  it.each(['prod', '__proto__', 'constructor'])(
    'refuses an unknown target %s without spawning',
    (target) => {
      const spawn = spawnReturning();
      expect(() => readLocalDbSystemIdentifier(target as 'dev', spawn)).toThrow(
        /unknown target/,
      );
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it('reads the identity inside an explicitly named CI service container', () => {
    vi.stubEnv('DB_COMPOSE_ENGINE', 'docker');
    vi.stubEnv('R4A_LOCAL_DB_CONTAINER', '0a1b2c3d4e5f');
    const spawn = spawnReturning({ status: 0, stdout: '7\n' });

    expect(readLocalDbSystemIdentifier('test', spawn)).toBe('7');
    expect(spawn.mock.calls[0]![0]).toBe('docker');
    expect(spawn.mock.calls[0]![1].slice(0, 2)).toEqual([
      'exec',
      '0a1b2c3d4e5f',
    ]);
  });

  it.each(['-h 127.0.0.1', 'a b', '--privileged', ''.padEnd(129, 'a')])(
    'refuses a malformed container override %j without spawning',
    (override) => {
      vi.stubEnv('R4A_LOCAL_DB_CONTAINER', override);
      const spawn = spawnReturning();
      expect(() => readLocalDbSystemIdentifier('test', spawn)).toThrow(
        /BLOCKED: R4A_LOCAL_DB_CONTAINER is not a container name or id/,
      );
      expect(spawn).not.toHaveBeenCalled();
    },
  );
});
