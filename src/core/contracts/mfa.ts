/**
 * Multi-factor authentication contract (SEC-48).
 *
 * Provider-neutral by construction: nothing in this file knows about Clerk,
 * NextAuth, otplib or TOTP time steps. The application asks two questions --
 * *does this principal have a second factor?* and *did they just prove it?*
 * -- and each auth provider answers them its own way behind this interface.
 *
 * Identity, not authorization. Whether an account has MFA enrolled is a fact
 * about its credentials; whether it may deactivate a user is not. The admin
 * gate combines them, but they are resolved on opposite sides of that
 * boundary and must never be resolved together (which is why `authorize()`
 * asks only the enrollment question, never an ABAC one).
 */

/** Which kind of factor satisfied a challenge. Mirrors OIDC `amr` naming. */
export type MfaFactorKind = 'otp' | 'recovery';

/**
 * Where enrollment happens for this provider.
 *
 * `application` -- this codebase owns the factor (AuthJS credentials).
 * `provider` -- the identity provider owns it and hosts its own UI (Clerk).
 */
export type MfaEnrollmentSurface = 'application' | 'provider';

export interface MfaStatus {
  readonly enrolled: boolean;
  readonly enrollmentSurface: MfaEnrollmentSurface;
  /**
   * Where to send someone who must enroll: an internal path for
   * `application`, an absolute provider URL for `provider`.
   */
  readonly enrollmentUrl: string;
}

export type MfaVerificationFailure =
  /** No confirmed factor exists -- enrollment is required, not a retry. */
  | 'not_enrolled'
  /** Wrong or expired code. Indistinguishable from a malformed one on purpose. */
  | 'invalid_code'
  /** Correct code, already used inside its own validity window. */
  | 'replayed'
  /** The provider or key material could not answer. Never treated as a pass. */
  | 'unavailable';

export type MfaVerification =
  | { readonly ok: true; readonly factor: MfaFactorKind }
  | { readonly ok: false; readonly reason: MfaVerificationFailure };

/**
 * The principal a factor belongs to.
 *
 * `userId` is always the internal UUID -- the same principal identity the
 * rest of the security layer uses. `externalUserId` is supplied only because
 * a provider-owned factor has to be looked up under the provider's own id.
 */
export interface MfaSubject {
  readonly userId: string;
  readonly externalUserId?: string;
}

export interface MfaService {
  getStatus(subject: MfaSubject): Promise<MfaStatus>;
  /**
   * Verifies one submitted code, whatever kind of factor it turns out to be.
   * A single entry point on purpose: the caller (a route handler) must not
   * have to decide whether "394027" is a TOTP code or a recovery code, and a
   * provider that treats both identically (Clerk) stays a drop-in.
   */
  verifyChallenge(subject: MfaSubject, code: string): Promise<MfaVerification>;
}

export interface StartedMfaEnrollment {
  /** Base32 secret, shown once so it can be typed in manually. */
  readonly secret: string;
  /** `otpauth://` URI for the QR code. Never logged, never persisted. */
  readonly enrollmentUri: string;
}

export type MfaEnrollmentConfirmation =
  | { readonly ok: true; readonly recoveryCodes: readonly string[] }
  | { readonly ok: false; readonly reason: MfaVerificationFailure };

/**
 * Enrollment operations, implemented only by providers whose
 * `enrollmentSurface` is `application`. Clerk deliberately does not implement
 * this: its factors are enrolled in Clerk's own UI, and a second enrollment
 * path in this application would be a second source of truth.
 */
export interface MfaEnrollmentService extends MfaService {
  readonly enrollmentSurface: 'application';
  startEnrollment(
    subject: MfaSubject,
    accountLabel: string,
  ): Promise<StartedMfaEnrollment>;
  confirmEnrollment(
    subject: MfaSubject,
    code: string,
  ): Promise<MfaEnrollmentConfirmation>;
  /** Removes the factor and every unused recovery code. */
  disable(subject: MfaSubject): Promise<void>;
  /** Issues a fresh set, invalidating the previous one entirely. */
  regenerateRecoveryCodes(subject: MfaSubject): Promise<readonly string[]>;
}

/**
 * Thrown when enrollment is started for an account that already holds a
 * confirmed factor. Replacing a working second factor is a security-relevant
 * change in its own right and goes through `disable()`, which requires a
 * step-up -- otherwise a hijacked session could quietly swap the factor it
 * cannot pass for one it controls.
 */
export class MfaAlreadyEnrolledError extends Error {
  constructor() {
    super('This account already has a confirmed second factor.');
    this.name = 'MfaAlreadyEnrolledError';
  }
}

export function supportsApplicationEnrollment(
  service: MfaService,
): service is MfaEnrollmentService {
  return (
    (service as Partial<MfaEnrollmentService>).enrollmentSurface ===
    'application'
  );
}
