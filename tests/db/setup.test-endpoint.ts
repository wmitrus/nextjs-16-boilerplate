import {
  TEST_DEFAULT_URL,
  assertTestEndpointIdentity,
} from '../../scripts/lib/db-guard.mjs';

/**
 * OZI-221 — before any suite reaches the fixed tenancy-inventory endpoint
 * (`TEST_DEFAULT_URL`), prove it is the isolated runner's own container.
 * No-op on the fixed 5433 contract (CI service / compose test-db).
 */
export async function setup(): Promise<void> {
  await assertTestEndpointIdentity(TEST_DEFAULT_URL);
}
