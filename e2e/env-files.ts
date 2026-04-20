import path from 'node:path';

import {
  pathExistsWithinBase,
  readTextFileWithinBase,
} from '../scripts/lib/fs-guards-shared';

const PROJECT_ROOT = process.cwd();
const ENV_VAR_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export function resolveProjectPath(...segments: string[]): string {
  return path.resolve(PROJECT_ROOT, ...segments);
}

export function readProjectTextFileIfExists(
  filePath: string,
  label = 'path',
): string | undefined {
  if (!pathExistsWithinBase(filePath, PROJECT_ROOT, label)) {
    return undefined;
  }

  return readTextFileWithinBase(filePath, PROJECT_ROOT, label);
}

function parseEnvContent(content: string): Map<string, string> {
  const env = new Map<string, string>();

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!ENV_VAR_KEY_PATTERN.test(key)) {
      continue;
    }

    const value = line.slice(equalsIndex + 1).trim();
    env.set(key, value.replace(/^['"]|['"]$/g, ''));
  }

  return env;
}

export function readEnvFileMap(
  filePath: string,
  label = 'env file',
): Map<string, string> {
  const content = readProjectTextFileIfExists(filePath, label);
  if (!content) {
    return new Map<string, string>();
  }

  return parseEnvContent(content);
}

export function readEnvFileRecord(
  filePath: string,
  label = 'env file',
): Record<string, string> {
  return Object.fromEntries(readEnvFileMap(filePath, label));
}
