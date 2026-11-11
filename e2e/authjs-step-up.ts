import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
} from '@playwright/test';
import { generate } from 'otplib';

import { signInAuthjsE2E, type AuthjsE2ECredentials } from './authjs-auth';

/**
 * The real SEC-48 second factor, driven through the app's own endpoints.
 *
 * Shared by the dedicated step-up suite and by every admin fixture that runs
 * with `ADMIN_STEP_UP_MODE=required`: there is no test-only shortcut on the
 * server side, so an admin E2E session gets its proof exactly the way a real
 * administrator does -- enroll TOTP, then answer the challenge.
 */

/** RFC 6238 code for the enrolled seed, matching the app's pinned policy. */
export async function codeFor(
  secret: string,
  epochSeconds?: number,
): Promise<string> {
  return generate({
    strategy: 'totp',
    secret,
    algorithm: 'sha1',
    digits: 6,
    period: 30,
    ...(epochSeconds === undefined ? {} : { epoch: epochSeconds }),
  });
}

/**
 * A code from the *next* time step.
 *
 * Confirming an enrollment spends the current step (that is the replay guard
 * working as designed), so any later challenge in the same test must present
 * a different one. One step ahead is inside the app's ±1-step tolerance, so
 * the server accepts it without the test having to sleep for 30 seconds.
 */
export async function nextStepCode(secret: string): Promise<string> {
  return codeFor(secret, Math.floor(Date.now() / 1000) + 30);
}

/** Enrolls a TOTP factor through the real endpoints and returns its secret. */
export async function enrollTotp(
  request: APIRequestContext,
): Promise<{ secret: string; recoveryCodes: string[] }> {
  const started = await request.post('/api/auth/mfa/totp');
  expect(started.status()).toBe(200);
  const startedBody = (await started.json()) as {
    data: { secret: string; enrollmentUri: string; qrDataUri: string };
  };
  expect(startedBody.data.enrollmentUri).toContain('otpauth://totp/');
  expect(startedBody.data.qrDataUri.startsWith('data:image/svg+xml')).toBe(
    true,
  );

  const confirmed = await request.fetch('/api/auth/mfa/totp', {
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

/** Answers the step-up challenge; the proof cookie lands in the context. */
export async function satisfyStepUp(
  request: APIRequestContext,
  code: string,
): Promise<void> {
  const verified = await request.fetch('/api/auth/step-up', {
    method: 'POST',
    data: { code },
  });
  expect(verified.status()).toBe(200);
}

type SessionStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** A signed-in admin who has passed the real step-up challenge. */
export interface SteppedUpAdminSession {
  storageState: SessionStorageState;
  secret: string;
  provedAt: number;
}

/**
 * The proof lives 15 minutes (`STEP_UP_TTL_SECONDS`). A worker-scoped session
 * is re-proved well before that, so a long serial suite never runs a mutation
 * on an expired proof and mistakes the resulting 403 for a product bug.
 */
const STEP_UP_REFRESH_AFTER_MS = 10 * 60 * 1000;

/** Signs in, enrolls TOTP and satisfies step-up: no bypass anywhere. */
export async function captureSteppedUpAdminSession(
  browser: Browser,
  credentials: AuthjsE2ECredentials,
): Promise<SteppedUpAdminSession> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signInAuthjsE2E(page, credentials);
    const { secret } = await enrollTotp(context.request);
    await satisfyStepUp(context.request, await nextStepCode(secret));
    return {
      storageState: await context.storageState(),
      secret,
      provedAt: Date.now(),
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Re-proves an ageing session in place with a fresh, unspent code. */
export async function ensureFreshStepUp(
  browser: Browser,
  session: SteppedUpAdminSession,
): Promise<void> {
  if (Date.now() - session.provedAt < STEP_UP_REFRESH_AFTER_MS) return;
  const context = await browser.newContext({
    storageState: session.storageState,
  });
  try {
    await satisfyStepUp(context.request, await codeFor(session.secret));
    session.storageState = await context.storageState();
    session.provedAt = Date.now();
  } finally {
    await context.close().catch(() => undefined);
  }
}
