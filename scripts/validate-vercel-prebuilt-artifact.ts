import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertPathWithinBase,
  pathExistsWithinBase,
  readDirentsWithinBase,
  readTextFileWithinBase,
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

export interface EscapingVercelTraceFile extends VercelTraceFileReference {
  resolvedPath: string;
}

export interface VercelPrebuiltArtifactSummary {
  configCount: number;
  requiredFileCount: number;
  requiredFiles: VercelTraceFileReference[];
  missingFiles: MissingVercelTraceFile[];
  forbiddenFiles: VercelTraceFileReference[];
  escapingFiles: EscapingVercelTraceFile[];
}

export interface MissingVercelUploadFile extends VercelTraceFileReference {
  ignoredByDryRunPath?: string;
}

export interface VercelPrebuiltUploadCoverageSummary {
  uploadedFileCount: number;
  ignoredPathCount: number;
  totalUploadSizeBytes?: number;
  missingUploadFiles: MissingVercelUploadFile[];
  forbiddenUploadFiles: VercelTraceFileReference[];
}

const DEFAULT_FUNCTIONS_DIR = '.vercel/output/functions';
export const MAX_PREBUILT_UPLOAD_FILE_COUNT = 5_000;
export const MAX_PREBUILT_UPLOAD_SIZE_BYTES = 80 * 1024 * 1024;
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
    (typeof parsed.filePathMap !== 'object' ||
      parsed.filePathMap === null ||
      Array.isArray(parsed.filePathMap))
  ) {
    throw new Error(
      `[vercel-prebuilt] Invalid filePathMap in ${toRepoRelativePath(configPath, rootDir)}.`,
    );
  }

  return parsed;
}

function assertVercelFilePathMap(
  filePathMap: Record<string, string>,
  configPath: string,
  rootDir: string,
): void {
  for (const [targetPath, sourcePath] of Object.entries(filePathMap)) {
    if (typeof sourcePath !== 'string') {
      throw new Error(
        `[vercel-prebuilt] Invalid source path in ${toRepoRelativePath(configPath, rootDir)} for target ${targetPath}.`,
      );
    }
  }
}

