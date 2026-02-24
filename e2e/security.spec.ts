import fs from 'node:fs';
import path from 'node:path';

import { test, expect } from '@playwright/test';

function resolveInternalApiKey(): string {
  const fromProcess = process.env.INTERNAL_API_KEY?.trim();
  if (fromProcess) {
    return fromProcess;
  }

  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const content = fs.readFileSync(envLocalPath, 'utf8');
    const match = content.match(/^INTERNAL_API_KEY\s*=\s*(.+)$/m);
    if (match?.[1]) {
      return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }

  return 'demo-internal-key';
}

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
});
