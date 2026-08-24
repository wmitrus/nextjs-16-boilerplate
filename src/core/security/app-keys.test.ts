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

import {
  deriveAesGcmKey,
  deriveHmacKey,
  deriveKeyId,
  hasAppSecurityMasterKey,
  listKeyGenerations,
} from './app-keys';

const CURRENT = 'test-master-key-current-not-a-real-secret-value';
const PREVIOUS = 'test-master-key-previous-not-a-real-secret-value';

async function signWith(key: CryptoKey, message: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

beforeEach(() => {
  envMock.APP_SECURITY_MASTER_KEY = CURRENT;
  envMock.APP_SECURITY_MASTER_KEY_PREVIOUS = undefined;
});

describe('app key material', () => {
  it('reports whether a master key is configured', () => {
    expect(hasAppSecurityMasterKey()).toBe(true);

    envMock.APP_SECURITY_MASTER_KEY = undefined;
    expect(hasAppSecurityMasterKey()).toBe(false);

    // Whitespace is not configuration.
    envMock.APP_SECURITY_MASTER_KEY = '   ';
    expect(hasAppSecurityMasterKey()).toBe(false);
  });

  it('derives no key material when the master key is absent', async () => {
    envMock.APP_SECURITY_MASTER_KEY = undefined;

    await expect(deriveKeyId()).resolves.toBeUndefined();
    await expect(
      deriveHmacKey('step-up-proof-signing'),
    ).resolves.toBeUndefined();
    await expect(
      deriveAesGcmKey('authjs-totp-encryption'),
    ).resolves.toBeUndefined();
    await expect(listKeyGenerations()).resolves.toEqual([]);
  });

  it('gives every purpose independent key material (domain separation)', async () => {
    // The whole reason the master key is HKDF input rather than a key: two
    // mechanisms deriving from the same secret must not end up able to
    // verify each other's material. Falsified by making both derivations
    // use the same `info` label -- these signatures then match.
    const signing = await deriveHmacKey('step-up-proof-signing');
    const totp = await deriveHmacKey('authjs-totp-encryption');
    expect(signing).toBeDefined();
    expect(totp).toBeDefined();

    const message = 'same message, two purposes';
    expect(await signWith(signing!, message)).not.toBe(
      await signWith(totp!, message),
    );
  });

  it('derives the same key for the same purpose and master key', async () => {
    const a = await deriveHmacKey('step-up-proof-signing');
    const b = await deriveHmacKey('step-up-proof-signing');

    expect(await signWith(a!, 'stable')).toBe(await signWith(b!, 'stable'));
  });

  it('gives each master-key generation a distinct, stable key id', async () => {
    envMock.APP_SECURITY_MASTER_KEY_PREVIOUS = PREVIOUS;

    const currentId = await deriveKeyId('current');
    const previousId = await deriveKeyId('previous');

    expect(currentId).toBeDefined();
    expect(previousId).toBeDefined();
    expect(currentId).not.toBe(previousId);
    expect(await deriveKeyId('current')).toBe(currentId);

    // The id is derived, never the secret itself or a prefix of it (SEC-44:
    // no part of a secret may appear in anything that leaves the server).
    expect(CURRENT).not.toContain(currentId!);
    expect(currentId).not.toContain(CURRENT.slice(0, 8));
  });

  it('lists configured generations newest first', async () => {
    envMock.APP_SECURITY_MASTER_KEY_PREVIOUS = PREVIOUS;

    const generations = await listKeyGenerations();

    expect(generations.map((entry) => entry.generation)).toEqual([
      'current',
      'previous',
    ]);
  });

  it('lists only the current generation when no previous key is set', async () => {
    const generations = await listKeyGenerations();

    expect(generations).toHaveLength(1);
    expect(generations[0]?.generation).toBe('current');
  });
});
