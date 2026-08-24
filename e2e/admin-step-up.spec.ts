import { expect, test, type Page } from '@playwright/test';
import { generate } from 'otplib';

import {
  createAuthjsE2ECredentials,
  isAuthjsRuntime,
  provisionAuthjsE2EUser,
  signInAuthjsE2E,
} from './authjs-auth';

/**
 * Real step-up round trip (SEC-48).
 *
 * The admin suites run with `ADMIN_STEP_UP_MODE=bypass-local-only` because
 * their subject is something else. This spec is the one that must not: it
 * runs with enforcement **required**, and proves the whole chain end to end
 * -- enroll a real TOTP factor, get refused without a proof, pass the
 * challenge, and be allowed exactly once the proof exists.
 *
 * Run it with `pnpm e2e:admin:step-up`, which sets the required mode and the
 * application key material.
 */

const isAuthjs = isAuthjsRuntime();
const stepUpRequired = process.env.ADMIN_STEP_UP_MODE === 'required';

/** RFC 6238 code for the enrolled seed, matching the app's pinned policy. */
async function codeFor(secret: string, epochSeconds?: number): Promise<string> {
  return generate({
    strategy: 'totp',
    secret,
    algorithm: 'sha1',
    digits: 6,
    period: 30,
    ...(epochSeconds === undefined ? {} : { epoch: epochSeconds }),
  });
}

/** Enrolls a TOTP factor through the real endpoints and returns its secret. */
async function enrollTotp(
  page: Page,
): Promise<{ secret: string; recoveryCodes: string[] }> {
  const started = await page.request.post('/api/auth/mfa/totp');
  expect(started.status()).toBe(200);
  const startedBody = (await started.json()) as {
    data: { secret: string; enrollmentUri: string; qrDataUri: string };
  };
  expect(startedBody.data.enrollmentUri).toContain('otpauth://totp/');
  expect(startedBody.data.qrDataUri.startsWith('data:image/svg+xml')).toBe(
    true,
  );

  const confirmed = await page.request.fetch('/api/auth/mfa/totp', {
    method: 'PUT',
    data: { code: await codeFor(startedBody.data.secret) },
  });
  expect(confirmed.status()).toBe(200);
  const confirmedBody = (await confirmed.json()) as {
    data: { recoveryCodes: string[] };
  };
  expect(confirmedBody.data.recoveryCodes).toHaveLength(10);

  return {
    secret: startedBody.data.secret,
    recoveryCodes: confirmedBody.data.recoveryCodes,
  };
}

/** A mutation that exists on every scenario: renaming the caller's own row. */
async function attemptAdminMutation(page: Page, userId: string) {
  return page.request.fetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    data: { displayName: `Step-up probe ${Date.now()}` },
  });
}

test.describe('Admin step-up (SEC-48)', () => {
  test.skip(
    !isAuthjs || !stepUpRequired,
    'Runs only under AUTH_PROVIDER=authjs with ADMIN_STEP_UP_MODE=required (pnpm e2e:admin:step-up)',
  );

  test('an admin without a second factor is sent to enrollment', async ({
    page,
    request,
  }) => {
    const credentials = createAuthjsE2ECredentials('step-up-unenrolled');
    await provisionAuthjsE2EUser(request, credentials);
    await signInAuthjsE2E(page, credentials);

    await page.goto('/admin');

    await expect(page).toHaveURL(/\/account\/security\/mfa/);
    await expect(
      page.getByRole('button', { name: 'Set up authenticator app' }),
    ).toBeVisible();
  });

  test('a mutation is refused without a proof and allowed with one', async ({
    page,
    request,
  }) => {
    const credentials = createAuthjsE2ECredentials('step-up-enrolled');
    await provisionAuthjsE2EUser(request, credentials);
    await signInAuthjsE2E(page, credentials);

    const { secret } = await enrollTotp(page);

    // Enrolled: the admin panel is reachable again.
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);

    const session = await page.request.get('/api/auth/session');
    const sessionBody = (await session.json()) as {
      user?: { id?: string };
    };
    expect(sessionBody.user?.id).toBeTruthy();

    const usersResponse = await page.request.get('/api/admin/users?limit=1');
    expect(usersResponse.status()).toBe(200);
    const usersBody = (await usersResponse.json()) as {
      data: { users: Array<{ id: string }> };
    };
    const targetId = usersBody.data.users[0]?.id;
    expect(targetId).toBeTruthy();

    // No proof yet: refused, with a machine-readable reason.
    const refused = await attemptAdminMutation(page, targetId!);
    expect(refused.status()).toBe(403);
    expect(((await refused.json()) as { code?: string }).code).toBe(
      'STEP_UP_REQUIRED',
    );

    // A wrong code does not produce a proof.
    const wrongCode = await page.request.fetch('/api/auth/step-up', {
      method: 'POST',
      data: { code: '000000' },
    });
    expect(wrongCode.status()).toBe(401);
    expect((await attemptAdminMutation(page, targetId!)).status()).toBe(403);

    // The real code does.
    const verified = await page.request.fetch('/api/auth/step-up', {
      method: 'POST',
      data: { code: await codeFor(secret) },
    });
    expect(verified.status()).toBe(200);

    const allowed = await attemptAdminMutation(page, targetId!);
    expect(allowed.status()).toBe(200);
  });

  test('a recovery code satisfies the challenge exactly once', async ({
    page,
    request,
  }) => {
    const credentials = createAuthjsE2ECredentials('step-up-recovery');
    await provisionAuthjsE2EUser(request, credentials);
    await signInAuthjsE2E(page, credentials);

    const { recoveryCodes } = await enrollTotp(page);
    const code = recoveryCodes[0]!;

    const first = await page.request.fetch('/api/auth/step-up', {
      method: 'POST',
      data: { code },
    });
    expect(first.status()).toBe(200);

    const reused = await page.request.fetch('/api/auth/step-up', {
      method: 'POST',
      data: { code },
    });
    expect(reused.status()).toBe(401);
  });

  test('sign-in itself requires the second factor once enrolled', async ({
    page,
    request,
    browser,
  }) => {
    const credentials = createAuthjsE2ECredentials('step-up-signin');
    await provisionAuthjsE2EUser(request, credentials);
    await signInAuthjsE2E(page, credentials);
    const { secret } = await enrollTotp(page);

    // A fresh browser context: password alone must no longer be enough.
    const context = await browser.newContext();
    try {
      const freshPage = await context.newPage();
      await freshPage.goto('/auth/signin');
      await freshPage.fill('input[type="email"]', credentials.email);
      await freshPage.fill('input[type="password"]', credentials.password);
      await freshPage.click('button[type="submit"]');

      const codeField = freshPage.getByLabel('Authentication code');
      await expect(codeField).toBeVisible();

      await codeField.fill(await codeFor(secret));
      await Promise.all([
        freshPage.waitForURL((url) => !url.pathname.startsWith('/auth/'), {
          waitUntil: 'domcontentloaded',
        }),
        freshPage.click('button[type="submit"]'),
      ]);
    } finally {
      await context.close().catch(() => undefined);
    }
  });
});
