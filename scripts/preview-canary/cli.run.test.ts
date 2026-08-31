import { afterEach, describe, expect, it, vi } from 'vitest';

const mockExecFileSync = vi.hoisted(() => vi.fn());
const mockReadTextFileWithinBase = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  return {
    ...actual,
    execFileSync: mockExecFileSync,
    default: { ...actual.default, execFileSync: mockExecFileSync },
  };
});

vi.mock('../lib/fs-guards-shared', () => ({
  readTextFileWithinBase: mockReadTextFileWithinBase,
}));

import { run } from './cli';

const identity = { branch: 'ozi-78', sha: 'a'.repeat(40) };
const immutableUrl = 'project-immutable-abc123-team.vercel.app';
const databaseHost = 'ep-test.us-east-2.aws.neon.tech';
const authjsRuntimeEvidence = {
  authProvider: 'authjs',
  clerkKeysTest: null,
  databaseHost,
};
const deployment = {
  id: 'dpl_expected',
  meta: {
    githubDeployment: '1',
    githubCommitOrg: 'wmitrus',
    githubCommitRef: identity.branch,
    githubCommitRepo: 'nextjs-16-boilerplate',
    githubCommitSha: identity.sha,
  },
  ownerId: 'team_expected',
  projectId: 'prj_expected',
  readyState: 'READY',
  target: null,
  url: immutableUrl,
};

function setRequiredEnvironment(): void {
  vi.stubEnv('GITHUB_REPOSITORY', 'wmitrus/nextjs-16-boilerplate');
  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'bypass-secret');
  vi.stubEnv('VERCEL_ORG_ID', 'team_expected');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_expected');
  vi.stubEnv('VERCEL_TOKEN', 'vercel-token');
}

function setupSuccessfulDependencies(input?: {
  previewEnv?: string;
  runtimeEvidence?: unknown;
}): void {
  setRequiredEnvironment();
  mockReadTextFileWithinBase.mockImplementation((file: string) => {
    if (file.endsWith('/.vercel/project.json')) {
      return JSON.stringify({
        orgId: 'team_expected',
        projectId: 'prj_expected',
      });
    }
    if (file.endsWith('/.vercel/.env.preview.local')) {
      return input?.previewEnv ?? 'INTERNAL_API_KEY=internal-key\n';
    }
    throw new Error(`unexpected file: ${file}`);
  });
  mockExecFileSync.mockImplementation((file: string, args: string[]) => {
    if (file === 'git' && args.join(' ') === 'branch --show-current') {
      return `${identity.branch}\n`;
    }
    if (file === 'git' && args.join(' ') === 'rev-parse HEAD') {
      return `${identity.sha}\n`;
    }
    if (file.endsWith('/node_modules/.bin/vercel')) {
      if (args[0] === 'api' && args[1]?.startsWith('/v6/deployments?')) {
        return JSON.stringify([{ ...deployment, uid: deployment.id }]);
      }
      if (args[0] === 'inspect') return JSON.stringify({ id: deployment.id });
      if (args[0] === 'api' && args[1]?.includes(deployment.id)) {
        return JSON.stringify(deployment);
      }
      if (args[0] === 'pull') return '';
    }
    if (file === 'pnpm') return '';
    throw new Error(`unexpected command: ${file} ${args.join(' ')}`);
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify(input?.runtimeEvidence ?? authjsRuntimeEvidence),
            { status: 200 },
          ),
        ),
      ),
  );
}

