import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface DeployConfig {
  backupRoot: string;
  host: string;
  localManifestDir: string;
  pluginName: string;
  port: number;
  remoteRoot: string;
  remoteStagingRoot: string;
  sourceDir: string;
  strictHostKeyChecking?: string;
  user: string;
}

interface PluginFile {
  hash: string;
  localPath: string;
  relativePath: string;
  size: number;
}

interface FilePlan {
  action: 'create' | 'overwrite' | 'skip-same';
  backupHash?: string;
  backupPath?: string;
  deployedHash?: string;
  localHash: string;
  relativePath: string;
  remoteHash?: string;
  remotePath: string;
  size: number;
  stagingHash?: string;
  stagingPath: string;
}

interface CommandResult {
  stderr: string;
  stdout: string;
}

const DEFAULT_LOCAL_MANIFEST_DIR = 'logs/leantime-plugin-deployments';
const DEFAULT_PLUGIN_NAME = 'AutomationApi';
const DEFAULT_SOURCE_DIR = 'leantime-plugins/AutomationApi';
const DEFAULT_SSH_PORT = 22;

function readEnv(name: string): string | undefined {
  // eslint-disable-next-line security/detect-object-injection -- name is selected from local static env var names in this deploy script
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`${name} is required for Leantime plugin deployment.`);
  }
  return value;
}

function assertSafeRemoteToken(value: string, label: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
  return value;
}

function assertSafeRemotePath(value: string, label: string): string {
  if (
    value.includes('\0') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.includes('..') ||
    value.includes(':') ||
    /\s/.test(value)
  ) {
    throw new Error(`${label} contains unsupported path characters.`);
  }

  if (!/^[A-Za-z0-9_./~-]+$/.test(value)) {
    throw new Error(`${label} contains unsupported path characters.`);
  }

  return value.replace(/\/+$/g, '');
}

function assertWithinCwd(value: string, label: string): string {
  const cwd = process.cwd();
  const resolved = path.resolve(cwd, value);
  return assertWithinBase(resolved, cwd, label);
}

function assertWithinBase(value: string, base: string, label: string): string {
  const resolved = path.resolve(value);
  const baseResolved = path.resolve(base);
  const relative = path.relative(baseResolved, resolved);

  if (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  ) {
    return resolved;
  }

  throw new Error(`${label} must resolve inside ${baseResolved}.`);
}

function parsePort(value: string | undefined): number {
  if (!value) return DEFAULT_SSH_PORT;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error('LEANTIME_DEPLOY_SSH_PORT must be a valid TCP port.');
  }

  return parsed;
}

function parseStrictHostKeyChecking(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;

  if (!['accept-new', 'no', 'yes'].includes(value)) {
    throw new Error(
      'LEANTIME_DEPLOY_STRICT_HOST_KEY_CHECKING must be yes, no, or accept-new.',
    );
  }

  return value;
}

export function resolveDeployConfig(): DeployConfig {
  const pluginName = assertSafeRemoteToken(
    readEnv('LEANTIME_PLUGIN_NAME') ?? DEFAULT_PLUGIN_NAME,
    'LEANTIME_PLUGIN_NAME',
  );
  const remoteRoot = assertSafeRemotePath(
    requireEnv('LEANTIME_DEPLOY_ROOT'),
    'LEANTIME_DEPLOY_ROOT',
  );

  return {
    backupRoot: assertSafeRemotePath(
      readEnv('LEANTIME_DEPLOY_BACKUP_ROOT') ??
        joinRemotePath(remoteRoot, 'storage', 'plugin-backups'),
      'LEANTIME_DEPLOY_BACKUP_ROOT',
    ),
    host: assertSafeRemoteToken(
      requireEnv('LEANTIME_DEPLOY_HOST'),
      'LEANTIME_DEPLOY_HOST',
    ),
    localManifestDir: assertWithinCwd(
      readEnv('LEANTIME_DEPLOY_MANIFEST_DIR') ?? DEFAULT_LOCAL_MANIFEST_DIR,
      'LEANTIME_DEPLOY_MANIFEST_DIR',
    ),
    pluginName,
    port: parsePort(readEnv('LEANTIME_DEPLOY_SSH_PORT')),
    remoteRoot,
    remoteStagingRoot: assertSafeRemotePath(
      readEnv('LEANTIME_DEPLOY_STAGING_ROOT') ??
        joinRemotePath(remoteRoot, 'storage', 'plugin-deploy-staging'),
      'LEANTIME_DEPLOY_STAGING_ROOT',
    ),
    sourceDir: assertWithinCwd(
      readEnv('LEANTIME_PLUGIN_SOURCE_DIR') ?? DEFAULT_SOURCE_DIR,
      'LEANTIME_PLUGIN_SOURCE_DIR',
    ),
    strictHostKeyChecking: parseStrictHostKeyChecking(
      readEnv('LEANTIME_DEPLOY_STRICT_HOST_KEY_CHECKING'),
    ),
    user: assertSafeRemoteToken(
      requireEnv('LEANTIME_DEPLOY_USER'),
      'LEANTIME_DEPLOY_USER',
    ),
  };
}

