import { and, eq } from 'drizzle-orm';
import { connection } from 'next/server';
import type { NextResponse } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createSuccessResponse,
  createServerErrorResponse,
  createValidationErrorResponse,
} from '@/shared/lib/api/response-service';
import { parseUuidRouteParam } from '@/shared/lib/api/uuid-route-param';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import {
  organizationsTable,
  rolesTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import {
  WaitlistEntryNotFoundError,
  WaitlistEntryAlreadyProcessedError,
} from '@/modules/waitlist/domain/errors';
import { DefaultWaitlistService } from '@/modules/waitlist/infrastructure/DefaultWaitlistService';
import { DrizzleWaitlistRepository } from '@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withAdminStepUp } from '@/security/api/with-admin-step-up';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

/**
 * The waitlist is **platform-global**, not tenant-local: entries are created
 * by anonymous visitors before they belong anywhere, `tenant_id` is never
 * written, and `organization_id` is whatever the joiner claimed. There is
 * therefore no trustworthy scope to filter by, and no scoped grant that
 * could be honest about what it authorises.
 *
 * So the ABAC path is deliberately absent here. `SECURITY_MANAGE_POLICIES`
 * is evaluated against the caller's ACTIVE TENANT, so every tenant owner
 * holds it -- and granting it access to an unscoped `listPending()` let one
 * tenant's owner read (and act on) every other tenant's applicants. Only an
 * env-based platform admin, whose grant genuinely is unscoped, may reach
 * these routes. See SEC-41.
 */
async function checkPlatformAdminAccess(
  email: string | undefined,
): Promise<boolean> {
  return isEnvBasedPlatformAdmin(email);
}

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'admin',
  module: 'admin-waitlist',
});

function resolveServices() {
  const container = getAppContainer();
  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const emailService = createEmailService({
    provider: env.EMAIL_PROVIDER,
    resendApiKey: env.RESEND_API_KEY,
    resendFromEmail: env.RESEND_FROM_EMAIL,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpSecure: env.SMTP_SECURE,
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
    smtpFromEmail: env.SMTP_FROM_EMAIL,
  });
  const waitlistService = new DefaultWaitlistService(
    new DrizzleWaitlistRepository(db),
    emailService,
  );
  const invitationService = new DefaultInvitationService(
    new DrizzleInvitationRepository(db),
    emailService,
    { appUrl: env.NEXT_PUBLIC_APP_URL ?? '' },
  );
  return { waitlistService, invitationService, emailService, db };
}

/**
 * For TENANCY_MODE=single: the org ID is auto-generated at first-user provisioning
 * time and is not known at deploy time — it cannot be pre-set in env vars.
 * This helper resolves both the org ID and the member role ID from the DB using
 * DEFAULT_TENANT_ID, removing the need for WAITLIST_INVITE_ORGANIZATION_ID and
 * WAITLIST_INVITE_ROLE_ID when running in single-tenancy mode.
 */
async function resolveSingleTenancyInviteTarget(
  db: DrizzleDb,
): Promise<{ orgId: string; roleId: string } | null> {
  const tenantId = env.DEFAULT_TENANT_ID;
  if (!tenantId) return null;

  const orgRows = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.tenantId, tenantId))
    .limit(1);

  const orgId = orgRows[0]?.id;
  if (!orgId) return null;

  const roleRows = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(
      and(eq(rolesTable.organizationId, orgId), eq(rolesTable.name, 'member')),
    )
    .limit(1);

  const roleId = roleRows[0]?.id;
  if (!roleId) return null;

  return { orgId, roleId };
}

function isWaitlistError(
  error: unknown,
): error is WaitlistEntryNotFoundError | WaitlistEntryAlreadyProcessedError {
  return (
    error instanceof WaitlistEntryNotFoundError ||
    error instanceof WaitlistEntryAlreadyProcessedError
  );
}

type WaitlistServices = ReturnType<typeof resolveServices>;

type WaitlistActor = {
  readonly tenantId: string;
  readonly actorUserId: string;
};

/**
 * Approving and rejecting are two complete workflows that happen to share a
 * route, an authorization check and an error mapping -- not two branches of
 * one operation. Each owns its own side effects (invitation vs. rejection
 * email) and its own audit event; the handler below stays responsible for
 * what is genuinely common: who may call, which entry, and which action.
 */
async function handleWaitlistApproval(
  id: string,
  actor: WaitlistActor,
  services: WaitlistServices,
): Promise<NextResponse> {
  const { waitlistService, db } = services;
  const entry = await waitlistService.approveEntry(id);

  const destination = await resolveInvitationDestination(db);

  if (destination) {
    await createApprovalInvitation(id, entry.email, destination, services);
  } else {
    logger.warn(
      {
        event: 'waitlist:approval_no_invite_config',
        waitlistEntryId: id,
        tenancyMode: env.TENANCY_MODE,
      },
      'Waitlist approved but could not resolve org/role for invitation — no invitation email sent',
    );
  }

  await recordAdminAuditEvent({
    category: 'waitlist',
    action: 'waitlist.approve',
    outcome: 'success',
    tenantId: actor.tenantId,
    actorUserId: actor.actorUserId,
    targetType: 'waitlist_entry',
    targetId: id,
  });

  return createSuccessResponse({ entry });
}

