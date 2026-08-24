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

import { MissingAppSecurityKeyError } from '@/core/security/app-keys';
import { bytesToBase64Url, utf8ToBytes } from '@/core/security/base64url';

import { STEP_UP_TTL_SECONDS } from './policy';
import { mintStepUpProof, verifyStepUpProof } from './proof';

const CURRENT = 'proof-test-current-master-key-not-a-real-secret';
const ROTATED_IN = 'proof-test-rotated-in-master-key-not-a-real-secret';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = 'sess_abc123';
const NOW = 1_800_000_000;

beforeEach(() => {
  envMock.APP_SECURITY_MASTER_KEY = CURRENT;
  envMock.APP_SECURITY_MASTER_KEY_PREVIOUS = undefined;
});

async function mint(
  overrides: Partial<Parameters<typeof mintStepUpProof>[0]> = {},
) {
  return mintStepUpProof({
    userId: USER_ID,
    logicalSessionId: SESSION_ID,
    methods: ['pwd', 'otp'],
    nowSeconds: NOW,
    ...overrides,
  });
}

describe('step-up proof', () => {
  it('mints a proof that verifies for the same subject and session', async () => {
    const { token, claims } = await mint();

    expect(claims.acr).toBe('mfa');
    expect(claims.amr).toEqual(['pwd', 'otp']);
    expect(claims.exp - claims.iat).toBe(STEP_UP_TTL_SECONDS);

    await expect(
      verifyStepUpProof({
        token,
        userId: USER_ID,
        logicalSessionId: SESSION_ID,
        nowSeconds: NOW + 60,
      }),
    ).resolves.toMatchObject({ valid: true });
  });

  it('expires exactly at the policy TTL, not a second later', async () => {
    const { token } = await mint();

    await expect(
      verifyStepUpProof({
        token,
        userId: USER_ID,
        logicalSessionId: SESSION_ID,
        nowSeconds: NOW + STEP_UP_TTL_SECONDS - 1,
      }),
    ).resolves.toMatchObject({ valid: true });

    await expect(
      verifyStepUpProof({
        token,
        userId: USER_ID,
        logicalSessionId: SESSION_ID,
        nowSeconds: NOW + STEP_UP_TTL_SECONDS,
      }),
    ).resolves.toEqual({ valid: false, reason: 'expired' });
  });

  it('refuses a proof issued to another principal', async () => {
    const { token } = await mint();

    await expect(
      verifyStepUpProof({
        token,
        userId: '44444444-4444-4444-8444-444444444444',
        logicalSessionId: SESSION_ID,
        nowSeconds: NOW,
      }),
    ).resolves.toEqual({ valid: false, reason: 'subject_mismatch' });
  });

  it('refuses a proof earned in another session', async () => {
    // This is what makes sign-out, re-login and SEC-36 session revocation
    // invalidate a still-unexpired proof: the new session has a new id.
    const { token } = await mint();

    await expect(
      verifyStepUpProof({
        token,
        userId: USER_ID,
        logicalSessionId: 'sess_rotated',
        nowSeconds: NOW,
      }),
    ).resolves.toEqual({ valid: false, reason: 'session_mismatch' });
  });

  it('refuses a proof whose claims were rewritten', async () => {
    const { token } = await mint();
    const [version, keyId, , signature] = token.split('.');

    const forged = bytesToBase64Url(
      utf8ToBytes(
        JSON.stringify({
          sub: '44444444-4444-4444-8444-444444444444',
          sid: SESSION_ID,
          acr: 'mfa',
          amr: ['pwd', 'otp'],
          iat: NOW,
          exp: NOW + STEP_UP_TTL_SECONDS,
        }),
      ),
    );

    await expect(
      verifyStepUpProof({
        token: [version, keyId, forged, signature].join('.'),
        userId: '44444444-4444-4444-8444-444444444444',
        logicalSessionId: SESSION_ID,
        nowSeconds: NOW,
      }),
    ).resolves.toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('refuses a proof signed with unrelated key material', async () => {
    const { token } = await mint();

    // A different master key: the key id no longer resolves at all.
    envMock.APP_SECURITY_MASTER_KEY = ROTATED_IN;

    await expect(
      verifyStepUpProof({
        token,
        userId: USER_ID,
        logicalSessionId: SESSION_ID,
        nowSeconds: NOW,
      }),
    ).resolves.toEqual({ valid: false, reason: 'unknown_key' });
  });

  it('still verifies a proof minted before a key rotation', async () => {
    const { token } = await mint();

    envMock.APP_SECURITY_MASTER_KEY = ROTATED_IN;
    envMock.APP_SECURITY_MASTER_KEY_PREVIOUS = CURRENT;

    await expect(
      verifyStepUpProof({
        token,
        userId: USER_ID,
        logicalSessionId: SESSION_ID,
        nowSeconds: NOW,
      }),
    ).resolves.toMatchObject({ valid: true });
  });

  it.each([['nonsense'], ['v1.a.b'], ['v2.a.b.c'], ['v1..b.c']])(
    'rejects the malformed token %s',
    async (token) => {
      await expect(
        verifyStepUpProof({
          token,
          userId: USER_ID,
          logicalSessionId: SESSION_ID,
          nowSeconds: NOW,
        }),
      ).resolves.toEqual({ valid: false, reason: 'malformed' });
    },
  );

  it('rejects an authentically signed proof that claims a lower assurance', async () => {
    // Signature valid, claims parse, but `acr` is not `mfa`: a password-only
    // proof must never satisfy an admin mutation. Minted here by signing the
    // claims directly, which is the only way such a token could exist.
    const { deriveHmacKey, deriveKeyId } =
      await import('@/core/security/app-keys');
    const key = await deriveHmacKey('step-up-proof-signing');
    const keyId = await deriveKeyId();

    const payload = bytesToBase64Url(
      utf8ToBytes(
        JSON.stringify({
          sub: USER_ID,
          sid: SESSION_ID,
          acr: 'pwd',
          amr: ['pwd'],
          iat: NOW,
          exp: NOW + STEP_UP_TTL_SECONDS,
        }),
      ),
    );
    const signingInput = `v1.${keyId}.${payload}`;
    const signature = await crypto.subtle.sign(
      'HMAC',
      key!,
      utf8ToBytes(signingInput),
    );

    await expect(
      verifyStepUpProof({
        token: `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`,
        userId: USER_ID,
        logicalSessionId: SESSION_ID,
        nowSeconds: NOW,
      }),
    ).resolves.toEqual({ valid: false, reason: 'insufficient_assurance' });
  });

  it('rejects an authentically signed proof with an over-long lifetime', async () => {
    const { deriveHmacKey, deriveKeyId } =
      await import('@/core/security/app-keys');
    const key = await deriveHmacKey('step-up-proof-signing');
    const keyId = await deriveKeyId();

    const payload = bytesToBase64Url(
      utf8ToBytes(
        JSON.stringify({
          sub: USER_ID,
          sid: SESSION_ID,
          acr: 'mfa',
          amr: ['pwd', 'otp'],
          iat: NOW,
          exp: NOW + STEP_UP_TTL_SECONDS * 10,
        }),
      ),
    );
    const signingInput = `v1.${keyId}.${payload}`;
    const signature = await crypto.subtle.sign(
      'HMAC',
      key!,
      utf8ToBytes(signingInput),
    );

    await expect(
      verifyStepUpProof({
        token: `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`,
        userId: USER_ID,
        logicalSessionId: SESSION_ID,
        nowSeconds: NOW + STEP_UP_TTL_SECONDS + 1,
      }),
    ).resolves.toEqual({ valid: false, reason: 'insufficient_assurance' });
  });

  it('cannot mint without key material', async () => {
    envMock.APP_SECURITY_MASTER_KEY = undefined;

    await expect(mint()).rejects.toBeInstanceOf(MissingAppSecurityKeyError);
  });
});
