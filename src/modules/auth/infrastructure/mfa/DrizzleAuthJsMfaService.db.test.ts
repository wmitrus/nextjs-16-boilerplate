/** @vitest-environment node */
import { generate } from 'otplib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// `vi.hoisted`: the mock factory below is hoisted above module-level consts,
// and this file's import graph touches `env` during that hoisting (the
// migration runner resolves the logger), so a plain const would be in its
// temporal dead zone.
const envMock = vi.hoisted(() => ({
  APP_SECURITY_MASTER_KEY: 'mfa-db-test-master-key-not-a-real-secret-value',
  APP_SECURITY_MASTER_KEY_PREVIOUS: undefined as string | undefined,
}));

vi.mock('@/core/env', async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...actual,
    get env() {
      return { ...actual.env, ...envMock };
    },
  };
});

import { MfaAlreadyEnrolledError } from '@/core/contracts/mfa';

import { DrizzleAuthJsMfaService } from './DrizzleAuthJsMfaService';
import { TOTP_POLICY } from './totp';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let service: DrizzleAuthJsMfaService;
let userId: string;
let otherUserId: string;

async function codeFor(secret: string, epochSeconds?: number): Promise<string> {
  return generate({
    strategy: 'totp',
    secret,
    algorithm: TOTP_POLICY.algorithm,
    digits: TOTP_POLICY.digits,
    period: TOTP_POLICY.period,
    ...(epochSeconds === undefined ? {} : { epoch: epochSeconds }),
  });
}

/** Enrolls the user and returns the confirmed seed plus its recovery codes. */
async function enroll(subjectId: string): Promise<{
  secret: string;
  recoveryCodes: readonly string[];
}> {
  const started = await service.startEnrollment(
    { userId: subjectId },
    'fixture@example.com',
  );
  const confirmation = await service.confirmEnrollment(
    { userId: subjectId },
    await codeFor(started.secret),
  );

  if (!confirmation.ok) {
    throw new Error(`fixture enrollment failed: ${confirmation.reason}`);
  }

  return { secret: started.secret, recoveryCodes: confirmation.recoveryCodes };
}

