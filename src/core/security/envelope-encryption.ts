import {
  deriveAesGcmKey,
  listKeyGenerations,
  MissingAppSecurityKeyError,
  type AppKeyPurpose,
} from './app-keys';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToUtf8,
  utf8ToBytes,
} from './base64url';

/**
 * AES-256-GCM envelope for secrets that must be *recoverable* rather than
 * merely verifiable (SEC-48).
 *
 * A TOTP seed cannot be stored as a hash: the verifier has to regenerate
 * codes from it. So it is stored encrypted, with the key living outside the
 * database entirely. A database dump alone -- backup disclosure, a read-only
 * credential, a mis-scoped snapshot, SQL injection -- then does not yield a
 * working second factor for every admin.
 *
 * Envelope wire format, deliberately self-describing:
 *
 *   v1.<keyId>.<nonce_b64url>.<ciphertext||tag_b64url>
 *
 * `keyId` names the master-key generation the ciphertext was written under,
 * so a rotation is a cutover rather than a flag day: new writes use the
 * current key, old rows still decrypt under `APP_SECURITY_MASTER_KEY_PREVIOUS`
 * until they are re-encrypted.
 *
 * The AAD binds each ciphertext to the record that owns it. Moving a
 * ciphertext from one user's row to another's makes decryption fail rather
 * than silently transplanting a second factor.
 */

const ENVELOPE_VERSION = 'v1';
const GCM_NONCE_BYTES = 12; // 96 bits -- the AES-GCM nonce size NIST specifies

export type DecryptFailureReason =
  | 'malformed'
  | 'unknown_key'
  | 'authentication_failed';

export type DecryptResult =
  | { readonly ok: true; readonly plaintext: string }
  | { readonly ok: false; readonly reason: DecryptFailureReason };

export interface EnvelopeContext {
  readonly purpose: AppKeyPurpose;
  /**
   * Record-scoped additional authenticated data, e.g.
   * `user_mfa_totp:<userId>`. Must be reproducible at decrypt time from the
   * row itself -- never from caller input.
   */
  readonly aad: string;
}

export async function encryptSecret(
  plaintext: string,
  context: EnvelopeContext,
): Promise<string> {
  const [generation] = await listKeyGenerations();
  if (!generation) throw new MissingAppSecurityKeyError();

  const key = await deriveAesGcmKey(context.purpose, 'current');
  if (!key) throw new MissingAppSecurityKeyError();

  const nonce = crypto.getRandomValues(new Uint8Array(GCM_NONCE_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: utf8ToBytes(context.aad) },
    key,
    utf8ToBytes(plaintext),
  );

  return [
    ENVELOPE_VERSION,
    generation.keyId,
    bytesToBase64Url(nonce),
    bytesToBase64Url(new Uint8Array(ciphertext)),
  ].join('.');
}

export async function decryptSecret(
  envelope: string,
  context: EnvelopeContext,
): Promise<DecryptResult> {
  const parts = envelope.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };

  const [version, keyId, nonceRaw, ciphertextRaw] = parts;
  if (version !== ENVELOPE_VERSION) return { ok: false, reason: 'malformed' };

  const nonce = base64UrlToBytes(nonceRaw ?? '');
  const ciphertext = base64UrlToBytes(ciphertextRaw ?? '');
  if (!nonce || !ciphertext || nonce.length !== GCM_NONCE_BYTES) {
    return { ok: false, reason: 'malformed' };
  }

  const generations = await listKeyGenerations();
  const match = generations.find((entry) => entry.keyId === keyId);
  if (!match) return { ok: false, reason: 'unknown_key' };

  const key = await deriveAesGcmKey(context.purpose, match.generation);
  if (!key) return { ok: false, reason: 'unknown_key' };

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: utf8ToBytes(context.aad) },
      key,
      ciphertext,
    );
    return { ok: true, plaintext: bytesToUtf8(new Uint8Array(plaintext)) };
  } catch {
    // A wrong AAD, a tampered ciphertext and a truncated tag are one and the
    // same answer here on purpose: the caller learns "this did not
    // authenticate", never which part of it failed.
    return { ok: false, reason: 'authentication_failed' };
  }
}

/**
 * Is this envelope written under a master-key generation that is no longer
 * the current one? Lets a caller re-encrypt opportunistically during a
 * rotation, the way SEC-47's `needsRehash` upgrades a password hash on login.
 */
export async function needsReEncryption(envelope: string): Promise<boolean> {
  const keyId = envelope.split('.')[1];
  if (!keyId) return false;

  const [current] = await listKeyGenerations();
  return current !== undefined && current.keyId !== keyId;
}
