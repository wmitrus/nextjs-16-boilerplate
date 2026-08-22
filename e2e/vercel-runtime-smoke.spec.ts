import { expect, test } from '@playwright/test';

test.describe('Vercel runtime smoke', () => {
  test('AuthJS sign-in completes its PPR response', async ({ page }) => {
    const pageErrors: string[] = [];
    const failedRscRequests: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => {
      if (request.headers().rsc === '1') {
        failedRscRequests.push(
          `${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`,
        );
      }
    });
    page.on('response', (response) => {
      if (
        response.request().headers().rsc === '1' &&
        response.status() >= 400
      ) {
        failedRscRequests.push(`${response.url()}: HTTP ${response.status()}`);
      }
    });

    const response = await page.goto('/auth/signin', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible({
      timeout: 20_000,
    });
    expect(
      pageErrors.filter((message) => message.includes('Connection closed')),
    ).toEqual([]);
    expect(failedRscRequests).toEqual([]);
  });

  test('AuthJS session endpoint remains JSON', async ({ request }) => {
    const response = await request.get('/api/auth/session');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    await expect(response.json()).resolves.toEqual(expect.any(Object));
  });

  // A "CSP script-src nonce is fresh per request" test lived here briefly.
  // It targeted "/" under the assumption that CSP_SCRIPT_MODE would be
  // 'nonce-dynamic' there. That assumption doesn't hold: nonce-based CSP
  // is currently incompatible with this app's cacheComponents/PPR (see
  // CSP_SCRIPT_MODE's doc comment in src/core/env.ts and SEC-30/SEC-31 in
  // docs/ai/general/SECURITY_CODING_PATTERNS.md), so the mode defaults to
  // 'cache-compatible'. CSP_SCRIPT_MODE is a deployment-wide choice, not a
  // per-route one (SEC-31 explains why mixing profiles on one origin
  // doesn't work under App Router client-side navigation) — "/" stays in
  // 'cache-compatible' mode as long as this deployment does. Its real home
  // is e2e/csp-nonce-dynamic.spec.ts, run via the opt-in
  // `pnpm e2e:csp-nonce-dynamic` scenario against a deployment with
  // CSP_SCRIPT_MODE=nonce-dynamic.
});
