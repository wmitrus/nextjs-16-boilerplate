import { execFileSync } from 'node:child_process';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkCandidateEnvironmentContractInstrumentation,
  readCandidateEnvironmentContract,
  readOperatorDeclaredProductionContractDimensions,
} from './remote-environment';

const gitSha = 'a'.repeat(40);
const ROUTE_PATH =
  'src/app/api/internal/rollback-assessment/environment-contract/route.ts';

beforeEach(() => {
  vi.unstubAllEnvs();
});

const immutableUrl = 'https://project-immutable-abc123-team.vercel.app';

function jsonResponse(body: unknown, status = 200): Response {
  const encoded = new TextEncoder().encode(JSON.stringify(body));
  return new Response(encoded, { status });
}

function setInternalApiKey(): void {
  vi.stubEnv('INTERNAL_API_KEY', 'sentinel-internal-key');
}

function setProtectionBypassSecret(): void {
  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'sentinel-bypass-secret');
}

function setRequiredReadSecrets(): void {
  setInternalApiKey();
  setProtectionBypassSecret();
}

describe('candidate environment-contract remote read', () => {
  it('performs one bounded GET with both the internal-auth and Vercel protection-bypass headers', async () => {
    setRequiredReadSecrets();
    const evidence = {
      authProvider: 'authjs',
      contractVersion: 'v1',
      fingerprint: 'a'.repeat(64),
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(evidence));
    try {
      const result = await readCandidateEnvironmentContract(
        immutableUrl,
        fetchMock,
      );
      expect(result).toEqual(evidence);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.toString()).toBe(
        `${immutableUrl}/api/internal/rollback-assessment/environment-contract`,
      );
      expect(init.method).toBe('GET');
      expect(init.redirect).toBe('error');
      const headers = init.headers as Record<string, string>;
      expect(headers['x-internal-key']).toBe('sentinel-internal-key');
      expect(headers['x-vercel-protection-bypass']).toBe(
        'sentinel-bypass-secret',
      );
      expect(headers['x-vercel-set-bypass-cookie']).toBe('true');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects a non-200 response without leaking headers', async () => {
    setRequiredReadSecrets();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 403));
    try {
      await expect(
        readCandidateEnvironmentContract(immutableUrl, fetchMock),
      ).rejects.toThrow(/HTTP 403/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('bounds the response body and rejects an oversized payload', async () => {
    setRequiredReadSecrets();
    const oversized = 'x'.repeat(4096 + 1);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(oversized, { status: 200 }));
    try {
      await expect(
        readCandidateEnvironmentContract(immutableUrl, fetchMock),
      ).rejects.toThrow(/too large/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ['malformed JSON', '{'],
    ['non-object', '[]'],
    [
      'extra fields',
      JSON.stringify({
        authProvider: 'authjs',
        contractVersion: 'v1',
        fingerprint: 'a'.repeat(64),
        extra: '1',
      }),
    ],
    [
      'bad auth provider',
      JSON.stringify({
        authProvider: 'root',
        contractVersion: 'v1',
        fingerprint: 'a'.repeat(64),
      }),
    ],
    [
      'bad fingerprint',
      JSON.stringify({
        authProvider: 'authjs',
        contractVersion: 'v1',
        fingerprint: 'not-hex',
      }),
    ],
  ])('rejects %s candidate evidence', async (_reason, body) => {
    setRequiredReadSecrets();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(body, { status: 200 }));
    try {
      await expect(
        readCandidateEnvironmentContract(immutableUrl, fetchMock),
      ).rejects.toThrow(/malformed/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('never leaks INTERNAL_API_KEY or VERCEL_AUTOMATION_BYPASS_SECRET in a thrown message on transport failure', async () => {
    setRequiredReadSecrets();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(
        new Error('network down: sentinel-internal-key sentinel-bypass-secret'),
      );
    try {
      let caught: unknown;
      try {
        await readCandidateEnvironmentContract(immutableUrl, fetchMock);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).not.toContain('sentinel-internal-key');
      expect((caught as Error).message).not.toContain('sentinel-bypass-secret');
      expect((caught as Error).message).toMatch(/read failed/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('requires INTERNAL_API_KEY before any network call', async () => {
    setProtectionBypassSecret();
    const fetchMock = vi.fn();
    await expect(
      readCandidateEnvironmentContract(immutableUrl, fetchMock),
    ).rejects.toThrow('INTERNAL_API_KEY is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires VERCEL_AUTOMATION_BYPASS_SECRET before any network call, independently of INTERNAL_API_KEY', async () => {
    setInternalApiKey();
    const fetchMock = vi.fn();
    await expect(
      readCandidateEnvironmentContract(immutableUrl, fetchMock),
    ).rejects.toThrow('VERCEL_AUTOMATION_BYPASS_SECRET is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('candidate environment-contract instrumentation check', () => {
  it('is PRESENT only when the trusted candidate commit actually contains the route, with no fetch', () => {
    const executor = vi
      .fn()
      .mockReturnValueOnce('false\n')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('');
    const result = checkCandidateEnvironmentContractInstrumentation(
      gitSha,
      executor,
    );
    expect(result).toEqual({ status: 'PRESENT' });
    expect(executor).toHaveBeenCalledTimes(3);
    expect(executor.mock.calls[1]?.[1]).toEqual([
      'cat-file',
      '-e',
      `${gitSha}^{commit}`,
    ]);
    expect(executor.mock.calls[2]?.[1]).toEqual([
      'cat-file',
      '-e',
      `${gitSha}:${ROUTE_PATH}`,
    ]);
    for (const call of executor.mock.calls) {
      expect(call[1]).not.toContain('fetch');
    }
  });

  it('blocks a legacy candidate whose commit is resolvable but genuinely lacks the route, without ever attempting the network read', () => {
    const executor = vi
      .fn()
      .mockReturnValueOnce('false\n')
      .mockReturnValueOnce('') // commit resolves
      .mockImplementationOnce(() => {
        throw new Error('fatal: path does not exist');
      });
    const result = checkCandidateEnvironmentContractInstrumentation(
      gitSha,
      executor,
    );
    expect(result).toEqual({
      reason:
        'Rollback candidate predates deployment-bound environment-contract instrumentation.',
      status: 'BLOCKED',
    });
  });

  it('blocks with a distinct reason when the commit object itself is not locally available -- never conflated with "predates"', () => {
    const executor = vi
      .fn()
      .mockReturnValueOnce('false\n')
      .mockImplementationOnce(() => {
        throw new Error('fatal: Not a valid object name');
      });
    const result = checkCandidateEnvironmentContractInstrumentation(
      gitSha,
      executor,
    );
    expect(result).toEqual({
      reason: 'Candidate commit is not available in local Git history.',
      status: 'BLOCKED',
    });
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('blocks a shallow checkout without fetching, with its own distinct reason', () => {
    const executor = vi.fn().mockReturnValue('true\n');
    const result = checkCandidateEnvironmentContractInstrumentation(
      gitSha,
      executor,
    );
    expect(result).toMatchObject({ status: 'BLOCKED' });
    expect(result.status === 'BLOCKED' && result.reason).toMatch(/shallow/i);
    expect(executor).toHaveBeenCalledOnce();
  });

  it('regression guard: the real A4.2a candidate SHA is diagnosed correctly against this actual repository', () => {
    // Uses the REAL executor (no mock). First establishes, from this actual
    // checkout's own state, exactly what the function's BLOCKED result is
    // allowed to mean here -- a shallow checkout must report the shallow
    // reason, never be silently read as "predates"; a full checkout with
    // the commit present must report the precise "predates instrumentation"
    // reason, proving this specific candidate SHA genuinely lacks the
    // route rather than merely being unreachable in this environment.
    const candidateSha = 'f2d57d52d10c7685df40b57b7d4aa9ab21778a67';
    const shallow = execFileSync(
      'git',
      ['rev-parse', '--is-shallow-repository'],
      { encoding: 'utf8' },
    ).trim();
    const result =
      checkCandidateEnvironmentContractInstrumentation(candidateSha);
    if (shallow === 'true') {
      expect(result).toMatchObject({ status: 'BLOCKED' });
      expect(result.status === 'BLOCKED' && result.reason).toMatch(/shallow/i);
      return;
    }
    // Non-shallow: the commit itself must be locally resolvable, or this
    // proves nothing about "predates" versus "object missing".
    execFileSync('git', ['cat-file', '-e', `${candidateSha}^{commit}`], {
      stdio: 'ignore',
    });
    expect(result).toEqual({
      reason:
        'Rollback candidate predates deployment-bound environment-contract instrumentation.',
      status: 'BLOCKED',
    });
  });

  it('errors when shallow-ness cannot be determined', () => {
    const result = checkCandidateEnvironmentContractInstrumentation(
      gitSha,
      () => {
        throw new Error('raw stderr');
      },
    );
    expect(result).toMatchObject({ status: 'ERROR' });
  });
});

const validTenantId = '11111111-1111-4111-8111-111111111111';
const otherValidTenantId = '22222222-2222-4222-8222-222222222222';

function stubSingleModeAnchors(): void {
  vi.stubEnv('PRODUCTION_AUTH_PROVIDER', 'authjs');
  vi.stubEnv('PRODUCTION_TENANCY_MODE', 'single');
  vi.stubEnv('PRODUCTION_TENANT_CONTEXT_SOURCE', 'none');
  vi.stubEnv(
    'PRODUCTION_RUNTIME_DATABASE_HOST',
    'ep-prod.us-east-2.aws.neon.tech',
  );
  vi.stubEnv('PRODUCTION_DATABASE_NAME', 'app_production');
  vi.stubEnv('PRODUCTION_DEFAULT_TENANT_ID', validTenantId);
}

describe('operator-declared expected Production environment contract', () => {
  it('is undefined when not explicitly declared -- ambient env is never used', () => {
    expect(readOperatorDeclaredProductionContractDimensions()).toBeUndefined();
  });

  it('reads only the explicit PRODUCTION_* trust anchors, never AUTH_PROVIDER/TENANCY_MODE/DATABASE_URL/DEFAULT_TENANT_ID directly', () => {
    vi.stubEnv('AUTH_PROVIDER', 'clerk');
    vi.stubEnv('TENANCY_MODE', 'org');
    vi.stubEnv('DATABASE_URL', 'postgresql://ambient-host/ambient_db');
    vi.stubEnv('DEFAULT_TENANT_ID', otherValidTenantId);
    stubSingleModeAnchors();
    expect(readOperatorDeclaredProductionContractDimensions()).toEqual({
      authProvider: 'authjs',
      databaseHost: 'ep-prod.us-east-2.aws.neon.tech',
      databaseName: 'app_production',
      defaultTenantId: validTenantId,
      tenancyMode: 'single',
      tenantContextSource: null,
    });
  });

  it.each([
    ['none', null],
    ['db', 'db'],
    ['provider', 'provider'],
  ] as const)(
    'maps the explicit PRODUCTION_TENANT_CONTEXT_SOURCE sentinel %s -> %s',
    (raw, expected) => {
      vi.stubEnv('PRODUCTION_AUTH_PROVIDER', 'clerk');
      vi.stubEnv('PRODUCTION_TENANCY_MODE', 'org');
      vi.stubEnv('PRODUCTION_TENANT_CONTEXT_SOURCE', raw);
      vi.stubEnv(
        'PRODUCTION_RUNTIME_DATABASE_HOST',
        'ep-prod.us-east-2.aws.neon.tech',
      );
      vi.stubEnv('PRODUCTION_DATABASE_NAME', 'app_production');
      expect(readOperatorDeclaredProductionContractDimensions()).toEqual({
        authProvider: 'clerk',
        databaseHost: 'ep-prod.us-east-2.aws.neon.tech',
        databaseName: 'app_production',
        defaultTenantId: null,
        tenancyMode: 'org',
        tenantContextSource: expected,
      });
    },
  );

  it.each([
    ['missing auth provider', {}],
    ['unmodeled auth provider', { PRODUCTION_AUTH_PROVIDER: 'supabase' }],
    [
      'unmodeled tenancy mode',
      { PRODUCTION_AUTH_PROVIDER: 'authjs', PRODUCTION_TENANCY_MODE: 'bogus' },
    ],
    [
      'missing tenant-context-source',
      { PRODUCTION_AUTH_PROVIDER: 'authjs', PRODUCTION_TENANCY_MODE: 'single' },
    ],
    [
      'empty tenant-context-source',
      {
        PRODUCTION_AUTH_PROVIDER: 'authjs',
        PRODUCTION_TENANCY_MODE: 'single',
        PRODUCTION_TENANT_CONTEXT_SOURCE: '',
      },
    ],
    [
      'unrecognized tenant-context-source',
      {
        PRODUCTION_AUTH_PROVIDER: 'authjs',
        PRODUCTION_TENANCY_MODE: 'single',
        PRODUCTION_TENANT_CONTEXT_SOURCE: 'bogus',
      },
    ],
  ])('is undefined for %s', (_reason, envVars) => {
    for (const [key, value] of Object.entries(envVars)) {
      vi.stubEnv(key, value);
    }
    expect(readOperatorDeclaredProductionContractDimensions()).toBeUndefined();
  });

  describe('expected database identity (FINDING 1)', () => {
    it('is undefined when PRODUCTION_RUNTIME_DATABASE_HOST is missing', () => {
      vi.stubEnv('PRODUCTION_AUTH_PROVIDER', 'authjs');
      vi.stubEnv('PRODUCTION_TENANCY_MODE', 'org');
      vi.stubEnv('PRODUCTION_TENANT_CONTEXT_SOURCE', 'none');
      vi.stubEnv('PRODUCTION_DATABASE_NAME', 'app_production');
      expect(
        readOperatorDeclaredProductionContractDimensions(),
      ).toBeUndefined();
    });

    it('is undefined when PRODUCTION_DATABASE_NAME is missing', () => {
      vi.stubEnv('PRODUCTION_AUTH_PROVIDER', 'authjs');
      vi.stubEnv('PRODUCTION_TENANCY_MODE', 'org');
      vi.stubEnv('PRODUCTION_TENANT_CONTEXT_SOURCE', 'none');
      vi.stubEnv(
        'PRODUCTION_RUNTIME_DATABASE_HOST',
        'ep-prod.us-east-2.aws.neon.tech',
      );
      expect(
        readOperatorDeclaredProductionContractDimensions(),
      ).toBeUndefined();
    });

    it('the expected host/name come only from the PRODUCTION_* pins, never ambient DATABASE_URL', () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://ambient-host/ambient_db');
      stubSingleModeAnchors();
      expect(readOperatorDeclaredProductionContractDimensions()).toMatchObject({
        databaseHost: 'ep-prod.us-east-2.aws.neon.tech',
        databaseName: 'app_production',
      });
    });

    it('changing only the ambient DATABASE_URL leaves the expected fingerprint dimensions unchanged', () => {
      stubSingleModeAnchors();
      const first = readOperatorDeclaredProductionContractDimensions();
      vi.stubEnv('DATABASE_URL', 'postgresql://some-other-host/some_other_db');
      const second = readOperatorDeclaredProductionContractDimensions();
      expect(second).toEqual(first);
    });

    it('changing PRODUCTION_RUNTIME_DATABASE_HOST changes the expected dimensions', () => {
      stubSingleModeAnchors();
      const first = readOperatorDeclaredProductionContractDimensions();
      vi.stubEnv(
        'PRODUCTION_RUNTIME_DATABASE_HOST',
        'ep-different.us-east-2.aws.neon.tech',
      );
      const second = readOperatorDeclaredProductionContractDimensions();
      expect(second?.databaseHost).not.toBe(first?.databaseHost);
    });

    it('changing PRODUCTION_DATABASE_NAME changes the expected dimensions', () => {
      stubSingleModeAnchors();
      const first = readOperatorDeclaredProductionContractDimensions();
      vi.stubEnv('PRODUCTION_DATABASE_NAME', 'other_production_db');
      const second = readOperatorDeclaredProductionContractDimensions();
      expect(second?.databaseName).not.toBe(first?.databaseName);
    });

    describe('pooled runtime host vs direct/unpooled schema host (host-surface separation)', () => {
      it('uses the pooled PRODUCTION_RUNTIME_DATABASE_HOST, independent of the direct/unpooled PRODUCTION_DATABASE_HOST schema pin', () => {
        vi.stubEnv('PRODUCTION_AUTH_PROVIDER', 'authjs');
        vi.stubEnv('PRODUCTION_TENANCY_MODE', 'org');
        vi.stubEnv('PRODUCTION_TENANT_CONTEXT_SOURCE', 'provider');
        vi.stubEnv(
          'PRODUCTION_RUNTIME_DATABASE_HOST',
          'ep-prod-pooler.us-east-2.aws.neon.tech',
        );
        // The direct/unpooled schema-compat pin, deliberately different --
        // this is the legitimate pooled-vs-direct Neon endpoint split.
        vi.stubEnv(
          'PRODUCTION_DATABASE_HOST',
          'ep-prod-direct.us-east-2.aws.neon.tech',
        );
        vi.stubEnv('PRODUCTION_DATABASE_NAME', 'app_production');
        expect(
          readOperatorDeclaredProductionContractDimensions(),
        ).toMatchObject({
          databaseHost: 'ep-prod-pooler.us-east-2.aws.neon.tech',
        });
      });

      it('changing only PRODUCTION_DATABASE_HOST (the schema/direct-host pin) does not change the expected environment-contract dimensions', () => {
        stubSingleModeAnchors();
        const first = readOperatorDeclaredProductionContractDimensions();
        vi.stubEnv(
          'PRODUCTION_DATABASE_HOST',
          'ep-completely-different-direct-host.us-east-2.aws.neon.tech',
        );
        const second = readOperatorDeclaredProductionContractDimensions();
        expect(second).toEqual(first);
      });

      it('ambient DATABASE_URL_UNPOOLED does not influence expected environment-contract dimensions', () => {
        vi.stubEnv(
          'DATABASE_URL_UNPOOLED',
          'postgresql://ambient-direct-host/ambient_db',
        );
        stubSingleModeAnchors();
        const withUnpooled = readOperatorDeclaredProductionContractDimensions();
        vi.stubEnv(
          'DATABASE_URL_UNPOOLED',
          'postgresql://some-other-direct-host/other_db',
        );
        const changedUnpooled =
          readOperatorDeclaredProductionContractDimensions();
        expect(changedUnpooled).toEqual(withUnpooled);
      });

      it('is undefined when PRODUCTION_RUNTIME_DATABASE_HOST is missing even though PRODUCTION_DATABASE_HOST is present', () => {
        vi.stubEnv('PRODUCTION_AUTH_PROVIDER', 'authjs');
        vi.stubEnv('PRODUCTION_TENANCY_MODE', 'org');
        vi.stubEnv('PRODUCTION_TENANT_CONTEXT_SOURCE', 'provider');
        vi.stubEnv(
          'PRODUCTION_DATABASE_HOST',
          'ep-prod-direct.us-east-2.aws.neon.tech',
        );
        vi.stubEnv('PRODUCTION_DATABASE_NAME', 'app_production');
        expect(
          readOperatorDeclaredProductionContractDimensions(),
        ).toBeUndefined();
      });
    });
  });

  describe('expected single-tenant identity (FINDING 2)', () => {
    it('requires PRODUCTION_DEFAULT_TENANT_ID when PRODUCTION_TENANCY_MODE=single', () => {
      vi.stubEnv('PRODUCTION_AUTH_PROVIDER', 'authjs');
      vi.stubEnv('PRODUCTION_TENANCY_MODE', 'single');
      vi.stubEnv('PRODUCTION_TENANT_CONTEXT_SOURCE', 'none');
      vi.stubEnv(
        'PRODUCTION_RUNTIME_DATABASE_HOST',
        'ep-prod.us-east-2.aws.neon.tech',
      );
      vi.stubEnv('PRODUCTION_DATABASE_NAME', 'app_production');
      expect(
        readOperatorDeclaredProductionContractDimensions(),
      ).toBeUndefined();
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['malformed', 'not-a-uuid'],
    ])(
      'is undefined for single mode with a %s PRODUCTION_DEFAULT_TENANT_ID',
      (_label, value) => {
        vi.stubEnv('PRODUCTION_AUTH_PROVIDER', 'authjs');
        vi.stubEnv('PRODUCTION_TENANCY_MODE', 'single');
        vi.stubEnv('PRODUCTION_TENANT_CONTEXT_SOURCE', 'none');
        vi.stubEnv(
          'PRODUCTION_RUNTIME_DATABASE_HOST',
          'ep-prod.us-east-2.aws.neon.tech',
        );
        vi.stubEnv('PRODUCTION_DATABASE_NAME', 'app_production');
        if (value !== undefined) {
          vi.stubEnv('PRODUCTION_DEFAULT_TENANT_ID', value);
        }
        expect(
          readOperatorDeclaredProductionContractDimensions(),
        ).toBeUndefined();
      },
    );

    it('a different PRODUCTION_DEFAULT_TENANT_ID changes the expected dimensions', () => {
      stubSingleModeAnchors();
      const first = readOperatorDeclaredProductionContractDimensions();
      vi.stubEnv('PRODUCTION_DEFAULT_TENANT_ID', otherValidTenantId);
      const second = readOperatorDeclaredProductionContractDimensions();
      expect(second?.defaultTenantId).not.toBe(first?.defaultTenantId);
    });

    it.each(['org', 'personal'] as const)(
      'never requires PRODUCTION_DEFAULT_TENANT_ID in %s mode -- expected defaultTenantId is null',
      (tenancyMode) => {
        vi.stubEnv('PRODUCTION_AUTH_PROVIDER', 'authjs');
        vi.stubEnv('PRODUCTION_TENANCY_MODE', tenancyMode);
        vi.stubEnv(
          'PRODUCTION_TENANT_CONTEXT_SOURCE',
          tenancyMode === 'org' ? 'provider' : 'none',
        );
        vi.stubEnv(
          'PRODUCTION_RUNTIME_DATABASE_HOST',
          'ep-prod.us-east-2.aws.neon.tech',
        );
        vi.stubEnv('PRODUCTION_DATABASE_NAME', 'app_production');
        expect(
          readOperatorDeclaredProductionContractDimensions(),
        ).toMatchObject({ defaultTenantId: null });
      },
    );

    it.each(['org', 'personal'] as const)(
      'ignores an ambient PRODUCTION_DEFAULT_TENANT_ID in %s mode for the fingerprint', // and never requires it
      (tenancyMode) => {
        vi.stubEnv('PRODUCTION_AUTH_PROVIDER', 'authjs');
        vi.stubEnv('PRODUCTION_TENANCY_MODE', tenancyMode);
        vi.stubEnv(
          'PRODUCTION_TENANT_CONTEXT_SOURCE',
          tenancyMode === 'org' ? 'provider' : 'none',
        );
        vi.stubEnv(
          'PRODUCTION_RUNTIME_DATABASE_HOST',
          'ep-prod.us-east-2.aws.neon.tech',
        );
        vi.stubEnv('PRODUCTION_DATABASE_NAME', 'app_production');
        vi.stubEnv('PRODUCTION_DEFAULT_TENANT_ID', validTenantId);
        expect(
          readOperatorDeclaredProductionContractDimensions(),
        ).toMatchObject({ defaultTenantId: null });
      },
    );
  });
});
