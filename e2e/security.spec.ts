import { test, expect } from '@playwright/test';

test.describe('Security Architecture E2E', () => {
  test('should have security headers on home page', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();

    const headers = response!.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['content-security-policy']).toBeDefined();
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
    const response = await request.get('/api/internal/test');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toContain('Internal Access Only');
  });

  test('should allow internal API access with correct key', async ({
    request,
  }) => {
    // We use the default key from .env.example
    const response = await request.get('/api/internal/test', {
      headers: {
        'x-internal-key': 'demo-internal-key',
      },
    });

    // It should NOT be 403.
    expect(response.status()).not.toBe(403);
  });
});
