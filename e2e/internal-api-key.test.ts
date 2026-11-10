import { describe, expect, it } from 'vitest';

import { MIN_INTERNAL_API_KEY_LENGTH } from '@/core/env';

import {
  DEFAULT_INTERNAL_API_KEY,
  E2E_MIN_INTERNAL_API_KEY_LENGTH,
  resolveInternalApiKey,
} from './internal-api-key';

/**
 * SEC-44 regression guard.
 *
 * In CI the Playwright `webServer` runs `pnpm start` (`NODE_ENV=production`)
 * and injects `resolveInternalApiKey()` as `INTERNAL_API_KEY`
 * (`playwright.config.ts`). Production enforces a length floor, so a fixture
 * below it stops the E2E server from booting -- a failure no unit test would
 * otherwise see, because it happens in a separate process at startup.
 */
describe('DEFAULT_INTERNAL_API_KEY', () => {
  it('satisfies the production length floor', () => {
    expect(DEFAULT_INTERNAL_API_KEY.length).toBeGreaterThanOrEqual(
      MIN_INTERNAL_API_KEY_LENGTH,
    );
  });

  it('is recognisably a fixture rather than something that looks like a secret', () => {
    // It is committed to the repository; anything relying on it in a real
    // deployment is misconfigured, and the name should say so.
    expect(DEFAULT_INTERNAL_API_KEY).toContain('not-a-secret');
  });
});

describe('resolveInternalApiKey (OZI-220)', () => {
  it('mirrors the production floor in src/core/env.ts', () => {
    expect(E2E_MIN_INTERNAL_API_KEY_LENGTH).toBe(MIN_INTERNAL_API_KEY_LENGTH);
  });

  it('uses the committed fixture when the runner sets no key', () => {
    expect(resolveInternalApiKey({})).toBe(DEFAULT_INTERNAL_API_KEY);
    expect(resolveInternalApiKey({ INTERNAL_API_KEY: '  ' })).toBe(
      DEFAULT_INTERNAL_API_KEY,
    );
  });

  it('honours an explicit key that meets the production floor', () => {
    const key = 'x'.repeat(MIN_INTERNAL_API_KEY_LENGTH);
    expect(resolveInternalApiKey({ INTERNAL_API_KEY: key })).toBe(key);
  });

  it('refuses a key a production-mode E2E server would reject', () => {
    expect(() =>
      resolveInternalApiKey({ INTERNAL_API_KEY: 'short-dev-key-17c' }),
    ).toThrow(/at least 32 characters/);
  });
});
