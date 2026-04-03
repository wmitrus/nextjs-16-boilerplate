import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Side-effect module: loads .env and .env.local into process.env before T3-Env initializes.
 * Import this BEFORE importing @/core/env in scripts that run outside Next.js dev/build context.
 *
 * Rules:
 * - Existing process.env values are NOT overwritten (CI/Vercel-injected values take precedence).
 * - Quotes are stripped from values.
 * - Comment lines (#) and blank lines are ignored.
 */

const ROOT = process.cwd();

export const loadedFiles: string[] = [];

function applyEnvFile(filePath: string): void {
  // filePath is always join(process.cwd(), '<static-literal>') — not user input.
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

applyEnvFile(join(ROOT, '.env'));
applyEnvFile(join(ROOT, '.env.local'));
