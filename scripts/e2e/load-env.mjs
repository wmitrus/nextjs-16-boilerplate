import fs from 'node:fs';
import path from 'node:path';

export const SCENARIO_NAMES = ['single', 'personal', 'org-provider', 'org-db'];

export const VARIANT_NAMES = [
  'single-missing-default-tenant',
  'single-linking-disabled',
  'single-free-tier-low',
];

const ROOT_DIR = process.cwd();
const ENV_DIR = path.resolve(ROOT_DIR, 'scripts/e2e/env');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

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

    env[key] = value;
  }

  return env;
}

function loadFileIfExists(filePath) {
  return parseEnvFile(filePath);
}

export function getScenarioEnvPath(scenario) {
  return path.join(ENV_DIR, `${scenario}.env`);
}

export function getVariantEnvPath(variant) {
  return path.join(ENV_DIR, `${variant}.env`);
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
  for (const [key, value] of Object.entries(envMap)) {
    if (value !== undefined) {
      target[key] = value;
    }
  }

  return target;
}

export function resolveScenarioDatabaseUrl({ scenario, variant } = {}) {
  const suffix = [scenario, variant].filter(Boolean).join('-');
  return `file:./data/e2e/${suffix || 'default'}`;
}

export function resolveScenarioDatabasePath({ scenario, variant } = {}) {
  const databaseUrl = resolveScenarioDatabaseUrl({ scenario, variant });
  return path.resolve(ROOT_DIR, databaseUrl.replace(/^file:\.?\/?/, ''));
}
