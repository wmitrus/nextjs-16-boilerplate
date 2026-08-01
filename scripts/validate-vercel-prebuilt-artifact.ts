import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertPathWithinBase,
  pathExistsWithinBase,
  readDirentsWithinBase,
  readTextFileWithinBase,
  writeTextFileWithinBase,
} from './lib/fs-guards-shared';

interface VercelFunctionConfig extends Record<string, unknown> {
  filePathMap?: Record<string, string>;
}

export interface VercelTraceFileReference {
  configPath: string;
  requiredPath: string;
}

export interface MissingVercelTraceFile extends VercelTraceFileReference {
  resolvedPath: string;
}

export interface VercelPrebuiltArtifactSummary {
  configCount: number;
  requiredFileCount: number;
  requiredFiles: VercelTraceFileReference[];
  missingFiles: MissingVercelTraceFile[];
  forbiddenFiles: VercelTraceFileReference[];
}

export interface MissingVercelUploadFile extends VercelTraceFileReference {
  ignoredByDryRunPath?: string;
}

export interface VercelPrebuiltUploadCoverageSummary {
  uploadedFileCount: number;
  ignoredPathCount: number;
  missingUploadFiles: MissingVercelUploadFile[];
}

const DEFAULT_FUNCTIONS_DIR = '.vercel/output/functions';
const FORBIDDEN_TRACE_PATH_PREFIXES = [
  '.env',
  'logs/',
  'src/',
  'tests/',
  'docs/',
  'e2e/',
  'playwright-report/',
  'test-results/',
];

function isForbiddenTracePath(requiredPath: string): boolean {
  return FORBIDDEN_TRACE_PATH_PREFIXES.some((prefix) =>
    requiredPath.startsWith(prefix),
  );
}

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
    const childPath = path.join(safeDir, dirent.name);

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
    path.join(safeRoot, functionsDir),
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
  const requiredFiles: VercelTraceFileReference[] = [];
  const missingFiles: MissingVercelTraceFile[] = [];
  const forbiddenFiles: VercelTraceFileReference[] = [];

  for (const configPath of configPaths) {
    const config = readVercelFunctionConfig(configPath, safeRoot);
    const requiredPaths = Object.keys(config.filePathMap ?? {});
    requiredFileCount += requiredPaths.length;

    for (const requiredPath of requiredPaths) {
      const configRelativePath = toRepoRelativePath(configPath, safeRoot);
      const resolvedPath = assertPathWithinBase(
        path.join(safeRoot, requiredPath),
        safeRoot,
        'Vercel traced file',
      );
      requiredFiles.push({
        configPath: configRelativePath,
        requiredPath,
      });

      if (isForbiddenTracePath(requiredPath)) {
        forbiddenFiles.push({
          configPath: configRelativePath,
          requiredPath,
        });
      }

      if (!pathExistsWithinBase(resolvedPath, safeRoot, 'Vercel traced file')) {
        missingFiles.push({
          configPath: configRelativePath,
          requiredPath,
          resolvedPath,
        });
      }
    }
  }

  return {
    configCount: configPaths.length,
    requiredFileCount,
    requiredFiles,
    missingFiles,
    forbiddenFiles,
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

export function assertVercelPrebuiltArtifactHasNoForbiddenTraces(
  summary: VercelPrebuiltArtifactSummary,
): void {
  if (summary.forbiddenFiles.length === 0) {
    return;
  }

  const examples = summary.forbiddenFiles
    .slice(0, 10)
    .map(
      (forbidden) =>
        `  - ${forbidden.requiredPath} (referenced by ${forbidden.configPath})`,
    )
    .join('\n');

  throw new Error(
    `[vercel-prebuilt] Found ${summary.forbiddenFiles.length} forbidden traced file(s) in .vc-config.json.\n` +
      `${examples}\n` +
      'Run `pnpm vercel:prebuilt:sanitize` after `vercel build --prod` before validating or deploying the prebuilt artifact.',
  );
}

export async function sanitizeVercelPrebuiltArtifact(
  rootDir = process.cwd(),
  functionsDir = DEFAULT_FUNCTIONS_DIR,
): Promise<{ configCount: number; removedFileCount: number }> {
  const safeRoot = assertPathWithinBase(rootDir, rootDir, 'repository root');
  const safeFunctionsDir = assertPathWithinBase(
    path.join(safeRoot, functionsDir),
    safeRoot,
    'Vercel functions directory',
  );
  const configPaths = await findVercelFunctionConfigPaths(
    safeFunctionsDir,
    safeRoot,
  );
  let removedFileCount = 0;

  for (const configPath of configPaths) {
    const config = readVercelFunctionConfig(configPath, safeRoot);
    const filePathMap = config.filePathMap;

    if (!filePathMap) {
      continue;
    }

    const allowedEntries = Object.entries(filePathMap).filter(
      ([requiredPath]) => !isForbiddenTracePath(requiredPath),
    );
    removedFileCount += Object.keys(filePathMap).length - allowedEntries.length;
    config.filePathMap = Object.fromEntries(allowedEntries);

    await writeTextFileWithinBase(
      configPath,
      safeRoot,
      JSON.stringify(config),
      'Vercel function config',
    );
  }

  return {
    configCount: configPaths.length,
    removedFileCount,
  };
}

function normalizeVercelRelativePath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\.\/+/, '');
}

