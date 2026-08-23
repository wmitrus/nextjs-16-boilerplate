/** @vitest-environment node */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const ADMIN_API_DIR = join(REPO_ROOT, 'src', 'app', 'api', 'admin');

/**
 * SEC-41 static guard over the whole `/api/admin/**` family.
 *
 * The same defect was found three times -- admin users (SEC-26), then the
 * waitlist and invitations (SEC-41) -- always in the same shape: a route
 * treats "is an admin" as one boolean, and then resolves a globally-unique
 * client-supplied id with no scope in the SQL. Fixing the three known
 * instances does nothing to stop the fourth, so the two structural halves of
 * the rule are asserted here over every admin route, present and future.
 *
 * These are deliberately structural, not semantic. A guard cannot read a
 * predicate and decide whether the right scope is in it; it can insist that
 * every admin route makes the platform-admin-vs-tenant-scoped distinction at
 * all, and that no admin route writes to the database without going through
 * a service that takes a scope. Both halves are what actually went missing.
 */
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
 * Does this route decide, explicitly, whether the caller's grant is unscoped?
 *
 * Either it calls `isEnvBasedPlatformAdmin` itself, or it delegates to a
 * shared access helper in an `_lib` module that does. Both are fine; what is
 * not fine is a route that never asks the question.
 */
export function makesPlatformAdminDistinction(source: string): boolean {
  if (source.includes('isEnvBasedPlatformAdmin')) return true;
  return /from\s+'[^']*_lib'/.test(source);
}

/**
 * Does this route write to the database itself?
 *
 * Route handlers must not: a mutation issued inline carries whatever
 * predicate the handler happened to write, while a module service is a
 * single place where the scope parameter can be made mandatory by the type
 * system -- as `revokePendingScoped(id, organizationId)` and
 * `DrizzleFeatureFlagAdminService.update(id, patch, scope)` now are.
 *
 * Reads are not covered: several routes legitimately run a scoped `select`
 * to validate a foreign key, and forbidding those would only push them into
 * worse shapes.
 */
export function hasInlineDbMutation(source: string): boolean {
  // `\s` already spans the newline the formatter inserts before `.delete(`,
  // so no second whitespace group is needed -- and adding one makes the
  // pattern ambiguous enough for the ReDoS lint rule to flag it.
  return /\bdb\s*\.\s*(?:update|delete|insert)\s*\(/.test(source);
}

describe('makesPlatformAdminDistinction', () => {
  // A guard whose classifier is never tested is just a green checkmark.
  it('accepts a direct isEnvBasedPlatformAdmin call', () => {
    expect(
      makesPlatformAdminDistinction(
        `if (isEnvBasedPlatformAdmin(email)) return { allowed: true };`,
      ),
    ).toBe(true);
  });

  it('accepts delegation to a shared _lib access helper', () => {
    expect(
      makesPlatformAdminDistinction(
        `import { checkOrganizationsAdminAccess } from '../../_lib';`,
      ),
    ).toBe(true);
  });

  it('rejects a route that only consults the tenant-scoped ABAC grant', () => {
    // The exact shape the waitlist routes had before SEC-41.
    expect(
      makesPlatformAdminDistinction(
        `const isAdmin = await authzService.can({ action: ACTIONS.SECURITY_MANAGE_POLICIES });`,
      ),
    ).toBe(false);
  });
});

describe('hasInlineDbMutation', () => {
  it('flags an inline update', () => {
    expect(
      hasInlineDbMutation(
        `await db.update(invitationsTable).set({ status: 'revoked' }).where(eq(invitationsTable.id, id));`,
      ),
    ).toBe(true);
  });

  it('flags an inline delete broken across lines by the formatter', () => {
    expect(hasInlineDbMutation(`await db\n  .delete(rolesTable)\n`)).toBe(true);
  });

  it('does not flag a scoped read', () => {
    expect(
      hasInlineDbMutation(
        `const roleRows = await db\n  .select({ id: rolesTable.id })\n  .from(rolesTable)\n`,
      ),
    ).toBe(false);
  });
});

describe('SEC-41: /api/admin/** scope discipline', () => {
  const routeFiles = findRouteFiles(ADMIN_API_DIR);

  it('finds the admin route family (the guard is not silently walking nothing)', () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  it.each(routeFiles.map((f) => [toRepoPath(f), f]))(
    '%s decides explicitly whether the caller is a platform admin',
    (repoPath, file) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const source = readFileSync(file, 'utf8');

      expect(
        makesPlatformAdminDistinction(source),
        `${repoPath} authorises without ever separating an unscoped platform ` +
          `admin from a tenant-scoped ABAC grant. Collapsing the two into one ` +
          `\`isAdmin\` boolean is the SEC-26/SEC-41 defect: every tenant owner ` +
          `holds SECURITY_MANAGE_POLICIES within their own tenant, so an ` +
          `unscoped query behind that boolean serves them every tenant's rows. ` +
          `Return \`{ allowed, isPlatformAdmin }\` and pass a scope down.`,
      ).toBe(true);
    },
  );

  it.each(routeFiles.map((f) => [toRepoPath(f), f]))(
    '%s does not mutate the database inline',
    (repoPath, file) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const source = readFileSync(file, 'utf8');

      expect(
        hasInlineDbMutation(source),
        `${repoPath} issues an insert/update/delete directly. Admin mutations ` +
          `must go through a module service whose signature makes the scope ` +
          `mandatory (e.g. \`revokePendingScoped(id, organizationId)\`), so the ` +
          `authorized scope cannot be left out of the statement that actually ` +
          `writes. See SEC-41.`,
      ).toBe(false);
    },
  );
});
