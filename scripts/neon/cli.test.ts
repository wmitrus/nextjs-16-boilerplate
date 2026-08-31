import { describe, expect, it, vi } from 'vitest';

import {
  assertDatabaseHostBelongsToPreviewEndpoints,
  assertDatabaseNameMatchesExpectedPreviewDatabase,
  readOption,
  assertDatabaseUrlBelongsToPreviewEndpoints,
  assertTrustedProviderUrl,
  findOldestObsoletePreviewBranch,
  getBranchDatabaseNames,
  readNeonConfig,
  resolveExpectedPreviewDatabaseName,
  verifyPreviewEndpoint,
} from './cli';

const config = { apiKey: 'secret', branchLimit: 10, projectId: 'project-1' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('assertDatabaseUrlBelongsToPreviewEndpoints', () => {
  const endpoint = 'ep-test.us-east-2.aws.neon.tech';

  it('accepts the direct endpoint host', () => {
    expect(() =>
      assertDatabaseUrlBelongsToPreviewEndpoints(
        [endpoint],
        `postgres://user:password@${endpoint}/database`,
      ),
    ).not.toThrow();
  });

  it('accepts the corresponding pooled endpoint host', () => {
    expect(() =>
      assertDatabaseUrlBelongsToPreviewEndpoints(
        [endpoint],
        'postgresql://user:password@ep-test-pooler.us-east-2.aws.neon.tech/database',
      ),
    ).not.toThrow();
  });

  it('rejects a different endpoint host', () => {
    expect(() =>
      assertDatabaseUrlBelongsToPreviewEndpoints(
        [endpoint],
        'postgres://user:password@ep-other.us-east-2.aws.neon.tech/database',
      ),
    ).toThrow('does not belong');
  });

  it.each([
    'https://ep-test.us-east-2.aws.neon.tech/database',
    'mysql://ep-test.us-east-2.aws.neon.tech/database',
  ])('rejects a non-Postgres URL: %s', (databaseUrl) => {
    expect(() =>
      assertDatabaseUrlBelongsToPreviewEndpoints([endpoint], databaseUrl),
    ).toThrow('postgres or postgresql protocol');
  });
});

describe('assertDatabaseHostBelongsToPreviewEndpoints', () => {
  const endpoint = 'ep-test.us-east-2.aws.neon.tech';

  it('accepts exact and pooled endpoint hosts only', () => {
    expect(() =>
      assertDatabaseHostBelongsToPreviewEndpoints([endpoint], endpoint),
    ).not.toThrow();
    expect(() =>
      assertDatabaseHostBelongsToPreviewEndpoints(
        [endpoint],
        'ep-test-pooler.us-east-2.aws.neon.tech',
      ),
    ).not.toThrow();
  });

  it.each([
    'ep-main.us-east-2.aws.neon.tech',
    'ep-test.us-east-2.aws.neon.tech.attacker.test',
    'prefix-ep-test.us-east-2.aws.neon.tech',
    'anything.neon.tech',
  ])('rejects non-matching host: %s', (host) => {
    expect(() =>
      assertDatabaseHostBelongsToPreviewEndpoints([endpoint], host),
    ).toThrow('does not belong');
  });
});

describe('readOption', () => {
  it('accepts single inline and separated values', () => {
    expect(readOption(['--database-host=a'], '--database-host')).toBe('a');
    expect(readOption(['--database-host', 'a'], '--database-host')).toBe('a');
  });

  it.each([
    ['--database-host=a', '--database-host=b'],
    ['--database-host=a', '--database-host', 'b'],
    ['--git-branch=a', '--git-branch=b'],
  ])('rejects duplicate options: %s', (...args) => {
    const name = args[0].startsWith('--git-branch')
      ? '--git-branch'
      : '--database-host';
    expect(() => readOption(args, name)).toThrow('must not be specified twice');
  });

  it('rejects a missing separated value', () => {
    expect(() => readOption(['--database-host'], '--database-host')).toThrow(
      'requires a value',
    );
  });
});

describe('assertTrustedProviderUrl', () => {
  it('accepts only the exact HTTPS provider endpoint', () => {
    expect(() =>
      assertTrustedProviderUrl(
        new URL('https://console.neon.tech/api/v2/projects/project-1/branches'),
        { projectId: 'project-1', provider: 'neon' },
      ),
    ).not.toThrow();
  });

  it.each([
    'http://console.neon.tech/api/v2/projects/project-1/branches',
    'https://internal.example/api/v2/projects/project-1/branches',
    'https://console.neon.tech/api/v2/projects/project-2/branches',
    'https://user:password@console.neon.tech/api/v2/projects/project-1/branches',
    'https://console.neon.tech/api/v2/projects/project-1/branches?redirect=internal',
  ])('rejects an untrusted provider URL: %s', (value) => {
    expect(() =>
      assertTrustedProviderUrl(new URL(value), {
        projectId: 'project-1',
        provider: 'neon',
      }),
    ).toThrow('unexpected provider API URL');
  });
});

describe('assertTrustedProviderUrl (databases endpoint)', () => {
  it('accepts the exact branch databases endpoint', () => {
    expect(() =>
      assertTrustedProviderUrl(
        new URL(
          'https://console.neon.tech/api/v2/projects/project-1/branches/br-1/databases',
        ),
        { projectId: 'project-1', provider: 'neon' },
      ),
    ).not.toThrow();
  });

  it('rejects a databases path for an untrusted branch id shape', () => {
    expect(() =>
      assertTrustedProviderUrl(
        new URL(
          'https://console.neon.tech/api/v2/projects/project-1/branches/br 1/databases',
        ),
        { projectId: 'project-1', provider: 'neon' },
      ),
    ).toThrow('unexpected provider API URL');
  });
});

describe('getBranchDatabaseNames', () => {
  it('requests the exact databases endpoint for the given branch ID with an explicit GET method', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ databases: [{ branch_id: 'br-1', name: 'appdb' }] }),
      );
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).resolves.toEqual([
        'appdb',
      ]);
      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.toString()).toBe(
        'https://console.neon.tech/api/v2/projects/project-1/branches/br-1/databases',
      );
      expect(init.method).toBe('GET');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a malformed response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        'invalid databases response',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails closed on an empty database list (returns empty array, not an error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ databases: [] })),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).resolves.toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects duplicate database names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          databases: [
            { branch_id: 'br-1', name: 'appdb' },
            { branch_id: 'br-1', name: 'appdb' },
          ],
        }),
      ),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        'duplicate database names',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a malformed database name', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ databases: [{ branch_id: 'br-1', name: '' }] }),
        ),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        'malformed database name',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a database entry with a missing branch_id -- untrusted provider JSON must validate completely', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ databases: [{ name: 'appdb' }] })),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        'missing or malformed branch_id',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a database belonging to a different branch when branch_id is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          databases: [{ branch_id: 'br-other', name: 'appdb' }],
        }),
      ),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        'does not belong to the expected branch',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accepts a database name of exactly 63 ASCII bytes and rejects 64', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          databases: [{ branch_id: 'br-1', name: 'a'.repeat(63) }],
        }),
      ),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).resolves.toEqual([
        'a'.repeat(63),
      ]);
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          databases: [{ branch_id: 'br-1', name: 'a'.repeat(64) }],
        }),
      ),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        'malformed database name',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a multi-byte UTF-8 name that is <=63 JS characters but exceeds 63 bytes', async () => {
    // 32 * 'ą' (U+0105, 2 UTF-8 bytes each) = 32 JS characters, 64 bytes.
    const oversizedByBytes = 'ą'.repeat(32);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          databases: [{ branch_id: 'br-1', name: oversizedByBytes }],
        }),
      ),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        'malformed database name',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accepts a multi-byte UTF-8 name that is exactly 63 bytes', async () => {
    // 31 * 'ą' (2 bytes each, 62 bytes) + 1 ASCII byte = 63 bytes total, 32 JS characters.
    const exactly63Bytes = `${'ą'.repeat(31)}a`;
    expect(Buffer.byteLength(exactly63Bytes, 'utf8')).toBe(63);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          databases: [{ branch_id: 'br-1', name: exactly63Bytes }],
        }),
      ),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).resolves.toEqual([
        exactly63Bytes,
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('getBranchDatabaseNames (bounded response body)', () => {
  const MAX_NEON_DATABASES_RESPONSE_BYTES = 512 * 1024;
  const MAX_NEON_BRANCH_DATABASES = 500;

  function rawJsonResponse(body: string, status = 200): Response {
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  /**
   * Builds a valid `{ databases, padding }` JSON body whose exact UTF-8 byte
   * length equals `targetBytes` -- `padding` is ignored by the parser, so
   * this controls response size precisely without affecting behavior other
   * than the byte-bound check itself.
   */
  function databasesResponseOfExactSize(
    databases: unknown[],
    targetBytes: number,
  ): string {
    const withoutPadding = JSON.stringify({ databases, padding: '' });
    const overhead = Buffer.byteLength(withoutPadding, 'utf8');
    if (overhead > targetBytes) {
      throw new Error('target size too small for the given payload');
    }
    return JSON.stringify({
      databases,
      padding: 'a'.repeat(targetBytes - overhead),
    });
  }

  it('processes a normal small response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ databases: [{ branch_id: 'br-1', name: 'appdb' }] }),
        ),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).resolves.toEqual([
        'appdb',
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('processes a response body exactly at the byte limit', async () => {
    const body = databasesResponseOfExactSize(
      [{ branch_id: 'br-1', name: 'appdb' }],
      MAX_NEON_DATABASES_RESPONSE_BYTES,
    );
    expect(Buffer.byteLength(body, 'utf8')).toBe(
      MAX_NEON_DATABASES_RESPONSE_BYTES,
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rawJsonResponse(body)));
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).resolves.toEqual([
        'appdb',
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a response body exceeding the byte limit BEFORE JSON parsing, even when the body is well-formed JSON', async () => {
    const body = databasesResponseOfExactSize(
      [{ branch_id: 'br-1', name: 'appdb' }],
      MAX_NEON_DATABASES_RESPONSE_BYTES + 1,
    );
    // Sanity check: this body is valid JSON. If the bound were applied only
    // after parsing (or not at all), this call would succeed.
    expect(() => JSON.parse(body)).not.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rawJsonResponse(body)));
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        'exceeded the bounded size limit',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports a bounded, generic error for an oversized body without leaking the raw payload', async () => {
    const body = databasesResponseOfExactSize(
      [{ branch_id: 'br-1', name: 'appdb' }],
      MAX_NEON_DATABASES_RESPONSE_BYTES + 1,
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rawJsonResponse(body)));
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        /^Neon API response exceeded the bounded size limit\.$/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects malformed JSON within the byte-bounded read path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(rawJsonResponse('{not valid json')),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        'Neon API returned malformed JSON.',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accepts exactly 500 valid database entries', async () => {
    const databases = Array.from(
      { length: MAX_NEON_BRANCH_DATABASES },
      (_, i) => ({
        branch_id: 'br-1',
        name: `db-${i}`,
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ databases })),
    );
    try {
      const names = await getBranchDatabaseNames(config, 'br-1');
      expect(names).toHaveLength(MAX_NEON_BRANCH_DATABASES);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects 501 database entries as too many, without silently truncating to the first 500', async () => {
    const databases = Array.from(
      { length: MAX_NEON_BRANCH_DATABASES + 1 },
      (_, i) => ({ branch_id: 'br-1', name: `db-${i}` }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ databases })),
    );
    try {
      await expect(getBranchDatabaseNames(config, 'br-1')).rejects.toThrow(
        'Neon API returned too many databases.',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps exact branch ID, explicit GET, and trusted provider URL validation intact under the bounded path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ databases: [{ branch_id: 'br-1', name: 'appdb' }] }),
      );
    vi.stubGlobal('fetch', fetchMock);
    try {
      await getBranchDatabaseNames(config, 'br-1');
      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.toString()).toBe(
        'https://console.neon.tech/api/v2/projects/project-1/branches/br-1/databases',
      );
      expect(init.method).toBe('GET');
    } finally {
      vi.unstubAllGlobals();
    }

    await expect(getBranchDatabaseNames(config, 'br 1')).rejects.toThrow(
      'invalid branch ID',
    );
  });
});

