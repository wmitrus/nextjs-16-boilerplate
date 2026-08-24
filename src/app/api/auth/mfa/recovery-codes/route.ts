import { connection } from 'next/server';

import { AUTH } from '@/core/contracts';
import {
  supportsApplicationEnrollment,
  type MfaService,
} from '@/core/contracts/mfa';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { enforceStepUp } from '@/security/api/with-admin-step-up';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

/**
 * Regenerates the MFA recovery-code set (SEC-48).
 *
 * Step-up is required: issuing a fresh set is how someone who holds a
 * hijacked session would mint credentials that outlive the session's own
 * lifetime. Regeneration replaces the whole previous set -- codes are never
 * appended, because a user who regenerates believes the old sheet is dead.
 */

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'mfa-recovery-codes',
});

export const POST = withErrorHandler(
  withNodeProvisioning(async (request, _context, access) => {
    await connection();

    const refusal = await enforceStepUp(request, access);
    if (refusal) return refusal;

    const mfaService = getAppContainer().resolve<MfaService>(AUTH.MFA_SERVICE);
    if (!supportsApplicationEnrollment(mfaService)) {
      return createServerErrorResponse(
        'Recovery codes are managed by your identity provider',
        409,
        'MFA_PROVIDER_MANAGED',
      );
    }

    const recoveryCodes = await mfaService.regenerateRecoveryCodes({
      userId: access.user.id,
    });

    logger.info(
      { event: 'auth:mfa_recovery_codes_regenerated', userId: access.user.id },
      'MFA recovery codes regenerated',
    );
    await recordAdminAuditEvent({
      category: 'auth',
      action: 'mfa.recovery_codes.regenerated',
      outcome: 'success',
      tenantId: access.tenant.tenantId,
      actorUserId: access.user.id,
      targetType: 'mfa',
      targetId: access.user.id,
    });

    return createSuccessResponse({ recoveryCodes });
  }),
);
