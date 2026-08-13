import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertPathWithinBase,
  readTextFileWithinBase,
} from './lib/fs-guards-shared';
import { parseVercelDeployDryRunOutput } from './validate-vercel-prebuilt-artifact';
import { PUBLIC_PREBUILT_ENV_TEMPLATE_IGNORE_RULES } from './vercel/prebuilt-env-template-policy';

const PREVIEW_REQUIRED_SOURCE_PATHS = [
  'next.config.ts',
  'package.json',
  'e2e/env-files.ts',
  'e2e/internal-api-key.ts',
  'src/core/db/migrations/generated/meta/_journal.json',
];
const PREBUILT_REQUIRED_EXCLUSIONS = ['/src'];
const PREBUILT_RUNTIME_PATHS = ['/.next', '/node_modules'];

function parseIgnoreRules(content: string): Set<string> {
  return new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#')),
  );
}

export function assertVercelDeployProfilesValid(
  previewIgnoreContent: string,
  prebuiltIgnoreContent: string,
): void {
  const previewRules = parseIgnoreRules(previewIgnoreContent);
  const prebuiltRules = parseIgnoreRules(prebuiltIgnoreContent);

  if (previewRules.has('/src') || previewRules.has('src')) {
    throw new Error(
      '[vercel-deploy] Default .vercelignore must include src for preview source builds.',
    );
  }

  for (const requiredExclusion of PREBUILT_REQUIRED_EXCLUSIONS) {
    if (!prebuiltRules.has(requiredExclusion)) {
      throw new Error(
        `[vercel-deploy] Production prebuilt profile must exclude ${requiredExclusion}.`,
      );
    }
  }

  for (const requiredTemplate of PUBLIC_PREBUILT_ENV_TEMPLATE_IGNORE_RULES) {
    if (!prebuiltRules.has(requiredTemplate)) {
      throw new Error(
        `[vercel-deploy] Production prebuilt profile must include tracked public template ${requiredTemplate.slice(1)} because Vercel filePathMap may require it.`,
      );
    }
  }

  for (const runtimePath of PREBUILT_RUNTIME_PATHS) {
    if (
      prebuiltRules.has(runtimePath) ||
      prebuiltRules.has(runtimePath.slice(1))
    ) {
      throw new Error(
        `[vercel-deploy] Production prebuilt profile must not exclude ${runtimePath}; generated filePathMap entries may reference it.`,
      );
    }
  }
}

export function assertVercelPreviewSourceUploadValid(
  dryRunOutput: string,
): void {
  const { uploadedPaths } = parseVercelDeployDryRunOutput(dryRunOutput);
  const missingPaths = PREVIEW_REQUIRED_SOURCE_PATHS.filter(
    (requiredPath) => !uploadedPaths.has(requiredPath),
  );

  if (missingPaths.length > 0) {
    throw new Error(
      '[vercel-deploy] Preview source upload is missing required build input(s):\n' +
        missingPaths.map((missingPath) => `  - ${missingPath}`).join('\n'),
    );
  }
}

function readAllowedFile(filePath: string, label: string): string {
  const allowedBaseDirs = [process.cwd(), tmpdir()];
  const safePath = allowedBaseDirs
    .map((baseDir) => {
      try {
        return assertPathWithinBase(filePath, baseDir, label);
      } catch {
        return undefined;
      }
    })
    .find((resolvedPath): resolvedPath is string => Boolean(resolvedPath));

  if (!safePath) {
    throw new Error(
      `[vercel-deploy] ${label} must be inside the repository or the system temp directory.`,
    );
  }

  return readTextFileWithinBase(safePath, path.dirname(safePath), label);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const equalsArg = args.find((arg) => arg.startsWith(`${flag}=`));
  if (equalsArg) {
    return equalsArg.slice(flag.length + 1);
  }

  const flagIndex = args.indexOf(flag);
  return flagIndex === -1 ? undefined : args[flagIndex + 1];
}

/* v8 ignore start -- CLI console/process wrapper; exported functions are unit-tested. */
function main(): void {
  const args = process.argv.slice(2);
  const previewDryRunPath = getFlagValue(args, '--preview-dry-run-json');

  if (previewDryRunPath) {
    assertVercelPreviewSourceUploadValid(
      readAllowedFile(previewDryRunPath, 'Vercel preview dry-run JSON'),
    );
    console.log(
      `[vercel-deploy] Preview source upload valid: ${PREVIEW_REQUIRED_SOURCE_PATHS.length} required build input(s) present.`,
    );
    return;
  }

  const repositoryRoot = process.cwd();
  assertVercelDeployProfilesValid(
    readAllowedFile(
      path.resolve(repositoryRoot, '.vercelignore'),
      'preview upload profile',
    ),
    readAllowedFile(
      path.resolve(repositoryRoot, '.vercelignore.prebuilt'),
      'production prebuilt upload profile',
    ),
  );
  console.log('[vercel-deploy] Preview and production upload profiles valid.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
/* v8 ignore stop */