describe('resolveExpectedPreviewDatabaseName', () => {
  it('resolves the single database as authoritative', () => {
    expect(resolveExpectedPreviewDatabaseName(['appdb'])).toBe('appdb');
  });

  it('fails closed on zero databases', () => {
    expect(() => resolveExpectedPreviewDatabaseName([])).toThrow(
      'no verifiable database',
    );
  });

  it('fails closed as ambiguous on multiple databases, never picking one', () => {
    expect(() =>
      resolveExpectedPreviewDatabaseName(['appdb', 'other']),
    ).toThrow('multiple databases');
  });
});

describe('assertDatabaseNameMatchesExpectedPreviewDatabase', () => {
  it('accepts an exact match', () => {
    expect(() =>
      assertDatabaseNameMatchesExpectedPreviewDatabase('appdb', 'appdb'),
    ).not.toThrow();
  });

  it('fails closed on a mismatch', () => {
    expect(() =>
      assertDatabaseNameMatchesExpectedPreviewDatabase('appdb', 'other'),
    ).toThrow('does not match the expected');
  });
});

describe('verifyPreviewEndpoint', () => {
  function stubNeonResponses(options: {
    databases: Array<{ branch_id?: string; name: string }>;
    endpointHost?: string;
  }): ReturnType<typeof vi.fn> {
    return vi.fn().mockImplementation((url: URL) => {
      const pathname = url.pathname;
      if (pathname.endsWith('/databases')) {
        return Promise.resolve(jsonResponse({ databases: options.databases }));
      }
      if (pathname.endsWith('/endpoints')) {
        return Promise.resolve(
          jsonResponse({
            endpoints: [{ host: options.endpointHost ?? 'ep-test.neon.tech' }],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          branches: [
            {
              id: 'br-1',
              name: 'preview/feature-x',
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
        }),
      );
    });
  }

  it('passes when the runtime host and the single authoritative database name both match', async () => {
    const fetchMock = stubNeonResponses({
      databases: [{ branch_id: 'br-1', name: 'appdb' }],
      endpointHost: 'ep-test.neon.tech',
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        verifyPreviewEndpoint(config, [
          '--git-branch=feature-x',
          '--database-host=ep-test.neon.tech',
          '--database-name=appdb',
        ]),
      ).resolves.toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails closed on a runtime database name mismatch even when the host matches', async () => {
    const fetchMock = stubNeonResponses({
      databases: [{ branch_id: 'br-1', name: 'appdb' }],
      endpointHost: 'ep-test.neon.tech',
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        verifyPreviewEndpoint(config, [
          '--git-branch=feature-x',
          '--database-host=ep-test.neon.tech',
          '--database-name=wrong-db',
        ]),
      ).rejects.toThrow('does not match the expected');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails closed on a host mismatch even when the database name matches', async () => {
    const fetchMock = stubNeonResponses({
      databases: [{ branch_id: 'br-1', name: 'appdb' }],
      endpointHost: 'ep-test.neon.tech',
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        verifyPreviewEndpoint(config, [
          '--git-branch=feature-x',
          '--database-host=ep-other.neon.tech',
          '--database-name=appdb',
        ]),
      ).rejects.toThrow('does not belong');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails closed when the branch has zero databases', async () => {
    const fetchMock = stubNeonResponses({
      databases: [],
      endpointHost: 'ep-test.neon.tech',
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        verifyPreviewEndpoint(config, [
          '--git-branch=feature-x',
          '--database-host=ep-test.neon.tech',
          '--database-name=appdb',
        ]),
      ).rejects.toThrow('no verifiable database');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails closed as ambiguous when the branch has multiple databases, never picking the runtime-reported one', async () => {
    const fetchMock = stubNeonResponses({
      databases: [
        { branch_id: 'br-1', name: 'appdb' },
        { branch_id: 'br-1', name: 'other' },
      ],
      endpointHost: 'ep-test.neon.tech',
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        verifyPreviewEndpoint(config, [
          '--git-branch=feature-x',
          '--database-host=ep-test.neon.tech',
          '--database-name=appdb',
        ]),
      ).rejects.toThrow('multiple databases');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('requires --database-name', async () => {
    await expect(
      verifyPreviewEndpoint(config, [
        '--git-branch=feature-x',
        '--database-host=ep-test.neon.tech',
      ]),
    ).rejects.toThrow(
      'requires --git-branch, a database host, and --database-name',
    );
  });
});

describe('readNeonConfig', () => {
  it('validates the dedicated Neon management environment', () => {
    vi.stubEnv('NEON_API_KEY', 'secret');
    vi.stubEnv('NEON_PROJECT_ID', 'project-123');
    vi.stubEnv('NEON_BRANCH_LIMIT', '10');

    expect(readNeonConfig()).toEqual({
      apiKey: 'secret',
      branchLimit: 10,
      projectId: 'project-123',
    });

    vi.unstubAllEnvs();
  });
});

describe('findOldestObsoletePreviewBranch', () => {
  const branches = [
    {
      created_at: '2026-08-12T10:00:00Z',
      id: 'br-main',
      name: 'main',
      default: true,
    },
    {
      created_at: '2026-08-13T10:00:00Z',
      id: 'br-old-active',
      name: 'preview/feature-active',
    },
    {
      created_at: '2026-08-11T10:00:00Z',
      id: 'br-old-obsolete',
      name: 'preview/feature-closed',
    },
    {
      created_at: '2026-08-10T10:00:00Z',
      id: 'br-current',
      name: 'preview/current-feature',
    },
  ];

  it('returns only the oldest preview whose GitHub branch no longer exists', async () => {
    const branchExists = vi.fn(async (name: string) => {
      return name === 'feature-active';
    });

    await expect(
      findOldestObsoletePreviewBranch(
        branches,
        'current-feature',
        branchExists,
      ),
    ).resolves.toMatchObject({ id: 'br-old-obsolete' });
    expect(branchExists).toHaveBeenCalledWith('feature-closed');
  });

  it('does not delete an active, default, or current branch', async () => {
    await expect(
      findOldestObsoletePreviewBranch(
        branches,
        'current-feature',
        async () => true,
      ),
    ).resolves.toBeUndefined();
  });
});
