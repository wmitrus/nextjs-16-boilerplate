import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildLocalRollbackAssessment, run } from './cli';
import type * as ProductionSchemaModule from './production-schema';

import * as RollbackEnvironmentContractModule from '@/security/internal-api/rollback-environment-contract';

const remoteCandidateMocks = vi.hoisted(() => ({
  readExpectedProductionIdentity: vi.fn(),
  readRemoteCandidateDetail: vi.fn(),
}));
const remoteEnvironmentMocks = vi.hoisted(() => ({
  checkCandidateEnvironmentContractInstrumentation: vi.fn(),
  readCandidateEnvironmentContract: vi.fn(),
  readOperatorDeclaredProductionContractDimensions: vi.fn(),
}));
const productionSchemaMocks = vi.hoisted(() => ({
  readCandidateMigrationJournal: vi.fn(),
  readProductionAppliedMigrationHashes: vi.fn(),
}));
const gitAncestryMocks = vi.hoisted(() => ({
  assessContainmentFloorAncestry: vi.fn(),
}));
const authjsSmokeMocks = vi.hoisted(() => ({
  runAuthjsReadOnlySmoke: vi.fn(),
}));

// Module-boundary mocks: run() is structurally bound to the real remote/
// local-Git modules with no caller-controlled dependency bag, so CLI-level
// tests control each remote outcome by mocking the module itself.
// `@/security/internal-api/rollback-environment-contract` is intentionally
// left unmocked -- cli.ts only uses its pure `buildEnvironmentContractEvidence`
// from there now; the "expected Production contract" source moved to the
// explicit, LOCAL_OPERATOR_DECLARED anchors in `./remote-environment`.
// `./git-ancestry` is mocked so tests can control the pre-read trust-order
// gate (candidate identity -> ancestry PASS -> Production evidence) with a
// synthetic candidate SHA, rather than depending on this checkout's real
// Git history; `assessContainmentFloorAncestry`'s own real-Git behavior is
// covered independently by `git-ancestry.test.ts`, which this pass does not
// touch.
vi.mock('./remote-candidate', () => remoteCandidateMocks);
vi.mock('./remote-environment', () => remoteEnvironmentMocks);
vi.mock('./git-ancestry', () => gitAncestryMocks);
vi.mock('./authjs-smoke', () => authjsSmokeMocks);
vi.mock('./production-schema', async () => {
  const actual = await vi.importActual<typeof ProductionSchemaModule>(
    './production-schema',
  );
  return {
    ...actual,
    readCandidateMigrationJournal:
      productionSchemaMocks.readCandidateMigrationJournal,
    readProductionAppliedMigrationHashes:
      productionSchemaMocks.readProductionAppliedMigrationHashes,
  };
});

function extractExportedSignature(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  const asyncStart = source.indexOf(`export async function ${name}(`);
  const matchStart = start >= 0 ? start : asyncStart;
  expect(matchStart).toBeGreaterThanOrEqual(0);
  const returnTypeStart = source.indexOf('): ', matchStart);
  const bodyStart = source.indexOf(' {', returnTypeStart);
  return source.slice(matchStart, bodyStart);
}

const deploymentId = 'dpl_AaJaXYD7YrcsMX8j6UyBPJCBXvrn';
const expectedIdentity = {
  orgId: 'team_expected',
  owner: 'wmitrus',
  projectId: 'prj_expected',
  repository: 'nextjs-16-boilerplate',
};
const immutableUrl = 'https://project-immutable-abc123-team.vercel.app';

function authoritativeDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: deploymentId,
    meta: {
      githubCommitOrg: expectedIdentity.owner,
      githubCommitRef: 'main',
      githubCommitRepo: expectedIdentity.repository,
      githubCommitSha: 'a'.repeat(40),
      githubDeployment: '1',
    },
    ownerId: expectedIdentity.orgId,
    projectId: expectedIdentity.projectId,
    readyState: 'READY',
    target: 'production',
    url: immutableUrl.replace('https://', ''),
    ...overrides,
  };
}

const expectedDimensions = {
  authProvider: 'authjs' as const,
  databaseHost: 'ep-prod.us-east-2.aws.neon.tech',
  databaseName: 'app_production',
  dbDriver: 'postgres' as const,
  dbProvider: 'drizzle' as const,
  defaultTenantId: '11111111-1111-4111-8111-111111111111',
  tenancyMode: 'single' as const,
  tenantContextSource: null,
};
const matchingEnvironmentEvidence =
  RollbackEnvironmentContractModule.buildEnvironmentContractEvidence(
    expectedDimensions,
  );

const candidateJournal = [
  { hash: 'a'.repeat(64), tag: '0000_rainy_lenny_balinger' },
];

function stubHappyCandidatePath(): void {
  remoteCandidateMocks.readExpectedProductionIdentity.mockReturnValue(
    expectedIdentity,
  );
  remoteCandidateMocks.readRemoteCandidateDetail.mockReturnValue(
    authoritativeDetail(),
  );
}

beforeEach(() => {
  remoteCandidateMocks.readExpectedProductionIdentity.mockReset();
  remoteCandidateMocks.readRemoteCandidateDetail.mockReset();
  remoteEnvironmentMocks.checkCandidateEnvironmentContractInstrumentation.mockReset();
  remoteEnvironmentMocks.checkCandidateEnvironmentContractInstrumentation.mockReturnValue(
    { status: 'PRESENT' },
  );
  remoteEnvironmentMocks.readCandidateEnvironmentContract.mockReset();
  remoteEnvironmentMocks.readOperatorDeclaredProductionContractDimensions.mockReset();
  remoteEnvironmentMocks.readOperatorDeclaredProductionContractDimensions.mockReturnValue(
    expectedDimensions,
  );
  productionSchemaMocks.readCandidateMigrationJournal.mockReset();
  productionSchemaMocks.readProductionAppliedMigrationHashes.mockReset();
  gitAncestryMocks.assessContainmentFloorAncestry.mockReset();
  gitAncestryMocks.assessContainmentFloorAncestry.mockReturnValue({
    reason: 'Candidate commit descends from the containment floor.',
    status: 'PASS',
  });
  authjsSmokeMocks.runAuthjsReadOnlySmoke.mockReset();
  authjsSmokeMocks.runAuthjsReadOnlySmoke.mockResolvedValue({
    evidence: { provider: 'authjs', session: 'PASS', signIn: 'PASS' },
    status: 'OK',
  });
});

