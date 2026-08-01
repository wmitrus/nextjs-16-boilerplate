import { fileURLToPath } from 'node:url';

import {
  assertPathWithinBase,
  pathExistsWithinBase,
  readDirentsWithinBase,
  readTextFileWithinBase,
} from './lib/fs-guards-shared';

interface VercelFunctionConfig {
  filePathMap?: Record<string, string>;
}

export interface MissingVercelTraceFile {
  configPath: string;
  requiredPath: string;
  resolvedPath: string;
}

export interface VercelPrebuiltArtifactSummary {
  configCount: number;
  requiredFileCount: number;
  missingFiles: MissingVercelTraceFile[];
}

const DEFAULT_FUNCTIONS_DIR = '.vercel/output/functions';

function toRepoRelativePath(path: string, rootDir: string): string {
  const safePath = assertPathWithinBase(path, rootDir, 'reported path');
  return safePath.slice(rootDir.length + 1);
}

async function findVercelFunctionConfigPaths(
  dirPath: string,
  rootDir: string,
): Promise<string[]> {
  const safeDir = assertPathWithinBase(dirPath, rootDir, 'Vercel output path');
  const dirents = await readDirentsWithinBase(
    safeDir,
    rootDir,
    'Vercel output path',
  );
  const configPaths: string[] = [];

  for (const dirent of dirents) {
    const childPath = `${safeDir}/${dirent.name}`;

    if (dirent.isDirectory()) {
      configPaths.push(
        ...(await findVercelFunctionConfigPaths(childPath, rootDir)),
      );
      continue;
    }

    if (dirent.isFile() && dirent.name === '.vc-config.json') {
      configPaths.push(childPath);
    }
  }

  return configPaths;
}

function readVercelFunctionConfig(
  configPath: string,
  rootDir: string,
): VercelFunctionConfig {
  const rawConfig = readTextFileWithinBase(
    configPath,
    rootDir,
    'Vercel function config',
  );
  const parsed = JSON.parse(rawConfig) as VercelFunctionConfig;

  if (
    parsed.filePathMap !== undefined &&
    (typeof parsed.filePathMap !== 'object' || parsed.filePathMap === null)
  ) {
    throw new Error(
      `[vercel-prebuilt] Invalid filePathMap in ${toRepoRelativePath(configPath, rootDir)}.`,
    );
  }

  return parsed;
}

export async function validateVercelPrebuiltArtifact(
  rootDir = process.cwd(),
  functionsDir = DEFAULT_FUNCTIONS_DIR,
): Promise<VercelPrebuiltArtifactSummary> {
  const safeRoot = assertPathWithinBase(rootDir, rootDir, 'repository root');
  const safeFunctionsDir = assertPathWithinBase(
    `${safeRoot}/${functionsDir}`,
    safeRoot,
    'Vercel functions directory',
  );

  if (!pathExistsWithinBase(safeFunctionsDir, safeRoot, 'Vercel output path')) {
    throw new Error(
      `[vercel-prebuilt] Missing ${functionsDir}. Run \`vercel build --prod\` before validating prebuilt artifacts.`,
    );
  }

  const configPaths = await findVercelFunctionConfigPaths(
    safeFunctionsDir,
    safeRoot,
  );
  let requiredFileCount = 0;
  const missingFiles: MissingVercelTraceFile[] = [];

  for (const configPath of configPaths) {
    const config = readVercelFunctionConfig(configPath, safeRoot);
    const requiredPaths = Object.keys(config.filePathMap ?? {});
    requiredFileCount += requiredPaths.length;

    for (const requiredPath of requiredPaths) {
      const resolvedPath = assertPathWithinBase(
        `${safeRoot}/${requiredPath}`,
        safeRoot,
        'Vercel traced file',
      );

      if (!pathExistsWithinBase(resolvedPath, safeRoot, 'Vercel traced file')) {
        missingFiles.push({
          configPath: toRepoRelativePath(configPath, safeRoot),
          requiredPath,
          resolvedPath,
        });
      }
    }
  }

  return {
    configCount: configPaths.length,
    requiredFileCount,
    missingFiles,
  };
}

export function assertVercelPrebuiltArtifactValid(
  summary: VercelPrebuiltArtifactSummary,
): void {
  if (summary.missingFiles.length === 0) {
    return;
  }

  const examples = summary.missingFiles
    .slice(0, 10)
    .map(
      (missing) =>
        `  - ${missing.requiredPath} (referenced by ${missing.configPath})`,
    )
    .join('\n');

  throw new Error(
    `[vercel-prebuilt] Missing ${summary.missingFiles.length} traced file(s) required by .vc-config.json.\n` +
      `${examples}\n` +
      'Run `vercel build --prod` after installing dependencies, and ensure required runtime files are not excluded from the prebuilt deploy upload.',
  );
}

/* v8 ignore start -- CLI console/process wrapper; exported functions are unit-tested. */
async function main(): Promise<void> {
  const summary = await validateVercelPrebuiltArtifact();
  assertVercelPrebuiltArtifactValid(summary);

  console.log(
    `[vercel-prebuilt] Artifact contract valid: ${summary.configCount} function config(s), ${summary.requiredFileCount} traced file reference(s), 0 missing.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
/* v8 ignore stop */
