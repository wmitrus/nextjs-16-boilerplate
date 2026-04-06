import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { env } from '@/core/env';

export interface LeantimeConfigInput {
  apiKey?: string;
  baseUrl?: string;
  defaultAuthorId?: number | string;
  defaultClientId?: number | string;
  defaultProjectId?: number | string;
  rpcPath?: string;
  timeoutMs?: number | string;
}

export interface LeantimeConfig {
  apiKey: string;
  baseUrl: string;
  defaultAuthorId?: number;
  defaultClientId?: number;
  defaultProjectId?: number;
  rpcUrl: string;
  timeoutMs: number;
}

export interface LeantimeRpcErrorShape {
  code?: number;
  data?: unknown;
  message?: string;
}

export interface LeantimeRpcResponse<TData> {
  error?: LeantimeRpcErrorShape;
  id?: number | string;
  jsonrpc?: string;
  result?: TData;
}

const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DEFAULT_RPC_PATH = 'api/jsonrpc';
const DEFAULT_TIMEOUT_MS = 30000;

export function parseCliFlag(argv: string[], name: string): string | undefined {
  const endOfOptionsIndex = argv.indexOf('--');
  const searchableArgv =
    endOfOptionsIndex === -1 ? argv : argv.slice(0, endOfOptionsIndex);
  const inlinePrefix = `--${name}=`;
  const inline = searchableArgv.find((arg) => arg.startsWith(inlinePrefix));

  if (inline) {
    return inline.slice(inlinePrefix.length).trim();
  }

  const index = searchableArgv.indexOf(`--${name}`);
  if (index === -1) return undefined;

  const value = searchableArgv[index + 1];
  if (typeof value !== 'string' || value.startsWith('--')) {
    return undefined;
  }

  return value.trim();
}

export function parseOutputFormat(argv: string[]): 'json' | 'table' {
  return parseCliFlag(argv, 'format') === 'json' ? 'json' : 'table';
}

export function parsePositionalArgs(argv: string[]): string[] {
  const positional: string[] = [];
  const flagsWithValues = new Set([
    '--account',
    '--author',
    '--client',
    '--format',
    '--input',
    '--input-file',
    '--method',
    '--project',
  ]);

  let skipNext = false;
  let reachedEndOfOptions = false;

  for (const current of argv.slice(2)) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (reachedEndOfOptions) {
      positional.push(current);
      continue;
    }

    if (current === '--') {
      reachedEndOfOptions = true;
      continue;
    }

    if (flagsWithValues.has(current)) {
      skipNext = true;
      continue;
    }

    if (
      current.startsWith('--account=') ||
      current.startsWith('--author=') ||
      current.startsWith('--client=') ||
      current.startsWith('--format=') ||
      current.startsWith('--input=') ||
      current.startsWith('--input-file=') ||
      current.startsWith('--method=') ||
      current.startsWith('--project=')
    ) {
      continue;
    }

    positional.push(current);
  }

  return positional;
}

function parseOptionalPositiveInt(
  value: number | string | undefined,
): number | undefined {
  if (value === undefined || value === '') return undefined;

  const numeric =
    typeof value === 'number' ? value : Number.parseInt(value.trim(), 10);

  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`Expected a positive integer, received "${value}".`);
  }

  return numeric;
}

function validateBaseUrl(baseUrl: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('LEANTIME_URL must be a valid absolute URL.');
  }

  const isLocalHttp =
    parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname);

  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    throw new Error(
      'LEANTIME_URL must use https unless you are targeting localhost for development.',
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      'LEANTIME_URL must not embed username or password credentials.',
    );
  }

  return parsed;
}

function resolveRpcUrl(baseUrl: URL, rpcPath: string): string {
  const trimmedRpcPath = rpcPath.trim();

  if (!trimmedRpcPath) {
    throw new Error('LEANTIME_RPC_PATH must not be empty.');
  }

  if (/^https?:\/\//i.test(trimmedRpcPath)) {
    return validateBaseUrl(trimmedRpcPath).toString();
  }

  if (trimmedRpcPath.startsWith('/')) {
    return new URL(trimmedRpcPath, baseUrl.origin).toString();
  }

  const normalizedBase = new URL(baseUrl.toString());
  if (!normalizedBase.pathname.endsWith('/')) {
    normalizedBase.pathname = `${normalizedBase.pathname}/`;
  }

  return new URL(trimmedRpcPath, normalizedBase).toString();
}

