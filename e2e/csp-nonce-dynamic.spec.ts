import { expect, test } from '@playwright/test';

import { readScriptNonces, trackCspViolations } from './support/csp-violations';

/**
 * Only meaningful against a deployment/scenario running with
 * CSP_SCRIPT_MODE=nonce-dynamic (see `pnpm e2e:csp-nonce-dynamic`) — never
 * part of the default suite, since nonce-dynamic is not this app's
 * default mode (see SEC-30/SEC-31 in
 * docs/ai/general/SECURITY_CODING_PATTERNS.md for why).
 *
 * This is the E2E coverage an external review pointed out was missing:
 * prior CSP tests checked the response *header* string only. They proved
 * nothing about whether the nonce in that header matched the nonce
 * actually on every `<script>` tag, whether zero CSP violations occurred,
 * or whether the page actually hydrated — exactly the gap that let the
 * Phase 1 nonce/PPR incompatibility bug ship undetected by tests.
 */
test.describe('CSP nonce-dynamic mode', () => {
  test('serves a real nonce+strict-dynamic CSP that every script tag matches, with zero violations, and the page actually hydrates', async ({
    page,
  }) => {
    const tracker = await trackCspViolations(page);

    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // 1. The response header itself: nonce + strict-dynamic, no
    // unsafe-inline. (Covered elsewhere with env mocked too, but this is
    // the real, deployed header.)
    const headers = response!.headers();
    const scriptSrc = headers['content-security-policy']
      ?.split('; ')
      .find((entry) => entry.startsWith('script-src '));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'strict-dynamic'");

    const nonceMatch = /'nonce-([^']+)'/.exec(scriptSrc!);
    expect(nonceMatch).not.toBeNull();
    const headerNonce = nonceMatch![1];

    // Give the page real time to stream/hydrate, matching what a patient
    // real-world user would experience — the original bug only showed up
    // after waiting past the initial paint, not on first response.
    await page.waitForTimeout(5000);

    // 2. Every <script> element actually in the DOM must carry the SAME
    // nonce as the header — not just "a nonce". This is the exact gap the
    // header-only check couldn't see: Next's own framework/bootstrap
    // scripts could in principle end up un-nonced (see SEC-30's incident)
    // while a hand-written <Script nonce={...}> tag looks fine in
    // isolation.
    const scriptNonces = await readScriptNonces(page);
    expect(scriptNonces.length).toBeGreaterThan(0);
    for (const nonce of scriptNonces) {
      expect(nonce).toBe(headerNonce);
    }

    // 3. Zero CSP violations across the full page lifecycle so far. This
    // is the direct, load-bearing assertion — the original bug's signature
    // was every script blocked by exactly this event, which no prior test
    // was listening for at all.
    expect(tracker.violations).toEqual([]);

    // 4. Real hydration, not just a painted DOM. HeaderAuthControls
    // renders only an `animate-pulse` skeleton until its `isMounted`
    // state — set inside a `useEffect`, which only ever runs after React
    // has hydrated — flips true. The Sign In button replacing that
    // skeleton is direct, first-party proof hydration completed; the
    // original bug's own signature (Lighthouse/mobile diagnostics) was
    // this exact skeleton staying forever.
    const skeleton = page.locator('.animate-pulse');
    await expect(skeleton).toHaveCount(0);
    const signInButton = page.getByRole('button', { name: 'Sign In' });
    await expect(signInButton).toBeVisible();

    // 5. A real, wired-up event handler: clicking Sign In opens Clerk's
    // modal. If hydration or script execution were broken, the button
    // would render (server HTML) but the click would do nothing.
    await signInButton.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

    // No unexpected console/page errors either, for good measure.
    expect(
      tracker.pageErrors.filter((message) =>
        message.includes('Connection closed'),
      ),
    ).toEqual([]);
  });
});
