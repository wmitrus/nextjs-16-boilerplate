/** @vitest-environment node */
import { generate } from 'otplib';
import { describe, expect, it } from 'vitest';

import {
  TOTP_POLICY,
  buildTotpEnrollmentUri,
  generateTotpSecret,
  normalizeTotpCode,
  verifyTotpCode,
} from './totp';

/**
 * These tests run the real otplib code path -- the algorithm choice, the
 * digit count, the tolerance window and the replay guard are exactly what is
 * under test, so mocking the library away would leave nothing behind.
 */

const EPOCH = 1_800_000_000; // fixed instant, so time steps are deterministic

/**
 * A fixed 20-byte (32-character base32) test seed. otplib v13 rejects
 * anything below 16 bytes outright -- the classic 10-byte `JBSWY3DPEHPK3PXP`
 * example from older docs no longer validates, which is one of the v13
 * hardening changes this policy relies on.
 */
const FIXTURE_SEED = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

async function codeAt(secret: string, epochSeconds: number): Promise<string> {
  return generate({
    strategy: 'totp',
    secret,
    algorithm: TOTP_POLICY.algorithm,
    digits: TOTP_POLICY.digits,
    period: TOTP_POLICY.period,
    epoch: epochSeconds,
  });
}

describe('TOTP policy', () => {
  it('pins RFC 6238 parameters explicitly rather than inheriting defaults', () => {
    // A dependency upgrade that changes otplib's own defaults must not
    // silently change this repository's policy (SEC-47's rule for Argon2,
    // applied here).
    expect(TOTP_POLICY).toEqual({
      algorithm: 'sha1',
      digits: 6,
      period: 30,
      secretBytes: 20,
      epochToleranceSeconds: 30,
    });
  });

  it('generates a 160-bit base32 secret', () => {
    const secret = generateTotpSecret();

    // 20 bytes -> 32 base32 characters.
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it('builds an otpauth URI an authenticator can import', () => {
    const uri = buildTotpEnrollmentUri(FIXTURE_SEED, 'ada@example.com');

    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain(`secret=${FIXTURE_SEED}`);
    expect(uri).toContain('issuer=');
    expect(uri).toContain(encodeURIComponent('ada@example.com'));
    // otplib omits parameters that match the otpauth defaults (SHA-1, 6
    // digits, 30 seconds) -- which is exactly the policy pinned in
    // TOTP_POLICY, so the shortest URI here is the correct one. Asserted as
    // an absence so that a future policy change (e.g. SHA-256) is forced to
    // revisit this test rather than silently producing a URI half the
    // authenticator apps would import with the wrong algorithm.
    expect(uri).not.toContain('algorithm=');
  });
});

describe('normalizeTotpCode', () => {
  it.each([
    ['123456', '123456'],
    ['123 456', '123456'],
    ['123-456', '123456'],
  ])('accepts %s', (raw, expected) => {
    expect(normalizeTotpCode(raw)).toBe(expected);
  });

  it.each([['12345'], ['1234567'], ['abcdef'], [''], ['12345a']])(
    'rejects %s',
    (raw) => {
      expect(normalizeTotpCode(raw)).toBeUndefined();
    },
  );
});

describe('verifyTotpCode', () => {
  it('accepts the current code and reports its time step', async () => {
    const secret = generateTotpSecret();
    const code = await codeAt(secret, Date.now() / 1000);

    const result = await verifyTotpCode({ secret, code });

    expect(result.valid).toBe(true);
    expect(result.valid && result.timeStep).toBeGreaterThan(0);
  });

  it('rejects a code generated from a different secret', async () => {
    const code = await codeAt(generateTotpSecret(), Date.now() / 1000);

    await expect(
      verifyTotpCode({ secret: generateTotpSecret(), code }),
    ).resolves.toEqual({ valid: false });
  });

  it('rejects anything that is not six digits without touching the secret', async () => {
    const secret = generateTotpSecret();

    await expect(verifyTotpCode({ secret, code: 'abcdef' })).resolves.toEqual({
      valid: false,
    });
  });

  it('reports the same time step for two codes inside one window', async () => {
    // The caller's replay guard is built on this: a code observed once keeps
    // reporting the same time step for the rest of its life, so the stored
    // marker can refuse it. Replay itself is enforced in
    // DrizzleAuthJsMfaService, which also has to tell a replay apart from a
    // wrong code.
    const secret = generateTotpSecret();
    const now = Math.floor(Date.now() / 1000);
    const stepStart = now - (now % TOTP_POLICY.period);

    const first = await verifyTotpCode({
      secret,
      code: await codeAt(secret, stepStart),
    });
    const second = await verifyTotpCode({
      secret,
      code: await codeAt(secret, stepStart + 1),
    });

    expect(first.valid && second.valid).toBe(true);
    expect(first.valid ? first.timeStep : -1).toBe(
      second.valid ? second.timeStep : -2,
    );
  });

  it('accepts one step of clock drift in either direction, but not two', async () => {
    const secret = generateTotpSecret();
    const now = Math.floor(Date.now() / 1000);

    const oneStepAgo = await codeAt(secret, now - TOTP_POLICY.period);
    const twoStepsAgo = await codeAt(secret, now - TOTP_POLICY.period * 2);

    await expect(
      verifyTotpCode({ secret, code: oneStepAgo }),
    ).resolves.toMatchObject({ valid: true });
    await expect(
      verifyTotpCode({ secret, code: twoStepsAgo }),
    ).resolves.toEqual({ valid: false });
  });

  it('is deterministic for a fixed epoch (RFC 6238 time-step maths)', async () => {
    const secret = FIXTURE_SEED;

    expect(await codeAt(secret, EPOCH)).toBe(await codeAt(secret, EPOCH + 29));
    expect(await codeAt(secret, EPOCH)).not.toBe(
      await codeAt(secret, EPOCH + 30),
    );
  });
});
