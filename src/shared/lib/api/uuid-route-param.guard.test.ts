/** @vitest-environment node */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();

/** Every `route.ts` under `src/app/api`, found without a glob dependency. */
function findRouteFiles(dir: string, found: string[] = []): string[] {
  // Paths are derived from process.cwd() and a fixed `src/app/api`
  // subtree -- nothing here is caller-controlled.
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
 * Dynamic segments that are NOT bound to a `uuid` column, with the reason
 * each one is exempt. Anything not listed is assumed to be a UUID sink and
 * must be validated: the default is "guard it", so forgetting to think about
 * a new route fails the suite rather than passing silently.
 */
const NON_UUID_SEGMENTS: Record<string, string> = {
  token: 'invitations.token is text(), not uuid -- a random token string',
  '...nextauth': 'NextAuth protocol catch-all, never bound to a column',
};

const LOOKBEHIND = 160;

/**
 * Answers the only question that matters: does the raw segment value reach
 * anything other than a validator?
 *
 * A route is safe when it either calls the shared helper, or feeds every
 * occurrence of the raw value straight into a `safeParse(...)`. That second
 * form is what the `organizations/**` routes do -- they parse
 * `params.organizationId` through a schema whose key is `id`, which is
 * genuine validation even though the names differ. Matching on schema key
 * names instead would have called those eight routes broken.
 */
export function findUnguardedSegment(source: string, segment: string): boolean {
  if (source.includes(`parseUuidRouteParam(params, '${segment}')`)) {
    return false;
  }

  // Collapse whitespace so a `safeParse({` opened on a previous line still
  // sits next to the value it is validating.
  const flat = source.replace(/\s+/g, ' ');
  const patterns = [`params.${segment}`, `params['${segment}']`];

  for (const pattern of patterns) {
    let from = 0;
    for (;;) {
      const at = flat.indexOf(pattern, from);
      if (at === -1) break;

      const before = flat.slice(Math.max(0, at - LOOKBEHIND), at);
      const openedAt = before.lastIndexOf('safeParse(');

      // The nearest `safeParse(` only covers this occurrence if no statement
      // boundary sits between them -- otherwise a value validated in one
      // statement would appear to excuse a raw use in the next.
      const covered = openedAt !== -1 && !before.slice(openedAt).includes(';');

      if (!covered) {
        return true; // raw value used somewhere that is not a validator
      }
      from = at + pattern.length;
    }
  }

  // A route that never touches the segment cannot leak it.
  return false;
}

describe('findUnguardedSegment', () => {
  // A guard that cannot fail proves nothing, so its own classifier is tested
  // against the exact shapes it has to tell apart.
  it('flags a raw segment assigned straight to a variable', () => {
    const source = `const params = await context.params; const id = params['id']; await service.revoke(id);`;

    expect(findUnguardedSegment(source, 'id')).toBe(true);
  });

  it('accepts the shared helper', () => {
    const source = `const idResult = parseUuidRouteParam(params, 'id'); const id = idResult.value;`;

    expect(findUnguardedSegment(source, 'id')).toBe(false);
  });

  it('accepts a schema whose key differs from the segment name', () => {
    const source = `const parseResult = organizationIdSchema.safeParse({\n  id: params.organizationId,\n});`;

    expect(findUnguardedSegment(source, 'organizationId')).toBe(false);
  });

  it('flags a route that validates the value but also uses it raw', () => {
    const source = `const r = schema.safeParse({ id: params.id }); logger.info({ raw: params.id });`;

    expect(findUnguardedSegment(source, 'id')).toBe(true);
  });
});

describe('SEC-23 guard: dynamic UUID route params are validated', () => {
  const routeFiles = findRouteFiles(join(REPO_ROOT, 'src', 'app', 'api'));

  it('finds the API routes to check', () => {
    expect(routeFiles.length).toBeGreaterThan(5);
  });

  // SEC-23 was marked "fixed" while two routes still bound raw params,
  // because it was written as advice to follow per route rather than as
  // something enforced. This test is the enforcement.
  it('has no dynamic UUID segment reaching a handler unvalidated', () => {
    const offenders: string[] = [];

    for (const file of routeFiles) {
      const segments = relative(REPO_ROOT, file)
        .split(sep)
        .filter((part) => part.startsWith('[') && part.endsWith(']'))
        .map((part) => part.slice(1, -1));

      if (segments.length === 0) continue;
      // `file` comes from the walk above, i.e. from the repo tree itself.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const source = readFileSync(file, 'utf8');

      for (const segment of segments) {
        if (segment in NON_UUID_SEGMENTS) continue;
        if (!findUnguardedSegment(source, segment)) continue;

        offenders.push(
          `${relative(REPO_ROOT, file)} -> [${segment}] reaches the handler ` +
            `unvalidated. Use parseUuidRouteParam(params, '${segment}') from ` +
            `@/shared/lib/api/uuid-route-param, or add the segment to ` +
            `NON_UUID_SEGMENTS with a reason if it is not a uuid column.`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps every exemption documented with a reason', () => {
    for (const [segment, reason] of Object.entries(NON_UUID_SEGMENTS)) {
      expect(reason.length, `${segment} needs a real reason`).toBeGreaterThan(
        20,
      );
    }
  });
});
