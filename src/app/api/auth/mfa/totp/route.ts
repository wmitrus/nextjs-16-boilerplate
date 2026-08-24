import { connection } from 'next/server';
import encodeQR from 'qr';
import { z } from 'zod';

import { AUTH } from '@/core/contracts';
import {
  MfaAlreadyEnrolledError,
  supportsApplicationEnrollment,
  type MfaService,
} from '@/core/contracts/mfa';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { checkStrictRateLimit } from '@/security/api/strict-rate-limit';
import { enforceStepUp } from '@/security/api/with-admin-step-up';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

/**
 * TOTP enrollment for application-owned second factors (SEC-48).
 *
 * `POST` starts an enrollment, `PUT` confirms it with a real code, `DELETE`
 * removes it. Only the last one requires a step-up proof, and the asymmetry
 * is the point:
 *
 * - Enrolling *raises* the account's assurance, and demanding a step-up to do
 *   it would be a deadlock -- there is no factor to step up with yet.
 * - Confirming proves possession of the authenticator by definition.
 * - Removing *lowers* it, which is exactly the move a hijacked session would
 *   make to swap a factor it cannot pass for one it controls. That one is
 *   challenged.
 *
 * Providers that own their own factors (Clerk) are refused here rather than
 * given a second enrollment surface: two sources of truth for "does this
 * account have MFA" is how the answer starts depending on who you ask.
 */

const MFA_TOTP_PATH = '/api/auth/mfa/totp';

const confirmSchema = z.object({
  code: z.string().min(6).max(64),
});

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'mfa-totp',
});

function providerManagedResponse() {
  return createServerErrorResponse(
    'Multi-factor authentication is managed by your identity provider',
    409,
    'MFA_PROVIDER_MANAGED',
  );
}

export const POST = withErrorHandler(
  withNodeProvisioning(async (_request, _context, access) => {
    await connection();

    const rateLimit = await checkStrictRateLimit(
      `mfa-enroll:${access.user.id}`,
      { path: MFA_TOTP_PATH },
    );
    if (!rateLimit.success) {
      return createServerErrorResponse(
        'Too many attempts. Please wait before trying again.',
        429,
        'RATE_LIMITED',
      );
    }

    const mfaService = getAppContainer().resolve<MfaService>(AUTH.MFA_SERVICE);
    if (!supportsApplicationEnrollment(mfaService)) {
      return providerManagedResponse();
    }

    const label = access.identity.email ?? access.user.id;

    let started;
    try {
      started = await mfaService.startEnrollment(
        { userId: access.user.id },
        label,
      );
    } catch (error) {
      if (error instanceof MfaAlreadyEnrolledError) {
        return createServerErrorResponse(
          'This account already has a second factor. Remove it first.',
          409,
          'MFA_ALREADY_ENROLLED',
        );
      }
      throw error;
    }

    logger.info(
      { event: 'auth:mfa_enrollment_started', userId: access.user.id },
      'TOTP enrollment started',
    );

    // The QR is rendered here rather than in the browser: the seed then never
    // needs a client-side QR library, and an SVG data URI in an `<img>` is
    // inert (images cannot execute script) and already allowed by this
    // repository's `img-src 'self' data:` policy.
    //
    // Neither the seed, the URI nor the QR is ever logged.
    const qrSvg = encodeQR(started.enrollmentUri, 'svg');

    return createSuccessResponse({
      secret: started.secret,
      enrollmentUri: started.enrollmentUri,
      qrDataUri: `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString('base64')}`,
    });
  }),
);

export const PUT = withErrorHandler(
  withNodeProvisioning(async (request, _context, access) => {
    await connection();

    const rateLimit = await checkStrictRateLimit(
      `mfa-enroll:${access.user.id}`,
      { path: MFA_TOTP_PATH },
    );
    if (!rateLimit.success) {
      return createServerErrorResponse(
        'Too many attempts. Please wait before trying again.',
        429,
        'RATE_LIMITED',
      );
    }

    const mfaService = getAppContainer().resolve<MfaService>(AUTH.MFA_SERVICE);
    if (!supportsApplicationEnrollment(mfaService)) {
      return providerManagedResponse();
    }

    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return createServerErrorResponse(
        'Invalid JSON body',
        400,
        'VALIDATION_ERROR',
      );
    }

    const parsed = confirmSchema.safeParse(parsedBody);
    if (!parsed.success) {
      return createValidationErrorResponse(
        { code: ['Enter the 6-digit code from your authenticator app'] },
        400,
      );
    }

    const confirmation = await mfaService.confirmEnrollment(
      { userId: access.user.id },
      parsed.data.code,
    );

    if (!confirmation.ok) {
      logger.warn(
        {
          event: 'auth:mfa_enrollment_confirm_failed',
          userId: access.user.id,
          reason: confirmation.reason,
        },
        'TOTP enrollment confirmation failed',
      );

      if (confirmation.reason === 'not_enrolled') {
        return createServerErrorResponse(
          'Start the enrollment again',
          409,
          'MFA_ENROLLMENT_NOT_STARTED',
        );
      }
      if (confirmation.reason === 'unavailable') {
        return createServerErrorResponse(
          'Multi-factor authentication is not available',
          503,
          'MFA_UNAVAILABLE',
        );
      }

      return createServerErrorResponse(
        'That code is not valid',
        401,
        'MFA_CODE_INVALID',
      );
    }

    logger.info(
      { event: 'auth:mfa_enrolled', userId: access.user.id },
      'TOTP enrollment confirmed',
    );
    await recordAdminAuditEvent({
      category: 'auth',
      action: 'mfa.enrolled',
      outcome: 'success',
      tenantId: access.tenant.tenantId,
      actorUserId: access.user.id,
      targetType: 'mfa',
      targetId: access.user.id,
    });

    // Shown exactly once. They are not stored anywhere recoverable -- only
    // Argon2id hashes of their secrets are.
    return createSuccessResponse({ recoveryCodes: confirmation.recoveryCodes });
  }),
);

export const DELETE = withErrorHandler(
  withNodeProvisioning(async (request, _context, access) => {
    await connection();

    // Removing a factor lowers the account's assurance, so it is challenged
    // exactly like an admin mutation.
    const refusal = await enforceStepUp(request, access);
    if (refusal) return refusal;

    const mfaService = getAppContainer().resolve<MfaService>(AUTH.MFA_SERVICE);
    if (!supportsApplicationEnrollment(mfaService)) {
      return providerManagedResponse();
    }

    await mfaService.disable({ userId: access.user.id });

    logger.warn(
      { event: 'auth:mfa_disabled', userId: access.user.id },
      'TOTP enrollment removed',
    );
    await recordAdminAuditEvent({
      category: 'auth',
      action: 'mfa.disabled',
      outcome: 'success',
      tenantId: access.tenant.tenantId,
      actorUserId: access.user.id,
      targetType: 'mfa',
      targetId: access.user.id,
    });

    return createSuccessResponse({ disabled: true });
  }),
);