function extractJsonObject(rawOutput: string): unknown {
  const start = rawOutput.indexOf('{');
  const end = rawOutput.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      '[vercel-prebuilt] Dry-run output does not contain a JSON object.',
    );
  }

  return JSON.parse(rawOutput.slice(start, end + 1));
}

function collectPathSet(value: unknown, propertyName: string): Set<string> {
  if (!Array.isArray(value)) {
    throw new Error(
      `[vercel-prebuilt] Dry-run JSON is missing an array at \`${propertyName}\`.`,
    );
  }

  const paths = new Set<string>();

  for (const entry of value) {
    if (typeof entry === 'string') {
      paths.add(normalizeVercelRelativePath(entry));
      continue;
    }

    const record = entry as { path?: unknown };

    if (
      typeof entry === 'object' &&
      entry !== null &&
      Object.hasOwn(entry, 'path') &&
      typeof record.path === 'string'
    ) {
      paths.add(normalizeVercelRelativePath(record.path));
    }
  }

  return paths;
}

export function parseVercelDeployDryRunOutput(rawOutput: string): {
  uploadedPaths: Set<string>;
  ignoredPaths: Set<string>;
} {
  const parsed = extractJsonObject(rawOutput);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('[vercel-prebuilt] Dry-run JSON must be an object.');
  }

  const dryRun = parsed as { files?: unknown; ignored?: unknown };

  return {
    uploadedPaths: collectPathSet(dryRun.files, 'files'),
    ignoredPaths: collectPathSet(dryRun.ignored, 'ignored'),
  };
}

function findIgnoredParentPath(
  requiredPath: string,
  ignoredPaths: Set<string>,
): string | undefined {
  for (const ignoredPath of ignoredPaths) {
    if (
      requiredPath === ignoredPath ||
      requiredPath.startsWith(`${ignoredPath}/`)
    ) {
      return ignoredPath;
    }
  }

  return undefined;
}

export function validateVercelPrebuiltUploadCoverage(
  artifactSummary: VercelPrebuiltArtifactSummary,
  dryRunOutput: string,
): VercelPrebuiltUploadCoverageSummary {
  const { uploadedPaths, ignoredPaths } =
    parseVercelDeployDryRunOutput(dryRunOutput);
  const missingUploadFiles = artifactSummary.requiredFiles
    .filter(({ requiredPath }) => !uploadedPaths.has(requiredPath))
    .map(({ configPath, requiredPath }) => ({
      configPath,
      requiredPath,
      ignoredByDryRunPath: findIgnoredParentPath(requiredPath, ignoredPaths),
    }));

  return {
    uploadedFileCount: uploadedPaths.size,
    ignoredPathCount: ignoredPaths.size,
    missingUploadFiles,
  };
}

