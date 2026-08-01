// @vitest-environment node
/* eslint-disable security/detect-non-literal-fs-filename -- tests create isolated temporary fixture trees. */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertVercelPrebuiltArtifactHasNoForbiddenTraces,
  assertVercelPrebuiltArtifactValid,
  assertVercelPrebuiltUploadCoverageValid,
  sanitizeVercelPrebuiltArtifact,
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
  filePathMap: Record<string, string>,
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
    });
    expect(() => assertVercelPrebuiltArtifactValid(summary)).not.toThrow();
    expect(() =>
      assertVercelPrebuiltArtifactHasNoForbiddenTraces(summary),
    ).not.toThrow();
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

  it('reports forbidden traced files that should never be uploaded', async () => {
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
    expect(() =>
      assertVercelPrebuiltArtifactHasNoForbiddenTraces(summary),
    ).toThrow('forbidden traced file');
  });

  it('sanitizes forbidden traced files from function configs', async () => {
    const root = await createTempRoot();
    const forbiddenPath = 'logs/server.log';
    const allowedPath = 'node_modules/.pnpm/pkg/node_modules/pkg/index.js';
    await writeFunctionConfig(root, {
      [forbiddenPath]: forbiddenPath,
      [allowedPath]: allowedPath,
    });
    await writeRequiredFile(root, forbiddenPath);
    await writeRequiredFile(root, allowedPath);

    const sanitizeSummary = await sanitizeVercelPrebuiltArtifact(root);
    const configRaw = await readFile(
      join(root, '.vercel/output/functions/api/example.func/.vc-config.json'),
      'utf8',
    );
    const config = JSON.parse(configRaw) as {
      filePathMap: Record<string, string>;
    };
    const summary = await validateVercelPrebuiltArtifact(root);

    expect(sanitizeSummary).toEqual({
      configCount: 1,
      removedFileCount: 1,
    });
    expect(config.filePathMap).toEqual({
      [allowedPath]: allowedPath,
    });
    expect(summary.forbiddenFiles).toEqual([]);
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
          files: [{ path: requiredPath }],
          ignored: [],
        }),
      ].join('\n'),
    );

    expect(uploadSummary).toEqual({
      uploadedFileCount: 1,
      ignoredPathCount: 0,
      missingUploadFiles: [],
    });
    expect(() =>
      assertVercelPrebuiltUploadCoverageValid(uploadSummary),
    ).not.toThrow();
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
          },
        ],
        ignored: ['node_modules'],
      }),
    );

    expect(uploadSummary.missingUploadFiles).toEqual([
      {
        configPath: '.vercel/output/functions/api/example.func/.vc-config.json',
        requiredPath,
        ignoredByDryRunPath: 'node_modules',
      },
    ]);
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
});
