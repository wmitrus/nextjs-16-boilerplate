import { clerkClient } from '@clerk/nextjs/server';

import type {
  MfaService,
  MfaStatus,
  MfaSubject,
  MfaVerification,
} from '@/core/contracts/mfa';
import { resolveServerLogger } from '@/core/logger/di';

/**
 * MFA for Clerk-managed accounts (SEC-48).
 *
 * Clerk owns these factors, so this adapter owns none of the state: it asks
 * Clerk whether a second factor exists and asks Clerk to verify a submitted
 * code. There is deliberately no enrollment path here (`MfaEnrollmentService`
 * is not implemented) -- Clerk hosts that UI, and a second enrollment surface
 * in this application would be a second source of truth for the same fact.
 *
 * Both Clerk endpoints used here are stable Backend API operations.
 * Clerk's own reverification feature is **not** used: `has({ reverification })`
 * is documented as public beta and "not recommended for production use", and
 * the `fva` session claim it reads is marked experimental. Building the
 * enforcement boundary of this repository on either would tie a security
 * control to an API that may change shape, and would give Clerk sessions a
 * different step-up mechanism than AuthJS sessions -- the opposite of one
 * policy behind one contract.
 */

const CLERK_MFA_ENROLLMENT_URL = 'https://accounts.clerk.dev/user';

function getLogger() {
  return resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'clerk-mfa',
  });
}

export class ClerkMfaService implements MfaService {
  async getStatus(subject: MfaSubject): Promise<MfaStatus> {
    const base: Omit<MfaStatus, 'enrolled'> = {
      enrollmentSurface: 'provider',
      enrollmentUrl: CLERK_MFA_ENROLLMENT_URL,
    };

    if (!subject.externalUserId) {
      // No Clerk id means no way to ask Clerk. Report "not enrolled", which
      // fails closed at every consumer, rather than guessing.
      return { ...base, enrolled: false };
    }

    try {
      const client = await clerkClient();
      const user = await client.users.getUser(subject.externalUserId);
      return { ...base, enrolled: user.twoFactorEnabled === true };
    } catch (error) {
      getLogger().warn(
        {
          event: 'auth:mfa_status_lookup_failed',
          provider: 'clerk',
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'Could not read MFA enrollment state from Clerk',
      );
      // An unreachable provider must not read as "enrolled" -- that would
      // let an admin mutation through on the strength of an outage.
      return { ...base, enrolled: false };
    }
  }

  async verifyChallenge(
    subject: MfaSubject,
    code: string,
  ): Promise<MfaVerification> {
    if (!subject.externalUserId) {
      return { ok: false, reason: 'not_enrolled' };
    }

    const status = await this.getStatus(subject);
    if (!status.enrolled) return { ok: false, reason: 'not_enrolled' };

    try {
      const client = await clerkClient();
      // Clerk's verifyTOTP accepts a TOTP code or one of the user's backup
      // codes and tells us which it was, so the single-entry-point shape of
      // `MfaService.verifyChallenge` maps directly onto it.
      const result = await client.users.verifyTOTP({
        userId: subject.externalUserId,
        code,
      });

      // The SDK types this response as `{ verified: true; code_type: 'totp' }`
      // -- Clerk throws rather than returning a negative result, and the
      // union is narrowed to the TOTP branch even though the endpoint also
      // accepts backup codes. Read both fields defensively: a response shape
      // that changes must not silently turn a backup code into "otp" in the
      // audit trail, nor an unexpected body into a pass.
      const verified = (result as { verified?: unknown }).verified === true;
      if (!verified) return { ok: false, reason: 'invalid_code' };

      const codeType = (result as { code_type?: unknown }).code_type;

      return {
        ok: true,
        factor: codeType === 'backup_code' ? 'recovery' : 'otp',
      };
    } catch (error) {
      // Clerk returns a 4xx for a wrong code, which the SDK throws. That is
      // an invalid code, not an outage -- but anything else is an outage,
      // and neither may be reported as success.
      const status = extractClerkStatus(error);
      if (status !== undefined && status >= 400 && status < 500) {
        return { ok: false, reason: 'invalid_code' };
      }

      getLogger().error(
        {
          event: 'auth:mfa_verification_unavailable',
          provider: 'clerk',
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'Clerk could not verify the submitted MFA code',
      );
      return { ok: false, reason: 'unavailable' };
    }
  }
}

function extractClerkStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}
