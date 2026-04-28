import { describe, expect, it } from 'vitest';

import { buildVercelCliInvocation, parseCliArgs } from './cli';

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
});

describe('buildVercelCliInvocation', () => {
  it('uses npx vercel by default and forwards the token from env', () => {
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
      command: 'npx',
      args: [
        '-y',
        'vercel@latest',
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
});
