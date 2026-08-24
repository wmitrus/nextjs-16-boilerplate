import type { NextRequest, NextResponse } from 'next/server';

import { AUTH } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { MfaService } from '@/core/contracts/mfa';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';

import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import type { NodeProvisioningAccessAllowed } from '@/security/core/node-provisioning-access';
import { STEP_UP_COOKIE_NAME } from '@/security/core/step-up/cookie';
import { resolveStepUpEnforcement } from '@/security/core/step-up/policy';
import { verifyStepUpProof } from '@/security/core/step-up/proof';

/**
 * Step-up enforcement for admin mutations (SEC-48).
 *
 * Every state-changing handler under `/api/admin/**` runs inside this
 * wrapper, and a static guard (`with-admin-step-up.guard.test.ts`) fails the
 * suite when a new one does not. Deny-by-default: the exemption list starts
 * empty and every entry carries a written justification.
 *
 * The boundary this enforces is **authentication assurance**, not
 * authorization. It deliberately does not care whether the caller is a
 * platform admin or a tenant admin -- those are authorization levels, decided
 * elsewhere and already enforced per route. If the operation is an admin
 * mutation, both kinds of administrator pass the same challenge.
 *
 * Order matters and is not negotiable:
 *
 * 1. The base session is validated first, by `withNodeProvisioning`, which
 *    this wrapper sits inside. Deactivation (SEC-33) and session revocation
 *    (SEC-36) are therefore already applied before a proof is ever read -- a
 *    cryptographically valid proof belonging to a killed session never gets
 *    the chance to matter.
 * 2. Enrollment is checked before the proof. "You have no second factor" and
 *    "your second factor is stale" are different problems with different
 *    remedies, and collapsing them sends an un-enrolled admin into a
 *    challenge they cannot pass.
 * 3. The proof is bound to the caller's internal user id *and* the logical
 *    session, so it cannot be replayed by another principal or survive a
 *    re-login.
 */

type RouteHandlerContext = {
  params: Promise<Record<string, string | string[]>>;
};

type GuardedRouteHandler = (
  request: NextRequest,
  context: RouteHandlerContext,
  access: NodeProvisioningAccessAllowed,
) => Promise<NextResponse> | NextResponse;

function getLogger() {
  return resolveServerLogger().child({
    type: 'API',
    category: 'security',
    module: 'admin-step-up',
  });
}

async function recordDenial(
  access: NodeProvisioningAccessAllowed,
  path: string,
  reason: string,
): Promise<void> {
  await recordAdminAuditEvent({
    category: 'admin_access',
    action: 'admin.step_up.denied',
    outcome: 'denied',
    tenantId: access.tenant.tenantId,
    actorUserId: access.user.id,
    targetType: 'admin_mutation',
    targetId: path,
    metadata: { reason },
  });
}

/**
 * Evaluates step-up for one request.
 *
 * Returns `null` when the caller may proceed, or the response that refuses
 * them. Exported because two kinds of caller need exactly this decision:
 * `withAdminStepUp` below, and the handful of non-admin endpoints that change
 * the second factor itself (disabling MFA, regenerating recovery codes) --
 * operations that are security-sensitive for the same reason admin mutations
 * are, and would otherwise be a way to swap out a factor a hijacked session
 * cannot pass.
 */
export async function enforceStepUp(
  request: NextRequest,
  access: NodeProvisioningAccessAllowed,
): Promise<NextResponse | null> {
  const path = request.nextUrl.pathname;
  const enforcement = resolveStepUpEnforcement();

  if (enforcement.mode === 'bypassed') {
    // Only reachable on a non-deployed environment: the env schema rejects
    // this configuration at startup, and `resolveStepUpEnforcement` refuses
    // it again at runtime for anything deployed.
    getLogger().warn(
      { event: 'security:step_up_bypassed', path },
      'Admin step-up bypassed by local-only configuration',
    );
    return null;
  }

  if (enforcement.mode === 'unavailable') {
    getLogger().error(
      {
        event: 'security:step_up_unavailable',
        path,
        reason: enforcement.reason,
      },
      'Admin mutation refused: step-up cannot be evaluated',
    );
    await recordDenial(access, path, enforcement.reason);
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
  const status = await mfaService.getStatus({
    userId: access.user.id,
    externalUserId: rawIdentity.userId,
  });

  if (!status.enrolled) {
    getLogger().warn(
      {
        event: 'security:step_up_enrollment_required',
        path,
        userId: access.user.id,
      },
      'Admin mutation refused: caller has no second factor',
    );
    await recordDenial(access, path, 'mfa_enrollment_required');
    return createServerErrorResponse(
      'Multi-factor authentication must be enrolled for this operation',
      403,
      'MFA_ENROLLMENT_REQUIRED',
    );
  }

  const logicalSessionId = rawIdentity.logicalSessionId;
  if (!logicalSessionId) {
    // Fail closed. Falling back to the user id would make one proof valid
    // across every session that user ever opens, which is precisely the
    // property the binding exists to prevent.
    getLogger().error(
      { event: 'security:step_up_no_session_reference', path },
      'Admin mutation refused: provider exposed no logical session id',
    );
    await recordDenial(access, path, 'missing_session_reference');
    return createServerErrorResponse(
      'Step-up authentication is required',
      403,
      'STEP_UP_REQUIRED',
    );
  }

  const proof = request.cookies.get(STEP_UP_COOKIE_NAME)?.value;
  if (!proof) {
    await recordDenial(access, path, 'absent');
    return createServerErrorResponse(
      'Step-up authentication is required',
      403,
      'STEP_UP_REQUIRED',
    );
  }

  const verification = await verifyStepUpProof({
    token: proof,
    userId: access.user.id,
    logicalSessionId,
  });

  if (!verification.valid) {
    getLogger().warn(
      {
        event: 'security:step_up_rejected',
        path,
        userId: access.user.id,
        // The reason, never the proof itself.
        reason: verification.reason,
      },
      'Admin mutation refused: step-up proof rejected',
    );
    await recordDenial(access, path, verification.reason);
    return createServerErrorResponse(
      'Step-up authentication is required',
      403,
      'STEP_UP_REQUIRED',
    );
  }

  getLogger().debug(
    {
      event: 'security:step_up_satisfied',
      path,
      userId: access.user.id,
      factors: verification.claims.amr,
    },
    'Admin mutation permitted by a fresh step-up proof',
  );

  return null;
}

export function withAdminStepUp(handler: GuardedRouteHandler) {
  return async (
    request: NextRequest,
    context: RouteHandlerContext,
    access: NodeProvisioningAccessAllowed,
  ): Promise<NextResponse> => {
    const refusal = await enforceStepUp(request, access);
    if (refusal) return refusal;

    return handler(request, context, access);
  };
}