export function assertVercelPrebuiltUploadCoverageValid(
  summary: VercelPrebuiltUploadCoverageSummary,
): void {
  if (summary.missingUploadFiles.length === 0) {
    return;
  }

  const examples = summary.missingUploadFiles
    .slice(0, 10)
    .map((missing) => {
      const ignoredSuffix = missing.ignoredByDryRunPath
        ? `; likely excluded by dry-run ignored path \`${missing.ignoredByDryRunPath}\``
        : '';

      return `  - ${missing.requiredPath} (referenced by ${missing.configPath}${ignoredSuffix})`;
    })
    .join('\n');

  throw new Error(
    `[vercel-prebuilt] Dry-run upload is missing ${summary.missingUploadFiles.length} traced file(s) required by .vc-config.json.\n` +
      `${examples}\n` +
      'Check `.vercelignore` and the prebuilt upload file list before running the real deploy.',
  );
}

function getDryRunJsonPath(args: string[]): string | undefined {
  const equalsArg = args.find((arg) => arg.startsWith('--dry-run-json='));

  if (equalsArg) {
    return equalsArg.slice('--dry-run-json='.length);
  }

  const flagIndex = args.indexOf('--dry-run-json');
  if (flagIndex === -1) {
    return undefined;
  }

  if (!args[flagIndex + 1] || args[flagIndex + 1].startsWith('--')) {
    throw new Error('[vercel-prebuilt] --dry-run-json requires a file path.');
  }

  return args[flagIndex + 1];
}

function shouldSanitizeForbiddenTraces(args: string[]): boolean {
  return args.includes('--sanitize-forbidden-traces');
}

function readDryRunJsonFile(filePath: string): string {
  const allowedBaseDirs = [process.cwd(), tmpdir()];
  const safePath = allowedBaseDirs
    .map((baseDir) => {
      try {
        return assertPathWithinBase(
          filePath,
          baseDir,
          'Vercel deploy dry-run JSON',
        );
      } catch {
        return undefined;
      }
    })
    .find((resolvedPath): resolvedPath is string => Boolean(resolvedPath));

  if (!safePath) {
    throw new Error(
      '[vercel-prebuilt] Dry-run JSON path must be inside the repository or the system temp directory.',
    );
  }

  return readTextFileWithinBase(
    safePath,
    path.dirname(safePath),
    'Vercel deploy dry-run JSON',
  );
}

/* v8 ignore start -- CLI console/process wrapper; exported functions are unit-tested. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (shouldSanitizeForbiddenTraces(args)) {
    const sanitizeSummary = await sanitizeVercelPrebuiltArtifact();

    console.log(
      `[vercel-prebuilt] Sanitized forbidden traces: ${sanitizeSummary.removedFileCount} removed across ${sanitizeSummary.configCount} function config(s).`,
    );
  }

  const summary = await validateVercelPrebuiltArtifact();
  assertVercelPrebuiltArtifactValid(summary);
  assertVercelPrebuiltArtifactHasNoForbiddenTraces(summary);
  const dryRunJsonPath = getDryRunJsonPath(args);

  if (dryRunJsonPath) {
    const dryRunOutput = readDryRunJsonFile(dryRunJsonPath);
    const uploadSummary = validateVercelPrebuiltUploadCoverage(
      summary,
      dryRunOutput,
    );
    assertVercelPrebuiltUploadCoverageValid(uploadSummary);

    console.log(
      `[vercel-prebuilt] Upload coverage valid: ${summary.requiredFileCount} traced file reference(s), ${uploadSummary.uploadedFileCount} dry-run upload file(s), 0 missing.`,
    );
    return;
  }

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
