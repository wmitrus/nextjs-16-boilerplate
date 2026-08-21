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

  test('CSP script-src nonce is fresh per request, not cached/stale', async ({
    request,
  }) => {
    // src/security/rsc/csp-nonce.ts's whole security guarantee depends on
    // the nonce being unpredictable and unique per request. The home page
    // is served with x-vercel-cache: PRERENDER / x-nextjs-prerender: 1
    // (Partial Prerendering caches the STATIC SHELL at Vercel's edge), so
    // this asserts the actually-security-relevant claim directly against
    // the deployed edge, not just locally: the CSP header (and the nonce
    // inside it) must differ across independent requests, proving the
    // Suspense boundary reading headers() for the nonce (NrBrowserScripts /
    // ClerkProviderWithNonce in src/app/layout.tsx) is genuinely
    // recomputed per request rather than being part of that cached shell.
    const extractNonce = (csp: string | undefined) => {
      const scriptSrc = csp
        ?.split('; ')
        .find((entry) => entry.startsWith('script-src '));
      return scriptSrc?.match(/'nonce-([^']+)'/)?.[1];
    };

    const responses = await Promise.all([
      request.get('/'),
      request.get('/'),
      request.get('/'),
    ]);

    for (const response of responses) {
      expect(response.status()).toBe(200);
    }

    const nonces = responses.map((response) =>
      extractNonce(response.headers()['content-security-policy']),
    );

    for (const nonce of nonces) {
      expect(nonce).toBeTruthy();
    }
    expect(new Set(nonces).size).toBe(nonces.length);
  });
});
