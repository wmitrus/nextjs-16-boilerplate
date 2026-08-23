/** @vitest-environment node */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();

/**
 * SEC-43 static guard.
 *
 * The trust model only holds while every client-IP decision goes through the
 * resolver. One `headers.get('x-forwarded-for')` somewhere reintroduces the
 * whole defect — believe the header because it is there — and no other test
 * would notice: the code would work perfectly on Vercel, where that header
 * happens to be set correctly, and silently trust the client anywhere else.
 */
const CLIENT_IP_HEADERS = [
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'x-vercel-forwarded-for',
  'true-client-ip',
  'x-client-ip',
];

/** Only these may name a client-IP header; everything else must ask the resolver. */
const ALLOWED: Record<string, string> = {
  'src/shared/lib/network/client-ip.ts':
    'the resolver itself -- this is where the trust model lives',
  'src/shared/lib/network/client-ip.test.ts': 'tests the resolver',
  'src/shared/lib/network/client-ip.guard.test.ts': 'this guard',
  'src/shared/lib/network/get-ip.test.ts': 'tests the resolver wiring',
  'src/security/core/security-context.test.ts':
    'builds request fixtures; the code under test goes through the resolver',
  'src/testing/integration/server-actions.test.ts':
    'builds request fixtures; the code under test goes through the resolver',
};

function walk(dir: string, found: string[] = []): string[] {
  // Paths derive from process.cwd() and a fixed `src` subtree -- nothing here
  // is caller-controlled.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, found);
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function toRepoPath(file: string): string {
  return relative(REPO_ROOT, file).split(sep).join('/');
}

/**
 * Strips comments before scanning.
 *
 * The rule is about what the code reads, not what the prose mentions --
 * explaining *why* a header must not be trusted is exactly the comment this
 * repository wants, and a guard that punished it would train people to write
 * worse ones.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('SEC-43: client IP comes only from the resolver', () => {
  const offenders = walk(join(REPO_ROOT, 'src'))
    .map((file) => {
      const repoPath = toRepoPath(file);
      if (repoPath in ALLOWED) return null;
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const source = stripComments(readFileSync(file, 'utf8')).toLowerCase();
      const hit = CLIENT_IP_HEADERS.find((header) => source.includes(header));
      return hit ? { repoPath, hit } : null;
    })
    .filter(
      (entry): entry is { repoPath: string; hit: string } => entry !== null,
    );

  it('finds the source tree (the guard is not walking nothing)', () => {
    expect(walk(join(REPO_ROOT, 'src')).length).toBeGreaterThan(100);
  });

  it('no file outside the resolver names a client-IP header', () => {
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These files name a client-IP header directly:\n` +
            offenders.map((o) => `  ${o.repoPath} -> ${o.hit}`).join('\n') +
            `\n\nUse \`getClientIp()\` instead. Reading the header directly is the ` +
            `SEC-43 defect: a header is believed because the deployment declared ` +
            `the ingress that sets it, never because it is present. If a file ` +
            `genuinely belongs to the resolver, add it to ALLOWED with a reason.`,
    ).toEqual([]);
  });
});
