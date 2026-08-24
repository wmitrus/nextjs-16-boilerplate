import { connection } from 'next/server';
import { z } from 'zod';

import { AUTH } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { MfaService } from '@/core/contracts/mfa';
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
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import {
  STEP_UP_COOKIE_NAME,
  buildStepUpCookieOptions,
} from '@/security/core/step-up/cookie';
import {
  STEP_UP_TTL_SECONDS,
  resolveStepUpEnforcement,
} from '@/security/core/step-up/policy';
import {
  mintStepUpProof,
  verifyStepUpProof,
} from '@/security/core/step-up/proof';

/**
 * The step-up challenge endpoint (SEC-48).
 *
 * `GET` reports what the caller needs to do next; `POST` verifies one second
 * factor and, on success, issues the short-lived proof that admin mutations
 * require.
 *
 * Deliberately **not** behind `withAdminStepUp` -- this is the endpoint that
 * grants the proof, so requiring one here would be a closed loop. It is
 * behind `withNodeProvisioning`, which means the base session is validated
 * (deactivation, revocation, onboarding, tenancy) before any code is checked.
 */

const STEP_UP_PATH = '/api/auth/step-up';

const challengeSchema = z.object({
  // Bounded at both ends: a TOTP code is six digits and a recovery code is
  // 23 characters, so nothing legitimate is longer. An unbounded string here
  // would be an unauthenticated-ish knob into a KDF (SEC-47's lesson).
  code: z.string().min(6).max(64),
});

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'step-up',
});

export const GET = withErrorHandler(
  withNodeProvisioning(async (request, _context, access) => {
    await connection();

    const container = getAppContainer();
    const rawIdentity = await container
      .resolve<RequestIdentitySource>(AUTH.IDENTITY_SOURCE)
      .get();
    const mfaService = container.resolve<MfaService>(AUTH.MFA_SERVICE);

    const status = await mfaService.getStatus({
      userId: access.user.id,
      externalUserId: rawIdentity.userId,
    });

    const enforcement = resolveStepUpEnforcement();
    const proof = request.cookies.get(STEP_UP_COOKIE_NAME)?.value;
    const logicalSessionId = rawIdentity.logicalSessionId;

    let satisfiedUntil: string | null = null;
    if (proof && logicalSessionId && enforcement.mode === 'required') {
      const verification = await verifyStepUpProof({
        token: proof,
        userId: access.user.id,
        logicalSessionId,
      });
      if (verification.valid) {
        satisfiedUntil = new Date(verification.claims.exp * 1000).toISOString();
      }
    }

    return createSuccessResponse({
      // `bypassed` is reported honestly rather than as "already satisfied":
      // a developer running with the bypass should see that is what happened.
      enforcement: enforcement.mode,
      enrolled: status.enrolled,
      enrollmentSurface: status.enrollmentSurface,
      enrollmentUrl: status.enrollmentUrl,
      satisfiedUntil,
      freshnessSeconds: STEP_UP_TTL_SECONDS,
    });
  }),
);

export const POST = withErrorHandler(
  withNodeProvisioning(async (request, _context, access) => {
    await connection();

    // Keyed on the actor, not the IP (SEC-42): an authenticated abuse control
    // keyed on the address misses one account behind a rotating IP and
    // punishes everyone behind a shared NAT.
    const rateLimitResult = await checkStrictRateLimit(
      `step-up:${access.user.id}`,
      { path: STEP_UP_PATH },
    );

    if (!rateLimitResult.success) {
      return createServerErrorResponse(
        'Too many attempts. Please wait before trying again.',
        429,
        'RATE_LIMITED',
      );
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

    const parsed = challengeSchema.safeParse(parsedBody);
    if (!parsed.success) {
      return createValidationErrorResponse(
        { code: ['Enter the 6-digit code from your authenticator app'] },
        400,
      );
    }

    const enforcement = resolveStepUpEnforcement();
    if (enforcement.mode === 'unavailable') {
      logger.error(
        { event: 'auth:step_up_unavailable', reason: enforcement.reason },
        'Step-up challenge refused: no application key material',
      );
      return createServerErrorResponse(
        'Step-up authentication is not available',
        503,
        'STEP_UP_UNAVAILABLE',
      );
    }

    const container = getAppContainer();
    const rawIdentity = await container
      .resolve<RequestIdentitySource>(AUTH.IDENTITY_SOURCE)
      .get();
    const mfaService = container.resolve<MfaService>(AUTH.MFA_SERVICE);

    const logicalSessionId = rawIdentity.logicalSessionId;
    if (!logicalSessionId) {
      // A proof that cannot be bound to a session must not be minted at all.
      logger.error(
        { event: 'auth:step_up_no_session_reference' },
        'Step-up challenge refused: provider exposed no logical session id',
      );
      return createServerErrorResponse(
        'Step-up authentication is not available',
        503,
        'STEP_UP_UNAVAILABLE',
      );
    }

    const verification = await mfaService.verifyChallenge(
      { userId: access.user.id, externalUserId: rawIdentity.userId },
      parsed.data.code,
    );

    if (!verification.ok) {
      logger.warn(
        {
          event: 'auth:step_up_challenge_failed',
          userId: access.user.id,
          // The reason, never the submitted code.
          reason: verification.reason,
        },
        'Step-up challenge failed',
      );
      await recordAdminAuditEvent({
        category: 'auth',
        action: 'mfa.challenge.failed',
        outcome: 'denied',
        tenantId: access.tenant.tenantId,
        actorUserId: access.user.id,
        targetType: 'step_up',
        targetId: STEP_UP_PATH,
        metadata: { reason: verification.reason },
      });

      if (verification.reason === 'not_enrolled') {
        return createServerErrorResponse(
          'Multi-factor authentication must be enrolled first',
          403,
          'MFA_ENROLLMENT_REQUIRED',
        );
      }

      if (verification.reason === 'unavailable') {
        return createServerErrorResponse(
          'Step-up authentication is not available',
          503,
          'STEP_UP_UNAVAILABLE',
        );
      }

      // A replayed code and a wrong one are one answer to the caller; the
      // distinction lives in the audit trail, where it belongs.
      return createServerErrorResponse(
        'That code is not valid',
        401,
        'MFA_CODE_INVALID',
      );
    }

    const { token, claims } = await mintStepUpProof({
      userId: access.user.id,
      logicalSessionId,
      // `pwd` is recorded alongside the second factor because the base
      // session itself was established with a first factor -- that is what
      // makes this assurance level multi-factor rather than single.
      methods: ['pwd', verification.factor],
    });

    logger.info(
      {
        event: 'auth:step_up_challenge_verified',
        userId: access.user.id,
        factor: verification.factor,
      },
      'Step-up challenge verified',
    );
    await recordAdminAuditEvent({
      category: 'auth',
      action: 'mfa.challenge.verified',
      outcome: 'success',
      tenantId: access.tenant.tenantId,
      actorUserId: access.user.id,
      targetType: 'step_up',
      targetId: STEP_UP_PATH,
      metadata: { factor: verification.factor },
    });

    const response = createSuccessResponse({
      satisfiedUntil: new Date(claims.exp * 1000).toISOString(),
    });
    response.cookies.set(
      STEP_UP_COOKIE_NAME,
      token,
      buildStepUpCookieOptions(),
    );

    return response;
  }),
);
