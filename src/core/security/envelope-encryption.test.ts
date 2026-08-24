import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  APP_SECURITY_MASTER_KEY: undefined as string | undefined,
  APP_SECURITY_MASTER_KEY_PREVIOUS: undefined as string | undefined,
};

vi.mock('@/core/env', async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...actual,
    get env() {
      return { ...actual.env, ...envMock };
    },
  };
});

import { MissingAppSecurityKeyError } from './app-keys';
import {
  decryptSecret,
  encryptSecret,
  needsReEncryption,
  type EnvelopeContext,
} from './envelope-encryption';

const CURRENT = 'envelope-test-current-master-key-not-a-real-secret';
const ROTATED_IN = 'envelope-test-rotated-in-master-key-not-a-real-secret';

const context: EnvelopeContext = {
  purpose: 'authjs-totp-encryption',
  aad: 'user_mfa_totp:11111111-1111-4111-8111-111111111111',
};

const SEED = 'JBSWY3DPEHPK3PXP';

beforeEach(() => {
  envMock.APP_SECURITY_MASTER_KEY = CURRENT;
  envMock.APP_SECURITY_MASTER_KEY_PREVIOUS = undefined;
});

describe('envelope encryption', () => {
  it('round-trips a secret', async () => {
    const envelope = await encryptSecret(SEED, context);

    expect(envelope.startsWith('v1.')).toBe(true);
    // The plaintext must not survive anywhere in the envelope.
    expect(envelope).not.toContain(SEED);

    await expect(decryptSecret(envelope, context)).resolves.toEqual({
      ok: true,
      plaintext: SEED,
    });
  });

  it('produces a different ciphertext every time (fresh nonce)', async () => {
    const a = await encryptSecret(SEED, context);
    const b = await encryptSecret(SEED, context);

    expect(a).not.toBe(b);
    // Same key id, different nonce -- a reused GCM nonce under one key is
    // catastrophic, so this is not a cosmetic assertion.
    expect(a.split('.')[1]).toBe(b.split('.')[1]);
    expect(a.split('.')[2]).not.toBe(b.split('.')[2]);
  });

  it('refuses a ciphertext presented under another record (AAD binding)', async () => {
    const envelope = await encryptSecret(SEED, context);

    await expect(
      decryptSecret(envelope, {
        ...context,
        aad: 'user_mfa_totp:22222222-2222-4222-8222-222222222222',
      }),
    ).resolves.toEqual({ ok: false, reason: 'authentication_failed' });
  });

  it('refuses a ciphertext decrypted under another purpose', async () => {
    const envelope = await encryptSecret(SEED, context);

    await expect(
      decryptSecret(envelope, {
        ...context,
        purpose: 'step-up-proof-signing',
      }),
    ).resolves.toEqual({ ok: false, reason: 'authentication_failed' });
  });

  it('refuses a tampered ciphertext', async () => {
    const envelope = await encryptSecret(SEED, context);
    const parts = envelope.split('.');
    const body = parts[3]!;
    const flipped = `${body.slice(0, -1)}${body.at(-1) === 'A' ? 'B' : 'A'}`;

    await expect(
      decryptSecret([...parts.slice(0, 3), flipped].join('.'), context),
    ).resolves.toEqual({ ok: false, reason: 'authentication_failed' });
  });

  it.each([
    ['not-an-envelope'],
    ['v1.key.nonce'],
    ['v2.key.AAAAAAAAAAAAAAAA.AAAA'],
    ['v1.key.!!!.AAAA'],
  ])('rejects the malformed envelope %s', async (envelope) => {
    await expect(decryptSecret(envelope, context)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('reports an unknown key id rather than guessing', async () => {
    const envelope = await encryptSecret(SEED, context);
    const parts = envelope.split('.');

    await expect(
      decryptSecret(
        ['v1', 'ZZZZZZZZZZZ', parts[2]!, parts[3]!].join('.'),
        context,
      ),
    ).resolves.toEqual({ ok: false, reason: 'unknown_key' });
  });

  it('still decrypts material written before a key rotation', async () => {
    const beforeRotation = await encryptSecret(SEED, context);

    // Rotate: yesterday's key becomes PREVIOUS, a new one becomes CURRENT.
    envMock.APP_SECURITY_MASTER_KEY = ROTATED_IN;
    envMock.APP_SECURITY_MASTER_KEY_PREVIOUS = CURRENT;

    await expect(decryptSecret(beforeRotation, context)).resolves.toEqual({
      ok: true,
      plaintext: SEED,
    });
    await expect(needsReEncryption(beforeRotation)).resolves.toBe(true);

    const afterRotation = await encryptSecret(SEED, context);
    await expect(needsReEncryption(afterRotation)).resolves.toBe(false);
  });

  it('fails loudly when no key material is configured', async () => {
    envMock.APP_SECURITY_MASTER_KEY = undefined;

    await expect(encryptSecret(SEED, context)).rejects.toBeInstanceOf(
      MissingAppSecurityKeyError,
    );
  });
});