export function joinRemotePath(...parts: string[]): string {
  return parts
    .filter((part) => part !== '')
    .map((part, index) =>
      index === 0 ? part.replace(/\/+$/g, '') : part.replace(/^\/+|\/+$/g, ''),
    )
    .join('/');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function sshTarget(config: DeployConfig): string {
  return `${config.user}@${config.host}`;
}

function sshArgs(config: DeployConfig, command: string): string[] {
  const args = [
    '-p',
    String(config.port),
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
  ];

  if (config.strictHostKeyChecking) {
    args.push('-o', `StrictHostKeyChecking=${config.strictHostKeyChecking}`);
  }

  args.push(sshTarget(config), command);
  return args;
}

function scpArgs(
  config: DeployConfig,
  localPath: string,
  remotePath: string,
): string[] {
  return [
    '-P',
    String(config.port),
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    localPath,
    `${sshTarget(config)}:${remotePath}`,
  ];
}

async function runCommand(
  command: string,
  args: string[],
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const result = {
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdout: Buffer.concat(stdout).toString('utf8'),
      };

      if (code === 0) {
        resolve(result);
        return;
      }

      reject(
        new Error(
          `${command} exited with ${code ?? 'unknown'}: ${result.stderr.trim()}`,
        ),
      );
    });
  });
}

async function ssh(
  config: DeployConfig,
  command: string,
): Promise<CommandResult> {
  return runCommand('ssh', sshArgs(config, command));
}

async function scp(
  config: DeployConfig,
  localPath: string,
  remotePath: string,
): Promise<CommandResult> {
  return runCommand('scp', scpArgs(config, localPath, remotePath));
}

async function remoteSha256(
  config: DeployConfig,
  remotePath: string,
): Promise<string | undefined> {
  const quoted = shellQuote(remotePath);
  const result = await ssh(
    config,
    `if test -f ${quoted}; then sha256sum ${quoted} | awk '{print $1}'; fi`,
  );
  const hash = result.stdout.trim();
  return hash === '' ? undefined : hash;
}

async function remoteMkdir(
  config: DeployConfig,
  remotePath: string,
): Promise<void> {
  await ssh(config, `mkdir -p -- ${shellQuote(remotePath)}`);
}

async function remoteInstall(
  config: DeployConfig,
  source: string,
  target: string,
): Promise<void> {
  await ssh(
    config,
    [
      `mkdir -p -- ${shellQuote(remoteDirname(target))}`,
      `install -m 0644 -- ${shellQuote(source)} ${shellQuote(target)}`,
    ].join(' && '),
  );
}

async function remoteBackup(
  config: DeployConfig,
  source: string,
  target: string,
): Promise<void> {
  await ssh(
    config,
    [
      `mkdir -p -- ${shellQuote(remoteDirname(target))}`,
      `cp -p -- ${shellQuote(source)} ${shellQuote(target)}`,
    ].join(' && '),
  );
}

function remoteDirname(remotePath: string): string {
  const index = remotePath.lastIndexOf('/');
  return index === -1 ? '.' : remotePath.slice(0, index);
}

