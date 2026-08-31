import { describe, expect, it, vi } from 'vitest';

import {
  parseRuntimeCanaryEvidence,
  probeRuntimeDatabaseBinding,
  readBoundedResponseBody,
  parseImmutableDeploymentUrl,
  parseVercelProjectLink,
  resolveAutoPreviewIdentity,
  runVercelOperation,
} from './cli';

const identity = { branch: 'ozi-78', sha: 'a'.repeat(40) };
const expectedMeta = {
  githubDeployment: '1',
  githubCommitOrg: 'wmitrus',
  githubCommitRef: identity.branch,
  githubCommitRepo: 'nextjs-16-boilerplate',
  githubCommitSha: identity.sha,
};
const runtimeEvidence = JSON.stringify({
  authProvider: 'authjs',
  clerkKeysTest: null,
  databaseHost: 'ep-test.us-east-2.aws.neon.tech',
  databaseName: 'app_preview',
});

function deployment(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'dpl_expected',
    meta: expectedMeta,
    ownerId: 'team_expected',
    projectId: 'prj_expected',
    readyState: 'READY',
    target: null,
    url: 'project-immutable-abc123-team.vercel.app',
    ...overrides,
  };
}

function listCandidate(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const { id, ownerId: _ownerId, ...reduced } = deployment(overrides);
  return { uid: id, ...reduced };
}

function resolveCandidates(
  candidates: unknown[],
  details: Record<string, unknown> = {},
) {
  vi.stubEnv('GITHUB_REPOSITORY', 'wmitrus/nextjs-16-boilerplate');
  vi.stubEnv('VERCEL_ORG_ID', 'team_expected');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_expected');
  vi.stubEnv('VERCEL_TOKEN', 'sentinel-vercel-token');
  const executor = vi.fn((_: string, args: string[]) => {
    if (args[1]?.startsWith('/v6/deployments?'))
      return JSON.stringify(candidates);
    const id = args[1]?.split('/').at(-1);
    return JSON.stringify(details[id ?? ''] ?? deployment());
  });
  return resolveAutoPreviewIdentity(identity, executor);
}

