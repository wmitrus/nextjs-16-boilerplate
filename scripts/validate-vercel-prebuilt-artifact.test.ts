// @vitest-environment node
/* eslint-disable security/detect-non-literal-fs-filename -- tests create isolated temporary fixture trees. */

import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertVercelPrebuiltArtifactHasNoForbiddenTraces,
  assertVercelPrebuiltArtifactHasNoEscapingTraces,
  assertVercelPrebuiltArtifactValid,
  assertVercelPrebuiltUploadCoverageValid,
  parseVercelDeployDryRunOutput,
  validateVercelPrebuiltArtifact,
  validateVercelPrebuiltUploadCoverage,
} from './validate-vercel-prebuilt-artifact';

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vercel-prebuilt-artifact-'));
  tempRoots.push(root);
  return root;
}

async function writeFunctionConfig(
  root: string,
  filePathMap: unknown,
): Promise<void> {
  const functionDir = join(root, '.vercel/output/functions/api/example.func');
  await mkdir(functionDir, { recursive: true });
  await writeFile(
    join(functionDir, '.vc-config.json'),
    JSON.stringify({ filePathMap }),
    'utf8',
  );
}

async function writeRequiredFile(
  root: string,
  relativePath: string,
): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, 'module.exports = {};\n', 'utf8');
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe('validateVercelPrebuiltArtifact', () => {
  it('rejects a non-object filePathMap from generated config JSON', async () => {
    const root = await createTempRoot();
    await writeFunctionConfig(root, 42);

    await expect(validateVercelPrebuiltArtifact(root)).rejects.toThrow(
      'Invalid filePathMap',
    );
  });

  it('passes when all function filePathMap entries exist locally', async () => {
    const root = await createTempRoot();
    const requiredPath = 'node_modules/.pnpm/pkg/node_modules/pkg/index.js';
    await writeFunctionConfig(root, {
      [requiredPath]: requiredPath,
    });
    await writeRequiredFile(root, requiredPath);

    const summary = await validateVercelPrebuiltArtifact(root);

    expect(summary).toEqual({
      configCount: 1,
      requiredFileCount: 1,
      requiredFiles: [
        {
          configPath:
            '.vercel/output/functions/api/example.func/.vc-config.json',
          requiredPath,
        },
      ],
      missingFiles: [],
      forbiddenFiles: [],
      escapingFiles: [],
    });
    expect(() => assertVercelPrebuiltArtifactValid(summary)).not.toThrow();
    expect(() =>
      assertVercelPrebuiltArtifactHasNoEscapingTraces(summary),
    ).not.toThrow();
  });

  it('uses filePathMap source values rather than target keys', async () => {
    const root = await createTempRoot();
    const targetPath = 'server/chunks/vendor.js';
    const sourcePath = 'node_modules/.pnpm/pkg/node_modules/pkg/index.js';
    await writeFunctionConfig(root, {
      [targetPath]: sourcePath,
    });
    await writeRequiredFile(root, sourcePath);

    const summary = await validateVercelPrebuiltArtifact(root);

    expect(summary.requiredFiles).toEqual([
      {
        configPath: '.vercel/output/functions/api/example.func/.vc-config.json',
        requiredPath: sourcePath,
      },
    ]);
    expect(summary.missingFiles).toEqual([]);
  });

  it('reports missing traced files with the config that references them', async () => {
    const root = await createTempRoot();
    const requiredPath =
      'node_modules/.pnpm/@opentelemetry+api@1.9.0/node_modules/@opentelemetry/api/build/src/api/context.js';
    await writeFunctionConfig(root, {
      [requiredPath]: requiredPath,
    });

    const summary = await validateVercelPrebuiltArtifact(root);

    expect(summary.configCount).toBe(1);
    expect(summary.requiredFileCount).toBe(1);
    expect(summary.missingFiles).toHaveLength(1);
    expect(summary.missingFiles[0]).toMatchObject({
      configPath: '.vercel/output/functions/api/example.func/.vc-config.json',
      requiredPath,
    });
    expect(() => assertVercelPrebuiltArtifactValid(summary)).toThrow(
      requiredPath,
    );
  });

  it('reports forbidden traced files for upload-plan enforcement', async () => {
    const root = await createTempRoot();
    const requiredPath = '.env.local';
    await writeFunctionConfig(root, {
      [requiredPath]: requiredPath,
    });
    await writeRequiredFile(root, requiredPath);

    const summary = await validateVercelPrebuiltArtifact(root);

    expect(summary.forbiddenFiles).toEqual([
      {
        configPath: '.vercel/output/functions/api/example.func/.vc-config.json',
        requiredPath,
      },
    ]);
  });

  it.each([
    '.env.example',
    '.env.leantime.example',
    '.env.leantime-dev.example',
  ])(
    'allows the tracked public env template %s required by the Vercel builder',
    async (requiredPath) => {
      const root = await createTempRoot();
      await writeFunctionConfig(root, {
        [requiredPath]: requiredPath,
      });
      await writeRequiredFile(root, requiredPath);

      const summary = await validateVercelPrebuiltArtifact(root);

      expect(summary.forbiddenFiles).toEqual([]);
    },
  );

  it('rejects traced files that symlink outside the repository root', async () => {
    const root = await createTempRoot();
    const outsideRoot = await createTempRoot();
    const requiredPath = 'node_modules/.pnpm/pkg/node_modules/pkg/index.js';
    const outsideFile = join(outsideRoot, 'outside.js');
    await writeFunctionConfig(root, {
      [requiredPath]: requiredPath,
    });
    await mkdir(dirname(join(root, requiredPath)), { recursive: true });
    await writeFile(outsideFile, 'module.exports = {};\n', 'utf8');
    await symlink(outsideFile, join(root, requiredPath));

    const summary = await validateVercelPrebuiltArtifact(root);

    expect(summary.escapingFiles).toHaveLength(1);
    expect(summary.escapingFiles[0]).toMatchObject({
      configPath: '.vercel/output/functions/api/example.func/.vc-config.json',
      requiredPath,
    });
    expect(() =>
      assertVercelPrebuiltArtifactHasNoEscapingTraces(summary),
    ).toThrow('escaping the repository root');
  });

  it('throws when the prebuilt functions output does not exist', async () => {
    const root = await createTempRoot();

    await expect(validateVercelPrebuiltArtifact(root)).rejects.toThrow(
      'Run `vercel build --prod` before validating prebuilt artifacts',
    );
  });

  it('passes upload coverage when dry-run files include all traced paths', async () => {
    const root = await createTempRoot();
    const requiredPath = 'node_modules/.pnpm/pkg/node_modules/pkg/index.js';
    await writeFunctionConfig(root, {
      [requiredPath]: requiredPath,
    });
    await writeRequiredFile(root, requiredPath);
    const artifactSummary = await validateVercelPrebuiltArtifact(root);

    const uploadSummary = validateVercelPrebuiltUploadCoverage(
      artifactSummary,
      [
        'Vercel CLI 58.4.4',
        JSON.stringify({
          files: [{ path: requiredPath, size: 123 }],
          ignored: [],
        }),
      ].join('\n'),
    );

    expect(uploadSummary).toEqual({
      uploadedFileCount: 1,
      ignoredPathCount: 0,
      totalUploadSizeBytes: 123,
      missingUploadFiles: [],
      forbiddenUploadFiles: [],
    });
    expect(() =>
      assertVercelPrebuiltUploadCoverageValid(uploadSummary),
    ).not.toThrow();
  });

  it('requires dry-run upload of a traced source file', async () => {
    const root = await createTempRoot();
    const requiredPath = 'src/core/logger/edge.ts';
    await writeFunctionConfig(root, {
      [requiredPath]: requiredPath,
    });
    await writeRequiredFile(root, requiredPath);
    const artifactSummary = await validateVercelPrebuiltArtifact(root);

    expect(artifactSummary.forbiddenFiles).toEqual([]);

    const uploadSummary = validateVercelPrebuiltUploadCoverage(
      artifactSummary,
      JSON.stringify({
        files: [],
        ignored: ['src'],
        totalSize: 0,
      }),
    );

    expect(uploadSummary.missingUploadFiles).toEqual([
      {
        configPath: '.vercel/output/functions/api/example.func/.vc-config.json',
        requiredPath,
        ignoredByDryRunPath: 'src',
      },
    ]);
    expect(() =>
      assertVercelPrebuiltUploadCoverageValid(uploadSummary),
    ).toThrow('likely excluded by dry-run ignored path `src`');
  });

  it('rejects dry-run entries that do not contain a supported path shape', () => {
    expect(() =>
      parseVercelDeployDryRunOutput(
        JSON.stringify({ files: [{ unexpected: 'entry' }], ignored: [] }),
      ),
    ).toThrow('contains an invalid entry in `files`');
  });

  it('rejects trailing non-JSON content after the dry-run payload', () => {
    expect(() =>
      parseVercelDeployDryRunOutput(
        `${JSON.stringify({ files: [], ignored: [] })}\nunexpected output`,
      ),
    ).toThrow(SyntaxError);
  });

  it('reports dry-run upload gaps with ignored parent paths', async () => {
    const root = await createTempRoot();
    const requiredPath =
      'node_modules/.pnpm/@opentelemetry+api@1.9.0/node_modules/@opentelemetry/api/build/src/api/context.js';
    await writeFunctionConfig(root, {
      [requiredPath]: requiredPath,
    });
    await writeRequiredFile(root, requiredPath);
    const artifactSummary = await validateVercelPrebuiltArtifact(root);

    const uploadSummary = validateVercelPrebuiltUploadCoverage(
      artifactSummary,
      JSON.stringify({
        files: [
          {
            path: '.vercel/output/functions/_global-error.func/.vc-config.json',
            size: 456,
          },
        ],
        ignored: ['node_modules'],
        totalSize: 789,
      }),
    );

    expect(uploadSummary.missingUploadFiles).toEqual([
      {
        configPath: '.vercel/output/functions/api/example.func/.vc-config.json',
        requiredPath,
        ignoredByDryRunPath: 'node_modules',
      },
    ]);
    expect(uploadSummary.totalUploadSizeBytes).toBe(789);
    expect(() =>
      assertVercelPrebuiltUploadCoverageValid(uploadSummary),
    ).toThrow('likely excluded by dry-run ignored path `node_modules`');
  });

  it('does not name .vercelignore when dry-run ignored paths do not cover the missing file', async () => {
    const root = await createTempRoot();
    const requiredPath = 'node_modules/.pnpm/pkg/node_modules/pkg/index.js';
    await writeFunctionConfig(root, {
      [requiredPath]: requiredPath,
    });
    await writeRequiredFile(root, requiredPath);
    const artifactSummary = await validateVercelPrebuiltArtifact(root);

    const uploadSummary = validateVercelPrebuiltUploadCoverage(
      artifactSummary,
      JSON.stringify({
        files: [],
        ignored: ['docs'],
      }),
    );

    expect(uploadSummary.missingUploadFiles[0]).toEqual({
      configPath: '.vercel/output/functions/api/example.func/.vc-config.json',
      requiredPath,
      ignoredByDryRunPath: undefined,
    });
    expect(() =>
      assertVercelPrebuiltUploadCoverageValid(uploadSummary),
    ).toThrow('Check `.vercelignore`');
    expect(() =>
      assertVercelPrebuiltUploadCoverageValid(uploadSummary),
    ).not.toThrow('likely excluded by dry-run ignored path');
  });

  it('rejects forbidden trace metadata before the dry-run can exclude it', async () => {
    const root = await createTempRoot();
    const forbiddenPath = '.env.local';
    await writeFunctionConfig(root, {
      [forbiddenPath]: forbiddenPath,
    });
    await writeRequiredFile(root, forbiddenPath);
    const artifactSummary = await validateVercelPrebuiltArtifact(root);

    expect(() =>
      assertVercelPrebuiltArtifactHasNoForbiddenTraces(artifactSummary),
    ).toThrow('.env.local');
  });

  it('rejects forbidden traced files present in dry-run upload', async () => {
    const root = await createTempRoot();
    const forbiddenPath = '.env.local';
    await writeFunctionConfig(root, {
      [forbiddenPath]: forbiddenPath,
    });
    await writeRequiredFile(root, forbiddenPath);
    const artifactSummary = await validateVercelPrebuiltArtifact(root);

    const uploadSummary = validateVercelPrebuiltUploadCoverage(
      artifactSummary,
      JSON.stringify({
        files: [{ path: forbiddenPath, size: 1 }],
        ignored: [],
      }),
    );

    expect(uploadSummary.forbiddenUploadFiles).toHaveLength(1);
    expect(() =>
      assertVercelPrebuiltUploadCoverageValid(uploadSummary),
    ).toThrow('forbidden traced file');
  });

  it('rejects dry-run uploads that exceed the file-count budget', () => {
    expect(() =>
      assertVercelPrebuiltUploadCoverageValid({
        uploadedFileCount: 5_001,
        ignoredPathCount: 0,
        totalUploadSizeBytes: 1,
        missingUploadFiles: [],
        forbiddenUploadFiles: [],
      }),
    ).toThrow('exceeding the 5000 file budget');
  });

  it('rejects dry-run uploads that exceed or cannot prove the size budget', () => {
    const summary = {
      uploadedFileCount: 1,
      ignoredPathCount: 0,
      missingUploadFiles: [],
      forbiddenUploadFiles: [],
    };

    expect(() => assertVercelPrebuiltUploadCoverageValid(summary)).toThrow(
      'upload size is unavailable',
    );
    expect(() =>
      assertVercelPrebuiltUploadCoverageValid({
        ...summary,
        totalUploadSizeBytes: 80 * 1024 * 1024 + 1,
      }),
    ).toThrow('exceeding the 83886080 byte budget');
  });
});
