import { randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

const compactIndexes = vi.hoisted(() => ({
  runR4aCompactIndexesCli: vi.fn(async () => undefined),
  runR4aCompactIndexCommand: vi.fn(async () => undefined),
}));
vi.mock('./db-r4a-compact-indexes', () => compactIndexes);

import {
  defaultR4aOperatorDeps,
  parseR4aOperatorArgs,
  R4A_PRODUCTION_TARGET,
  runR4aOperatorCheck,
  type R4aOperatorDeps,
} from './db-r4a-operator-check';

const SECRET = randomBytes(18).toString('hex');
const PROD_HOST = 'ep-prod-fixture.eu-central-1.aws.neon.tech';
const PREVIEW_HOST = 'ep-preview-fixture.eu-central-1.aws.neon.tech';
const PREVIEW_BRANCH = { id: 'br-preview-fixture', name: 'preview/feat/x' };
const url = (host: string, db: string, query = '?sslmode=require') =>
  `postgresql://owner:${SECRET}@${host}/${db}${query}`;
const PROD_URL = url(PROD_HOST, 'neondb');
const PREVIEW_URL = url(PREVIEW_HOST, 'neondb');
const NEON_FILE = `NEON_API_KEY=${SECRET}-api\nNEON_PROJECT_ID=${R4A_PRODUCTION_TARGET.projectId}\n`;

function deps(
  files: Record<string, string | undefined>,
  env: Record<string, string | undefined> = {},
) {
  const runCheck = vi.fn(async () => undefined);
  const runApply = vi.fn(async () => undefined);
  const value: R4aOperatorDeps = {
    readFile: (name) => new Map(Object.entries(files)).get(name),
    env,
    listBranches: vi.fn(async () => [
      {
        id: R4A_PRODUCTION_TARGET.branchId,
        name: 'main',
        default: true,
        created_at: '',
      },
      { ...PREVIEW_BRANCH, created_at: '' },
    ]),
    endpointHosts: vi.fn(async (_config, branchId: string) =>
      branchId === R4A_PRODUCTION_TARGET.branchId
        ? [PROD_HOST]
        : branchId === PREVIEW_BRANCH.id
          ? [PREVIEW_HOST]
          : [],
    ),
    databaseNames: vi.fn(async () => ['neondb']),
    runCheck,
    runApply,
    log: vi.fn(),
  };
  return { value, runCheck, runApply };
}

const prodFiles = {
  '.env.production.local': `DATABASE_URL_UNPOOLED=${PROD_URL}\n`,
  '.env.neon': NEON_FILE,
};
const previewFiles = {
  '.env.preview.local': `DATABASE_URL_UNPOOLED="${PREVIEW_URL}"\n`,
  '.env.neon': NEON_FILE,
};
const PREVIEW_ARGS = ['preview', '--git-branch=feat/x'];

async function expectRefusal(
  d: ReturnType<typeof deps>,
  args: readonly string[],
  message: string,
) {
  const error: unknown = await runR4aOperatorCheck(args, d.value).catch(
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(message);
  expect((error as Error).message).not.toContain(SECRET);
  // Zero database connections on every refusal.
  expect(d.runCheck).not.toHaveBeenCalled();
  expect(d.runApply).not.toHaveBeenCalled();
}
const APPLY_ARGS = [
  'preview-apply',
  '--git-branch=feat/x',
  '--preview-approved',
];

describe('db-r4a-operator-check', () => {
  it('runs --check for the verified Production target only', async () => {
    const d = deps(prodFiles);
    await runR4aOperatorCheck(['production'], d.value);
    expect(d.runCheck).toHaveBeenCalledExactlyOnceWith(PROD_URL);
    expect(d.value.listBranches).not.toHaveBeenCalled();
  });

  it('runs --check for the verified, explicitly selected Preview branch', async () => {
    const d = deps(previewFiles);
    await runR4aOperatorCheck(
      ['preview', '--', '--git-branch=feat/x'],
      d.value,
    );
    expect(d.runCheck).toHaveBeenCalledExactlyOnceWith(PREVIEW_URL);
    expect(d.value.endpointHosts).toHaveBeenCalledWith(
      expect.anything(),
      PREVIEW_BRANCH.id,
    );
  });

  it('accepts the separated --git-branch form', () => {
    expect(parseR4aOperatorArgs(['preview', '--git-branch', 'feat/x'])).toEqual(
      { profile: 'preview', mode: 'check', gitBranch: 'feat/x' },
    );
  });

  it.each([
    [['production', '--apply']],
    [['production', '--apply', '--production-approved']],
    [['--apply', '--production-approved']],
    [['production', '--recover-invalid']],
    [['preview', '--git-branch=feat/x', '--apply']],
    [['preview']],
    [['preview', '--git-branch=']],
    [['preview', '--git-branch=feat x']],
    [['prod']],
    [['--', 'production']],
    [['--', 'preview', '--git-branch=feat/x']],
    [['production', '--', '--']],
    [['preview', '--', '--', '--git-branch=feat/x']],
    [['preview', '--git-branch=feat/x', '--']],
    [['preview', '--git-branch', '--', 'feat/x']],
    [['preview', '--git-branch', '--']],
    [['preview', '--git-branch=-x']],
    [['preview', '--git-branch=feat/x', '--preview-approved']],
    [['preview-apply', '--git-branch=feat/x']],
    [['preview-apply', '--preview-approved']],
    [['preview-apply', '--preview-approved', '--git-branch=feat/x']],
    [['preview-apply', '--git-branch=feat/x', '--preview-approved', '--apply']],
    [['preview-apply', '--git-branch=feat/x', '--production-approved']],
    [['production-apply', '--preview-approved']],
    [['production', '--preview-approved']],
    [[]],
  ])('refuses unsupported arguments %j', async (args) => {
    await expectRefusal(deps(prodFiles), args, 'usage:');
  });

  it('refuses a shell DATABASE_URL_UNPOOLED, even an identical one', async () => {
    await expectRefusal(
      deps(prodFiles, { DATABASE_URL_UNPOOLED: PROD_URL }),
      ['production'],
      'set in the shell',
    );
  });

  it('refuses a Production URL in the Preview profile', async () => {
    await expectRefusal(
      deps({
        ...previewFiles,
        '.env.preview.local': prodFiles['.env.production.local'],
      }),
      PREVIEW_ARGS,
      'not a direct endpoint',
    );
  });

  it('refuses a Preview URL in the Production profile', async () => {
    await expectRefusal(
      deps({
        ...prodFiles,
        '.env.production.local': `DATABASE_URL_UNPOOLED=${PREVIEW_URL}`,
      }),
      ['production'],
      'not a direct endpoint',
    );
  });

  it('refuses a pooled URL', async () => {
    await expectRefusal(
      deps({
        ...prodFiles,
        '.env.production.local': `DATABASE_URL_UNPOOLED=${url('ep-prod-fixture-pooler.eu-central-1.aws.neon.tech', 'neondb')}`,
      }),
      ['production'],
      'pooled endpoint',
    );
  });

  it.each([
    [{ '.env.neon': NEON_FILE }, 'not found'],
    [
      { ...prodFiles, '.env.production.local': 'DATABASE_URL=x\n' },
      'must define DATABASE_URL_UNPOOLED',
    ],
    [
      { '.env.production.local': prodFiles['.env.production.local'] },
      '.env.neon not found',
    ],
    [
      { ...prodFiles, '.env.neon': 'NEON_API_KEY=k\n' },
      'must define NEON_API_KEY and NEON_PROJECT_ID',
    ],
  ])('refuses a missing file or key (%#)', async (files, message) => {
    await expectRefusal(deps(files), ['production'], message);
  });

  it.each(['', '?sslmode=disable', '?sslmode=prefer'])(
    'refuses a URL without enforced SSL (%j)',
    async (query) => {
      await expectRefusal(
        deps({
          ...prodFiles,
          '.env.production.local': `DATABASE_URL_UNPOOLED=${url(PROD_HOST, 'neondb', query)}`,
        }),
        ['production'],
        'sslmode',
      );
    },
  );

  it('refuses an unknown Preview branch', async () => {
    await expectRefusal(
      deps(previewFiles),
      ['preview', '--git-branch=feat/unknown'],
      'was not found',
    );
  });

  it('refuses a Preview selection that resolves to the Production branch', async () => {
    const d = deps(previewFiles);
    vi.mocked(d.value.listBranches).mockResolvedValue([
      {
        id: R4A_PRODUCTION_TARGET.branchId,
        name: 'preview/feat/x',
        created_at: '',
      },
    ]);
    await expectRefusal(d, PREVIEW_ARGS, 'not a Preview branch');
  });

  it.each([
    ['production', prodFiles, ['production'], url(PROD_HOST, 'otherdb')],
    ['preview', previewFiles, PREVIEW_ARGS, url(PREVIEW_HOST, 'otherdb')],
  ] as const)(
    'refuses a wrong database name (%s)',
    async (profile, files, args, target) => {
      await expectRefusal(
        deps({
          ...files,
          [`.env.${profile}.local`]: `DATABASE_URL_UNPOOLED=${target}`,
        }),
        args,
        'not the expected database',
      );
    },
  );

  it('refuses Production when the Neon API does not list neondb on the branch', async () => {
    const d = deps(prodFiles);
    vi.mocked(d.value.databaseNames).mockResolvedValue(['otherdb']);
    await expectRefusal(d, ['production'], 'not the expected database');
  });

  it('refuses a Production URL naming another database that exists on the branch', async () => {
    const d = deps({
      ...prodFiles,
      '.env.production.local': `DATABASE_URL_UNPOOLED=${url(PROD_HOST, 'otherdb')}`,
    });
    vi.mocked(d.value.databaseNames).mockResolvedValue(['neondb', 'otherdb']);
    await expectRefusal(d, ['production'], 'not the expected database');
  });

  it('refuses Production when .env.neon points at another Neon project', async () => {
    await expectRefusal(
      deps({
        ...prodFiles,
        '.env.neon': 'NEON_API_KEY=k\nNEON_PROJECT_ID=other-project\n',
      }),
      ['production'],
      'not the Production project',
    );
  });

  it('accepts a single separator right after the profile', () => {
    expect(parseR4aOperatorArgs(['production', '--'])).toEqual({
      profile: 'production',
      mode: 'check',
    });
    expect(
      parseR4aOperatorArgs([
        'preview-apply',
        '--',
        '--git-branch',
        'feat/x',
        '--preview-approved',
      ]),
    ).toEqual({ profile: 'preview', mode: 'apply', gitBranch: 'feat/x' });
  });

  it('scrubs the Neon API key from a provider error and does not connect', async () => {
    const d = deps(prodFiles);
    vi.mocked(d.value.endpointHosts).mockRejectedValue(
      new Error(`Neon API returned 500: echoed ${SECRET}-api`),
    );
    await expectRefusal(d, ['production'], 'Neon identity lookup failed');
  });

  it('applies schema A only to the verified, explicitly approved Preview branch', async () => {
    const d = deps(previewFiles);
    await runR4aOperatorCheck(APPLY_ARGS, d.value);
    expect(d.runApply).toHaveBeenCalledExactlyOnceWith(PREVIEW_URL);
    expect(d.runCheck).not.toHaveBeenCalled();
  });

  it('a plain Preview check never applies', async () => {
    const d = deps(previewFiles);
    await runR4aOperatorCheck(PREVIEW_ARGS, d.value);
    expect(d.runApply).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a Production URL in the Preview file',
      {
        ...previewFiles,
        '.env.preview.local': `DATABASE_URL_UNPOOLED=${PROD_URL}`,
      },
      'not a direct endpoint',
    ],
    ['an unknown Preview branch', previewFiles, 'was not found'],
  ])('refuses Preview apply for %s', async (_case, files, message) => {
    const args =
      message === 'was not found'
        ? ['preview-apply', '--git-branch=feat/unknown', '--preview-approved']
        : APPLY_ARGS;
    await expectRefusal(deps(files), args, message);
  });

  it('refuses Preview apply when the selection resolves to the Production branch', async () => {
    const d = deps(previewFiles);
    vi.mocked(d.value.listBranches).mockResolvedValue([
      {
        id: R4A_PRODUCTION_TARGET.branchId,
        name: 'preview/feat/x',
        created_at: '',
      },
    ]);
    await expectRefusal(d, APPLY_ARGS, 'not a Preview branch');
  });

  it('refuses Preview apply with a shell DATABASE_URL_UNPOOLED', async () => {
    await expectRefusal(
      deps(previewFiles, { DATABASE_URL_UNPOOLED: PREVIEW_URL }),
      APPLY_ARGS,
      'set in the shell',
    );
  });

  it('does not connect when the Neon API lookup fails', async () => {
    const d = deps(prodFiles);
    vi.mocked(d.value.endpointHosts).mockRejectedValue(
      new Error('Neon API returned 401'),
    );
    await expect(runR4aOperatorCheck(['production'], d.value)).rejects.toThrow(
      '401',
    );
    expect(d.runCheck).not.toHaveBeenCalled();
  });
});

describe('default executor wiring (OZI-219)', () => {
  it('Preview apply runs the typed standard apply and never forges the Production approval token', async () => {
    await defaultR4aOperatorDeps().runApply(PREVIEW_URL);

    expect(compactIndexes.runR4aCompactIndexCommand).toHaveBeenCalledWith(
      { mode: 'apply' },
      PREVIEW_URL,
    );
    expect(compactIndexes.runR4aCompactIndexesCli).not.toHaveBeenCalled();
    expect(
      JSON.stringify(compactIndexes.runR4aCompactIndexCommand.mock.calls),
    ).not.toContain('production-approved');
  });

  it('check stays the read-only --check argv', async () => {
    await defaultR4aOperatorDeps().runCheck(PREVIEW_URL);

    expect(compactIndexes.runR4aCompactIndexesCli).toHaveBeenCalledWith(
      ['--check'],
      PREVIEW_URL,
    );
  });
});
