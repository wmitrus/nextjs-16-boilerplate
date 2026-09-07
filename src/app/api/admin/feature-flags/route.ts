import { connection } from 'next/server';
import { z } from 'zod';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { resolveFeatureFlagsAdminScope } from './feature-flags-admin-scope';
import { resolveCanonicalFeatureFlagWrite } from './feature-flags-canonical-write';

import { DuplicateFeatureFlagError } from '@/modules/feature-flags/domain/errors';
import { DrizzleFeatureFlagAdminService } from '@/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withAdminStepUp } from '@/security/api/with-admin-step-up';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'admin',
  module: 'admin-feature-flags',
});

/**
 * OZI-71 FF·D — `strictObject`, not `object`: a plain `z.object` silently
 * STRIPS unknown keys, so a legacy client still sending the pre-rename
 * `tenantId` field (and omitting `organizationId`) would parse successfully
 * with `organizationId: undefined` -- for a platform admin that reads as an
 * explicit `organizationId: null` platform-global create, silently creating
 * a GLOBAL flag instead of failing. `strictObject` rejects any unknown key
 * (including a stray `tenantId`) with a 400 before canonical resolution
 * ever runs.
 */
const createBodySchema = z.strictObject({
  key: z.string().trim().min(1).max(200),
  organizationId: z.string().trim().min(1).max(200).nullable().optional(),
  enabled: z.boolean(),
  description: z.string().trim().max(500).nullable().optional(),
});

type AdminAccess = { allowed: boolean; isPlatformAdmin: boolean };

