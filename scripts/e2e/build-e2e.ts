import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertE2EServerIsolatedFromProductionServices,
  E2E_BUILD_ORIGIN_FILE,
  e2eIsolatedEnv,
  findProductionTargetsInBuild,
  resolveE2EBaseURL,
  type ServerEnv,
} from '../../e2e/production-service-guard';

/**
 * OZI-219 — the only supported way to build the app for E2E (`pnpm e2e:build`).
 * `next build` inlines NEXT_PUBLIC_* and loads `.env.production*`, so a plain
 * `pnpm build` on a workstation bakes production Sentry / app URL into the
 * bundle. Here the build runs with the isolated E2E env (outbound-service
 * keys empty, NEXT_PUBLIC_APP_URL = the loopback E2E base URL):
 *
 * 1. BLOCKED before the build unless `@next/env` proves that env isolated;
 * 2. BLOCKED after the build if the artifacts still inline a Sentry DSN or a
 *    non-loopback app URL (independent second layer; `next start` repeats it);
 * 3. a verified build is marked with its origin, which `next start` must match.
 */
export function runE2EBuild(
  baseEnv: ServerEnv = process.env,
  dir: string = process.cwd(),
  spawn: typeof spawnSync = spawnSync,
): void {
  const env = e2eIsolatedEnv(baseEnv, resolveE2EBaseURL(baseEnv));
  assertE2EServerIsolatedFromProductionServices(env, {
    dir,
    serveBuild: false,
  });

  const result = spawn('pnpm', ['exec', 'next', 'build'], {
    cwd: dir,
    env: env as NodeJS.ProcessEnv,
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw new Error(`[e2e-build] next build failed (exit ${result.status}).`);

  const inlined = findProductionTargetsInBuild(dir);
  if (inlined.length > 0)
    throw new Error(
      `[e2e-build] BLOCKED: the E2E build still inlines a production target (${inlined.length} file(s), e.g. ${inlined[0]}).`,
    );

  // Only a verified build is marked; `next start` refuses any other origin.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed relative path under <dir>/.next
  fs.writeFileSync(
    path.resolve(dir, E2E_BUILD_ORIGIN_FILE),
    env.NEXT_PUBLIC_APP_URL,
  );
}

if (process.argv[1]?.endsWith('/scripts/e2e/build-e2e.ts')) {
  try {
    runE2EBuild();
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
