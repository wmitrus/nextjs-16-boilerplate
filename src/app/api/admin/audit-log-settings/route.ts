import { connection } from 'next/server';
import { z } from 'zod';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import {
  AUDIT_CATEGORIES,
  AUDIT_RETENTION_DAYS_MAX,
  AUDIT_RETENTION_DAYS_MIN,
  AUDIT_SAMPLE_RATE_MAX,
  AUDIT_SAMPLE_RATE_MIN,
} from '@/modules/audit-log/domain/category';
import { AuditSettingNotFoundError } from '@/modules/audit-log/domain/errors';
import { DrizzleAuditLogSettingsAdminService } from '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogSettingsAdminService';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withAdminStepUp } from '@/security/api/with-admin-step-up';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'admin',
  module: 'admin-audit-log-settings',
});

const categorySchema = z.enum(AUDIT_CATEGORIES);

const patchBodySchema = z.object({
  category: categorySchema,
  tenantId: z.string().trim().min(1).max(200).nullable().optional(),
  enabled: z.boolean(),
  retentionDays: z
    .number()
    .int()
    .min(AUDIT_RETENTION_DAYS_MIN)
    .max(AUDIT_RETENTION_DAYS_MAX),
  sampleRate: z
    .number()
    .min(AUDIT_SAMPLE_RATE_MIN)
    .max(AUDIT_SAMPLE_RATE_MAX)
    .nullable()
    .optional(),
  captureInputOnSuccess: z.boolean(),
});

const deleteBodySchema = z.object({
  category: categorySchema,
  tenantId: z.string().trim().min(1).max(200).nullable().optional(),
});

type AdminAccess = { allowed: boolean; isPlatformAdmin: boolean };

/**
 * Distinguishes an unscoped platform-admin grant from an ABAC grant scoped
 * to `tenantId`. Callers must not treat `allowed: true` alone as sufficient
 * authorization for a client-supplied `tenantId` -- check `isPlatformAdmin`
 * before allowing anything outside the caller's own tenant. See SEC-26 in
 * `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 */
async function checkAdminAccess(
  email: string | undefined,
  userId: string,
  tenantId: string,
  container: ReturnType<typeof getAppContainer>,
  action: (typeof ACTIONS)[keyof typeof ACTIONS],
): Promise<AdminAccess> {
  if (isEnvBasedPlatformAdmin(email)) {
    return { allowed: true, isPlatformAdmin: true };
  }

  try {
    const authzService = container.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    );
    const allowed = await authzService.can({
      tenant: { tenantId },
      subject: { id: userId },
      resource: { type: RESOURCES.SECURITY, id: 'admin-panel' },
      action,
    });
    return { allowed, isPlatformAdmin: false };
  } catch {
    return { allowed: false, isPlatformAdmin: false };
  }
}

export const GET = withErrorHandler(
  withNodeProvisioning(async (_request, _context, access) => {
    await connection();

    const container = getAppContainer();

    const adminAccess = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.SECURITY_READ_AUDIT,
    );

    if (!adminAccess.allowed) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleAuditLogSettingsAdminService(db);
    // An ABAC-authorized tenant caller only ever sees their own tenant's
    // effective settings (tenant override, else global, else taxonomy
    // default) -- never another tenant's override (SEC-26).
    const settings = adminAccess.isPlatformAdmin
      ? await service.listGlobalEffective()
      : await service.listEffectiveForTenant(access.tenant.tenantId);

    logger.info(
      {
        event: 'admin:audit_log_settings_list',
        adminId: access.user.id,
        tenantId: access.tenant.tenantId,
        total: settings.length,
      },
      'Admin audit log settings fetched',
    );

    return createSuccessResponse({
      settings,
      scope: adminAccess.isPlatformAdmin
        ? { isPlatformAdmin: true, tenantId: null }
        : { isPlatformAdmin: false, tenantId: access.tenant.tenantId },
    });
  }),
);