function commandCalls(): Array<{ args: string[]; file: string }> {
  return mockExecFileSync.mock.calls.map(([file, args]) => ({
    args: args as string[],
    file: file as string,
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mockExecFileSync.mockReset();
  mockReadTextFileWithinBase.mockReset();
});

describe('Preview canary shared execution', () => {
  it('runs explicit and auto identities through the same downstream canary flow', async () => {
    setupSuccessfulDependencies();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run([
      'node',
      'cli.ts',
      `--preview-url=https://${immutableUrl}`,
      `--git-branch=${identity.branch}`,
      `--git-sha=${identity.sha}`,
    ]);
    const explicitCalls = commandCalls();
    const explicitEvidence = JSON.parse(log.mock.calls[0]?.[0] as string);

    mockExecFileSync.mockClear();
    log.mockClear();
    await run(['node', 'cli.ts', '--auto']);
    const autoCalls = commandCalls();
    const autoEvidence = JSON.parse(log.mock.calls[0]?.[0] as string);

    const expectedDownstream = [
      ['inspect', `https://${immutableUrl}`, '--json'],
      ['api', `/v13/deployments/${deployment.id}`, '--raw'],
      [
        'pull',
        '--yes',
        '--environment=preview',
        `--git-branch=${identity.branch}`,
      ],
    ];
    expect(
      explicitCalls
        .filter(({ file }) => file.endsWith('/node_modules/.bin/vercel'))
        .map(({ args }) => args.slice(0, -1)),
    ).toEqual(expectedDownstream);
    expect(
      autoCalls
        .filter(({ file }) => file.endsWith('/node_modules/.bin/vercel'))
        .slice(-3)
        .map(({ args }) => args.slice(0, -1)),
    ).toEqual(expectedDownstream);
    expect(autoCalls.find(({ file }) => file === 'pnpm')?.args).toEqual([
      'neon',
      '--',
      'verify-preview-endpoint',
      `--git-branch=${identity.branch}`,
      `--database-host=${databaseHost}`,
    ]);
    expect(explicitEvidence).toEqual(autoEvidence);
  });

  it('uses the auto provider immutable deployment URL as the runtime probe target', async () => {
    setupSuccessfulDependencies();

    await run(['node', 'cli.ts', '--auto']);

    expect(fetch).toHaveBeenCalledWith(
      new URL(
        '/api/internal/preview-canary/database-binding',
        `https://${immutableUrl}`,
      ),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('does not use pulled branch provider or Clerk values as runtime evidence', async () => {
    setupSuccessfulDependencies({
      previewEnv:
        'AUTH_PROVIDER=clerk\nCLERK_SECRET_KEY=sk_live_branch\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_branch\nINTERNAL_API_KEY=internal-key\n',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run(['node', 'cli.ts', '--auto']);

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      provider: 'authjs',
    });
  });

  it('accepts Clerk only when immutable runtime evidence confirms test keys', async () => {
    setupSuccessfulDependencies({
      runtimeEvidence: {
        authProvider: 'clerk',
        clerkKeysTest: true,
        databaseHost,
      },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run(['node', 'cli.ts', '--auto']);

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      provider: 'clerk',
    });
  });

  it('uses the pulled previous internal key only after selected runtime rejects current', async () => {
    setupSuccessfulDependencies({
      previewEnv:
        'INTERNAL_API_KEY=current-key\nINTERNAL_API_KEY_PREVIOUS=previous-key\n',
    });
    const runtimeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(authjsRuntimeEvidence), { status: 200 }),
      );
    vi.stubGlobal('fetch', runtimeFetch);

    await run(['node', 'cli.ts', '--auto']);

    expect(runtimeFetch).toHaveBeenCalledTimes(2);
    expect(
      runtimeFetch.mock.calls.map(([, init]) => {
        const headers = init?.headers as Record<string, string>;
        return headers['x-internal-key'];
      }),
    ).toEqual(['current-key', 'previous-key']);
  });

  it.each([['missing INTERNAL_API_KEY', 'AUTH_PROVIDER=authjs\n']])(
    'fails closed for %s before runtime probing or Neon verification',
    async (_, previewEnv) => {
      setupSuccessfulDependencies({ previewEnv });

      await expect(run(['node', 'cli.ts', '--auto'])).rejects.toThrow(
        'Preview environment must define',
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(commandCalls().some(({ file }) => file === 'pnpm')).toBe(false);
    },
  );

  it.each([
    ['runtime HTTP failure', new Response('', { status: 500 }), 'HTTP 500'],
    [
      'invalid runtime evidence',
      new Response(
        '{"databaseHost":"host/path","authProvider":"authjs","clerkKeysTest":null}',
        { status: 200 },
      ),
      'invalid evidence',
    ],
  ])(
    'fails closed for %s before Neon verification',
    async (_, response, message) => {
      setupSuccessfulDependencies();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

      await expect(run(['node', 'cli.ts', '--auto'])).rejects.toThrow(message);
      expect(commandCalls().some(({ file }) => file === 'pnpm')).toBe(false);
    },
  );

  it.each([
    [
      'Clerk non-test keys',
      { authProvider: 'clerk', clerkKeysTest: false, databaseHost },
    ],
    [
      'authjs with Clerk evidence',
      { authProvider: 'authjs', clerkKeysTest: true, databaseHost },
    ],
    [
      'unsupported provider',
      { authProvider: 'supabase', clerkKeysTest: null, databaseHost },
    ],
  ])(
    'fails closed for invalid immutable runtime %s',
    async (_, runtimeEvidence) => {
      setupSuccessfulDependencies({ runtimeEvidence });

      await expect(run(['node', 'cli.ts', '--auto'])).rejects.toThrow(
        'invalid evidence',
      );
      expect(commandCalls().some(({ file }) => file === 'pnpm')).toBe(false);
    },
  );

  it('fails closed when Neon verification fails', async () => {
    setupSuccessfulDependencies();
    mockExecFileSync.mockImplementation((file: string, args: string[]) => {
      if (file === 'pnpm') throw new Error('Neon endpoint mismatch');
      if (file === 'git' && args.join(' ') === 'branch --show-current') {
        return `${identity.branch}\n`;
      }
      if (file === 'git' && args.join(' ') === 'rev-parse HEAD') {
        return `${identity.sha}\n`;
      }
      if (file.endsWith('/node_modules/.bin/vercel')) {
        if (args[0] === 'api' && args[1]?.startsWith('/v6/deployments?')) {
          return JSON.stringify([{ ...deployment, uid: deployment.id }]);
        }
        if (args[0] === 'inspect') return JSON.stringify({ id: deployment.id });
        if (args[0] === 'api' && args[1]?.includes(deployment.id)) {
          return JSON.stringify(deployment);
        }
        if (args[0] === 'pull') return '';
      }
      throw new Error(`unexpected command: ${file} ${args.join(' ')}`);
    });

    await expect(run(['node', 'cli.ts', '--auto'])).rejects.toThrow(
      'Neon endpoint mismatch',
    );
  });
});
