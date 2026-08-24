/** @vitest-environment node */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const ADMIN_API_DIR = join(REPO_ROOT, 'src', 'app', 'api', 'admin');

/**
 * SEC-48 static guard: step-up is deny-by-default across `/api/admin/**`.
 *
 * The runtime enforcement lives in `withAdminStepUp`. This guard exists
 * because runtime enforcement only protects the handlers someone remembered
 * to wrap, and "someone forgets one route" is the single most repeated defect
 * in this repository's security history -- SEC-26 twice, SEC-41 twice, all
 * four the same shape of one admin route left out of a rule the others
 * follow. A rule that is not mechanically checked decays (SEC-38 made the
 * same point about response envelopes: twelve of thirty-six routes had
 * quietly diverged from advice nothing enforced).
 *
 * So: every state-changing export under `/api/admin/**` must be wrapped, and
 * an exemption must be written down here with a reason. **The exemption list
 * starts empty and should stay that way.**
 */

/**
 * Repo-relative route paths exempt from step-up, each with a written
 * justification naming who relies on it and why the challenge cannot apply.
 *
 * Empty by design. Adding an entry is a security decision, reviewed as one.
 */
const EXEMPT_ROUTES: ReadonlyMap<string, string> = new Map();

function findRouteFiles(dir: string, found: string[] = []): string[] {
  // Paths are derived from process.cwd() and a fixed `src/app/api/admin`
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

function toRepoPath(file: string): string {
  return relative(REPO_ROOT, file).split(sep).join('/');
}

/**
 * Every exported HTTP method that changes state.
 *
 * Both export shapes App Router accepts are matched, not just the one this
 * repository happens to use today -- a guard that only recognises the current
 * style stops working the moment someone writes `export async function
 * POST()`, which is precisely when it is needed.
 */
export function findMutatingExports(source: string): string[] {
  const methods = /\b(POST|PUT|PATCH|DELETE)\b/;
  const declarations = [
    ...source.matchAll(/export\s+const\s+(POST|PUT|PATCH|DELETE)\s*=/g),
    // Two literal alternatives rather than `(?:async\s+)?` after `\s+`:
    // that shape is what `security/detect-unsafe-regex` flags, and a static
    // guard is the last file that should carry a lint suppression.
    ...source.matchAll(/export\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g),
    ...source.matchAll(
      /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g,
    ),
  ]
    .map((match) => match[1])
    .filter((method): method is string => method !== undefined);

  // Braces are found by splitting rather than by a regex with a quantifier
  // inside a quantifier: `security/detect-unsafe-regex` flags that shape, and
  // a guard's own helper should not be the thing that stalls a lint run.
  const reExports = source
    .split('export')
    .filter((segment) => segment.trimStart().startsWith('{'))
    .map(
      (segment) => segment.slice(segment.indexOf('{') + 1).split('}')[0] ?? '',
    )
    .flatMap((names) => names.split(','))
    .map(
      (entry) =>
        entry
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim() ?? '',
    )
    .filter((name) => methods.test(name));

  return [...declarations, ...reExports];
}

export function countStepUpWrappers(source: string): number {
  return source.split('withAdminStepUp(').length - 1;
}

describe('findMutatingExports', () => {
  // A guard whose classifier is never tested is just a green checkmark.
  it('finds a const-assigned handler', () => {
    expect(
      findMutatingExports('export const PATCH = withErrorHandler(...)'),
    ).toEqual(['PATCH']);
  });

  it('finds a function-declaration handler', () => {
    expect(
      findMutatingExports('export async function DELETE(request) {}'),
    ).toEqual(['DELETE']);
  });

  it('finds a renamed re-export', () => {
    expect(findMutatingExports('export { handler as POST };')).toEqual([
      'POST',
    ]);
  });

  it('ignores read-only handlers', () => {
    expect(
      findMutatingExports('export const GET = withErrorHandler(...)'),
    ).toEqual([]);
    expect(findMutatingExports('export const HEAD = () => {};')).toEqual([]);
  });

  it('counts each mutating export separately', () => {
    expect(
      findMutatingExports(
        'export const PATCH = a;\nexport const DELETE = b;\nexport const GET = c;',
      ),
    ).toEqual(['PATCH', 'DELETE']);
  });
});

describe('countStepUpWrappers', () => {
  it('counts one wrapper per wrapped handler', () => {
    expect(
      countStepUpWrappers(
        'withNodeProvisioning(withAdminStepUp(a))\nwithNodeProvisioning(withAdminStepUp(b))',
      ),
    ).toBe(2);
  });

  it('does not count the import', () => {
    expect(
      countStepUpWrappers(
        "import { withAdminStepUp } from '@/security/api/with-admin-step-up';",
      ),
    ).toBe(0);
  });
});

describe('SEC-48: /api/admin/** step-up discipline', () => {
  const routeFiles = findRouteFiles(ADMIN_API_DIR);

  it('finds the admin route family (the guard is not silently walking nothing)', () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  it('keeps the exemption list empty', () => {
    // Not a formality: an exemption is a hole in an authentication-assurance
    // boundary, and this assertion is what makes adding one a decision
    // somebody has to argue for in review rather than a quiet edit.
    expect([...EXEMPT_ROUTES.keys()]).toEqual([]);
  });

  it.each(routeFiles.map((f) => [toRepoPath(f), f]))(
    '%s wraps every state-changing handler in withAdminStepUp',
    (repoPath, file) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const source = readFileSync(file, 'utf8');
      const mutations = findMutatingExports(source);

      if (mutations.length === 0) return;
      if (EXEMPT_ROUTES.has(repoPath)) return;

      expect(
        countStepUpWrappers(source),
        `${repoPath} exports ${mutations.join(', ')} but wraps ` +
          `${countStepUpWrappers(source)} handler(s) in withAdminStepUp. ` +
          `Every state-changing admin handler must go through the step-up ` +
          `guard -- an admin session alone is authorization, not proof that ` +
          `the human is still there. If this route genuinely cannot be ` +
          `challenged, add it to EXEMPT_ROUTES with a written reason.`,
      ).toBeGreaterThanOrEqual(mutations.length);
    },
  );
});
