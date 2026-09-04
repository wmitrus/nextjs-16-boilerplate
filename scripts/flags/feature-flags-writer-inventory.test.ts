import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * OZI-71 FF·C P1 — writer-inventory regression.
 *
 * After FF·B (canonical dual-write) every NEW `feature_flags` row must carry
 * canonical ownership. A legacy writer that omits `organization_id` /
 * `ownership_state` lets the schema default (`unresolved_legacy`) create a
 * post-FF·B phantom sibling and is the root cause of the projected-collision
 * race. This test walks the LIVE repo and asserts:
 *
 *  1. the only non-test files that INSERT into `feature_flags` are the three
 *     sanctioned writers;
 *  2. the two operator scripts among them set `ownershipState` explicitly on
 *     every insert (never relying on the fail-closed default).
 */

const REPO_ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = ['src', 'scripts'];
const SKIP_DIR = new Set(['node_modules', '.next', 'coverage', 'dist']);

const isSourceFile = (name: string) =>
  (name.endsWith('.ts') || name.endsWith('.tsx')) &&
  !name.endsWith('.test.ts') &&
  !name.endsWith('.test.tsx') &&
  !name.endsWith('.db.test.ts') &&
  !name.endsWith('.d.ts') &&
  !name.includes('.stories.');

function walk(dir: string, out: string[]): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- repo-owned source tree, test-only scan
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') && ent.name !== '.') continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIR.has(ent.name)) walk(full, out);
    } else if (ent.isFile() && isSourceFile(ent.name)) {
      out.push(full);
    }
  }
}

/** Any spelling of an INSERT that targets the `feature_flags` table. */
const INSERT_PATTERNS = [
  /\.insert\(\s*featureFlagsTable\s*\)/,
  /INSERT\s+INTO\s+\$\{featureFlagsTable\}/i,
  /INSERT\s+INTO\s+feature_flags\b/i,
];

describe('feature_flags writer inventory (OZI-71 FF·C P1)', () => {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(REPO_ROOT, d), files);

  const writers = files
    .filter((f) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- repo-owned source tree, test-only read
      const src = readFileSync(resolve(f), 'utf8');
      return INSERT_PATTERNS.some((re) => re.test(src));
    })
    .map((f) => relative(REPO_ROOT, f).split(sep).join('/'))
    .sort();

  it('only the three sanctioned writers INSERT into feature_flags', () => {
    expect(writers).toEqual([
      'scripts/flags/import.ts',
      'scripts/flags/migrate.ts',
      'src/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService.ts',
    ]);
  });

  it.each(['scripts/flags/import.ts', 'scripts/flags/migrate.ts'])(
    '%s sets ownershipState explicitly on every insert (never the unresolved_legacy default)',
    (rel) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- repo-owned source, test-only read
      const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
      // Grab each `.insert(featureFlagsTable).values({ ... })` object body.
      const bodies = [
        ...src.matchAll(
          /\.insert\(\s*featureFlagsTable\s*\)\s*\.values\(\s*\{([\s\S]*?)\}\s*\)/g,
        ),
      ].map((m) => m[1]!);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        expect(body).toMatch(/ownershipState\s*:/);
        expect(body).toMatch(/organizationId\s*:/);
        // an operator script must never guess a canonical org id here
        expect(body).not.toMatch(
          /ownershipState\s*:\s*['"]canonical_organization['"]/,
        );
      }
    },
  );

  it('DrizzleFeatureFlagAdminService only creates intentional_global or canonical_organization rows (never a bare legacy row)', () => {
    const rel =
      'src/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService.ts';

    const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
    // The builder insert is the intentional-global path.
    expect(src).toMatch(
      /\.insert\(\s*featureFlagsTable\s*\)\s*\.values\(\s*\{[\s\S]*?ownershipState\s*:\s*['"]intentional_global['"][\s\S]*?\}\s*\)/,
    );
    // The raw insert is the canonical-organization path (same-statement tuple proof).
    expect(src).toMatch(
      /INSERT\s+INTO\s+\$\{featureFlagsTable\}[\s\S]*?'canonical_organization'/,
    );
  });
});
