/** @vitest-environment node */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();

/**
 * SEC-46 static guard.
 *
 * The canonical-id model only holds while exactly one place decides what
 * `correlationId` and `requestId` are. The moment a second layer re-derives
 * them from a raw header, the caller can be handed one id while the logs and
 * `audit_events.correlation_id` record another.
 *
 * What this guard does NOT forbid: reading `x-correlation-id` from
 * `headers()` in Node/RSC code. After the Edge boundary overwrites the
 * forwarded request headers, that read returns the canonical value -- it is
 * the correct source, not a violation. The rule is about *deriving* an id from
 * an untrusted inbound header in a second place, and about the request id
 * never coming from a caller at all.
 */

/**
 * Files allowed to read the raw inbound `x-correlation-id` off a NextRequest.
 * This is the security boundary itself.
 */
const CANONICAL_RESOLVER_SITES = new Set([
  'src/security/middleware/route-classification.ts',
]);

/** Edge-side code, where `req.headers` is the untrusted inbound request. */
const EDGE_SURFACES = ['src/security/middleware', 'src/proxy.ts'];

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

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readSource(repoPath: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return stripComments(readFileSync(join(REPO_ROOT, repoPath), 'utf8'));
}

const sourceFiles = walk(join(REPO_ROOT, 'src'))
  .map(toRepoPath)
  .filter((repoPath) => !/\.(test|spec|mock)\.tsx?$/.test(repoPath));

describe('SEC-46: one place decides the correlation and request ids', () => {
  it('derives the request id from nothing the caller sent', () => {
    const source = readSource(
      'src/security/middleware/route-classification.ts',
    );

    // Not "validated" -- ignored. Even a well-formed caller value would let
    // two distinct requests share an id, and "which single request was this"
    // is a question only the server can answer.
    expect(source).not.toContain('x-request-id');
    expect(source).toContain('generateRequestId()');
  });

  it('reads the raw inbound correlation header in the boundary only', () => {
    const offenders = sourceFiles
      .filter((repoPath) =>
        EDGE_SURFACES.some(
          (surface) =>
            repoPath === surface || repoPath.startsWith(`${surface}/`),
        ),
      )
      .filter((repoPath) => !CANONICAL_RESOLVER_SITES.has(repoPath))
      .filter((repoPath) => {
        const source = readSource(repoPath);
        return (
          source.includes("headers.get('x-correlation-id')") ||
          source.includes('headers.get("x-correlation-id")') ||
          source.includes("headers.get('x-request-id')") ||
          source.includes('headers.get("x-request-id")')
        );
      });

    // Edge code has `ctx.correlationId` / `ctx.requestId` available. Reaching
    // past them to the raw header is how the two ids drift apart.
    expect(offenders).toEqual([]);
  });

  it('forwards the canonical pair to everything downstream', () => {
    const source = readSource('src/proxy.ts');

    // Without these three lines the RSC/Node side keeps reading the caller's
    // own values via headers(), and the id in the response stops matching the
    // id in the logs and the audit trail.
    expect(source).toContain(
      "requestHeaders.set('x-correlation-id', ctx.correlationId)",
    );
    expect(source).toContain(
      "requestHeaders.set('x-request-id', ctx.requestId)",
    );
    expect(source).toContain(
      "requestHeaders.set('x-correlation-source', ctx.correlationSource)",
    );

    // The forwarding must not sit behind the nonce branch -- it applies to
    // every request, not only those in nonce-dynamic CSP mode.
    const forwardIndex = source.indexOf(
      "requestHeaders.set('x-correlation-id'",
    );
    const nonceBranchIndex = source.indexOf('if (ctx.nonce)');
    expect(forwardIndex).toBeGreaterThan(-1);
    expect(nonceBranchIndex).toBeGreaterThan(forwardIndex);
  });

  it('keeps the accepted shape bounded and free of log-splitting characters', () => {
    const source = readSource('src/shared/lib/observability/correlation-id.ts');

    expect(source).toContain('CORRELATION_ID_MAX_LENGTH = 128');
    // A single bounded character class: no whitespace, no control characters,
    // and no backtracking for an attacker to exploit.
    expect(source).toContain('/^[A-Za-z0-9._:-]{1,128}$/');
  });
});
