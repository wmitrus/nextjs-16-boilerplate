import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseEnv } from 'node:util';

import {
  assertPathWithinBase,
  pathExistsWithinBase,
  readTextFileWithinBase,
} from '../scripts/lib/fs-guards-shared';

/**
 * OZI-219 — local E2E must never reach real outbound services. `next start`
 * loads `.env.production*`, `next dev` loads `.env.local`, and both may hold
 * real Sentry / Upstash / log-shipping / e-mail credentials. Every E2E web
 * server therefore gets these keys pinned EMPTY: `@next/env` never overrides
 * a key already present in the process env (empty included), and `env.ts`
 * reads empty as unset (EMAIL_PROVIDER then defaults to `none`). The guard
 * then proves it, fail-closed:
 *
 * 1. the env `next dev` AND `next start` would really see -- computed by
 *    Next's own `@next/env` in a child process -- has none of these keys set,
 *    and its NEXT_PUBLIC_APP_URL (the edge logger's `/api/logs` target) is
 *    loopback or unset;
 * 2. a production build that `next start` would serve as built inlines
 *    neither a Sentry DSN nor a non-loopback NEXT_PUBLIC_APP_URL taken from
 *    the env files (on 2026-10-28 such a build forwarded local edge logs to
 *    Production `/api/logs`, i.e. Production Upstash and Logflare).
 *
 * Only key and file names are ever reported, never values.
 */
export const PRODUCTION_SERVICE_ENV_KEYS: readonly string[] = [
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'LOGFLARE_API_KEY',
  'LOGFLARE_SOURCE_TOKEN',
  'LOGFLARE_SOURCE_NAME',
  'BETTER_STACK_SOURCE_TOKEN',
  'NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN',
  'BETTER_STACK_INGESTING_URL',
  'NEXT_PUBLIC_BETTER_STACK_INGESTING_URL',
  'EMAIL_PROVIDER',
  'RESEND_API_KEY',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

export type ServerEnv = Readonly<Record<string, string | undefined>>;

export const E2E_DEFAULT_BASE_URL = 'http://localhost:3100';

/**
 * The isolated env for an E2E web server or E2E build: every outbound-service
 * key pinned empty and NEXT_PUBLIC_APP_URL pinned to the local base URL (so
 * the edge logger keeps working against the local server). A non-loopback
 * base URL is refused.
 */
export function e2eIsolatedEnv(
  baseEnv: ServerEnv,
  baseURL: string,
): Record<string, string> {
  if (!isLoopbackUrl(baseURL))
    throw new Error(
      '[e2e-guard] BLOCKED: the E2E base URL must be loopback (localhost, 127.0.0.1, [::1]).',
    );
  const defined = Object.entries(baseEnv).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return {
    ...Object.fromEntries(defined),
    ...PRODUCTION_SERVICE_ENV_OVERRIDES,
    NEXT_PUBLIC_APP_URL: new URL(baseURL).origin,
  };
}

/** Env files Next.js may load for `next dev` / `next start`. */
const NEXT_ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
];

export const PRODUCTION_SERVICE_ENV_OVERRIDES: Readonly<
  Record<string, string>
> = Object.fromEntries(PRODUCTION_SERVICE_ENV_KEYS.map((key) => [key, '']));