beforeAll(async () => {
  testDb = await resolveTestDb();
  service = new DrizzleAuthJsMfaService(testDb.db);

  const users = await seedUsers(testDb.db);
  userId = users.alice.id;
  otherUserId = users.bob.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAuthJsMfaService (real DB)', () => {
  it('reports an unenrolled account as unenrolled', async () => {
    await expect(service.getStatus({ userId })).resolves.toEqual({
      enrolled: false,
      enrollmentSurface: 'application',
      enrollmentUrl: '/account/security/mfa',
    });
  });

  it('does not count a started-but-unconfirmed enrollment as a factor', async () => {
    // The difference between "has a second factor" and "once opened the
    // setup page". Falsified by dropping `confirmedAt` from `getStatus`.
    await service.startEnrollment({ userId }, 'alice@example.com');

    await expect(service.getStatus({ userId })).resolves.toMatchObject({
      enrolled: false,
    });
  });

  it('refuses to verify a challenge while enrollment is unconfirmed', async () => {
    const started = await service.startEnrollment(
      { userId },
      'alice@example.com',
    );

    await expect(
      service.verifyChallenge({ userId }, await codeFor(started.secret)),
    ).resolves.toEqual({ ok: false, reason: 'not_enrolled' });
  });

  it('rejects a wrong code at confirmation and stays unconfirmed', async () => {
    await service.startEnrollment({ userId }, 'alice@example.com');

    await expect(
      service.confirmEnrollment({ userId }, '000000'),
    ).resolves.toEqual({ ok: false, reason: 'invalid_code' });
    await expect(service.getStatus({ userId })).resolves.toMatchObject({
      enrolled: false,
    });
  });

  it('confirms enrollment and issues ten recovery codes', async () => {
    const { recoveryCodes } = await enroll(userId);

    expect(recoveryCodes).toHaveLength(10);
    await expect(service.getStatus({ userId })).resolves.toMatchObject({
      enrolled: true,
    });
  });

  it('does not let the confirming code also satisfy the first challenge', async () => {
    // Confirmation spends a code; replaying it immediately afterwards is the
    // most obvious replay there is.
    await service.disable({ userId });
    const started = await service.startEnrollment(
      { userId },
      'alice@example.com',
    );
    const code = await codeFor(started.secret);
    await service.confirmEnrollment({ userId }, code);

    await expect(service.verifyChallenge({ userId }, code)).resolves.toEqual({
      ok: false,
      reason: 'replayed',
    });
  });

  it('accepts a fresh code and then refuses that same code', async () => {
    await service.disable({ userId });
    const { secret } = await enroll(userId);

    // A code from the next time step, so it is not the one confirmation spent.
    const future = Math.floor(Date.now() / 1000) + TOTP_POLICY.period;
    const code = await codeFor(secret, future);

    await expect(service.verifyChallenge({ userId }, code)).resolves.toEqual({
      ok: true,
      factor: 'otp',
    });
    await expect(service.verifyChallenge({ userId }, code)).resolves.toEqual({
      ok: false,
      reason: 'replayed',
    });
  });

  it('rejects a code minted from another account seed', async () => {
    await service.disable({ userId });
    await enroll(userId);
    const foreign = await service.startEnrollment(
      { userId: otherUserId },
      'bob@example.com',
    );

    await expect(
      service.verifyChallenge({ userId }, await codeFor(foreign.secret)),
    ).resolves.toEqual({ ok: false, reason: 'invalid_code' });

    await service.disable({ userId: otherUserId });
  });

  it('consumes a recovery code exactly once', async () => {
    await service.disable({ userId });
    const { recoveryCodes } = await enroll(userId);
    const code = recoveryCodes[0]!;

    await expect(service.verifyChallenge({ userId }, code)).resolves.toEqual({
      ok: true,
      factor: 'recovery',
    });
    // A used code is indistinguishable from an unknown one.
    await expect(service.verifyChallenge({ userId }, code)).resolves.toEqual({
      ok: false,
      reason: 'invalid_code',
    });
  });

  it('rejects a recovery code belonging to another account', async () => {
    await service.disable({ userId });
    await service.disable({ userId: otherUserId });
    await enroll(userId);
    const other = await enroll(otherUserId);

    await expect(
      service.verifyChallenge({ userId }, other.recoveryCodes[0]!),
    ).resolves.toEqual({ ok: false, reason: 'invalid_code' });
  });

  it('invalidates the whole previous set when codes are regenerated', async () => {
    await service.disable({ userId });
    const { recoveryCodes } = await enroll(userId);

    const regenerated = await service.regenerateRecoveryCodes({ userId });
    expect(regenerated).toHaveLength(10);
    expect(regenerated).not.toEqual(recoveryCodes);

    await expect(
      service.verifyChallenge({ userId }, recoveryCodes[1]!),
    ).resolves.toEqual({ ok: false, reason: 'invalid_code' });
    await expect(
      service.verifyChallenge({ userId }, regenerated[0]!),
    ).resolves.toEqual({ ok: true, factor: 'recovery' });
  });

  it('refuses to start a second enrollment over a confirmed factor', async () => {
    await service.disable({ userId });
    await enroll(userId);

    await expect(
      service.startEnrollment({ userId }, 'alice@example.com'),
    ).rejects.toBeInstanceOf(MfaAlreadyEnrolledError);
  });

  it('removes the factor and every recovery code on disable', async () => {
    await service.disable({ userId });
    const { recoveryCodes } = await enroll(userId);

    await service.disable({ userId });

    await expect(service.getStatus({ userId })).resolves.toMatchObject({
      enrolled: false,
    });
    await expect(
      service.verifyChallenge({ userId }, recoveryCodes[0]!),
    ).resolves.toEqual({ ok: false, reason: 'not_enrolled' });
  });

  it('cannot decrypt a seed written under unrelated key material', async () => {
    // The seed is encrypted, not merely stored: losing/rotating away the key
    // must fail closed rather than silently accept or crash.
    await service.disable({ userId });
    const { secret } = await enroll(userId);

    envMock.APP_SECURITY_MASTER_KEY = 'a-completely-different-master-key-value';
    try {
      const future = Math.floor(Date.now() / 1000) + TOTP_POLICY.period * 2;
      await expect(
        service.verifyChallenge({ userId }, await codeFor(secret, future)),
      ).resolves.toEqual({ ok: false, reason: 'unavailable' });
    } finally {
      envMock.APP_SECURITY_MASTER_KEY =
        'mfa-db-test-master-key-not-a-real-secret-value';
    }
  });
});
