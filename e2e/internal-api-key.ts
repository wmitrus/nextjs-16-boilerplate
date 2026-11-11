/**
 * Fallback key for E2E runs that do not supply one.
 *
 * At least `MIN_INTERNAL_API_KEY_LENGTH` characters on purpose (SEC-44). In
 * CI the Playwright `webServer` runs `pnpm start`, i.e. `NODE_ENV=production`,
 * and injects this value as `INTERNAL_API_KEY` -- so a fixture below the
 * production floor would stop the E2E server from booting at all. The
 * previous 21-character value would have done exactly that.
 *
 * A fixture, never a secret: it is committed, and any deployment relying on
 * it is misconfigured.
 */
export const DEFAULT_INTERNAL_API_KEY =
  'e2e-fixture-internal-api-key-not-a-secret';

/**
 * Mirrors `MIN_INTERNAL_API_KEY_LENGTH` in `src/core/env.ts` (asserted equal
 * by `internal-api-key.test.ts`). Not imported: this module is loaded by
 * `playwright.config.ts`, and importing `@/core/env` there would run the app's
 * env validation against the test runner's own environment.
 */
export const E2E_MIN_INTERNAL_API_KEY_LENGTH = 32;

/**
 * The internal API key every E2E web server is started with (OZI-220).
 *
 * Test-only by construction: an explicit `INTERNAL_API_KEY` in the runner's
 * environment, or the committed fixture. It is deliberately never read from
 * `.env.local` / `.env` -- those hold a developer's own key, which is not a
 * test fixture and (at 17 characters locally) made a production-mode build
 * reject every internal request with a 500. A key below the production floor
 * fails here, before the server starts, instead.
 */
export function resolveInternalApiKey(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const value = env.INTERNAL_API_KEY?.trim() || DEFAULT_INTERNAL_API_KEY;
  if (value.length < E2E_MIN_INTERNAL_API_KEY_LENGTH) {
    throw new Error(
      `[e2e] INTERNAL_API_KEY must be at least ${E2E_MIN_INTERNAL_API_KEY_LENGTH} characters: the E2E server may be a production build (\`pnpm start\`), which refuses a shorter key. Unset it to use the committed test fixture.`,
    );
  }
  return value;
}
