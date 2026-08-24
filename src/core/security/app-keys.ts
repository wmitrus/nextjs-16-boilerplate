import { env } from '@/core/env';

import { bytesToBase64Url } from './base64url';

/**
 * Application key material (SEC-48).
 *
 * One master secret, `APP_SECURITY_MASTER_KEY`, is **never used directly for
 * any cryptographic operation**. It is HKDF input only. Every consumer
 * derives its own subkey under a distinct context label, so two mechanisms
 * can never end up sharing key material:
 *
 * - `step-up-proof-signing/v1` -- HMAC-SHA256 over the step-up proof
 * - `authjs-totp-encryption/v1` -- AES-256-GCM over a stored TOTP seed
 *
 * Why a dedicated application key at all, rather than reusing
 * `NEXTAUTH_SECRET` or `CLERK_SECRET_KEY`: step-up spans *both* auth
 * providers. Signing a provider-neutral mechanism with a provider's secret
 * leaks that provider back into the shared mechanism, and makes a provider
 * swap (or a provider-side secret rotation) silently invalidate an unrelated
 * security control.
 *
 * Web Crypto only -- no `node:crypto` -- so the same module is valid in the
 * Node and Edge runtimes.
 */

export type AppKeyPurpose = 'step-up-proof-signing' | 'authjs-totp-encryption';

/**
 * Derivation version, part of every HKDF `info` label and therefore of the
 * key identity. Bump it only to deliberately invalidate everything derived
 * under the old label (which, for TOTP seeds, means re-enrollment).
 */
export const APP_KEY_DERIVATION_VERSION = 1;

/**
 * Fixed, non-secret HKDF salt. RFC 5869 permits an empty salt; a constant
 * application-scoped one costs nothing and keeps material derived here from
 * colliding with material some other system derives from the same master
 * secret.
 */
const HKDF_SALT = new TextEncoder().encode(
  'nextjs-boilerplate/app-security/hkdf-salt/v1',
);

export class MissingAppSecurityKeyError extends Error {
  constructor() {
    super(
      'APP_SECURITY_MASTER_KEY is not configured. Step-up authentication and ' +
        'MFA secret storage cannot operate without it. Generate one with: ' +
        'openssl rand -base64 48',
    );
    this.name = 'MissingAppSecurityKeyError';
  }
}

export type MasterKeyGeneration = 'current' | 'previous';

function readMasterKey(generation: MasterKeyGeneration): string | undefined {
  const raw =
    generation === 'current'
      ? env.APP_SECURITY_MASTER_KEY
      : env.APP_SECURITY_MASTER_KEY_PREVIOUS;

  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/** Is any usable master key configured at all? */
export function hasAppSecurityMasterKey(): boolean {
  return readMasterKey('current') !== undefined;
}

async function importHkdfBaseKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'HKDF',
    false,
    ['deriveKey', 'deriveBits'],
  );
}

function hkdfParams(info: string): HkdfParams {
  return {
    name: 'HKDF',
    hash: 'SHA-256',
    salt: HKDF_SALT,
    info: new TextEncoder().encode(info),
  };
}

function label(purpose: AppKeyPurpose): string {
  return `${purpose}/v${APP_KEY_DERIVATION_VERSION}`;
}

/**
 * Stable, non-secret identifier for a master key generation.
 *
 * Persisted alongside every ciphertext and every signature so a rotation
 * needs no flag day: material written under the outgoing key still names
 * that key, and the verifier finds it in `APP_SECURITY_MASTER_KEY_PREVIOUS`.
 *
 * Derived through HKDF under its own label rather than hashing the secret
 * directly -- the id is public, and nothing public should be a function the
 * attacker can also compute over a guessed secret in a *different* domain
 * than the one the real keys live in.
 */
export async function deriveKeyId(
  generation: MasterKeyGeneration = 'current',
): Promise<string | undefined> {
  const secret = readMasterKey(generation);
  if (!secret) return undefined;

  const base = await importHkdfBaseKey(secret);
  const bits = await crypto.subtle.deriveBits(
    hkdfParams(`app-key-id/v${APP_KEY_DERIVATION_VERSION}`),
    base,
    64,
  );

  return bytesToBase64Url(new Uint8Array(bits));
}

/** HMAC-SHA256 subkey for `purpose`, from the named master-key generation. */
export async function deriveHmacKey(
  purpose: AppKeyPurpose,
  generation: MasterKeyGeneration = 'current',
): Promise<CryptoKey | undefined> {
  const secret = readMasterKey(generation);
  if (!secret) return undefined;

  const base = await importHkdfBaseKey(secret);
  return crypto.subtle.deriveKey(
    hkdfParams(label(purpose)),
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  );
}

/** AES-256-GCM subkey for `purpose`, from the named master-key generation. */
export async function deriveAesGcmKey(
  purpose: AppKeyPurpose,
  generation: MasterKeyGeneration = 'current',
): Promise<CryptoKey | undefined> {
  const secret = readMasterKey(generation);
  if (!secret) return undefined;

  const base = await importHkdfBaseKey(secret);
  return crypto.subtle.deriveKey(
    hkdfParams(label(purpose)),
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Every configured generation, newest first, as `[keyId, generation]` pairs.
 * Verifiers and decryptors walk this to find the generation a given key id
 * was produced under.
 */
export async function listKeyGenerations(): Promise<
  Array<{ keyId: string; generation: MasterKeyGeneration }>
> {
  const generations: MasterKeyGeneration[] = ['current', 'previous'];
  const resolved: Array<{ keyId: string; generation: MasterKeyGeneration }> =
    [];

  for (const generation of generations) {
    const keyId = await deriveKeyId(generation);
    if (keyId) resolved.push({ keyId, generation });
  }

  return resolved;
}