export const PATCH = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (request, _context, access) => {
      await connection();

      const container = getAppContainer();

      const adminAccess = await checkAdminAccess(
        access.identity.email,
        access.user.id,
        access.tenant.tenantId,
        container,
        ACTIONS.SECURITY_MANAGE_AUDIT_SETTINGS,
      );

      if (!adminAccess.allowed) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return createServerErrorResponse(
          'Invalid audit log setting payload',
          400,
          'VALIDATION_ERROR',
        );
      }

      const parseResult = patchBodySchema.safeParse(body);
      if (!parseResult.success) {
        return createServerErrorResponse(
          'Invalid audit log setting payload',
          400,
          'VALIDATION_ERROR',
        );
      }

      // An ABAC-authorized (non-platform-admin) caller may only ever target
      // their own verified tenant -- derive the scope from
      // `access.tenant.tenantId` rather than trusting (or rejecting) the
      // client-supplied `tenantId`, same derive-don't-reject shape as
      // `/api/admin/feature-flags` (SEC-26).
      const requestedTenantId = adminAccess.isPlatformAdmin
        ? (parseResult.data.tenantId ?? null)
        : access.tenant.tenantId;
      const scope = adminAccess.isPlatformAdmin
        ? null
        : { tenantId: access.tenant.tenantId };

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const service = new DrizzleAuditLogSettingsAdminService(db);

      const setting = await service.upsert(
        {
          category: parseResult.data.category,
          tenantId: requestedTenantId,
          enabled: parseResult.data.enabled,
          retentionDays: parseResult.data.retentionDays,
          sampleRate: parseResult.data.sampleRate ?? null,
          captureInputOnSuccess: parseResult.data.captureInputOnSuccess,
          updatedByUserId: access.user.id,
        },
        scope,
      );

      logger.info(
        {
          event: 'admin:audit_log_setting_update',
          adminId: access.user.id,
          tenantId: access.tenant.tenantId,
          category: setting.category,
          settingTenantId: setting.tenantId,
        },
        'Audit log setting updated by admin',
      );

      // Recorded under 'rbac_policy' (governance/policy config), never under
      // the category being changed -- an admin disabling category X must not
      // also erase the record of having disabled it (Codex review, PR #72).
      await recordAdminAuditEvent({
        category: 'rbac_policy',
        action: 'audit_log_setting.update',
        outcome: 'success',
        tenantId: setting.tenantId,
        actorUserId: access.user.id,
        targetType: 'audit_log_setting',
        targetId: setting.category,
        metadata: {
          enabled: setting.enabled,
          retentionDays: setting.retentionDays,
          sampleRate: setting.sampleRate,
          captureInputOnSuccess: setting.captureInputOnSuccess,
        },
      });

      return createSuccessResponse({ setting });
    }),
  ),
);

export const DELETE = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (request, _context, access) => {
      await connection();

      const container = getAppContainer();

      const adminAccess = await checkAdminAccess(
        access.identity.email,
        access.user.id,
        access.tenant.tenantId,
        container,
        ACTIONS.SECURITY_MANAGE_AUDIT_SETTINGS,
      );

      if (!adminAccess.allowed) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return createServerErrorResponse(
          'Invalid audit log setting payload',
          400,
          'VALIDATION_ERROR',
        );
      }

      const parseResult = deleteBodySchema.safeParse(body);
      if (!parseResult.success) {
        return createServerErrorResponse(
          'Invalid audit log setting payload',
          400,
          'VALIDATION_ERROR',
        );
      }

      const requestedTenantId = adminAccess.isPlatformAdmin
        ? (parseResult.data.tenantId ?? null)
        : access.tenant.tenantId;
      const scope = adminAccess.isPlatformAdmin
        ? null
        : { tenantId: access.tenant.tenantId };

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const service = new DrizzleAuditLogSettingsAdminService(db);

      try {
        await service.resetToDefault(
          parseResult.data.category,
          requestedTenantId,
          scope,
        );

        logger.info(
          {
            event: 'admin:audit_log_setting_reset',
            adminId: access.user.id,
            tenantId: access.tenant.tenantId,
            category: parseResult.data.category,
            settingTenantId: requestedTenantId,
          },
          'Audit log setting reset to default by admin',
        );

        // See the identical note on the PATCH handler above (Codex review,
        // PR #72): recorded under 'rbac_policy', never under the category
        // whose override was just removed.
        await recordAdminAuditEvent({
          category: 'rbac_policy',
          action: 'audit_log_setting.reset',
          outcome: 'success',
          tenantId: requestedTenantId,
          actorUserId: access.user.id,
          targetType: 'audit_log_setting',
          targetId: parseResult.data.category,
        });

        return createSuccessResponse({ deleted: true });
      } catch (error) {
        if (error instanceof AuditSettingNotFoundError) {
          return createServerErrorResponse(
            'Audit log setting not found',
            404,
            'NOT_FOUND',
          );
        }

        throw error;
      }
    }),
  ),
);