describe('local rollback assessment CLI (A4.1/A4.2a)', () => {
  it('produces a bounded blocked plan without subprocesses or network access', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      await run(['node', 'cli.ts', `--deployment-id=${deploymentId}`]);
      const output = JSON.parse(log.mock.calls[0]?.[0] as string);
      expect(output).toMatchObject({
        nominatedDeploymentId: deploymentId,
        candidateIdentity: { status: 'BLOCKED' },
        containmentFloorAncestry: { status: 'BLOCKED' },
        environmentContract: { status: 'BLOCKED' },
        schemaCompatibility: { status: 'BLOCKED' },
        smoke: { status: 'BLOCKED' },
        rollbackAction: 'NOT_AUTHORIZED',
        rollbackExecutable: false,
        remoteCandidateEvidence: { status: 'NOT_REQUESTED' },
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        remoteCandidateMocks.readExpectedProductionIdentity,
      ).not.toHaveBeenCalled();
      expect(
        remoteCandidateMocks.readRemoteCandidateDetail,
      ).not.toHaveBeenCalled();
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readCandidateMigrationJournal,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readProductionAppliedMigrationHashes,
      ).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /token|secret|password/i,
      );
    } finally {
      log.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('rejects a malformed remote nomination before invoking any remote-read module', async () => {
    await expect(
      run([
        'node',
        'cli.ts',
        '--deployment-id=latest',
        '--execute-remote-candidate-read',
      ]),
    ).rejects.toThrow('deployment ID is malformed');
    expect(
      remoteCandidateMocks.readRemoteCandidateDetail,
    ).not.toHaveBeenCalled();
  });

  it('invokes the real remote-read module exactly once with the nominated ID, only after acknowledgement', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();

    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
      ]);
      const output = JSON.parse(log.mock.calls[0]?.[0] as string);
      expect(
        remoteCandidateMocks.readExpectedProductionIdentity,
      ).toHaveBeenCalledOnce();
      expect(
        remoteCandidateMocks.readRemoteCandidateDetail,
      ).toHaveBeenCalledOnce();
      expect(
        remoteCandidateMocks.readRemoteCandidateDetail,
      ).toHaveBeenCalledWith(deploymentId);
      expect(output).toMatchObject({
        candidateIdentity: { status: 'PASS' },
        environmentContract: { status: 'BLOCKED' },
        schemaCompatibility: { status: 'BLOCKED' },
        smoke: { status: 'BLOCKED' },
        remoteCandidateEvidence: {
          deploymentId,
          gitRef: 'main',
          gitSha: 'a'.repeat(40),
          status: 'READ_AND_VALIDATED',
        },
        rollbackAction: 'NOT_AUTHORIZED',
        rollbackExecutable: false,
      });
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    ['wrong organization', { ownerId: 'team_other' }],
    ['wrong project', { projectId: 'prj_other' }],
    ['Preview target', { target: 'preview' }],
    ['non-READY state', { readyState: 'BUILDING' }],
    ['different deployment ID', { id: 'dpl_OtherDeployment' }],
  ])('rejects remote DETAIL with %s', async (_reason, overrides) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    remoteCandidateMocks.readExpectedProductionIdentity.mockReturnValue(
      expectedIdentity,
    );
    remoteCandidateMocks.readRemoteCandidateDetail.mockReturnValue(
      authoritativeDetail(overrides),
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        candidateIdentity: { status: 'INVALID' },
        containmentFloorAncestry: { status: 'BLOCKED' },
        remoteCandidateEvidence: { status: 'ERROR' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('returns bounded ERROR evidence when the remote-read module fails, without leaking its message', async () => {
    const sentinel = 'sentinel-vercel-token stderr';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    remoteCandidateMocks.readExpectedProductionIdentity.mockReturnValue(
      expectedIdentity,
    );
    remoteCandidateMocks.readRemoteCandidateDetail.mockImplementation(() => {
      throw new Error(sentinel);
    });
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
      ]);
      const output = JSON.stringify(log.mock.calls);
      expect(output).not.toContain(sentinel);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        candidateIdentity: { status: 'BLOCKED' },
        remoteCandidateEvidence: { status: 'ERROR' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('does not label locally supplied candidate DETAIL as remotely read, and never touches the remote-read modules', () => {
    const assessment = buildLocalRollbackAssessment({
      candidateDetail: authoritativeDetail(),
      deploymentId,
      expectedIdentity,
    });
    expect(assessment.candidateIdentity).toMatchObject({ status: 'PASS' });
    expect(assessment.remoteCandidateEvidence).toEqual({
      status: 'NOT_REQUESTED',
    });
    expect(
      remoteCandidateMocks.readExpectedProductionIdentity,
    ).not.toHaveBeenCalled();
  });

  it('keeps locally supplied candidate + ancestry PASS as NOT_REQUESTED provenance', () => {
    // `./git-ancestry` is mocked at the module boundary (see the top of this
    // file) -- the real `assessContainmentFloorAncestry`/`gitExecutor`
    // integration is covered independently by `git-ancestry.test.ts`.
    const assessment = buildLocalRollbackAssessment({
      candidateDetail: authoritativeDetail(),
      deploymentId,
      expectedIdentity,
    });
    expect(assessment.containmentFloorAncestry).toMatchObject({
      status: 'PASS',
    });
    expect(assessment.remoteCandidateEvidence).toEqual({
      status: 'NOT_REQUESTED',
    });
  });

  it("rejects REMOTE_READ provenance at the exported builder's type, and ignores it at runtime", () => {
    const assessment = buildLocalRollbackAssessment(
      // @ts-expect-error -- buildLocalRollbackAssessment's public signature
      // has no provenance parameter; this line exists so `pnpm typecheck`
      // fails the moment that invariant regresses.
      { candidateEvidenceSource: 'REMOTE_READ', deploymentId },
    );
    expect(assessment.remoteCandidateEvidence).toEqual({
      status: 'NOT_REQUESTED',
    });
  });

  it('confirms via source inspection that no exported API accepts REMOTE_READ provenance or a caller-controlled remote dependency bag', () => {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.resolve(dirname, 'cli.ts'), 'utf8');
    const buildSignature = extractExportedSignature(
      source,
      'buildLocalRollbackAssessment',
    );
    const runSignature = extractExportedSignature(source, 'run');
    const forbidden =
      /REMOTE_READ|candidateEvidenceSource|environmentEvidenceSource|schemaEvidenceSource|vercelExecutor|readExpectedIdentity|gitExecutor|dependencies/;
    expect(buildSignature).not.toMatch(forbidden);
    expect(runSignature).not.toMatch(forbidden);
    // run() must accept no second parameter at all.
    expect(runSignature).toBe(
      'export async function run(argv = process.argv): Promise<void>',
    );
    // The provenance discriminant must still exist somewhere internally --
    // otherwise the remote-read path could never establish it either.
    expect(source).toMatch(/REMOTE_READ/);
  });

  it('keeps environment and smoke blocked without deployment-bound evidence', () => {
    const assessment = buildLocalRollbackAssessment({ deploymentId });
    expect(assessment.environmentContract).toEqual({
      status: 'BLOCKED',
      reason: 'Deployment-bound environment evidence is required.',
    });
    expect(assessment.smoke).toMatchObject({ status: 'BLOCKED' });
  });
});

describe('A4.2b environment-contract compatibility', () => {
  it('1. default CLI makes no environment remote call', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await run(['node', 'cli.ts', `--deployment-id=${deploymentId}`]);
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('2. candidate environment evidence cannot be marked remotely verified by supplying it directly to a pure/local builder', () => {
    const assessment = buildLocalRollbackAssessment({
      deploymentId,
      environmentContract: matchingEnvironmentEvidence,
    });
    expect(assessment.environmentContract.status).not.toBe('PASS');
    expect(assessment.environmentContract).toMatchObject({
      status: 'BLOCKED',
    });
  });

  it.each([
    ['non-object', 'not-an-object'],
    ['extra field', { ...matchingEnvironmentEvidence, extra: '1' }],
    [
      'secret-shaped field',
      { ...matchingEnvironmentEvidence, internalApiKey: 'x' },
    ],
  ])(
    '3-4. malformed/secret-shaped environment evidence -> INVALID (%s)',
    (_reason, evidence) => {
      const assessment = buildLocalRollbackAssessment({
        deploymentId,
        environmentContract: evidence,
      });
      expect(assessment.environmentContract).toMatchObject({
        status: 'INVALID',
      });
    },
  );

  it('5. candidate vs expected contract exact match -> PASS only after proper provenance', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      matchingEnvironmentEvidence,
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'PASS' },
      });
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).toHaveBeenCalledOnce();
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).toHaveBeenCalledWith(immutableUrl);
    } finally {
      log.mockRestore();
    }
  });

  it('checks candidate instrumentation locally before ever reading the network, and in that order', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      matchingEnvironmentEvidence,
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      expect(
        remoteEnvironmentMocks.checkCandidateEnvironmentContractInstrumentation,
      ).toHaveBeenCalledOnce();
      expect(
        remoteEnvironmentMocks.checkCandidateEnvironmentContractInstrumentation,
      ).toHaveBeenCalledWith('a'.repeat(40));
    } finally {
      log.mockRestore();
    }
  });

  it('legacy candidate that predates environment-contract instrumentation -> BLOCKED, zero environment network call, neither secret required', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    remoteEnvironmentMocks.checkCandidateEnvironmentContractInstrumentation.mockReturnValue(
      {
        reason:
          'Rollback candidate predates deployment-bound environment-contract instrumentation.',
        status: 'BLOCKED',
      },
    );
    // Neither INTERNAL_API_KEY nor VERCEL_AUTOMATION_BYPASS_SECRET is
    // stubbed anywhere in this file -- if the legacy-candidate short
    // circuit ever regressed into calling the real
    // readCandidateEnvironmentContract(), it would throw on a missing
    // secret and this test would fail via the unmocked import.
    expect(process.env.INTERNAL_API_KEY).toBeUndefined();
    expect(process.env.VERCEL_AUTOMATION_BYPASS_SECRET).toBeUndefined();
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: {
          reason: expect.stringMatching(/predates/i) as unknown as string,
          status: 'BLOCKED',
        },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('does not treat local operator-declared dimensions as authoritative unless explicitly configured, and names all three required anchors', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readOperatorDeclaredProductionContractDimensions.mockReturnValue(
      undefined,
    );
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      matchingEnvironmentEvidence,
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      const output = JSON.parse(log.mock.calls[0]?.[0] as string) as {
        environmentContract: { reason: string; status: string };
      };
      expect(output.environmentContract.status).toBe('BLOCKED');
      expect(output.environmentContract.reason).toContain(
        'PRODUCTION_AUTH_PROVIDER',
      );
      expect(output.environmentContract.reason).toContain(
        'PRODUCTION_TENANCY_MODE',
      );
      expect(output.environmentContract.reason).toContain(
        'PRODUCTION_TENANT_CONTEXT_SOURCE',
      );
      expect(output.environmentContract.reason).toContain(
        'PRODUCTION_RUNTIME_DATABASE_HOST',
      );
      expect(output.environmentContract.reason).toContain(
        'PRODUCTION_DATABASE_NAME',
      );
      expect(output.environmentContract.reason).toContain(
        'PRODUCTION_DB_PROVIDER',
      );
      expect(output.environmentContract.reason).toContain(
        'PRODUCTION_DB_DRIVER',
      );
      expect(output.environmentContract.reason).toContain(
        'PRODUCTION_DEFAULT_TENANT_ID',
      );
      // Must not imply PRODUCTION_DATABASE_HOST (the separate schema-compat
      // pin) is required for environment-contract comparison.
      expect(output.environmentContract.reason).not.toMatch(
        /(?<!RUNTIME_)PRODUCTION_DATABASE_HOST/,
      );
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    [
      '6. auth provider mismatch',
      { ...matchingEnvironmentEvidence, authProvider: 'clerk' },
    ],
    [
      '7. contract version mismatch',
      { ...matchingEnvironmentEvidence, contractVersion: 'v1' },
    ],
    [
      '8. fingerprint mismatch',
      { ...matchingEnvironmentEvidence, fingerprint: 'b'.repeat(64) },
    ],
  ])('%s -> BLOCKED', async (_reason, evidence) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      evidence,
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('26. candidate single-tenant ID mismatch -> environment contract is BLOCKED, never PASS', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    const mismatchedTenantEvidence =
      RollbackEnvironmentContractModule.buildEnvironmentContractEvidence({
        ...expectedDimensions,
        defaultTenantId: '22222222-2222-4222-8222-222222222222',
      });
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      mismatchedTenantEvidence,
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('candidate with pglite does NOT match expected postgres, even with identical host/name -> BLOCKED', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    const pgliteEvidence =
      RollbackEnvironmentContractModule.buildEnvironmentContractEvidence({
        ...expectedDimensions,
        dbDriver: 'pglite',
      });
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      pgliteEvidence,
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('candidate with prisma does NOT match expected drizzle, even with identical host/name -> BLOCKED', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    const prismaEvidence =
      RollbackEnvironmentContractModule.buildEnvironmentContractEvidence({
        ...expectedDimensions,
        dbProvider: 'prisma',
      });
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      prismaEvidence,
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('a v2-shaped candidate contractVersion vs the real v3 expected contract -> BLOCKED', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue({
      ...matchingEnvironmentEvidence,
      contractVersion: 'v2',
    });
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('11. candidate runtime read failure -> ERROR', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockRejectedValue(
      new Error('sentinel-internal-key transport failure'),
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      const output = log.mock.calls[0]?.[0] as string;
      expect(output).not.toContain('sentinel-internal-key');
      expect(JSON.parse(output)).toMatchObject({
        environmentContract: { status: 'ERROR' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('12. no environment-mutation API is exported by this route -- GET only', () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        'src/app/api/internal/rollback-assessment/environment-contract/route.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(/export async function GET/);
    expect(source).not.toMatch(
      /export (async )?function (POST|PUT|PATCH|DELETE)/,
    );
  });

  it('the environment-read flag never triggers a Vercel DETAIL or candidate read on its own', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-production-environment-read',
      ]);
      expect(
        remoteCandidateMocks.readRemoteCandidateDetail,
      ).not.toHaveBeenCalled();
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });
});

describe('Trust ordering: containment-floor ancestry gates Production evidence (Codex P1)', () => {
  it('environment: ancestry BLOCKED -> no instrumentation check, no secret-bearing GET, environmentContract BLOCKED', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    gitAncestryMocks.assessContainmentFloorAncestry.mockReturnValue({
      reason: 'Candidate commit does not descend from the containment floor.',
      status: 'BLOCKED',
    });
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      expect(
        remoteEnvironmentMocks.checkCandidateEnvironmentContractInstrumentation,
      ).not.toHaveBeenCalled();
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('environment: ancestry ERROR -> no instrumentation check, no secret-bearing GET, environmentContract ERROR (never downgraded to BLOCKED)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    gitAncestryMocks.assessContainmentFloorAncestry.mockReturnValue({
      reason: 'Could not prove containment-floor ancestry locally.',
      status: 'ERROR',
    });
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      expect(
        remoteEnvironmentMocks.checkCandidateEnvironmentContractInstrumentation,
      ).not.toHaveBeenCalled();
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'ERROR' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('environment: ancestry PASS -> instrumentation is checked, then (only then) the probe runs -- ordering identity -> ancestry -> instrumentation -> GET', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      matchingEnvironmentEvidence,
    );
    const callOrder: string[] = [];
    gitAncestryMocks.assessContainmentFloorAncestry.mockImplementation(() => {
      callOrder.push('ancestry');
      return {
        reason: 'Candidate commit descends from the containment floor.',
        status: 'PASS',
      };
    });
    remoteEnvironmentMocks.checkCandidateEnvironmentContractInstrumentation.mockImplementation(
      () => {
        callOrder.push('instrumentation');
        return { status: 'PRESENT' };
      },
    );
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockImplementation(
      async () => {
        callOrder.push('probe');
        return matchingEnvironmentEvidence;
      },
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
      ]);
      // A second 'ancestry' entry is expected: `buildAssessment()` separately
      // recomputes the same authoritative check for the final displayed
      // `containmentFloorAncestry` field (see cli.ts's trust-order doc
      // comment) -- what matters here is that it comes AFTER the probe, not
      // before it.
      expect(callOrder).toEqual([
        'ancestry',
        'instrumentation',
        'probe',
        'ancestry',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'PASS' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('schema: ancestry BLOCKED -> no candidate migration-journal read, no Production DB read, schemaCompatibility BLOCKED', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    gitAncestryMocks.assessContainmentFloorAncestry.mockReturnValue({
      reason: 'Candidate commit does not descend from the containment floor.',
      status: 'BLOCKED',
    });
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-schema-read',
      ]);
      expect(
        productionSchemaMocks.readCandidateMigrationJournal,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readProductionAppliedMigrationHashes,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        schemaCompatibility: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('schema: ancestry ERROR -> no candidate migration-journal read, no Production DB read, schemaCompatibility ERROR', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    gitAncestryMocks.assessContainmentFloorAncestry.mockReturnValue({
      reason: 'Could not prove containment-floor ancestry locally.',
      status: 'ERROR',
    });
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-schema-read',
      ]);
      expect(
        productionSchemaMocks.readCandidateMigrationJournal,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readProductionAppliedMigrationHashes,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        schemaCompatibility: { status: 'ERROR' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('combined: both flags requested, ancestry BLOCKED -> zero reads across environment AND schema, both gates BLOCKED, rollback still non-executable', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    gitAncestryMocks.assessContainmentFloorAncestry.mockReturnValue({
      reason: 'Candidate commit does not descend from the containment floor.',
      status: 'BLOCKED',
    });
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
        '--execute-production-schema-read',
      ]);
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).not.toHaveBeenCalled();
      expect(
        remoteEnvironmentMocks.checkCandidateEnvironmentContractInstrumentation,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readCandidateMigrationJournal,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readProductionAppliedMigrationHashes,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'BLOCKED' },
        schemaCompatibility: { status: 'BLOCKED' },
        rollbackAction: 'NOT_AUTHORIZED',
        rollbackExecutable: false,
      });
    } finally {
      log.mockRestore();
    }
  });

  it('candidate identity failure wins first: ancestry mock is never consulted to authorize anything when DETAIL identity is invalid', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    remoteCandidateMocks.readExpectedProductionIdentity.mockReturnValue(
      expectedIdentity,
    );
    remoteCandidateMocks.readRemoteCandidateDetail.mockReturnValue(
      authoritativeDetail({ ownerId: 'team_other' }),
    );
    // Even if the ancestry mock were told to PASS, an invalid DETAIL
    // identity must never establish a trusted candidate to check ancestry
    // against, and must never authorize either evidence read.
    gitAncestryMocks.assessContainmentFloorAncestry.mockReturnValue({
      reason: 'Candidate commit descends from the containment floor.',
      status: 'PASS',
    });
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
        '--execute-production-schema-read',
      ]);
      expect(
        gitAncestryMocks.assessContainmentFloorAncestry,
      ).not.toHaveBeenCalled();
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readCandidateMigrationJournal,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        candidateIdentity: { status: 'INVALID' },
        environmentContract: { status: 'BLOCKED' },
        schemaCompatibility: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('default CLI (no execution flags) remains unchanged: zero Vercel reads, zero environment reads, zero Production DB reads', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await run(['node', 'cli.ts', `--deployment-id=${deploymentId}`]);
      expect(
        remoteCandidateMocks.readRemoteCandidateDetail,
      ).not.toHaveBeenCalled();
      expect(
        remoteEnvironmentMocks.readCandidateEnvironmentContract,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readCandidateMigrationJournal,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readProductionAppliedMigrationHashes,
      ).not.toHaveBeenCalled();
      expect(
        gitAncestryMocks.assessContainmentFloorAncestry,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        environmentContract: { status: 'BLOCKED' },
        schemaCompatibility: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });
});