function assertTraceSourceRealPathWithinRoot(
  requiredPath: string,
  rootDir: string,
): void {
  const resolvedPath = path.join(rootDir, requiredPath);

  if (!pathExistsWithinBase(resolvedPath, rootDir, 'Vercel traced file')) {
    return;
  }

  assertPathWithinBase(
    realpathSync.native(resolvedPath),
    rootDir,
    'Vercel traced file real path',
  );
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
  const escapingFiles: EscapingVercelTraceFile[] = [];

  for (const configPath of configPaths) {
    const config = readVercelFunctionConfig(configPath, safeRoot);
    const configRelativePath = toRepoRelativePath(configPath, safeRoot);
    const filePathMap = config.filePathMap ?? {};
    assertVercelFilePathMap(filePathMap, configPath, safeRoot);
    const requiredPaths = Object.values(filePathMap);
    requiredFileCount += requiredPaths.length;

    for (const requiredPath of requiredPaths) {
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
        continue;
      }

      try {
        assertTraceSourceRealPathWithinRoot(requiredPath, safeRoot);
      } catch {
        escapingFiles.push({
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
    escapingFiles,
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

export function assertVercelPrebuiltArtifactHasNoEscapingTraces(
  summary: VercelPrebuiltArtifactSummary,
): void {
  if (summary.escapingFiles.length === 0) {
    return;
  }

  const examples = summary.escapingFiles
    .slice(0, 10)
    .map(
      (escaping) =>
        `  - ${escaping.requiredPath} (referenced by ${escaping.configPath})`,
    )
    .join('\n');

  throw new Error(
    `[vercel-prebuilt] Found ${summary.escapingFiles.length} traced file(s) escaping the repository root.\n` +
      `${examples}\n` +
      'Do not deploy a prebuilt artifact whose traced source paths resolve outside the repository.',
  );
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

function collectTotalSizeBytes(parsed: {
  files?: unknown;
  totalSize?: unknown;
}): number | undefined {
  if (typeof parsed.totalSize === 'number') {
    return parsed.totalSize;
  }

  if (!Array.isArray(parsed.files)) {
    return undefined;
  }

  let totalSizeBytes = 0;
  let hasSizeData = false;

  for (const entry of parsed.files) {
    const record = entry as { size?: unknown };

    if (
      typeof entry === 'object' &&
      entry !== null &&
      Object.hasOwn(entry, 'size') &&
      typeof record.size === 'number'
    ) {
      totalSizeBytes += record.size;
      hasSizeData = true;
    }
  }

  return hasSizeData ? totalSizeBytes : undefined;
}

export function parseVercelDeployDryRunOutput(rawOutput: string): {
  uploadedPaths: Set<string>;
  ignoredPaths: Set<string>;
  totalUploadSizeBytes?: number;
} {
  const parsed = extractJsonObject(rawOutput);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('[vercel-prebuilt] Dry-run JSON must be an object.');
  }

  const dryRun = parsed as { files?: unknown; ignored?: unknown };

  return {
    uploadedPaths: collectPathSet(dryRun.files, 'files'),
    ignoredPaths: collectPathSet(dryRun.ignored, 'ignored'),
    totalUploadSizeBytes: collectTotalSizeBytes(dryRun),
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
  const { uploadedPaths, ignoredPaths, totalUploadSizeBytes } =
    parseVercelDeployDryRunOutput(dryRunOutput);
  const allowedRequiredFiles = artifactSummary.requiredFiles.filter(
    ({ requiredPath }) => !isForbiddenTracePath(requiredPath),
  );
  const missingUploadFiles = allowedRequiredFiles
    .filter(({ requiredPath }) => !uploadedPaths.has(requiredPath))
    .map(({ configPath, requiredPath }) => ({
      configPath,
      requiredPath,
      ignoredByDryRunPath: findIgnoredParentPath(requiredPath, ignoredPaths),
    }));
  const forbiddenUploadFiles = artifactSummary.forbiddenFiles.filter(
    ({ requiredPath }) => uploadedPaths.has(requiredPath),
  );

  return {
    uploadedFileCount: uploadedPaths.size,
    ignoredPathCount: ignoredPaths.size,
    totalUploadSizeBytes,
    missingUploadFiles,
    forbiddenUploadFiles,
  };
}

export function assertVercelPrebuiltUploadCoverageValid(
  summary: VercelPrebuiltUploadCoverageSummary,
): void {
  if (summary.missingUploadFiles.length > 0) {
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
      `[vercel-prebuilt] Dry-run upload is missing ${summary.missingUploadFiles.length} allowed traced file(s) required by .vc-config.json.\n` +
        `${examples}\n` +
        'Check `.vercelignore` and the prebuilt upload file list before running the real deploy.',
    );
  }

  if (summary.forbiddenUploadFiles.length > 0) {
    const examples = summary.forbiddenUploadFiles
      .slice(0, 10)
      .map(
        (forbidden) =>
          `  - ${forbidden.requiredPath} (referenced by ${forbidden.configPath})`,
      )
      .join('\n');

    throw new Error(
      `[vercel-prebuilt] Dry-run upload contains ${summary.forbiddenUploadFiles.length} forbidden traced file(s).\n` +
        `${examples}\n` +
        'Do not deploy until the forbidden source paths are excluded from the upload plan.',
    );
  }

  if (summary.uploadedFileCount > MAX_PREBUILT_UPLOAD_FILE_COUNT) {
    throw new Error(
      `[vercel-prebuilt] Dry-run upload contains ${summary.uploadedFileCount} files, exceeding the ${MAX_PREBUILT_UPLOAD_FILE_COUNT} file budget.`,
    );
  }

  if (summary.totalUploadSizeBytes === undefined) {
    throw new Error(
      '[vercel-prebuilt] Dry-run upload size is unavailable; cannot enforce the upload budget.',
    );
  }

  if (summary.totalUploadSizeBytes > MAX_PREBUILT_UPLOAD_SIZE_BYTES) {
    throw new Error(
      `[vercel-prebuilt] Dry-run upload is ${summary.totalUploadSizeBytes} bytes, exceeding the ${MAX_PREBUILT_UPLOAD_SIZE_BYTES} byte budget.`,
    );
  }
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
  const summary = await validateVercelPrebuiltArtifact();
  assertVercelPrebuiltArtifactValid(summary);
  assertVercelPrebuiltArtifactHasNoEscapingTraces(summary);
  const dryRunJsonPath = getDryRunJsonPath(args);

  if (dryRunJsonPath) {
    const dryRunOutput = readDryRunJsonFile(dryRunJsonPath);
    const uploadSummary = validateVercelPrebuiltUploadCoverage(
      summary,
      dryRunOutput,
    );
    assertVercelPrebuiltUploadCoverageValid(uploadSummary);

    console.log(
      `[vercel-prebuilt] Upload coverage valid: ${summary.requiredFileCount} traced file reference(s), ${uploadSummary.uploadedFileCount}/${MAX_PREBUILT_UPLOAD_FILE_COUNT} dry-run upload file(s), ${uploadSummary.totalUploadSizeBytes}/${MAX_PREBUILT_UPLOAD_SIZE_BYTES} byte(s), 0 missing allowed reference(s), 0 forbidden upload(s).`,
    );
    return;
  }

  console.log(
    `[vercel-prebuilt] Artifact contract valid: ${summary.configCount} function config(s), ${summary.requiredFileCount} traced file reference(s), ${summary.forbiddenFiles.length} forbidden reference(s) pending upload-plan enforcement, 0 missing.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
/* v8 ignore stop */