describe('Preview canary Vercel boundary', () => {
  it('reports a runtime probe timeout without retrying', async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort());
    const fetchMock = vi.fn().mockRejectedValue(new Error('network failure'));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(
        probeRuntimeDatabaseBinding({
          deploymentProtectionBypass: 'bypass-secret',
          deploymentUrl: 'https://project-immutable-abc123-team.vercel.app',
          internalApiKeys: ['internal-key', 'previous-key'],
        }),
      ).rejects.toThrow('Preview runtime probe timed out.');
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      timeout.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('uses the current internal key first and falls back once to previous on 403', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response(runtimeEvidence, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(
        probeRuntimeDatabaseBinding({
          deploymentProtectionBypass: 'bypass-secret',
          deploymentUrl: 'https://project-immutable-abc123-team.vercel.app',
          internalApiKeys: ['current-key', 'previous-key'],
        }),
      ).resolves.toMatchObject({ authProvider: 'authjs' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(timeout).toHaveBeenCalledOnce();
      expect(
        fetchMock.mock.calls.map(([, init]) => {
          const headers = init?.headers as Record<string, string>;
          return headers['x-internal-key'];
        }),
      ).toEqual(['current-key', 'previous-key']);
      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
        'https://project-immutable-abc123-team.vercel.app/api/internal/preview-canary/database-binding',
        'https://project-immutable-abc123-team.vercel.app/api/internal/preview-canary/database-binding',
      ]);
    } finally {
      timeout.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('deduplicates identical current and previous internal keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(runtimeEvidence));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await probeRuntimeDatabaseBinding({
        deploymentProtectionBypass: 'bypass-secret',
        deploymentUrl: 'https://project-immutable-abc123-team.vercel.app',
        internalApiKeys: ['same-key', 'same-key'],
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([[[]], [['']], [['  ']], [['current-key', '  ']], [['a', 'b', 'c']]])(
    'rejects invalid bounded runtime probe credentials without fetching: %j',
    async (internalApiKeys) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      try {
        await expect(
          probeRuntimeDatabaseBinding({
            deploymentProtectionBypass: 'bypass-secret',
            deploymentUrl: 'https://project-immutable-abc123-team.vercel.app',
            internalApiKeys,
          }),
        ).rejects.toThrow('Preview runtime probe credentials are invalid.');
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it.each([
    ['no previous key', [new Response('', { status: 403 })], ['current-key']],
    [
      'previous key also forbidden',
      [new Response('', { status: 403 }), new Response('', { status: 403 })],
      ['current-key', 'previous-key'],
    ],
    [
      'network failure',
      [new Error('network failure')],
      ['current-key', 'previous-key'],
    ],
    [
      'HTTP 500',
      [new Response('', { status: 500 })],
      ['current-key', 'previous-key'],
    ],
    [
      'HTTP 401',
      [new Response('', { status: 401 })],
      ['current-key', 'previous-key'],
    ],
    [
      'malformed successful evidence',
      [new Response('{"unexpected":true}')],
      ['current-key', 'previous-key'],
    ],
  ])(
    'fails closed without an inappropriate fallback for %s',
    async (_, outcomes, internalApiKeys) => {
      const fetchMock = vi.fn();
      for (const outcome of outcomes) {
        if (outcome instanceof Error) fetchMock.mockRejectedValueOnce(outcome);
        else fetchMock.mockResolvedValueOnce(outcome);
      }
      vi.stubGlobal('fetch', fetchMock);

      try {
        await expect(
          probeRuntimeDatabaseBinding({
            deploymentProtectionBypass: 'bypass-secret',
            deploymentUrl: 'https://project-immutable-abc123-team.vercel.app',
            internalApiKeys,
          }),
        ).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(outcomes.length);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('selects exactly one exact READY Preview deployment by immutable URL', () => {
    try {
      expect(resolveCandidates([listCandidate()])).toEqual({
        ...identity,
        previewUrl: 'https://project-immutable-abc123-team.vercel.app',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not use reduced LIST metadata as final security evidence', () => {
    try {
      expect(
        resolveCandidates(
          [
            listCandidate({
              meta: { ...expectedMeta, githubCommitSha: 'b'.repeat(40) },
            }),
          ],
          { dpl_expected: deployment() },
        ),
      ).toEqual({
        ...identity,
        previewUrl: 'https://project-immutable-abc123-team.vercel.app',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('uses uid, the provider identifier field in the LIST response, for DETAIL', () => {
    vi.stubEnv('GITHUB_REPOSITORY', 'wmitrus/nextjs-16-boilerplate');
    vi.stubEnv('VERCEL_ORG_ID', 'team_expected');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_expected');
    vi.stubEnv('VERCEL_TOKEN', 'sentinel-vercel-token');
    const executor = vi.fn((_: string, args: string[]) =>
      args[1]?.startsWith('/v6/deployments?')
        ? JSON.stringify([listCandidate({ id: 'dpl_from_uid' })])
        : JSON.stringify(deployment()),
    );
    try {
      resolveAutoPreviewIdentity(identity, executor);
      expect(executor.mock.calls[1]?.[1]).toEqual(
        expect.arrayContaining([
          'api',
          '/v13/deployments/dpl_from_uid',
          '--method=GET',
          '--raw',
        ]),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([{}, { uid: 'invalid/id' }])(
    'fails closed for a missing or malformed LIST provider identifier',
    (candidate) => {
      try {
        expect(() => resolveCandidates([candidate])).toThrow(
          'Vercel deployment discovery returned malformed data.',
        );
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it('fails closed when no LIST candidates are discovered', () => {
    try {
      expect(() => resolveCandidates([])).toThrow(
        'No exact READY Preview deployment found',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('uses an explicitly read-only, exact metadata-filtered deployment list', () => {
    vi.stubEnv('GITHUB_REPOSITORY', 'wmitrus/nextjs-16-boilerplate');
    vi.stubEnv('VERCEL_ORG_ID', 'team_expected');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_expected');
    vi.stubEnv('VERCEL_TOKEN', 'sentinel-vercel-token');
    const executor = vi.fn((_: string, args: string[]) =>
      args[1]?.startsWith('/v6/deployments?')
        ? JSON.stringify([listCandidate()])
        : JSON.stringify(deployment()),
    );

    try {
      resolveAutoPreviewIdentity(identity, executor);
      expect(executor).toHaveBeenCalledTimes(2);
      const args = executor.mock.calls[0]?.[1] as string[];
      expect(args).toContain('--method=GET');
      expect(args).toContain('--raw');
      expect(args[0]).toBe('api');
      expect(args[1]).toContain('projectId=prj_expected');
      expect(args[1]).toContain('teamId=team_expected');
      expect(args[1]).toContain('meta-githubCommitRef=ozi-78');
      expect(args[1]).toContain(`meta-githubCommitSha=${identity.sha}`);
      expect(args[1]).toContain('limit=100');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('emits allowlisted debug reasons without changing fail-closed selection', () => {
    vi.stubEnv('GITHUB_REPOSITORY', 'wmitrus/nextjs-16-boilerplate');
    vi.stubEnv('VERCEL_ORG_ID', 'team_expected');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_expected');
    vi.stubEnv('VERCEL_TOKEN', 'secret-vercel-token');
    const candidate = listCandidate({
      meta: { ...expectedMeta, githubCommitSha: 'b'.repeat(40) },
      rawProviderSecret: 'raw-provider-secret',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const executor = vi.fn((_: string, args: string[]) =>
      args[1]?.startsWith('/v6/deployments?')
        ? JSON.stringify([candidate])
        : JSON.stringify(
            deployment({
              meta: { ...expectedMeta, githubCommitSha: 'b'.repeat(40) },
              rawProviderSecret: 'raw-provider-secret',
            }),
          ),
    );

    try {
      expect(() =>
        resolveAutoPreviewIdentity(identity, executor, true),
      ).toThrow('No exact READY Preview deployment found');
      const output = JSON.stringify(log.mock.calls);
      expect(output).toContain('git SHA mismatch');
      expect(output).toContain('"gitSha":"fail"');
      expect(output).not.toContain('secret-vercel-token');
      expect(output).not.toContain('raw-provider-secret');
      expect(executor).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it.each([
    [
      'wrong branch',
      { meta: { ...expectedMeta, githubCommitRef: 'other-branch' } },
    ],
    [
      'wrong SHA',
      { meta: { ...expectedMeta, githubCommitSha: 'b'.repeat(40) } },
    ],
    [
      'wrong repository owner',
      { meta: { ...expectedMeta, githubCommitOrg: 'other-owner' } },
    ],
    [
      'wrong repository name',
      { meta: { ...expectedMeta, githubCommitRepo: 'other-repository' } },
    ],
    ['wrong Vercel project', { projectId: 'prj_other' }],
    ['wrong Vercel organization', { ownerId: 'team_other' }],
    ['missing owner', { ownerId: undefined }],
    ['non-null target', { target: 'production' }],
    [
      'missing GitHub deployment marker',
      { meta: { ...expectedMeta, githubDeployment: undefined } },
    ],
    [
      'wrong GitHub deployment marker',
      { meta: { ...expectedMeta, githubDeployment: '0' } },
    ],
    ['non-READY deployment', { readyState: 'BUILDING' }],
  ])('rejects %s DETAIL candidates', (_reason, detailOverrides) => {
    try {
      expect(() =>
        resolveCandidates([listCandidate()], {
          dpl_expected: deployment(detailOverrides),
        }),
      ).toThrow('No exact READY Preview deployment found');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects a malformed immutable deployment URL', () => {
    try {
      expect(() =>
        resolveCandidates([listCandidate()], {
          dpl_expected: deployment({ url: 'host.vercel.app/path' }),
        }),
      ).toThrow('No exact READY Preview deployment found');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    [[listCandidate(), listCandidate({ id: 'dpl_second' })]],
    [[listCandidate({ id: 'dpl_second' }), listCandidate()]],
  ])(
    'rejects multiple valid candidates regardless of result order',
    (candidates) => {
      try {
        expect(() => resolveCandidates(candidates)).toThrow(
          'Multiple exact READY Preview deployments found',
        );
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it('reports a missing Vercel token before spawning Vercel', () => {
    vi.stubEnv('VERCEL_TOKEN', '');
    const executor = vi.fn();

    try {
      expect(() =>
        runVercelOperation(
          'inspect',
          ['inspect', 'https://preview.example'],
          executor,
        ),
      ).toThrow('VERCEL_TOKEN is required.');
      expect(executor).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('sanitizes a Vercel process failure without exposing the token', () => {
    const sentinel = 'sentinel-vercel-token';
    vi.stubEnv('VERCEL_TOKEN', sentinel);

    let failure: unknown;
    try {
      runVercelOperation(
        'inspect',
        ['inspect', 'https://preview.example'],
        () => {
          throw new Error(`failed --token=${sentinel}`);
        },
      );
    } catch (error) {
      failure = error;
    } finally {
      vi.unstubAllEnvs();
    }

    expect(failure).toEqual(new Error('Vercel inspect failed.'));
    expect(JSON.stringify(failure)).not.toContain(sentinel);
    expect(String(failure)).not.toContain(sentinel);
  });

  it('reports a Vercel child-process exit code without its output', () => {
    vi.stubEnv('VERCEL_TOKEN', 'sentinel-vercel-token');

    try {
      expect(() =>
        runVercelOperation(
          'inspect',
          ['inspect', 'https://preview.example'],
          () => {
            const error = new Error(
              'sensitive child-process output',
            ) as Error & {
              status: number;
            };
            error.status = 2;
            throw error;
          },
        ),
      ).toThrow('Vercel inspect failed (exit code 2).');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('accepts only a complete Vercel project link', () => {
    expect(
      parseVercelProjectLink({
        orgId: 'team_expected',
        projectId: 'prj_expected',
      }),
    ).toEqual({ orgId: 'team_expected', projectId: 'prj_expected' });
  });

  it('accepts only a bounded runtime database hostname and database name', () => {
    expect(
      parseRuntimeCanaryEvidence(
        '{"databaseHost":"ep-test.us-east-2.aws.neon.tech","databaseName":"app_preview","authProvider":"authjs","clerkKeysTest":null}',
      ),
    ).toEqual({
      authProvider: 'authjs',
      clerkKeysTest: null,
      databaseHost: 'ep-test.us-east-2.aws.neon.tech',
      databaseName: 'app_preview',
    });
  });

  it('accepts a database name of exactly 63 ASCII bytes', () => {
    const name = 'a'.repeat(63);
    expect(
      parseRuntimeCanaryEvidence(
        JSON.stringify({
          authProvider: 'authjs',
          clerkKeysTest: null,
          databaseHost: 'ep-test.us-east-2.aws.neon.tech',
          databaseName: name,
        }),
      ),
    ).toMatchObject({ databaseName: name });
  });

  it('accepts a multi-byte UTF-8 database name that is exactly 63 bytes', () => {
    // 31 * 'ą' (2 UTF-8 bytes each, 62 bytes) + 1 ASCII byte = 63 bytes, 32 JS characters.
    const name = `${'ą'.repeat(31)}a`;
    expect(Buffer.byteLength(name, 'utf8')).toBe(63);
    expect(
      parseRuntimeCanaryEvidence(
        JSON.stringify({
          authProvider: 'authjs',
          clerkKeysTest: null,
          databaseHost: 'ep-test.us-east-2.aws.neon.tech',
          databaseName: name,
        }),
      ),
    ).toMatchObject({ databaseName: name });
  });

  it('accepts Clerk runtime evidence only when deployed keys are test keys', () => {
    expect(
      parseRuntimeCanaryEvidence(
        '{"databaseHost":"ep-test.us-east-2.aws.neon.tech","databaseName":"app_preview","authProvider":"clerk","clerkKeysTest":true}',
      ),
    ).toMatchObject({ authProvider: 'clerk', clerkKeysTest: true });
  });

  it('derives the immutable runtime target from deployment metadata', () => {
    expect(
      parseImmutableDeploymentUrl({
        url: 'project-immutable-abc123-team.vercel.app',
      }),
    ).toBe('https://project-immutable-abc123-team.vercel.app');
  });

  it.each([
    undefined,
    'user@host.vercel.app',
    'host.vercel.app/path',
    'host.vercel.app?query',
    'host.vercel.app#hash',
    'host vercel.app',
  ])('rejects malformed immutable deployment URLs', (url) => {
    expect(() => parseImmutableDeploymentUrl({ url })).toThrow('immutable URL');
  });

  it.each([
    'not json',
    '{}',
    '{"databaseHost":"https://example.test","databaseName":"db","authProvider":"authjs","clerkKeysTest":null}',
    '{"databaseHost":"host/path","databaseName":"db","authProvider":"authjs","clerkKeysTest":null}',
    '{"databaseHost":"host","databaseName":"db","authProvider":"authjs","clerkKeysTest":true}',
    '{"databaseHost":"host","databaseName":"db","authProvider":"clerk","clerkKeysTest":false}',
    '{"databaseHost":"host","databaseName":"db","authProvider":"supabase","clerkKeysTest":null}',
    '{"databaseHost":"host","databaseName":"db","authProvider":"authjs","clerkKeysTest":null,"extra":true}',
    '{"databaseHost":"host","databaseName":"db","authProvider":"clerk","clerkKeysTest":true,"clerkSecretKey":"sk_test_not-allowed"}',
    '{"databaseHost":"host","databaseName":"db","authProvider":"authjs","clerkKeysTest":null,"databaseUrl":"postgresql://not-allowed"}',
    // databaseName-specific malformations
    '{"databaseHost":"host","authProvider":"authjs","clerkKeysTest":null}',
    '{"databaseHost":"host","databaseName":"","authProvider":"authjs","clerkKeysTest":null}',
    '{"databaseHost":"host","databaseName":"has space","authProvider":"authjs","clerkKeysTest":null}',
    '{"databaseHost":"host","databaseName":123,"authProvider":"authjs","clerkKeysTest":null}',
    `{"databaseHost":"host","databaseName":"${'a'.repeat(64)}","authProvider":"authjs","clerkKeysTest":null}`,
    // 32 * 'ą' (2 UTF-8 bytes each) = 32 JS characters (well under 63) but 64
    // UTF-8 bytes -- must be rejected by byte length, not JS .length.
    JSON.stringify({
      databaseHost: 'host',
      databaseName: 'ą'.repeat(32),
      authProvider: 'authjs',
      clerkKeysTest: null,
    }),
  ])('rejects malformed runtime evidence: %s', (output) => {
    expect(() => parseRuntimeCanaryEvidence(output)).toThrow(
      'invalid evidence',
    );
  });

  it.each([4096, 4097])(
    'enforces the byte response cap at %i bytes',
    async (size) => {
      const response = new Response('a'.repeat(size));
      if (size === 4096)
        await expect(readBoundedResponseBody(response)).resolves.toHaveLength(
          size,
        );
      else
        await expect(readBoundedResponseBody(response)).rejects.toThrow(
          'invalid evidence',
        );
    },
  );

  it('counts multibyte data by bytes and rejects a null body', async () => {
    await expect(
      readBoundedResponseBody(new Response('€'.repeat(1366))),
    ).rejects.toThrow('invalid evidence');
    await expect(readBoundedResponseBody(new Response(null))).rejects.toThrow(
      'invalid evidence',
    );
  });

  it.each([
    undefined,
    {},
    { orgId: 'team_expected' },
    { projectId: 'prj_expected' },
  ])('rejects a missing or malformed Vercel project link', (link) => {
    expect(() => parseVercelProjectLink(link)).toThrow('missing or malformed');
  });
});