/** A Sentry DSN: https://<32-hex public key>@<host>/<project id>. */
const SENTRY_DSN_PATTERN = /https?:\/\/[0-9a-f]{32}@[^/"'`\s]+\/\d+/i;

const PROBE = `
const [nextEnvPath, keysJson] = process.argv.slice(1);
const { loadEnvConfig } = require(nextEnvPath);
const silent = { info() {}, error() {} };
const keys = JSON.parse(keysJson);
const leaked = [];
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const isLoopback = (v) => { try { return LOOPBACK.has(new URL(v).hostname); } catch { return false; } };
for (const dev of [true, false]) {
  const mode = dev ? 'next dev: ' : 'next start: ';
  // forceReload: always read the files, even under a pre-set __NEXT_PROCESSED_ENV.
  const { combinedEnv } = loadEnvConfig(process.cwd(), dev, silent, true);
  for (const key of keys) if (combinedEnv[key]) leaked.push(mode + key);
  const appUrl = combinedEnv.NEXT_PUBLIC_APP_URL;
  if (appUrl && !isLoopback(appUrl)) leaked.push(mode + 'NEXT_PUBLIC_APP_URL (non-loopback)');
}
process.stdout.write(JSON.stringify(leaked));
`;

/** Next.js's own env loader, resolved through this project's `next`. */
function resolveNextEnv(): string {
  const fromProject = createRequire(path.resolve('package.json'));
  return createRequire(fromProject.resolve('next/package.json')).resolve(
    '@next/env',
  );
}

/** Leaked key names (prefixed by server mode) for a web server env. */
export function findLeakedProductionServiceEnv(
  serverEnv: ServerEnv,
  dir: string,
): string[] {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      PROBE,
      resolveNextEnv(),
      JSON.stringify(PRODUCTION_SERVICE_ENV_KEYS),
    ],
    { cwd: dir, env: { ...serverEnv } as NodeJS.ProcessEnv, encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(
      '[e2e-guard] BLOCKED: cannot compute the web server env with @next/env.',
    );
  return JSON.parse(result.stdout) as string[];
}

/** Non-loopback NEXT_PUBLIC_APP_URL values written in the project's env files. */
function nonLoopbackAppUrlsInEnvFiles(dir: string): string[] {
  const urls = new Set<string>();
  for (const name of NEXT_ENV_FILES) {
    const file = path.resolve(dir, name);
    if (!pathExistsWithinBase(file, dir, 'env file')) continue;
    const value = parseEnv(readTextFileWithinBase(file, dir, 'env file'))
      .NEXT_PUBLIC_APP_URL?.trim()
      .replace(/\/+$/, '');
    if (value && !isLoopbackUrl(value)) urls.add(value);
  }
  return [...urls];
}

/**
 * Build files (relative to `dir`, under `.next/static` and `.next/server`)
 * that inline a Sentry DSN or a non-loopback app URL from the env files.
 */
export function findProductionTargetsInBuild(dir: string): string[] {
  const appUrls = nonLoopbackAppUrlsInEnvFiles(dir);
  const hits: string[] = [];
  for (const sub of ['static', 'server']) {
    const root = assertPathWithinBase(
      path.resolve(dir, '.next', sub),
      dir,
      'Next.js build output',
    );
    if (!pathExistsWithinBase(root, dir, 'Next.js build output')) continue;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- confined to <dir>/.next/<sub> by assertPathWithinBase above
    for (const entry of fs.readdirSync(path.resolve(root), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      const file = path.resolve(entry.parentPath, entry.name);
      const text = readTextFileWithinBase(file, root, 'Next.js build chunk');
      if (
        SENTRY_DSN_PATTERN.test(text) ||
        appUrls.some((url) => text.includes(url))
      )
        hits.push(path.relative(dir, file));
    }
  }
  return hits;
}

/** Throws unless the E2E web server is isolated from production services. */
export function assertE2EServerIsolatedFromProductionServices(
  serverEnv: ServerEnv,
  { dir, serveBuild }: { readonly dir: string; readonly serveBuild: boolean },
): void {
  const leaked = findLeakedProductionServiceEnv(serverEnv, dir);
  if (leaked.length > 0)
    throw new Error(
      `[e2e-guard] BLOCKED: the E2E web server would load production service credentials (${leaked.join(', ')}).`,
    );
  if (!serveBuild) return;
  const inlined = findProductionTargetsInBuild(dir);
  if (inlined.length > 0)
    throw new Error(
      `[e2e-guard] BLOCKED: the build served by \`next start\` inlines a Sentry DSN or a non-loopback NEXT_PUBLIC_APP_URL (${inlined.length} file(s), e.g. ${inlined[0]}). ` +
        'Rebuild it with the E2E env (empty service keys, loopback NEXT_PUBLIC_APP_URL) before running E2E.',
    );
}
