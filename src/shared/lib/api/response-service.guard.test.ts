/** @vitest-environment node */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();

function findRouteFiles(dir: string, found: string[] = []): string[] {
  // Paths come from process.cwd() and a fixed `src/app/api` subtree.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      findRouteFiles(full, found);
    } else if (entry.name === 'route.ts') {
      found.push(full);
    }
  }
  return found;
}

/**
 * Routes allowed to build responses by hand, each with the reason. Everything
 * else must go through `response-service.ts`, so a new route that quietly
 * open-codes an envelope fails here rather than shipping a shape no client
 * expects.
 *
 * `AGENTS.md` has said to use the shared helpers for a long time. Twelve of
 * thirty-six routes did not, which is what advice without enforcement gets
 * you -- see SEC-38.
 */
const EXEMPT_ROUTES: Record<string, string> = {
  'src/app/api/auth/[...nextauth]/route.ts':
    'NextAuth owns its own protocol responses; the handler is re-exported, not authored here',
  'src/app/api/internal/health/route.ts':
    'health probe consumed by external uptime monitors that expect a flat, stable body',
  'src/app/api/internal/env-check/route.ts':
    'diagnostics payload consumed by deployment scripts, not by app clients',
  'src/app/api/internal/preview-canary/database-binding/route.ts':
    'Preview-only deployment probe exposes a deliberately bounded hostname evidence payload, not an application response envelope',
  'src/app/api/internal/rollback-assessment/environment-contract/route.ts':
    'Production-only deployment-bound attestation consumed by the rollback-assessment CLI, exposing a deliberately bounded non-secret evidence payload, not an application response envelope',
  'src/app/api/logs/route.ts':
    'log ingest endpoint: returns bare acknowledgements to a transport, not an app client',
  'src/app/api/sentry-example-api/route.ts':
    'Sentry wizard example route, kept verbatim so it matches their docs',
};

const HAND_ROLLED = /(?:^|[^.\w])(?:NextResponse|Response)\.json\(/;

describe('API response discipline (SEC-38)', () => {
  const routeFiles = findRouteFiles(join(REPO_ROOT, 'src', 'app', 'api'));

  it('finds the API routes to check', () => {
    expect(routeFiles.length).toBeGreaterThan(20);
  });

  it('has no route open-coding a JSON response envelope', () => {
    const offenders: string[] = [];

    for (const file of routeFiles) {
      const rel = relative(REPO_ROOT, file).split('\\').join('/');
      if (rel in EXEMPT_ROUTES) continue;

      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const source = readFileSync(file, 'utf8');
      if (!HAND_ROLLED.test(source)) continue;

      offenders.push(
        `${rel} builds a response with Response.json(...) / NextResponse.json(...). ` +
          `Use the helpers in @/shared/lib/api/response-service, or add the route to ` +
          `EXEMPT_ROUTES with a reason if it genuinely owns its own wire format.`,
      );
    }

    expect(offenders).toEqual([]);
  });

  it('keeps every exemption pointing at a route that still exists', () => {
    const known = new Set(
      routeFiles.map((f) => relative(REPO_ROOT, f).split('\\').join('/')),
    );

    for (const route of Object.keys(EXEMPT_ROUTES)) {
      expect(known, `${route} is exempted but no longer exists`).toContain(
        route,
      );
    }
  });

  it('keeps every exemption documented with a reason', () => {
    for (const [route, reason] of Object.entries(EXEMPT_ROUTES)) {
      expect(reason.length, `${route} needs a real reason`).toBeGreaterThan(30);
    }
  });
});