/**
 * Deliberately NOT `entry.organizationId`. That column is populated from the
 * anonymous join request, so honouring it would let a visitor choose which
 * organization approving them creates an invitation into. The destination is
 * a platform decision: server configuration, or the single-tenant resolution
 * below. See SEC-41.
 */
async function resolveInvitationDestination(
  db: DrizzleDb,
): Promise<{ orgId: string; roleId: string } | null> {
  let orgId = env.WAITLIST_INVITE_ORGANIZATION_ID;
  let roleId = env.WAITLIST_INVITE_ROLE_ID;

  if ((!orgId || !roleId) && env.TENANCY_MODE === 'single') {
    const resolved = await resolveSingleTenancyInviteTarget(db);
    if (resolved) {
      orgId = orgId ?? resolved.orgId;
      roleId = roleId ?? resolved.roleId;
    }
  }

  return orgId && roleId ? { orgId, roleId } : null;
}

/**
 * A failed invitation does not un-approve the entry: the approval decision is
 * already recorded and is the administrator's, while delivery is best-effort
 * and recoverable by re-inviting. It is logged rather than swallowed.
 */
async function createApprovalInvitation(
  id: string,
  email: string,
  destination: { orgId: string; roleId: string },
  services: WaitlistServices,
): Promise<void> {
  try {
    await services.invitationService.createInvitation({
      organizationId: destination.orgId,
      invitedByUserId: null,
      email,
      roleId: destination.roleId,
    });
  } catch (inviteErr) {
    const err =
      inviteErr instanceof Error ? inviteErr : new Error(String(inviteErr));
    logger.error(
      {
        event: 'waitlist:approval_invite_failed',
        waitlistEntryId: id,
        errorMessage: err.message,
        errorName: err.name,
      },
      'Waitlist approved but invitation creation failed',
    );
  }
}

async function handleWaitlistRejection(
  id: string,
  actor: WaitlistActor,
  services: WaitlistServices,
): Promise<NextResponse> {
  const entry = await services.waitlistService.rejectEntry(id);

  if (env.WAITLIST_SEND_REJECTION_EMAIL) {
    await sendRejectionEmail(id, entry, services);
  }

  await recordAdminAuditEvent({
    category: 'waitlist',
    action: 'waitlist.reject',
    outcome: 'success',
    tenantId: actor.tenantId,
    actorUserId: actor.actorUserId,
    targetType: 'waitlist_entry',
    targetId: id,
  });

  return createSuccessResponse({ entry });
}

/** Same posture as the invitation above: the decision stands, delivery does not gate it. */
async function sendRejectionEmail(
  id: string,
  entry: { email: string; name: string | null },
  services: WaitlistServices,
): Promise<void> {
  try {
    await services.emailService.sendWaitlistRejectionEmail({
      to: entry.email,
      name: entry.name,
    });
  } catch (emailErr) {
    const err =
      emailErr instanceof Error ? emailErr : new Error(String(emailErr));
    logger.error(
      {
        event: 'waitlist:rejection_email_failed',
        waitlistEntryId: id,
        errorMessage: err.message,
        errorName: err.name,
      },
      'Failed to send waitlist rejection email',
    );
  }
}

/**
 * POST /api/admin/waitlist/[id]?action=approve|reject
 *
 * approve: marks the entry approved, then creates an invitation and sends the
 *          invite email. For TENANCY_MODE=single, org + member role are resolved
 *          automatically from the DB (WAITLIST_INVITE_ORGANIZATION_ID +
 *          WAITLIST_INVITE_ROLE_ID are optional overrides).
 * reject:  marks the entry rejected, sends a rejection email (opt-out via
 *          WAITLIST_SEND_REJECTION_EMAIL=false).
 *
 * Requires: authenticated provisioned user (admin).
 */
export const POST = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (_request, context, access) => {
      await connection();

      const isAdmin = await checkPlatformAdminAccess(access.identity.email);
      if (!isAdmin) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      const params = await context.params;
      // SEC-23: the approve/reject path binds this to waitlistEntriesTable.id (uuid), so a shape check alone is not enough -- a malformed
      // segment would reach the driver and surface as a 500 instead of a 400.
      const idResult = parseUuidRouteParam(params, 'id');
      if (!idResult.ok) {
        return createValidationErrorResponse(idResult.fieldErrors, 400);
      }
      const id = idResult.value;
      const action = _request.nextUrl.searchParams.get('action');

      if (action !== 'approve' && action !== 'reject') {
        return createServerErrorResponse(
          'action must be approve or reject',
          400,
          'INVALID_ACTION',
        );
      }

      const services = resolveServices();
      const actor = {
        tenantId: access.tenant.tenantId,
        actorUserId: access.user.id,
      };

      try {
        return action === 'approve'
          ? await handleWaitlistApproval(id, actor, services)
          : await handleWaitlistRejection(id, actor, services);
      } catch (error) {
        if (isWaitlistError(error)) {
          const status =
            error instanceof WaitlistEntryNotFoundError ? 404 : 409;
          return createServerErrorResponse(
            error.message,
            status,
            (error as { code: string }).code,
          );
        }
        throw error;
      }
    }),
  ),
);
