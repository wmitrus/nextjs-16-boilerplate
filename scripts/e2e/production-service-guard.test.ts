/** @vitest-environment node */
/* eslint-disable security/detect-non-literal-fs-filename -- tests create isolated temporary fixture trees. */
import type { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertE2EServerIsolatedFromProductionServices,
  E2E_BUILD_ORIGIN_FILE,
  findLeakedProductionServiceEnv,
  PRODUCTION_SERVICE_ENV_OVERRIDES,
} from '../../e2e/production-service-guard';

import { runE2EBuild } from './build-e2e';

/**
 * OZI-219 — local E2E never reaches production Sentry / Upstash. The fixture
 * project carries fake "production" credentials in the files `next start` and
 * `next dev` load; the guard must see them through Next's own `@next/env`.
 */
const FAKE_DSN = `https://${'a'.repeat(32)}@o1.ingest.sentry.io/42`;
const FAKE_TOKEN = 'fake-upstash-token-value';
const dirs: string[] = [];

function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-guard-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

const productionProfile = {
  '.env.production.local': `SENTRY_DSN=${FAKE_DSN}\nUPSTASH_REDIS_REST_URL=https://prod.upstash.io\nUPSTASH_REDIS_REST_TOKEN=${FAKE_TOKEN}\n`,
  '.env.local': `NEXT_PUBLIC_SENTRY_DSN=${FAKE_DSN}\n`,
};
const baseEnv = { PATH: process.env.PATH ?? '' };

// Config imports would otherwise serve (and so verify) the repo's own `.next`
// whenever the unit suite itself runs with CI=true.
beforeEach(() => {
  vi.stubEnv('CI', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0))
    fs.rmSync(path.resolve(dir), { recursive: true });
});

