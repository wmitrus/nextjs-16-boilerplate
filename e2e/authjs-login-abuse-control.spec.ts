import { test, expect, type Page } from '@playwright/test';

import {
  createAuthjsE2ECredentials,
  provisionAuthjsE2EUser,
} from './authjs-auth';
import { getRuntimeProfile } from './runtime-profile';

const profile = getRuntimeProfile();
const isAuthjsRuntime = profile.authProvider === 'authjs';

// Cloudflare's official "always passes" Turnstile test keypair, documented at
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/ --
// deterministic in CI: the widget auto-verifies without any human
// interaction and the server's `siteverify` call always returns success for
// it. Real (account-specific) keys are never used in this spec.
//
// This spec requires two things this scenario run sets deliberately (see
// `e2e:authjs:login-abuse` in package.json):
//   - LOGIN_ABUSE_CAPTCHA_THRESHOLD=1, so a single wrong attempt is enough to
//     require a CAPTCHA on the next one (keeps the run fast and deterministic
//     instead of depending on the default production threshold).
//   - E2E_LOGIN_ABUSE_CONTROL_ENABLED=true, which forces the account-bucket
//     abuse control back on for this run only, overriding the blanket
//     E2E_ENABLED bypass that every other authjs E2E spec relies on (see
//     SEC-34 in docs/ai/general/SECURITY_CODING_PATTERNS.md and the comment
//     next to this flag in src/modules/auth/infrastructure/authjs/auth.ts).
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';

const turnstileConfigured =
  typeof process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === 'string' &&
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim().length > 0;

async function submitCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

test.describe('AuthJS Login Abuse Control — CAPTCHA escalation (SEC-34)', () => {
  test.skip(
    !isAuthjsRuntime,
    'Auth provider is not authjs — skipping login abuse control specs',
  );
  test.skip(
    !turnstileConfigured,
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set for this run — run via `pnpm e2e:authjs:login-abuse`.',
  );

  test('requires and accepts a CAPTCHA after the configured failure threshold', async ({
    page,
    request,
  }) => {
    expect(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY).toBe(
      TURNSTILE_TEST_SITE_KEY,
    );

    const credentials = createAuthjsE2ECredentials('login-abuse');
    await provisionAuthjsE2EUser(request, credentials);

    await page.goto('/auth/signin');

    // First wrong attempt: rejected normally, no CAPTCHA yet (failedAttempts
    // was 0 going in, below the threshold).
    await submitCredentials(page, credentials.email, 'not-the-password');
    await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
    await expect(page.getByTestId('turnstile-widget-container')).toHaveCount(0);

    // Second wrong attempt: failedAttempts (1) now meets
    // LOGIN_ABUSE_CAPTCHA_THRESHOLD (1) -- the server rejects it as
    // CaptchaRequired without even checking the password, and the client
    // reveals the Turnstile widget.
    await submitCredentials(page, credentials.email, 'not-the-password');
    await expect(
      page.getByText(/complete the security check below/i),
    ).toBeVisible();
    const widgetContainer = page.getByTestId('turnstile-widget-container');
    await expect(widgetContainer).toBeVisible();

    // The submit button stays disabled until the widget's onVerify callback
    // fires with a token. Cloudflare's "always passes" test key auto-solves
    // without any human interaction, so this only waits on the real
    // script-load + verify round trip -- nothing here simulates it.
    const submitButton = page.getByRole('button', { name: /sign in/i });
    await expect(submitButton).toBeEnabled({ timeout: 30_000 });

    // Third attempt: correct password + a verified CAPTCHA token. The
    // server calls the real `siteverify` endpoint, which always succeeds
    // for this test key, so the sign-in should complete.
    await submitCredentials(page, credentials.email, credentials.password);
    await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
  });
});
