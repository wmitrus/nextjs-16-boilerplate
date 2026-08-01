// @vitest-environment node
/* eslint-disable security/detect-non-literal-fs-filename -- tests create isolated temporary fixture trees. */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertVercelPrebuiltArtifactValid,
  validateVercelPrebuiltArtifact,
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
      missingFiles: [],
    });
    expect(() => assertVercelPrebuiltArtifactValid(summary)).not.toThrow();
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

  it('throws when the prebuilt functions output does not exist', async () => {
    const root = await createTempRoot();

    await expect(validateVercelPrebuiltArtifact(root)).rejects.toThrow(
      'Run `vercel build --prod` before validating prebuilt artifacts',
    );
  });
});
