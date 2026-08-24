import {
  deriveHmacKey,
  listKeyGenerations,
  MissingAppSecurityKeyError,
} from '@/core/security/app-keys';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToUtf8,
  utf8ToBytes,
} from '@/core/security/base64url';

import {
  REQUIRED_ASSURANCE,
  STEP_UP_TTL_SECONDS,
  type AssuranceLevel,
  type AuthenticationMethod,
} from './policy';

/**
 * The step-up proof (SEC-48).
 *
 * Stateless, application-signed, short-lived. It answers exactly one
 * question -- *this principal, in this session, reached assurance level
 * `acr` at time `iat`* -- and it is not a credential: possession of it
 * without a valid base session grants nothing, because the guard validates
 * the session first and only then looks at the proof.
 *
 * Wire format:
 *
 *   v1.<keyId>.<payload_b64url>.<signature_b64url>
 *
 * The signature covers `v1.<keyId>.<payload_b64url>`, so neither the key id
 * nor the version can be swapped without invalidating it.
 *
 * Three bindings make a stolen or stale proof useless:
 *
 * - `sub` -- the **internal** user id, never a provider id. Two provider
 *   accounts linked to one internal user are the same principal here.
 * - `sid` -- a provider-neutral logical session reference. A new sign-in
 *   produces a new one, so a proof never outlives the session that earned
 *   it, and SEC-36's revocation (which invalidates the session) invalidates
 *   the proof by consequence.
 * - `exp` -- 15 minutes, fixed in code.
 *
 * `amr` records the factors that produced the proof for the audit trail;
 * `acr` is what the guard actually compares. Nothing anywhere branches on
 * which provider or library performed the verification.
 */

const PROOF_VERSION = 'v1';

/** Tolerance for a proof minted "in the future" by the same server clock. */
const MAX_CLOCK_SKEW_SECONDS = 60;

export interface StepUpProofClaims {
  readonly sub: string;
  readonly sid: string;
  readonly acr: AssuranceLevel;
  readonly amr: readonly AuthenticationMethod[];
  readonly iat: number;
  readonly exp: number;
}

export interface MintStepUpProofInput {
  readonly userId: string;
  readonly logicalSessionId: string;
  readonly methods: readonly AuthenticationMethod[];
  /** Injectable for tests; defaults to the current time. */
  readonly nowSeconds?: number;
}

export interface MintedStepUpProof {
  readonly token: string;
  readonly claims: StepUpProofClaims;
}

export type StepUpProofFailureReason =
  | 'malformed'
  | 'unknown_key'
  | 'bad_signature'
  | 'expired'
  | 'not_yet_valid'
  | 'subject_mismatch'
  | 'session_mismatch'
  | 'insufficient_assurance';

export type StepUpProofVerification =
  | { readonly valid: true; readonly claims: StepUpProofClaims }
  | { readonly valid: false; readonly reason: StepUpProofFailureReason };

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function isAuthenticationMethod(value: unknown): value is AuthenticationMethod {
  return value === 'pwd' || value === 'otp' || value === 'recovery';
}

function parseClaims(raw: string): StepUpProofClaims | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const candidate = parsed as Record<string, unknown>;

  const { sub, sid, acr, amr, iat, exp } = candidate;

  if (typeof sub !== 'string' || sub.length === 0) return undefined;
  if (typeof sid !== 'string' || sid.length === 0) return undefined;
  if (acr !== REQUIRED_ASSURANCE) return undefined;
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return undefined;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return undefined;
  if (!Array.isArray(amr) || !amr.every(isAuthenticationMethod)) {
    return undefined;
  }

  return { sub, sid, acr, amr, iat, exp };
}

export async function mintStepUpProof(
  input: MintStepUpProofInput,
): Promise<MintedStepUpProof> {
  const [generation] = await listKeyGenerations();
  if (!generation) throw new MissingAppSecurityKeyError();

  const key = await deriveHmacKey('step-up-proof-signing', 'current');
  if (!key) throw new MissingAppSecurityKeyError();

  const iat = input.nowSeconds ?? nowInSeconds();
  const claims: StepUpProofClaims = {
    sub: input.userId,
    sid: input.logicalSessionId,
    acr: REQUIRED_ASSURANCE,
    amr: [...input.methods],
    iat,
    exp: iat + STEP_UP_TTL_SECONDS,
  };

  const payload = bytesToBase64Url(utf8ToBytes(JSON.stringify(claims)));
  const signingInput = `${PROOF_VERSION}.${generation.keyId}.${payload}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    utf8ToBytes(signingInput),
  );

  return {
    token: `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`,
    claims,
  };
}

export interface VerifyStepUpProofInput {
  readonly token: string;
  readonly userId: string;
  readonly logicalSessionId: string;
  readonly nowSeconds?: number;
}

export async function verifyStepUpProof(
  input: VerifyStepUpProofInput,
): Promise<StepUpProofVerification> {
  const parts = input.token.split('.');
  if (parts.length !== 4) return { valid: false, reason: 'malformed' };

  const [version, keyId, payload, signature] = parts;
  if (version !== PROOF_VERSION || !keyId || !payload || !signature) {
    return { valid: false, reason: 'malformed' };
  }

  const signatureBytes = base64UrlToBytes(signature);
  const payloadBytes = base64UrlToBytes(payload);
  if (!signatureBytes || !payloadBytes) {
    return { valid: false, reason: 'malformed' };
  }

  const generations = await listKeyGenerations();
  const match = generations.find((entry) => entry.keyId === keyId);
  if (!match) return { valid: false, reason: 'unknown_key' };

  const key = await deriveHmacKey('step-up-proof-signing', match.generation);
  if (!key) return { valid: false, reason: 'unknown_key' };

  // `crypto.subtle.verify` compares in constant time -- never hand-roll the
  // comparison here (SEC-44).
  const signatureValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    utf8ToBytes(`${version}.${keyId}.${payload}`),
  );
  if (!signatureValid) return { valid: false, reason: 'bad_signature' };

  const claims = parseClaims(bytesToUtf8(payloadBytes));
  // An authentic signature over claims we cannot parse, or over an assurance
  // level below the required one, is not "malformed input" -- it is a proof
  // this application minted under different rules. Fail closed either way.
  if (!claims) return { valid: false, reason: 'insufficient_assurance' };

  const now = input.nowSeconds ?? nowInSeconds();
  if (claims.exp <= now) return { valid: false, reason: 'expired' };
  if (claims.iat > now + MAX_CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: 'not_yet_valid' };
  }
  // A proof whose own lifetime exceeds the policy TTL was minted under a
  // longer window than this code allows; refuse it rather than honour it.
  if (claims.exp - claims.iat > STEP_UP_TTL_SECONDS) {
    return { valid: false, reason: 'insufficient_assurance' };
  }
  if (claims.sub !== input.userId) {
    return { valid: false, reason: 'subject_mismatch' };
  }
  if (claims.sid !== input.logicalSessionId) {
    return { valid: false, reason: 'session_mismatch' };
  }

  return { valid: true, claims };
}