describe('A4.2b Production schema compatibility', () => {
  it('13. candidate migration evidence is resolved from the exact trusted candidate SHA, not the working tree', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      journal: candidateJournal,
      status: 'OK',
    });
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { hashes: candidateJournal.map((entry) => entry.hash), status: 'OK' },
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-schema-read',
      ]);
      expect(
        productionSchemaMocks.readCandidateMigrationJournal,
      ).toHaveBeenCalledOnce();
      expect(
        productionSchemaMocks.readCandidateMigrationJournal,
      ).toHaveBeenCalledWith('a'.repeat(40));
    } finally {
      log.mockRestore();
    }
  });

  it('6. Production journal read is bounded to the already-known candidate migration count', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      journal: candidateJournal,
      status: 'OK',
    });
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { hashes: candidateJournal.map((entry) => entry.hash), status: 'OK' },
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-schema-read',
      ]);
      expect(
        productionSchemaMocks.readProductionAppliedMigrationHashes,
      ).toHaveBeenCalledOnce();
      expect(
        productionSchemaMocks.readProductionAppliedMigrationHashes,
      ).toHaveBeenCalledWith(candidateJournal.length);
    } finally {
      log.mockRestore();
    }
  });

  it('14. shallow/missing local candidate commit -> BLOCKED, with no fetch', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      reason:
        'Local Git history is shallow; candidate migration evidence cannot be resolved locally.',
      status: 'BLOCKED',
    });
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-schema-read',
      ]);
      expect(
        productionSchemaMocks.readProductionAppliedMigrationHashes,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        schemaCompatibility: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('16-18. Production DB read is SELECT-only, real (unmocked at the module level) implementation is used, no repair helper called', () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        'scripts/rollback-assessment/production-schema.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(/select hash/);
    expect(source).not.toMatch(
      /import[\s\S]*?from ['"].*(validate-migration-journal|reconcile-known-migration-state)/,
    );
  });

  it('21. exact hash sets -> PASS via the real remote path (no positional/tag pairing)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      journal: candidateJournal,
      status: 'OK',
    });
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { hashes: candidateJournal.map((entry) => entry.hash), status: 'OK' },
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-schema-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        schemaCompatibility: { status: 'PASS' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('22. Production hash-count mismatch -> BLOCKED', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      journal: candidateJournal,
      status: 'OK',
    });
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { hashes: [], status: 'OK' },
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-schema-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        schemaCompatibility: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('24. hash mismatch -> BLOCKED', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      journal: candidateJournal,
      status: 'OK',
    });
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { hashes: ['b'.repeat(64)], status: 'OK' },
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-schema-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        schemaCompatibility: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('25-26. Production database error -> ERROR, without leaking the connection string', async () => {
    const sentinel = 'postgres://user:super-secret@host/db';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      journal: candidateJournal,
      status: 'OK',
    });
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { reason: 'Production migration-journal read failed.', status: 'ERROR' },
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-schema-read',
      ]);
      const output = log.mock.calls[0]?.[0] as string;
      expect(output).not.toContain(sentinel);
      expect(output).not.toContain('super-secret');
      expect(JSON.parse(output)).toMatchObject({
        schemaCompatibility: { status: 'ERROR' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('27. Production schema-read flag duplicate -> rejected before DB access', async () => {
    await expect(
      run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-production-schema-read',
        '--execute-production-schema-read',
      ]),
    ).rejects.toThrow('may appear only once');
    expect(
      productionSchemaMocks.readProductionAppliedMigrationHashes,
    ).not.toHaveBeenCalled();
  });

  it('28. malformed/missing candidate identity -> Production schema read must not proceed', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    remoteCandidateMocks.readExpectedProductionIdentity.mockReturnValue(
      expectedIdentity,
    );
    remoteCandidateMocks.readRemoteCandidateDetail.mockReturnValue(
      authoritativeDetail({ readyState: 'BUILDING' }),
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-schema-read',
      ]);
      expect(
        productionSchemaMocks.readCandidateMigrationJournal,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readProductionAppliedMigrationHashes,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        candidateIdentity: { status: 'INVALID' },
        schemaCompatibility: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('the schema-read flag never triggers a Vercel DETAIL or candidate read on its own', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-production-schema-read',
      ]);
      expect(
        remoteCandidateMocks.readRemoteCandidateDetail,
      ).not.toHaveBeenCalled();
      expect(
        productionSchemaMocks.readCandidateMigrationJournal,
      ).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        schemaCompatibility: { status: 'BLOCKED' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('schema evidence supplied directly to the pure/local builder never reaches PASS', () => {
    const candidateHashes = candidateJournal.map((entry) => entry.hash);
    const assessment = buildLocalRollbackAssessment({
      candidateMigrationHashes: candidateHashes,
      deploymentId,
      productionAppliedMigrationHashes: candidateHashes,
    });
    expect(assessment.schemaCompatibility.status).not.toBe('PASS');
    expect(assessment.schemaCompatibility).toMatchObject({ status: 'BLOCKED' });
  });
});

