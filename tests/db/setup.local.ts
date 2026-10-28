import type { TestProject } from 'vitest/node';

import { readLocalDbSystemIdentifier } from '../../scripts/lib/local-db-identity.mjs';

/**
 * OZI-219 — `test:db:local` targets the compose test-db over a loopback URL.
 * Its cluster identity is read inside that container, so the per-file R4a
 * schema A bootstrap (`create-test-db.ts`) refuses any other server behind
 * the URL (tunnel, port-forward).
 */
export function setup(project: TestProject): void {
  project.provide(
    'TEST_DATABASE_SYSTEM_IDENTIFIER',
    readLocalDbSystemIdentifier('test'),
  );
}
