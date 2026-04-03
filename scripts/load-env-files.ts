import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Side-effect module: loads .env, .env.local, and Vercel-pulled env files into
 * process.env before T3-Env initializes. Import this BEFORE importing @/core/env
 * in scripts that run outside the Next.js dev/build context.
 *
 * Load order (last-write wins for duplicates is irrelevant — existing keys are NOT
 * overwritten, so earlier files take precedence):
 *   1. .env                          — base defaults
 *   2. .env.local                    — local developer overrides
 *   3. .vercel/.env.{APP_ENV}.local  — downloaded by `vercel pull` in CI
 *
 * Rules:
 * - Existing process.env values are NOT overwritten (CI/Vercel-injected values take precedence).
 * - Quotes are stripped from values.
 * - Comment lines (#) and blank lines are ignored.
 */

const ROOT = process.cwd();

export const loadedFiles: string[] = [];

function applyEnvFile(filePath: string): void {
  // filePath is always resolve(process.cwd(), '<static-literal or safe env-derived path>').
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!existsSync(filePath)) return;

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const rawVal = line.slice(eqIdx + 1);
    const val = rawVal.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');

    if (key && !(key in process.env)) {
      // eslint-disable-next-line security/detect-object-injection -- key is parsed from a local env file on disk, not from user/request input
      process.env[key] = val;
    }
  }

  loadedFiles.push(filePath.replace(ROOT, '.'));
}

// 1. Base defaults
applyEnvFile(resolve(ROOT, '.env'));

// 2. Local developer overrides
applyEnvFile(resolve(ROOT, '.env.local'));

// 3. Vercel-pulled env file — created by `vercel pull --environment={env}` in CI.
//    APP_ENV is set by the GitHub Actions workflows (preview-deploy.yml, prod-deploy.yml).
//    VERCEL_ENV is set by the Vercel runtime itself during builds.
const vercelEnv = process.env.APP_ENV ?? process.env.VERCEL_ENV;
if (vercelEnv === 'preview' || vercelEnv === 'production') {
  applyEnvFile(resolve(ROOT, `.vercel/.env.${vercelEnv}.local`));
}