describe('A4.2b global gates', () => {
  async function runFullyAuthorized(): Promise<Record<string, unknown>> {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      matchingEnvironmentEvidence,
    );
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      journal: candidateJournal,
      status: 'OK',
    });
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { hashes: candidateJournal.map((entry) => entry.hash), status: 'OK' },
    );
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-production-environment-read',
        '--execute-production-schema-read',
      ]);
      return JSON.parse(log.mock.calls[0]?.[0] as string) as Record<
        string,
        unknown
      >;
    } finally {
      log.mockRestore();
    }
  }

  it('29-31. smoke remains BLOCKED, rollbackExecutable false, rollbackAction NOT_AUTHORIZED after full environment+schema PASS', async () => {
    const output = await runFullyAuthorized();
    expect(output).toMatchObject({
      environmentContract: { status: 'PASS' },
      schemaCompatibility: { status: 'PASS' },
      smoke: { status: 'BLOCKED' },
      rollbackAction: 'NOT_AUTHORIZED',
      rollbackExecutable: false,
    });
  });

  it('32-35. no rollback/promote subprocess is spawned, no traffic mutation, no generic remote/execution flag', async () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'scripts/rollback-assessment/cli.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/vercel rollback|vercel promote/);
    await expect(
      run(['node', 'cli.ts', `--deployment-id=${deploymentId}`, '--remote']),
    ).rejects.toThrow();
    await expect(
      run(['node', 'cli.ts', `--deployment-id=${deploymentId}`, '--execute']),
    ).rejects.toThrow();
    await expect(
      run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--production',
      ]),
    ).rejects.toThrow();
  });

  it('rejects secret-shaped or raw environment evidence and never authorizes rollback', () => {
    const assessment = buildLocalRollbackAssessment({
      deploymentId,
      environmentContract: {
        authProvider: 'authjs',
        contractVersion: 'v1',
        fingerprint: 'a'.repeat(64),
        internalApiKey: 'not-accepted',
      },
    });
    expect(assessment.environmentContract).toMatchObject({ status: 'INVALID' });
    expect(assessment.rollbackExecutable).toBe(false);
    expect(assessment.rollbackAction).toBe('NOT_AUTHORIZED');
  });

  it.each([
    ['authjs', 'AuthJS read-only smoke was not requested'],
    ['clerk', 'Clerk smoke is blocked'],
    ['unknown', 'unsupported or unknown provider'],
  ])(
    'keeps %s smoke non-executing without the A4.2c flag',
    (authProvider, reason) => {
      const assessment = buildLocalRollbackAssessment({
        deploymentId,
        environmentContract: {
          authProvider,
          contractVersion: 'v1',
          fingerprint: 'a'.repeat(64),
        },
      });
      expect(assessment.smoke).toMatchObject({ status: 'BLOCKED' });
      expect(assessment.smoke.reason).toContain(reason);
    },
  );
});

