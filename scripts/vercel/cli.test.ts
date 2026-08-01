import { describe, expect, it, vi } from 'vitest';

import {
  buildVercelChildEnv,
  buildVercelCliInvocation,
  parseCliArgs,
  run,
} from './cli';

describe('parseCliArgs', () => {
  it('returns help when no command is provided', () => {
    expect(parseCliArgs(['node', 'cli.ts'])).toEqual({
      command: 'help',
      wait: false,
      passthroughArgs: [],
    });
  });

  it('ignores pnpm leading argument separator', () => {
    expect(parseCliArgs(['node', 'cli.ts', '--', 'help'])).toEqual({
      command: 'help',
      wait: false,
      passthroughArgs: [],
    });
  });

  it('parses inspect-logs target and wait flag', () => {
    expect(
      parseCliArgs([
        'node',
        'cli.ts',
        'inspect-logs',
        'https://preview.example.vercel.app',
        '--wait',
      ]),
    ).toEqual({
      command: 'inspect-logs',
      deploymentTarget: 'https://preview.example.vercel.app',
      wait: true,
      passthroughArgs: [],
    });
  });

  it('parses whoami passthrough args', () => {
    expect(parseCliArgs(['node', 'cli.ts', 'whoami', '--debug'])).toEqual({
      command: 'whoami',
      wait: false,
      passthroughArgs: ['--debug'],
    });
  });

  it('keeps inspect passthrough flags after the deployment target', () => {
    expect(
      parseCliArgs([
        'node',
        'cli.ts',
        'inspect-logs',
        'preview.example.vercel.app',
        '--scope',
        'team',
      ]),
    ).toEqual({
      command: 'inspect-logs',
      deploymentTarget: 'preview.example.vercel.app',
      wait: false,
      passthroughArgs: ['--scope', 'team'],
    });
  });

  it('throws for unknown commands', () => {
    expect(() => parseCliArgs(['node', 'cli.ts', 'deploy'])).toThrow(
      'Unknown command "deploy"',
    );
  });
});

describe('buildVercelCliInvocation', () => {
  it('uses the pinned repo Vercel CLI by default and forwards the token from env', () => {
    const invocation = buildVercelCliInvocation(
      {
        command: 'inspect-logs',
        deploymentTarget: 'preview.example.vercel.app',
        wait: true,
        passthroughArgs: [],
      },
      {
        NODE_ENV: 'test',
        VERCEL_TOKEN: 'token-123',
      },
    );

    expect(invocation).toEqual({
      command: 'pnpm',
      args: [
        'exec',
        'vercel',
        'inspect',
        'preview.example.vercel.app',
        '--logs',
        '--wait',
        '--token=token-123',
      ],
    });
  });

  it('uses a custom vercel binary when provided', () => {
    const invocation = buildVercelCliInvocation(
      {
        command: 'whoami',
        wait: false,
        passthroughArgs: [],
      },
      {
        NODE_ENV: 'test',
        VERCEL_CLI_BIN: '/usr/local/bin/vercel',
      },
    );

    expect(invocation).toEqual({
      command: '/usr/local/bin/vercel',
      args: ['whoami'],
    });
  });

  it('does not append a duplicate token argument when passthrough already has one', () => {
    const invocation = buildVercelCliInvocation(
      {
        command: 'whoami',
        wait: false,
        passthroughArgs: ['--token=manual-token'],
      },
      {
        NODE_ENV: 'test',
        VERCEL_TOKEN: 'env-token',
      },
    );

    expect(invocation.args).toEqual([
      'exec',
      'vercel',
      'whoami',
      '--token=manual-token',
    ]);
  });

  it('throws when inspect-logs has no deployment target', () => {
    expect(() =>
      buildVercelCliInvocation({
        command: 'inspect-logs',
        wait: false,
        passthroughArgs: [],
      }),
    ).toThrow('Missing deployment target');
  });
});

describe('buildVercelChildEnv', () => {
  it('removes the New Relic preload from NODE_OPTIONS', () => {
    const childEnv = buildVercelChildEnv({
      NODE_ENV: 'test',
      NODE_OPTIONS: '--max-old-space-size=4096 -r newrelic --trace-warnings',
      VERCEL_TOKEN: 'token-123',
    });

    expect(childEnv).toMatchObject({
      NODE_ENV: 'test',
      NODE_OPTIONS: '--max-old-space-size=4096 --trace-warnings',
      VERCEL_TOKEN: 'token-123',
    });
  });

  it('drops NODE_OPTIONS entirely when it only preloads New Relic', () => {
    const childEnv = buildVercelChildEnv({
      NODE_ENV: 'test',
      NODE_OPTIONS: '-r newrelic',
    });

    expect(childEnv.NODE_OPTIONS).toBeUndefined();
  });

  it('removes compact New Relic preload spellings', () => {
    const childEnv = buildVercelChildEnv({
      NODE_ENV: 'test',
      NODE_OPTIONS: '--requirenewrelic -rnewrelic --trace-warnings',
    });

    expect(childEnv.NODE_OPTIONS).toBe('--trace-warnings');
  });
});

describe('run', () => {
  it('prints help without invoking the external CLI', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(run(['node', 'cli.ts', 'help'])).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith('Vercel helper');
    consoleSpy.mockRestore();
  });
});