/**
 * Distinguishes an unscoped platform-admin grant from an ABAC grant scoped
 * to `tenantId`. Callers must not treat `allowed: true` alone as sufficient
 * authorization for a client-supplied scope (organizationId, cross-org row)
 * -- check `isPlatformAdmin` before allowing anything outside the caller's
 * own organization. See SEC-26 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
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
      resource: { type: RESOURCES.FEATURE_FLAG, id: 'admin-panel' },
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
      ACTIONS.FEATURE_FLAG_READ,
    );

    if (!adminAccess.allowed) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);

    // OZI-71 FF·D — canonical per-operation scope, never the legacy
    // tenant_id: `organization` scope (own org's canonical rows +
    // intentional_global read-only overlay) or `platform-global`
    // (intentional_global only). `null` is a legitimate fail-closed
    // membership denial -- maps to an empty list, not a 403 (ABAC already
    // granted `allowed` above).
    const scope = await resolveFeatureFlagsAdminScope(access, db);

    const service = new DrizzleFeatureFlagAdminService(db);
    const flags = scope === null ? [] : await service.list(scope);

    logger.info(
      {
        event: 'admin:feature_flag_list',
        adminId: access.user.id,
        tenantId: access.tenant.tenantId,
        total: flags.length,
      },
      'Admin feature flag list fetched',
    );

    return createSuccessResponse({
      flags,
      activeProvider: env.FEATURE_FLAG_PROVIDER,
      // Lets the client render mutation controls only for rows the caller
      // can actually mutate -- an ABAC-authorized org owner sees global
      // rows as a read-only overlay (via `service.list` above) but cannot
      // toggle/edit/delete them; without this the client has no way to know
      // that (SEC-26 follow-up: PR #71 review).
      scope:
        scope === null
          ? { isPlatformAdmin: false, organizationId: null }
          : scope.kind === 'platform-global'
            ? { isPlatformAdmin: true, organizationId: null }
            : { isPlatformAdmin: false, organizationId: scope.organizationId },
    });
  }),
);

export const POST = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (request, _context, access) => {
      await connection();

      const container = getAppContainer();

      const adminAccess = await checkAdminAccess(
        access.identity.email,
        access.user.id,
        access.tenant.tenantId,
        container,
        ACTIONS.FEATURE_FLAG_MANAGE,
      );

      if (!adminAccess.allowed) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return createServerErrorResponse(
          'Invalid feature flag payload',
          400,
          'VALIDATION_ERROR',
        );
      }

      const parseResult = createBodySchema.safeParse(body);
      if (!parseResult.success) {
        return createServerErrorResponse(
          'Invalid feature flag payload',
          400,
          'VALIDATION_ERROR',
        );
      }

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);

      // OZI-71 FF·B/FF·D — resolve the canonical ownership facts written
      // alongside (never instead of) the legacy `tenant_id`. Authorization is
      // already settled above; this only answers "which internal
      // organization?". Ordinary org-context writer: resolution failure fails
      // closed (generic 500 via withErrorHandler). Platform admin:
      // `organizationId: null` -> explicit global; an unresolvable
      // organization target -> 422, no row written.
      const canonical = await resolveCanonicalFeatureFlagWrite({
        isPlatformAdmin: adminAccess.isPlatformAdmin,
        ordinaryActiveOrganizationId: access.tenant.organizationId,
        platformTargetOrganizationId: adminAccess.isPlatformAdmin
          ? (parseResult.data.organizationId ?? null)
          : null,
        db,
        authProvider: env.AUTH_PROVIDER,
      });

      if (canonical.outcome === 'unresolvable-organization-target') {
        return createServerErrorResponse(
          'The target organization could not be resolved to an internal organization',
          422,
          'ORGANIZATION_NOT_RESOLVED',
        );
      }

      // OZI-71 FF·B (preserved unchanged through FF·D) — the legacy
      // `tenant_id` column is COMPATIBILITY / ROLLBACK DATA, not canonical
      // authority: FF·B always wrote the platform admin's raw candidate
      // string VERBATIM, never its canonically-resolved parent tenant.
      // Writing `canonical.facts.tenantId` (the ORGANIZATION's parent
      // TenantId) here instead would be a real regression: two sibling
      // organizations under the SAME tenant (a legal canonical topology --
      // the same key may exist once per organization) would both write the
      // same tenant_id and collide on the retained legacy
      // `UNIQUE(key, tenant_id)`, even though canonically they are two
      // distinct, valid rows. The raw `organizationId` field is only ever
      // used as this opaque compatibility value here -- it never by itself
      // becomes `organization_id` / `ownership_state` (that is exclusively
      // `canonical.facts`, resolved above). For an ordinary caller it stays
      // `access.tenant.tenantId`, exactly as the FF·B contract already
      // established.
      const requestedTenantId = adminAccess.isPlatformAdmin
        ? (parseResult.data.organizationId ?? null)
        : access.tenant.tenantId;

      const service = new DrizzleFeatureFlagAdminService(db);

      try {
        const flag = await service.create(
          {
            key: parseResult.data.key,
            tenantId: requestedTenantId,
            enabled: parseResult.data.enabled,
            description: parseResult.data.description ?? null,
          },
          canonical.facts,
        );

        logger.info(
          {
            event: 'admin:feature_flag_create',
            adminId: access.user.id,
            tenantId: access.tenant.tenantId,
            flagKey: flag.key,
            flagTenantId: flag.tenantId,
          },
          'Feature flag created by admin',
        );

        await recordAdminAuditEvent({
          category: 'feature_flag',
          action: 'feature_flag.create',
          outcome: 'success',
          // OZI-71 FF·D — the flag's own CANONICAL tenant, from
          // `canonical.facts`, never `flag.tenantId`: that DTO field is now
          // the opaque legacy compatibility value (the raw organizationId
          // candidate for a platform-admin create, see above), not a real
          // tenant identifier. Using it here would mislabel the audit event
          // under an organization id instead of its actual parent tenant.
          // (Still "the flag's own scope, not the acting admin's active
          // tenant" -- a platform admin can create a flag for a different
          // organization or global; Codex review, PR #72.)
          tenantId:
            canonical.facts.kind === 'organization'
              ? canonical.facts.tenantId
              : null,
          actorUserId: access.user.id,
          targetType: 'feature_flag',
          targetId: flag.id,
        });

        return createSuccessResponse({ flag }, 201);
      } catch (error) {
        if (error instanceof DuplicateFeatureFlagError) {
          return createServerErrorResponse(
            error.message,
            409,
            'DUPLICATE_FEATURE_FLAG',
          );
        }

        throw error;
      }
    }),
  ),
);