export function resolveLeantimeConfig(
  input: LeantimeConfigInput,
): LeantimeConfig {
  const baseUrl = input.baseUrl?.trim();

  if (!baseUrl) {
    throw new Error(
      'LEANTIME_URL is required for Leantime automation scripts.',
    );
  }

  const parsedBaseUrl = validateBaseUrl(baseUrl);
  const apiKey = input.apiKey?.trim();

  if (!apiKey) {
    throw new Error(
      'LEANTIME_API_KEY is required. Create one in Leantime Company Settings.',
    );
  }

  const timeoutMs =
    typeof input.timeoutMs === 'number'
      ? input.timeoutMs
      : Number.parseInt(input.timeoutMs?.trim() ?? '', 10) ||
        DEFAULT_TIMEOUT_MS;

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('LEANTIME_API_TIMEOUT_MS must be a positive integer.');
  }

  const rpcUrl = resolveRpcUrl(
    parsedBaseUrl,
    input.rpcPath?.trim() || DEFAULT_RPC_PATH,
  );

  return {
    apiKey,
    baseUrl: parsedBaseUrl.toString(),
    defaultAuthorId: parseOptionalPositiveInt(input.defaultAuthorId),
    defaultClientId: parseOptionalPositiveInt(input.defaultClientId),
    defaultProjectId: parseOptionalPositiveInt(input.defaultProjectId),
    rpcUrl,
    timeoutMs,
  };
}

export function getLeantimeConfig(argv: string[]): LeantimeConfig {
  return resolveLeantimeConfig({
    apiKey: env.LEANTIME_API_KEY,
    baseUrl: env.LEANTIME_URL,
    defaultAuthorId:
      parseCliFlag(argv, 'author') ?? env.LEANTIME_DEFAULT_AUTHOR_ID,
    defaultClientId:
      parseCliFlag(argv, 'client') ?? env.LEANTIME_DEFAULT_CLIENT_ID,
    defaultProjectId:
      parseCliFlag(argv, 'project') ?? env.LEANTIME_DEFAULT_PROJECT_ID,
    rpcPath: env.LEANTIME_RPC_PATH,
    timeoutMs: env.LEANTIME_API_TIMEOUT_MS,
  });
}

function readInputFile(filePath: string): string {
  const resolvedPath = isAbsolute(filePath)
    ? filePath
    : resolve(process.cwd(), filePath);
  // resolvedPath is normalized from CLI input and used only after verifying the
  // target exists and is a regular file.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const stats = statSync(resolvedPath);

  if (!stats.isFile()) {
    throw new Error(`Input path "${filePath}" must point to a file.`);
  }

  // resolvedPath is normalized and checked as an existing regular file above.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return readFileSync(resolvedPath, 'utf8');
}

export function readStructuredInput(argv: string[]): unknown {
  const inlineInput = parseCliFlag(argv, 'input');
  const inputFile = parseCliFlag(argv, 'input-file');

  if (inlineInput && inputFile) {
    throw new Error('Use either --input or --input-file, not both.');
  }

  if (!inlineInput && !inputFile) {
    return {};
  }

  const payload = inlineInput ?? readInputFile(inputFile!);

  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON input: ${formatError(error)}. ` +
        'Pass valid JSON via --input or --input-file.',
    );
  }
}

export function asRecord(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

export async function runLeantimeRpc<TData>(
  config: LeantimeConfig,
  method: string,
  params: unknown,
  id: number | string = 1,
): Promise<TData> {
  const response = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
    },
    body: JSON.stringify({
      id,
      jsonrpc: '2.0',
      method,
      params,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  }).catch((error: unknown) => {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      throw new Error(
        `Leantime request timed out after ${config.timeoutMs}ms for ${method}.`,
      );
    }

    throw error;
  });

  const payload = (await response.json()) as LeantimeRpcResponse<TData>;

  if (!response.ok) {
    throw new Error(
      `Leantime request failed with HTTP ${response.status} for ${method}.`,
    );
  }

  if (payload.error) {
    throw new Error(
      `Leantime RPC error ${payload.error.code ?? 'unknown'} for ${method}: ${
        payload.error.message ?? 'Unknown error'
      }`,
    );
  }

  return payload.result as TData;
}

export function printValue(value: unknown, format: 'json' | 'table'): void {
  if (format === 'json') {
    process.stdout.write(JSON.stringify(value, null, 2) + '\n');
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      console.log('No rows returned.');
      return;
    }

    if (value.every((row) => row !== null && typeof row === 'object')) {
      console.table(value);
      return;
    }

    console.log(value);
    return;
  }

  if (value !== null && typeof value === 'object') {
    console.table([value]);
    return;
  }

  console.log(value);
}

export function withDefaultEntityIds(
  input: Record<string, unknown>,
  config: LeantimeConfig,
): Record<string, unknown> {
  const next = { ...input };

  if (next.projectId === undefined && config.defaultProjectId !== undefined) {
    next.projectId = config.defaultProjectId;
  }

  if (next.author === undefined && config.defaultAuthorId !== undefined) {
    next.author = config.defaultAuthorId;
  }

  if (next.authorId === undefined && config.defaultAuthorId !== undefined) {
    next.authorId = config.defaultAuthorId;
  }

  if (next.clientId === undefined && config.defaultClientId !== undefined) {
    next.clientId = config.defaultClientId;
  }

  return next;
}