describe('E2E production-service guard', () => {
  it('sees the credentials next start / next dev would load from env files', () => {
    const dir = project(productionProfile);

    expect(findLeakedProductionServiceEnv(baseEnv, dir)).toEqual(
      expect.arrayContaining([
        'next dev: NEXT_PUBLIC_SENTRY_DSN',
        'next start: SENTRY_DSN',
        'next start: UPSTASH_REDIS_REST_URL',
        'next start: UPSTASH_REDIS_REST_TOKEN',
      ]),
    );
  });

  it('blocks a server without the pinned overrides and never prints a value', () => {
    const dir = project(productionProfile);

    let message = '';
    try {
      assertE2EServerIsolatedFromProductionServices(baseEnv, {
        dir,
        serveBuild: false,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^\[e2e-guard\] BLOCKED: .*SENTRY_DSN/);
    expect(message).not.toContain(FAKE_DSN);
    expect(message).not.toContain(FAKE_TOKEN);
  });

  it('pinned empty overrides win over every env file, in both modes', () => {
    const dir = project(productionProfile);

    expect(() =>
      assertE2EServerIsolatedFromProductionServices(
        { ...baseEnv, ...PRODUCTION_SERVICE_ENV_OVERRIDES },
        { dir, serveBuild: false },
      ),
    ).not.toThrow();
  });

  it('blocks a credential inherited from the shell', () => {
    const dir = project({});

    expect(() =>
      assertE2EServerIsolatedFromProductionServices(
        { ...baseEnv, UPSTASH_REDIS_REST_TOKEN: FAKE_TOKEN },
        { dir, serveBuild: false },
      ),
    ).toThrow(/BLOCKED: .*UPSTASH_REDIS_REST_TOKEN/);
  });

  it('a pre-set __NEXT_PROCESSED_ENV cannot hide the env files', () => {
    const dir = project(productionProfile);

    expect(
      findLeakedProductionServiceEnv(
        { ...baseEnv, __NEXT_PROCESSED_ENV: 'true' },
        dir,
      ),
    ).toContain('next start: SENTRY_DSN');
  });

  it('blocks next start on a build that inlined a Sentry DSN into the browser bundle', () => {
    const dir = project({
      '.next/static/chunks/app.js': `init({dsn:"${FAKE_DSN}"})`,
    });
    const env = { ...baseEnv, ...PRODUCTION_SERVICE_ENV_OVERRIDES };

    expect(() =>
      assertE2EServerIsolatedFromProductionServices(env, {
        dir,
        serveBuild: true,
      }),
    ).toThrow(/inlines a Sentry DSN.*\.next\/static\/chunks\/app\.js/);
    // next dev compiles from the pinned env; an old build is not served.
    expect(() =>
      assertE2EServerIsolatedFromProductionServices(env, {
        dir,
        serveBuild: false,
      }),
    ).not.toThrow();
  });

  const LOCAL = 'http://localhost:3100';
  const localEnv = {
    ...baseEnv,
    ...PRODUCTION_SERVICE_ENV_OVERRIDES,
    NEXT_PUBLIC_APP_URL: LOCAL,
  };

  it('accepts a clean build made by e2e:build for this origin', () => {
    const dir = project({
      '.next/static/chunks/app.js': 'init({dsn:undefined})',
      [E2E_BUILD_ORIGIN_FILE]: `${LOCAL}`,
    });

    expect(() =>
      assertE2EServerIsolatedFromProductionServices(localEnv, {
        dir,
        serveBuild: true,
      }),
    ).not.toThrow();
  });

  it('blocks next start on a clean build not made by e2e:build', () => {
    const dir = project({
      '.next/static/chunks/app.js': 'init({dsn:undefined})',
    });

    expect(() =>
      assertE2EServerIsolatedFromProductionServices(localEnv, {
        dir,
        serveBuild: true,
      }),
    ).toThrow(/BLOCKED: .*not made by `pnpm e2e:build`/);
  });

  it('blocks next start on a build made for another loopback origin (port or host)', () => {
    for (const builtFor of ['http://localhost:3200', 'http://127.0.0.1:3100']) {
      const dir = project({ [E2E_BUILD_ORIGIN_FILE]: builtFor });

      expect(() =>
        assertE2EServerIsolatedFromProductionServices(localEnv, {
          dir,
          serveBuild: true,
        }),
      ).toThrow(/for this E2E base URL \(http:\/\/localhost:3100\)/);
    }
  });
});

describe('playwright.config wiring (OZI-219)', () => {
  it('pins every production-service key empty and never reuses an unverified server', async () => {
    const { default: config } = await import('../../playwright.config');
    const webServer = config.webServer as {
      env: Record<string, string>;
      reuseExistingServer: boolean;
    };

    expect(webServer.reuseExistingServer).toBe(false);
    expect(webServer.env).toMatchObject(PRODUCTION_SERVICE_ENV_OVERRIDES);
  });
});

describe('playwright.vscode.config wiring (OZI-219)', () => {
  it('pins every production-service key empty and never reuses an unverified server', async () => {
    const { default: config } = await import('../../playwright.vscode.config');
    const webServer = config.webServer as {
      env: Record<string, string>;
      reuseExistingServer: boolean;
    };

    expect(webServer.reuseExistingServer).toBe(false);
    expect(webServer.env).toMatchObject(PRODUCTION_SERVICE_ENV_OVERRIDES);
  });
});

describe('log-shipping, e-mail and app-URL vectors (OZI-219)', () => {
  const PROD_APP_URL = 'https://prod-app.example.com';
  const env = { ...baseEnv, ...PRODUCTION_SERVICE_ENV_OVERRIDES };

  it('blocks New Relic server and browser agent activation from the env files', () => {
    const dir = project({
      '.env.local': `NEW_RELIC_ENABLED=true\nNEW_RELIC_LICENSE_KEY=${FAKE_TOKEN}\nNEW_RELIC_BROWSER_ENABLED=true\nNEW_RELIC_BROWSER_LICENSE_KEY=${FAKE_TOKEN}\n`,
      '.env.production.local': `NEW_RELIC_LICENSE_KEY=${FAKE_TOKEN}\n`,
    });

    expect(findLeakedProductionServiceEnv(baseEnv, dir)).toEqual(
      expect.arrayContaining([
        'next dev: NEW_RELIC_ENABLED',
        'next dev: NEW_RELIC_LICENSE_KEY',
        'next dev: NEW_RELIC_BROWSER_ENABLED',
        'next dev: NEW_RELIC_BROWSER_LICENSE_KEY',
        'next start: NEW_RELIC_LICENSE_KEY',
      ]),
    );
    expect(() =>
      assertE2EServerIsolatedFromProductionServices(env, {
        dir,
        serveBuild: false,
      }),
    ).not.toThrow();
  });

  it('blocks log-shipping and e-mail credentials from the env files', () => {
    const dir = project({
      '.env.local': `LOGFLARE_API_KEY=${FAKE_TOKEN}\nEMAIL_PROVIDER=smtp\nSMTP_PASS=${FAKE_TOKEN}\nBETTER_STACK_SOURCE_TOKEN=${FAKE_TOKEN}\n`,
    });

    expect(findLeakedProductionServiceEnv(baseEnv, dir)).toEqual(
      expect.arrayContaining([
        'next dev: LOGFLARE_API_KEY',
        'next dev: EMAIL_PROVIDER',
        'next dev: SMTP_PASS',
        'next dev: BETTER_STACK_SOURCE_TOKEN',
      ]),
    );
    expect(() =>
      assertE2EServerIsolatedFromProductionServices(env, {
        dir,
        serveBuild: false,
      }),
    ).not.toThrow();
  });

  it('blocks a non-loopback NEXT_PUBLIC_APP_URL unless a loopback one is pinned', () => {
    const dir = project({
      '.env.production.local': `NEXT_PUBLIC_APP_URL=${PROD_APP_URL}\n`,
    });

    expect(() =>
      assertE2EServerIsolatedFromProductionServices(env, {
        dir,
        serveBuild: false,
      }),
    ).toThrow(/next start: NEXT_PUBLIC_APP_URL \(non-loopback\)/);
    expect(() =>
      assertE2EServerIsolatedFromProductionServices(
        { ...env, NEXT_PUBLIC_APP_URL: 'http://localhost:3100' },
        { dir, serveBuild: false },
      ),
    ).not.toThrow();
  });

  it('blocks next start on a server bundle that inlined the production app URL, without printing it', () => {
    const dir = project({
      '.env.production.local': `NEXT_PUBLIC_APP_URL=${PROD_APP_URL}/\n`,
      '.next/server/edge/chunks/proxy.js': `fetch("${PROD_APP_URL}/api/logs")`,
    });
    const local = { ...env, NEXT_PUBLIC_APP_URL: 'http://localhost:3100' };

    let message = '';
    try {
      assertE2EServerIsolatedFromProductionServices(local, {
        dir,
        serveBuild: true,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(
      /BLOCKED: .*\.next\/server\/edge\/chunks\/proxy\.js/,
    );
    expect(message).not.toContain(PROD_APP_URL);
  });
});

describe('isolated E2E build (OZI-219)', () => {
  const PROD_APP_URL = 'https://prod-app.example.com';
  const prodFiles = {
    ...productionProfile,
    '.env.production.local': `${productionProfile['.env.production.local']}NEXT_PUBLIC_APP_URL=${PROD_APP_URL}\nLOGFLARE_API_KEY=${FAKE_TOKEN}\nEMAIL_PROVIDER=smtp\n`,
  };

  function fakeSpawn(writeArtifact?: (dir: string) => void, status = 0) {
    return vi.fn((_cmd: string, _args: string[], opts: { cwd: string }) => {
      if (status === 0)
        fs.mkdirSync(path.join(opts.cwd, '.next'), { recursive: true });
      writeArtifact?.(opts.cwd);
      return { status };
    }) as unknown as typeof spawnSync & ReturnType<typeof vi.fn>;
  }

  it('builds with production values present only under the isolated env', () => {
    const dir = project(prodFiles);
    const spawn = fakeSpawn();

    runE2EBuild({ ...baseEnv }, dir, spawn);

    const [cmd, args, opts] = spawn.mock.calls[0]!;
    expect([cmd, args]).toEqual(['pnpm', ['exec', 'next', 'build']]);
    expect(opts.env).toMatchObject({
      ...PRODUCTION_SERVICE_ENV_OVERRIDES,
      NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
    });
  });

  it('marks the verified build with its origin; Playwright on the same custom port accepts it', async () => {
    const dir = project(prodFiles);
    const custom = {
      ...baseEnv,
      PLAYWRIGHT_TEST_BASE_URL: 'http://127.0.0.1:3200',
    };

    runE2EBuild(custom, dir, fakeSpawn());

    expect(fs.readFileSync(path.join(dir, E2E_BUILD_ORIGIN_FILE), 'utf8')).toBe(
      'http://127.0.0.1:3200',
    );
    vi.stubEnv('PLAYWRIGHT_TEST_BASE_URL', 'http://127.0.0.1:3200');
    vi.resetModules();
    const { default: config } = await import('../../playwright.config');
    const { env } = config.webServer as { env: Record<string, string> };
    expect(() =>
      assertE2EServerIsolatedFromProductionServices(env, {
        dir,
        serveBuild: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertE2EServerIsolatedFromProductionServices(
        { ...env, NEXT_PUBLIC_APP_URL: 'http://localhost:3100' },
        { dir, serveBuild: true },
      ),
    ).toThrow(/not made by `pnpm e2e:build` for this E2E base URL/);
  });

  it('does not mark a build that failed the artifact scan', () => {
    const dir = project(prodFiles);
    const spawn = fakeSpawn((cwd) => {
      fs.mkdirSync(path.join(cwd, '.next/static/chunks'), { recursive: true });
      fs.writeFileSync(
        path.join(cwd, '.next/static/chunks/app.js'),
        `init({dsn:"${FAKE_DSN}"})`,
      );
    });

    expect(() => runE2EBuild({ ...baseEnv }, dir, spawn)).toThrow(/BLOCKED/);
    expect(fs.existsSync(path.join(dir, E2E_BUILD_ORIGIN_FILE))).toBe(false);
  });

  it('is BLOCKED before the build for a remote base URL', () => {
    const dir = project(prodFiles);
    const spawn = fakeSpawn();

    expect(() =>
      runE2EBuild(
        { ...baseEnv, PLAYWRIGHT_TEST_BASE_URL: PROD_APP_URL },
        dir,
        spawn,
      ),
    ).toThrow(/BLOCKED: the E2E base URL must be loopback/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('is BLOCKED after the build when an artifact still inlines a production target', () => {
    const dir = project(prodFiles);
    const spawn = fakeSpawn((cwd) => {
      fs.mkdirSync(path.join(cwd, '.next/static/chunks'), { recursive: true });
      fs.writeFileSync(
        path.join(cwd, '.next/static/chunks/app.js'),
        `fetch("${PROD_APP_URL}/api/logs")`,
      );
    });

    expect(() => runE2EBuild({ ...baseEnv }, dir, spawn)).toThrow(
      /\[e2e-build\] BLOCKED: .*\.next\/static\/chunks\/app\.js/,
    );
  });

  it('fails when next build fails', () => {
    const dir = project({});
    expect(() =>
      runE2EBuild({ ...baseEnv }, dir, fakeSpawn(undefined, 1)),
    ).toThrow(/next build failed/);
  });
});

describe('playwright.config base URL (OZI-219)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('pins NEXT_PUBLIC_APP_URL to the scenario base URL, overriding an inherited one', async () => {
    vi.stubEnv('PLAYWRIGHT_TEST_BASE_URL', 'http://127.0.0.1:3200');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://prod-app.example.com');
    vi.resetModules();
    const { default: config } = await import('../../playwright.config');

    expect(
      (config.webServer as { env: Record<string, string> }).env
        .NEXT_PUBLIC_APP_URL,
    ).toBe('http://127.0.0.1:3200');
  });

  it('refuses a remote base URL', async () => {
    vi.stubEnv('PLAYWRIGHT_TEST_BASE_URL', 'https://prod-app.example.com');
    vi.resetModules();

    await expect(import('../../playwright.config')).rejects.toThrow(
      /E2E base URL must be loopback/,
    );
  });
});
