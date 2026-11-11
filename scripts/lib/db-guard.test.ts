import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * OZI-221 — the fixed 5433 test contract stays the default; the isolated
 * runner's port is accepted only with a well-formed port+token pair, only
 * on 127.0.0.1/app_test, and partial/malformed config fails closed.
 */
const TOKEN = 'a'.repeat(32);

async function loadGuard(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv('DB_TEST_ISOLATED_PORT', env.port);
  vi.stubEnv('DB_TEST_ISOLATED_TOKEN', env.token);
  return import('./db-guard.mjs');
}

function urlWith(port: number, host = '127.0.0.1', database = 'app_test') {
  const url = new URL('postgres://127.0.0.1/');
  url.hostname = host;
  url.port = String(port);
  url.pathname = `/${database}`;
  return url.toString();
}

function expectBlocked(fn: () => void) {
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('exit');
  }) as never);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  expect(fn).toThrow('exit');
  expect(exit).toHaveBeenCalledWith(1);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('db-guard test target (OZI-221)', () => {
  it('keeps the fixed 5433 contract when isolated mode is not configured', async () => {
    const guard = await loadGuard({});
    expect(new URL(guard.TEST_DEFAULT_URL).port).toBe('5433');
    expect(() => guard.assertTestTarget(urlWith(5433))).not.toThrow();
    expectBlocked(() => guard.assertTestTarget(urlWith(55433)));
    await expect(
      guard.assertTestEndpointIdentity(guard.TEST_DEFAULT_URL),
    ).resolves.toBeUndefined();
  });

  it('accepts only the runner port on 127.0.0.1/app_test in isolated mode', async () => {
    const guard = await loadGuard({ port: '55433', token: TOKEN });
    expect(guard.TEST_DEFAULT_URL).toBe(
      urlWith(55433).replace('postgres://', 'postgres://postgres:postgres@'),
    );
    expect(() => guard.assertTestTarget(urlWith(55433))).not.toThrow();
    expectBlocked(() => guard.assertTestTarget(urlWith(5433)));
    expectBlocked(() => guard.assertTestTarget(urlWith(55433, 'localhost')));
    expectBlocked(() =>
      guard.assertTestTarget(urlWith(55433, '127.0.0.1', 'app_dev')),
    );
  });

  it.each([
    ['port only', { port: '55433' }],
    ['token only', { token: TOKEN }],
    ['dev port', { port: '5432', token: TOKEN }],
    ['fixed port', { port: '5433', token: TOKEN }],
    ['privileged port', { port: '80', token: TOKEN }],
    ['short token', { port: '55433', token: 'abc' }],
    ['non-numeric port', { port: '5543x', token: TOKEN }],
  ])('fails closed on %s', async (_label, env) => {
    await expect(loadGuard(env)).rejects.toThrow(/BLOCKED/);
  });

  it('refuses an endpoint that does not answer with the run token', async () => {
    // Port 1 on loopback: nothing listens, so no token can be proven.
    const guard = await loadGuard({ port: '55433', token: TOKEN });
    await expect(guard.assertTestEndpointIdentity(urlWith(1))).rejects.toThrow(
      /not the isolated test endpoint/,
    );
  });
});