export async function sha256File(
  filePath: string,
  baseDir: string,
): Promise<string> {
  const safePath = assertWithinBase(filePath, baseDir, 'sha256 file path');

  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- safePath is confined with assertWithinBase at the sink
    const stream = createReadStream(safePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function listPluginFiles(
  sourceDir: string,
): Promise<PluginFile[]> {
  const files: PluginFile[] = [];
  const sourceRoot = path.resolve(sourceDir);

  async function visit(dir: string): Promise<void> {
    const safeDir = assertWithinBase(
      dir,
      sourceRoot,
      'plugin source directory',
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- safeDir is confined with assertWithinBase at the sink
    const entries = await readdir(safeDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = assertWithinBase(
        path.join(safeDir, entry.name),
        sourceRoot,
        'plugin source entry',
      );

      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path
        .relative(sourceRoot, absolute)
        .replaceAll(path.sep, '/');
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Plugin file escaped source directory: ${absolute}`);
      }

      const safeFile = assertWithinBase(absolute, sourceRoot, 'plugin file');
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- safeFile is confined with assertWithinBase at the sink
      const fileStat = await stat(safeFile);
      files.push({
        hash: await sha256File(safeFile, sourceRoot),
        localPath: safeFile,
        relativePath,
        size: fileStat.size,
      });
    }
  }

  await visit(sourceDir);
  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

function parseArgs(argv: string[]): { apply: boolean } {
  return {
    apply: argv.includes('--apply'),
  };
}

function timestamp(): string {
  return new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d{3}Z$/, 'Z');
}

async function writeManifest(
  config: DeployConfig,
  deploymentTimestamp: string,
  mode: 'apply' | 'plan',
  plans: FilePlan[],
): Promise<string> {
  const safeManifestDir = assertWithinBase(
    config.localManifestDir,
    process.cwd(),
    'manifest directory',
  );
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- safeManifestDir is confined to the workspace with assertWithinBase at the sink
  await mkdir(safeManifestDir, { recursive: true });
  const manifestPath = assertWithinBase(
    path.join(
      safeManifestDir,
      `${deploymentTimestamp}-${config.pluginName}-${mode}.json`,
    ),
    safeManifestDir,
    'manifest path',
  );
  const manifest = {
    backupRoot: config.backupRoot,
    files: plans,
    host: config.host,
    mode,
    pluginName: config.pluginName,
    remoteRoot: config.remoteRoot,
    timestamp: deploymentTimestamp,
    user: config.user,
  };

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- manifestPath is confined to the manifest directory with assertWithinBase at the sink
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return manifestPath;
}

async function buildPlan(
  config: DeployConfig,
  deploymentTimestamp: string,
  files: PluginFile[],
): Promise<FilePlan[]> {
  const plans: FilePlan[] = [];

  await ssh(
    config,
    `test -d ${shellQuote(config.remoteRoot)} && test -d ${shellQuote(
      joinRemotePath(config.remoteRoot, 'app'),
    )}`,
  );

  for (const file of files) {
    const remotePath = joinRemotePath(
      config.remoteRoot,
      'app',
      'Plugins',
      config.pluginName,
      file.relativePath,
    );
    const stagingPath = joinRemotePath(
      config.remoteStagingRoot,
      config.pluginName,
      deploymentTimestamp,
      file.relativePath,
    );
    const backupPath = joinRemotePath(
      config.backupRoot,
      config.pluginName,
      deploymentTimestamp,
      file.relativePath,
    );
    const remoteHash = await remoteSha256(config, remotePath);

    plans.push({
      action:
        remoteHash === undefined
          ? 'create'
          : remoteHash === file.hash
            ? 'skip-same'
            : 'overwrite',
      backupPath:
        remoteHash && remoteHash !== file.hash ? backupPath : undefined,
      localHash: file.hash,
      relativePath: file.relativePath,
      remoteHash,
      remotePath,
      size: file.size,
      stagingPath,
    });
  }

  return plans;
}

async function applyPlan(
  config: DeployConfig,
  plans: FilePlan[],
  files: PluginFile[],
): Promise<FilePlan[]> {
  const byRelativePath = new Map(
    files.map((file) => [file.relativePath, file]),
  );

  for (const plan of plans) {
    const file = byRelativePath.get(plan.relativePath);
    if (!file) {
      throw new Error(`Missing local file for ${plan.relativePath}.`);
    }

    await remoteMkdir(config, remoteDirname(plan.stagingPath));
    await scp(config, file.localPath, plan.stagingPath);
    const stagingHash = await remoteSha256(config, plan.stagingPath);
    plan.stagingHash = stagingHash;

    if (stagingHash !== plan.localHash) {
      throw new Error(`Staging hash mismatch for ${plan.relativePath}.`);
    }

    if (plan.action === 'skip-same') {
      continue;
    }

    if (plan.remoteHash && plan.backupPath) {
      await remoteBackup(config, plan.remotePath, plan.backupPath);
      const backupHash = await remoteSha256(config, plan.backupPath);
      plan.backupHash = backupHash;

      if (backupHash !== plan.remoteHash) {
        throw new Error(`Backup hash mismatch for ${plan.relativePath}.`);
      }
    }

    await remoteInstall(config, plan.stagingPath, plan.remotePath);
    const deployedHash = await remoteSha256(config, plan.remotePath);
    plan.deployedHash = deployedHash;

    if (deployedHash !== plan.localHash) {
      throw new Error(`Deployed hash mismatch for ${plan.relativePath}.`);
    }
  }

  return plans;
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  const config = resolveDeployConfig();
  const deploymentTimestamp = timestamp();
  const files = await listPluginFiles(config.sourceDir);
  const plans = await buildPlan(config, deploymentTimestamp, files);

  if (apply) {
    await applyPlan(config, plans, files);
  }

  const manifestPath = await writeManifest(
    config,
    deploymentTimestamp,
    apply ? 'apply' : 'plan',
    plans,
  );

  console.log(
    JSON.stringify(
      {
        actions: plans.reduce<Record<string, number>>((accumulator, plan) => {
          accumulator[plan.action] = (accumulator[plan.action] ?? 0) + 1;
          return accumulator;
        }, {}),
        files: plans.length,
        manifestPath,
        mode: apply ? 'apply' : 'plan',
        pluginName: config.pluginName,
        remoteRoot: config.remoteRoot,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1]?.endsWith('/deploy-plugin.ts')) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[leantime:plugin] ${message}`);
    process.exit(1);
  });
}
