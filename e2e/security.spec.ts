import { test, expect } from '@playwright/test';

import { resolveInternalApiKey } from './internal-api-key';

test.describe('Security Architecture E2E', () => {
  test('should have security headers on home page', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();

    const headers = response!.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers['cross-origin-opener-policy']).toBe(
      'same-origin-allow-popups',
    );
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(headers['x-xss-protection']).toBeUndefined();

    // CSP_SCRIPT_STRICT_MODE defaults on — script-src must use a per-request
    // nonce + strict-dynamic, not unsafe-inline, in the default scenario.
    const scriptSrc = headers['content-security-policy']
      ?.split('; ')
      .find((entry) => entry.startsWith('script-src '));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toMatch(/'nonce-[^']+'/);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  test('should redirect unauthenticated user from protected route', async ({
    page,
  }) => {
    // /dashboard is protected and should redirect to sign-in
    await page.goto('/dashboard');

    // Check if we are on a sign-in page (either custom or Clerk's default)
    await expect(page).toHaveURL(/.*sign-in.*/);
  });

  test('should block internal API access without key', async ({ request }) => {
    const response = await request.get('/api/internal/health');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toContain('Internal Access Only');
  });

  test('should block internal API access with invalid key', async ({
    request,
  }) => {
    const response = await request.get('/api/internal/health', {
      headers: {
        'x-internal-key': 'invalid-key',
      },
    });

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  test('should allow internal API access with correct key', async ({
    request,
  }) => {
    const internalApiKey = resolveInternalApiKey();
    const response = await request.get('/api/internal/health', {
      headers: {
        'x-internal-key': internalApiKey,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.scope).toBe('internal');
  });

  test.describe('demo/showcase routes are gated off by default', () => {
    // DEMO_SHOWCASE_ENABLED is unset in the default scenario runtime — every
    // demo route must 404 regardless of auth state, unauthenticated
    // included. See SEC-29 in docs/ai/general/SECURITY_CODING_PATTERNS.md.
    for (const path of [
      '/security-showcase',
      '/sentry-example-page',
      '/feature-flags-demo',
      '/env-summary',
    ]) {
      test(`${path} returns a real 404, not a sign-in redirect`, async ({
        page,
      }) => {
        const response = await page.goto(path);
        expect(response?.status()).toBe(404);
        // Must not have been redirected to sign-in — a demo route with the
        // flag off must behave as if it doesn't exist, not "exists, but
        // requires auth".
        expect(page.url()).not.toContain('sign-in');
      });
    }

    test('/api/security-test/ssrf returns a JSON 404', async ({ request }) => {
      const response = await request.get(
        '/api/security-test/ssrf?url=https://example.com',
      );
      expect(response.status()).toBe(404);
      const body = await response.json();
      expect(body.code).toBe('NOT_FOUND');
    });
  });
});