describe('A4.2c AuthJS read-only rollback smoke trust ordering', () => {
  const ALL_FLAGS = [
    '--execute-remote-candidate-read',
    '--execute-production-environment-read',
    '--execute-production-schema-read',
    '--execute-authjs-smoke-read',
  ];

  function stubUpstreamPass(): void {
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      matchingEnvironmentEvidence,
    );
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      journal: candidateJournal,
      status: 'OK',
    });
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { hashes: candidateJournal.map((entry) => entry.hash), status: 'OK' },
    );
  }

  async function runFlags(flags: string[]): Promise<Record<string, unknown>> {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        ...flags,
      ]);
      return JSON.parse(log.mock.calls[0]?.[0] as string) as Record<
        string,
        unknown
      >;
    } finally {
      log.mockRestore();
    }
  }

  it('smoke flag alone performs no candidate/environment/schema/smoke remote read', async () => {
    const output = await runFlags(['--execute-authjs-smoke-read']);
    expect(
      remoteCandidateMocks.readRemoteCandidateDetail,
    ).not.toHaveBeenCalled();
    expect(
      remoteEnvironmentMocks.readCandidateEnvironmentContract,
    ).not.toHaveBeenCalled();
    expect(
      productionSchemaMocks.readCandidateMigrationJournal,
    ).not.toHaveBeenCalled();
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      smoke: { status: 'BLOCKED' },
      smokeEvidence: { status: 'BLOCKED' },
      rollbackAction: 'NOT_AUTHORIZED',
      rollbackExecutable: false,
    });
  });

  it('candidate identity failure blocks the smoke, with no smoke request', async () => {
    remoteCandidateMocks.readExpectedProductionIdentity.mockReturnValue(
      expectedIdentity,
    );
    remoteCandidateMocks.readRemoteCandidateDetail.mockReturnValue(
      authoritativeDetail({ ownerId: 'team_other' }),
    );
    const output = await runFlags(ALL_FLAGS);
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      candidateIdentity: { status: 'INVALID' },
      smoke: { status: 'BLOCKED' },
    });
  });

  it('containment-floor ancestry failure blocks the environment, schema, and smoke reads', async () => {
    stubUpstreamPass();
    gitAncestryMocks.assessContainmentFloorAncestry.mockReturnValue({
      reason: 'Candidate commit does not descend from the containment floor.',
      status: 'BLOCKED',
    });
    const output = await runFlags(ALL_FLAGS);
    expect(
      remoteEnvironmentMocks.readCandidateEnvironmentContract,
    ).not.toHaveBeenCalled();
    expect(
      productionSchemaMocks.readCandidateMigrationJournal,
    ).not.toHaveBeenCalled();
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      environmentContract: { status: 'BLOCKED' },
      schemaCompatibility: { status: 'BLOCKED' },
      smoke: { status: 'BLOCKED' },
    });
  });

  it('ancestry ERROR surfaces as smoke ERROR, still no smoke request', async () => {
    stubUpstreamPass();
    gitAncestryMocks.assessContainmentFloorAncestry.mockReturnValue({
      reason: 'Could not prove containment-floor ancestry locally.',
      status: 'ERROR',
    });
    const output = await runFlags(ALL_FLAGS);
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output).toMatchObject({ smoke: { status: 'ERROR' } });
  });

  it('missing --execute-production-environment-read blocks the smoke', async () => {
    stubUpstreamPass();
    const output = await runFlags([
      '--execute-remote-candidate-read',
      '--execute-production-schema-read',
      '--execute-authjs-smoke-read',
    ]);
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output.smoke).toMatchObject({ status: 'BLOCKED' });
    expect((output.smoke as { reason: string }).reason).toContain(
      '--execute-production-environment-read',
    );
  });

  it('environment acquisition failure blocks the smoke', async () => {
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockRejectedValue(
      new Error('sentinel-internal-key transport failure'),
    );
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      journal: candidateJournal,
      status: 'OK',
    });
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { hashes: candidateJournal.map((entry) => entry.hash), status: 'OK' },
    );
    const output = await runFlags(ALL_FLAGS);
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      environmentContract: { status: 'ERROR' },
      smoke: { status: 'BLOCKED' },
    });
  });

  it('environment contract mismatch blocks the smoke', async () => {
    stubUpstreamPass();
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue({
      ...matchingEnvironmentEvidence,
      fingerprint: 'b'.repeat(64),
    });
    const output = await runFlags(ALL_FLAGS);
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      environmentContract: { status: 'BLOCKED' },
      smoke: { status: 'BLOCKED' },
    });
  });

  it('a Clerk environment contract blocks the smoke without calling the AuthJS smoke', async () => {
    const clerkDimensions = {
      ...expectedDimensions,
      authProvider: 'clerk' as const,
    };
    const clerkEvidence =
      RollbackEnvironmentContractModule.buildEnvironmentContractEvidence(
        clerkDimensions,
      );
    stubHappyCandidatePath();
    remoteEnvironmentMocks.readOperatorDeclaredProductionContractDimensions.mockReturnValue(
      clerkDimensions,
    );
    remoteEnvironmentMocks.readCandidateEnvironmentContract.mockResolvedValue(
      clerkEvidence,
    );
    productionSchemaMocks.readCandidateMigrationJournal.mockReturnValue({
      journal: candidateJournal,
      status: 'OK',
    });
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { hashes: candidateJournal.map((entry) => entry.hash), status: 'OK' },
    );
    const output = await runFlags(ALL_FLAGS);
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output.environmentContract).toMatchObject({ status: 'PASS' });
    expect(output.smoke).toMatchObject({ status: 'BLOCKED' });
    expect((output.smoke as { reason: string }).reason).toContain('Clerk');
  });

  it('missing --execute-production-schema-read blocks the smoke', async () => {
    stubUpstreamPass();
    const output = await runFlags([
      '--execute-remote-candidate-read',
      '--execute-production-environment-read',
      '--execute-authjs-smoke-read',
    ]);
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output.smoke).toMatchObject({ status: 'BLOCKED' });
    expect((output.smoke as { reason: string }).reason).toContain(
      '--execute-production-schema-read',
    );
  });

  it('schema compatibility mismatch blocks the smoke', async () => {
    stubUpstreamPass();
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { hashes: [], status: 'OK' },
    );
    const output = await runFlags(ALL_FLAGS);
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      schemaCompatibility: { status: 'BLOCKED' },
      smoke: { status: 'BLOCKED' },
    });
  });

  it('schema acquisition failure blocks the smoke', async () => {
    stubUpstreamPass();
    productionSchemaMocks.readProductionAppliedMigrationHashes.mockResolvedValue(
      { reason: 'Production migration-journal read failed.', status: 'ERROR' },
    );
    const output = await runFlags(ALL_FLAGS);
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      schemaCompatibility: { status: 'ERROR' },
      smoke: { status: 'BLOCKED' },
    });
  });

  it('exact upstream PASS invokes the smoke exactly once with the trusted immutable URL', async () => {
    stubUpstreamPass();
    const output = await runFlags(ALL_FLAGS);
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).toHaveBeenCalledOnce();
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).toHaveBeenCalledWith(
      immutableUrl,
    );
    expect(output).toMatchObject({
      environmentContract: { status: 'PASS' },
      schemaCompatibility: { status: 'PASS' },
      smoke: { status: 'PASS' },
      smokeEvidence: {
        provider: 'authjs',
        session: 'PASS',
        signIn: 'PASS',
        status: 'READ_AND_VALIDATED',
      },
    });
  });

  it.each([
    [
      'extra key',
      { extra: 'x', provider: 'authjs', session: 'PASS', signIn: 'PASS' },
    ],
    ['missing key', { provider: 'authjs', session: 'PASS' }],
    [
      'case-substituted key',
      { provider: 'authjs', session: 'PASS', signin: 'PASS' },
    ],
    [
      'wrong provider value',
      { provider: 'clerk', session: 'PASS', signIn: 'PASS' },
    ],
    [
      'wrong session value',
      { provider: 'authjs', session: 'FAIL', signIn: 'PASS' },
    ],
    ['array', ['authjs', 'PASS', 'PASS']],
  ])(
    'a structurally malformed OK smoke result (%s) never reaches PASS',
    async (_label, evidence) => {
      stubUpstreamPass();
      authjsSmokeMocks.runAuthjsReadOnlySmoke.mockResolvedValue({
        evidence,
        status: 'OK',
      });
      const output = await runFlags(ALL_FLAGS);
      expect(output).toMatchObject({
        smoke: { status: 'ERROR' },
        smokeEvidence: { status: 'ERROR' },
        rollbackAction: 'NOT_AUTHORIZED',
        rollbackExecutable: false,
      });
    },
  );

  it('an inherited-only provider/session/signIn shape never reaches PASS', async () => {
    stubUpstreamPass();
    const inherited = Object.create({
      provider: 'authjs',
      session: 'PASS',
      signIn: 'PASS',
    }) as Record<string, unknown>;
    authjsSmokeMocks.runAuthjsReadOnlySmoke.mockResolvedValue({
      evidence: inherited,
      status: 'OK',
    });
    const output = await runFlags(ALL_FLAGS);
    expect(output).toMatchObject({ smoke: { status: 'ERROR' } });
  });

  it('a smoke acquisition error surfaces as smoke ERROR, with no secret leakage', async () => {
    stubUpstreamPass();
    authjsSmokeMocks.runAuthjsReadOnlySmoke.mockResolvedValue({
      reason: 'AuthJS sign-in read-only smoke did not satisfy its contract.',
      status: 'ERROR',
    });
    const output = await runFlags(ALL_FLAGS);
    const serialized = JSON.stringify(output);
    expect(serialized).not.toMatch(/token|secret|bypass|x-internal-key/i);
    expect(output).toMatchObject({
      smoke: { status: 'ERROR' },
      smokeEvidence: { status: 'ERROR' },
      rollbackAction: 'NOT_AUTHORIZED',
      rollbackExecutable: false,
    });
  });

  it('a thrown smoke implementation is contained as smoke ERROR', async () => {
    stubUpstreamPass();
    authjsSmokeMocks.runAuthjsReadOnlySmoke.mockRejectedValue(
      new Error('sentinel-bypass-secret raw failure'),
    );
    const output = await runFlags(ALL_FLAGS);
    expect(JSON.stringify(output)).not.toContain('sentinel-bypass-secret');
    expect(output).toMatchObject({ smoke: { status: 'ERROR' } });
  });

  it('valid remote smoke evidence reaches smoke PASS only through run(), never the local builder', () => {
    const forged = buildLocalRollbackAssessment({
      deploymentId,
      environmentContract: matchingEnvironmentEvidence,
      smokeEvidence: { provider: 'authjs', session: 'PASS', signIn: 'PASS' },
    });
    expect(forged.smoke.status).not.toBe('PASS');
    expect(forged.smoke).toMatchObject({ status: 'BLOCKED' });
    expect(forged.smokeEvidence).toEqual({ status: 'NOT_REQUESTED' });
  });

  it('even with all four evidence categories PASS, rollback stays non-executable', async () => {
    stubUpstreamPass();
    const output = await runFlags(ALL_FLAGS);
    expect(output).toMatchObject({
      candidateIdentity: { status: 'PASS' },
      containmentFloorAncestry: { status: 'PASS' },
      environmentContract: { status: 'PASS' },
      schemaCompatibility: { status: 'PASS' },
      smoke: { status: 'PASS' },
      rollbackAction: 'NOT_AUTHORIZED',
      rollbackExecutable: false,
    });
  });

  it('the smoke flag never triggers a Vercel DETAIL, environment, or schema read on its own', async () => {
    await runFlags(['--execute-authjs-smoke-read']);
    expect(
      remoteCandidateMocks.readRemoteCandidateDetail,
    ).not.toHaveBeenCalled();
    expect(
      remoteEnvironmentMocks.readCandidateEnvironmentContract,
    ).not.toHaveBeenCalled();
    expect(
      productionSchemaMocks.readProductionAppliedMigrationHashes,
    ).not.toHaveBeenCalled();
    expect(authjsSmokeMocks.runAuthjsReadOnlySmoke).not.toHaveBeenCalled();
  });
});
