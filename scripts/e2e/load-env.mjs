import fs from 'node:fs';
import path from 'node:path';

export const SCENARIO_NAMES = ['single', 'personal', 'org-provider', 'org-db'];
export const E2E_BACKEND_MODES = ['pglite', 'container'];

function assertPathWithinBase(resolvedPath, baseDir) {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(resolvedPath);
  const expectedPrefix = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;
  if (
    normalizedPath !== normalizedBase &&
    !normalizedPath.startsWith(expectedPrefix)
  ) {
    throw new Error(
      `Security: file path escapes the allowed directory.\n` +
        `  Allowed base : ${normalizedBase}\n` +
        `  Resolved path: ${normalizedPath}\n`,
    );
  }
}

export const VARIANT_NAMES = [
  'single-missing-default-tenant',
  'single-linking-disabled',
  'single-free-tier-low',
];

const ROOT_DIR = process.cwd();
const ENV_DIR = path.resolve(ROOT_DIR, 'scripts/e2e/env');

function parseEnvFile(filePath) {
  assertPathWithinBase(filePath, ROOT_DIR);
  const resolvedFilePath = path.resolve(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(path.resolve(resolvedFilePath))) {
    return {};
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const content = fs.readFileSync(path.resolve(resolvedFilePath), 'utf8');
  const entries = [];

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
    const value = line
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    entries.push([key, value]);
  }

  return Object.fromEntries(entries);
}

function loadFileIfExists(filePath) {
  return parseEnvFile(filePath);
}

export function getScenarioEnvPath(scenario) {
  const filePath = path.join(ENV_DIR, `${scenario}.env`);
  assertPathWithinBase(filePath, ENV_DIR);
  return filePath;
}

export function getVariantEnvPath(variant) {
  const filePath = path.join(ENV_DIR, `${variant}.env`);
  assertPathWithinBase(filePath, ENV_DIR);
  return filePath;
}

export function loadScenarioEnv({
  scenario,
  variant,
  includeLocal = true,
} = {}) {
  const merged = {};

  Object.assign(merged, loadFileIfExists(path.resolve(ROOT_DIR, '.env.local')));
  Object.assign(merged, loadFileIfExists(path.resolve(ROOT_DIR, '.env.e2e')));
  Object.assign(merged, loadFileIfExists(path.join(ENV_DIR, 'base.env')));

  if (scenario) {
    Object.assign(merged, loadFileIfExists(getScenarioEnvPath(scenario)));
  }

  if (variant) {
    Object.assign(merged, loadFileIfExists(getVariantEnvPath(variant)));
  }

  if (includeLocal) {
    Object.assign(
      merged,
      loadFileIfExists(path.resolve(ROOT_DIR, '.env.e2e.local')),
    );
  }

  return merged;
}

export function applyEnv(envMap, target = process.env) {
  const pendingEntries = [];

  for (const [key, value] of Object.entries(envMap)) {
    if (value !== undefined) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      pendingEntries.push([key, value]);
    }
  }

  Object.assign(target, Object.fromEntries(pendingEntries));

  return target;
}

export function resolveE2EBackendMode(source = process.env) {
  const rawMode = source.E2E_BACKEND_MODE?.trim() || 'pglite';

  if (!E2E_BACKEND_MODES.includes(rawMode)) {
    throw new Error(
      `Unsupported E2E_BACKEND_MODE="${rawMode}". Expected one of: ${E2E_BACKEND_MODES.join(', ')}`,
    );
  }

  return rawMode;
}

export function resolveScenarioDatabaseUrl({ scenario, variant } = {}) {
  const suffix = [scenario, variant].filter(Boolean).join('-');
  return `file:./data/e2e/${suffix || 'default'}`;
}

export function resolveScenarioDatabasePath({ scenario, variant } = {}) {
  const databaseUrl = resolveScenarioDatabaseUrl({ scenario, variant });
  const resolvedPath = path.resolve(
    ROOT_DIR,
    databaseUrl.replace(/^file:\.?\/?/, ''),
  );
  assertPathWithinBase(resolvedPath, path.resolve(ROOT_DIR, 'data/e2e'));
  return resolvedPath;
}
