import { test, expect } from '@playwright/test';

import { isAuthjsRuntime } from './authjs-auth';

test.describe('AuthJS Session Route Health', () => {
  test.skip(
    !isAuthjsRuntime(),
    'Skipping — AUTH_PROVIDER is not authjs. These tests guard against CLIENT_FETCH_ERROR.',
  );

  test('/api/auth/session returns JSON (not HTML) for unauthenticated requests', async ({
    request,
  }) => {
    const response = await request.get('/api/auth/session');
    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('application/json');
    const body = await response.json();
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
  });

  test('/api/auth/providers returns JSON for unauthenticated requests', async ({
    request,
  }) => {
    const response = await request.get('/api/auth/providers');
    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('application/json');
    const body = await response.json();
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
  });

  test('/api/auth/session does NOT return HTML (CLIENT_FETCH_ERROR regression guard)', async ({
    request,
  }) => {
    const response = await request.get('/api/auth/session');
    const text = await response.text();
    expect(text).not.toMatch(/<!DOCTYPE html>/i);
    expect(text).not.toMatch(/<html/i);
  });
});
