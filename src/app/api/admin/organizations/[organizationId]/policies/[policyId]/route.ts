import { connection } from 'next/server';
import type { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import { isAction } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db/types';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import {
  checkOrganizationsAdminAccess,
  getFieldErrors,
  getOrganizationDetailInActiveScope,
  organizationIdSchema,
  toAdminOrganizationsScope,
} from '../../../_lib';

import {
  DuplicatePolicyError,
  PolicyNotFoundError,
  ProtectedPolicyDeletionError,
  ProtectedPolicyMutationError,
  RoleNotFoundError,
} from '@/modules/authorization/domain/errors';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { DrizzleAdminPoliciesMutationService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminPoliciesMutationService';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withAdminStepUp } from '@/security/api/with-admin-step-up';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const allowedResources = new Set<string>(Object.values(RESOURCES));
const allowedActions = new Set<string>(Object.values(ACTIONS));

const policyIdSchema = z.object({
  policyId: z.uuid(),
});

const bodySchema = z.object({
  effect: z.enum(['allow', 'deny']),
  resource: z.string(),
  actions: z.array(z.string()).min(1).max(20),
});

/** As delivered by the route context: unvalidated, hence the schemas below. */
type PolicyRouteParams = Record<string, string | string[]>;

type PolicyUpdateRequest = {
  readonly organizationId: string;
  readonly policyId: string;
  readonly effect: 'allow' | 'deny';
  readonly resource: string;
  readonly actions: string[];
};

type ParsedPolicyUpdate =
  | { readonly ok: true; readonly data: PolicyUpdateRequest }
  | { readonly ok: false; readonly response: NextResponse };

/**
 * Everything about the request that can be judged before any database access:
 * route params, JSON parsing, schema, and the resource/action vocabulary.
 *
 * Extracted so the handler below reads as the security-relevant sequence it
 * is -- admin grant, tenant-scoped lookup, archived check, mutation, audit --
 * instead of burying it under input validation. Deliberately does **not**
 * decide which organization the caller may reach: that is answered against
 * `access.tenant` in the handler and must stay there.
 */
async function parsePolicyUpdateRequest(
  request: NextRequest,
  params: PolicyRouteParams,
): Promise<ParsedPolicyUpdate> {
  const organizationResult = organizationIdSchema.safeParse({
    id: params.organizationId,
  });
  const policyResult = policyIdSchema.safeParse({
    policyId: params.policyId,
  });

  if (!organizationResult.success) {
    return {
      ok: false,
      response: createValidationErrorResponse(
        getFieldErrors(organizationResult.error),
      ),
    };
  }

  if (!policyResult.success) {
    return {
      ok: false,
      response: createValidationErrorResponse(
        getFieldErrors(policyResult.error),
      ),
    };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: createServerErrorResponse(
        'Invalid policy payload',
        400,
        'VALIDATION_ERROR',
      ),
    };
  }

  const bodyResult = bodySchema.safeParse(body);
  if (!bodyResult.success) {
    return {
      ok: false,
      response: createValidationErrorResponse(getFieldErrors(bodyResult.error)),
    };
  }

  const vocabularyError = checkPolicyVocabulary(
    bodyResult.data.resource,
    bodyResult.data.actions,
  );
  if (vocabularyError) {
    return { ok: false, response: vocabularyError };
  }

  return {
    ok: true,
    data: {
      organizationId: organizationResult.data.id,
      policyId: policyResult.data.policyId,
      effect: bodyResult.data.effect,
      resource: bodyResult.data.resource,
      actions: bodyResult.data.actions,
    },
  };
}

/**
 * A policy may only name a resource and actions this application actually
 * defines, and every action must belong to the named resource -- otherwise a
 * grant could be written that no code path ever evaluates, or one that reads
 * as scoped to one resource while carrying another's actions.
 */
function checkPolicyVocabulary(
  resource: string,
  actions: readonly string[],
): NextResponse | undefined {
  if (!allowedResources.has(resource)) {
    return createServerErrorResponse(
      'Unknown resource',
      400,
      'VALIDATION_ERROR',
    );
  }

  const invalidAction = actions.find(
    (action) => !isAction(action) || !allowedActions.has(action),
  );

  if (invalidAction) {
    return createServerErrorResponse(
      `Unknown action: ${invalidAction}`,
      400,
      'VALIDATION_ERROR',
    );
  }

  if (actions.some((action) => !action.startsWith(`${resource}:`))) {
    return createServerErrorResponse(
      'All actions must belong to the selected resource',
      400,
      'VALIDATION_ERROR',
    );
  }

  return undefined;
}

/**
 * The domain errors both mutations share. Each handler keeps its own
 * remaining cases, because they genuinely differ: PATCH answers an unmapped
 * `Error` as a validation failure, DELETE rethrows it.
 */
function mapSharedPolicyMutationError(
  error: unknown,
): NextResponse | undefined {
  if (
    error instanceof PolicyNotFoundError ||
    error instanceof RoleNotFoundError
  ) {
    return createServerErrorResponse(error.message, 404, error.code);
  }

  if (error instanceof DuplicatePolicyError) {
    return createServerErrorResponse(error.message, 409, error.code);
  }

  if (error instanceof ProtectedPolicyMutationError) {
    return createServerErrorResponse(error.message, 400, error.code);
  }

  return undefined;
}

export const PATCH = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (request, context, access) => {
      await connection();

      const container = getAppContainer();
      const adminAccess = await checkOrganizationsAdminAccess(
        access.identity.email,
        access.user.id,
        access.tenant.tenantId,
        container,
      );

      if (!adminAccess.allowed) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      const parsed = await parsePolicyUpdateRequest(
        request,
        await context.params,
      );
      if (!parsed.ok) {
        return parsed.response;
      }

      const update = parsed.data;

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const readService = new DrizzleAdminOrganizationsReadService(db);
      const organization = await getOrganizationDetailInActiveScope(
        readService,
        toAdminOrganizationsScope(adminAccess, access.tenant.organizationId),
        update.organizationId,
        'policies',
      );

      if (!organization) {
        return createServerErrorResponse(
          'Organization not found',
          404,
          'NOT_FOUND',
        );
      }

      if (organization.organization.status === 'archived') {
        return createServerErrorResponse(
          'Archived organizations cannot update policies',
          409,
          'ARCHIVED_ORGANIZATION',
        );
      }

      const mutationService = new DrizzleAdminPoliciesMutationService(db);

      try {
        const policy = await mutationService.updateRolePolicy({
          organizationId: update.organizationId,
          policyId: update.policyId,
          effect: update.effect,
          resource: update.resource,
          actions: update.actions,
        });

        await recordAdminAuditEvent({
          category: 'rbac_policy',
          action: 'rbac_policy.update',
          outcome: 'success',
          tenantId: access.tenant.tenantId,
          actorUserId: access.user.id,
          targetType: 'policy',
          targetId: update.policyId,
        });

        return createSuccessResponse({ policy });
      } catch (error) {
        const mapped = mapSharedPolicyMutationError(error);
        if (mapped) return mapped;

        if (error instanceof Error) {
          return createServerErrorResponse(
            error.message,
            400,
            'VALIDATION_ERROR',
          );
        }

        throw error;
      }
    }),
  ),
);

export const DELETE = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (_request, context, access) => {
      await connection();

      const container = getAppContainer();
      const adminAccess = await checkOrganizationsAdminAccess(
        access.identity.email,
        access.user.id,
        access.tenant.tenantId,
        container,
      );

      if (!adminAccess.allowed) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      const params = await context.params;
      const organizationResult = organizationIdSchema.safeParse({
        id: params.organizationId,
      });
      const policyResult = policyIdSchema.safeParse({
        policyId: params.policyId,
      });

      if (!organizationResult.success) {
        return createValidationErrorResponse(
          getFieldErrors(organizationResult.error),
        );
      }

      if (!policyResult.success) {
        return createValidationErrorResponse(
          getFieldErrors(policyResult.error),
        );
      }

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const readService = new DrizzleAdminOrganizationsReadService(db);
      const organization = await getOrganizationDetailInActiveScope(
        readService,
        toAdminOrganizationsScope(adminAccess, access.tenant.organizationId),
        organizationResult.data.id,
        'policies',
      );

      if (!organization) {
        return createServerErrorResponse(
          'Organization not found',
          404,
          'NOT_FOUND',
        );
      }

      if (organization.organization.status === 'archived') {
        return createServerErrorResponse(
          'Archived organizations cannot delete policies',
          409,
          'ARCHIVED_ORGANIZATION',
        );
      }

      const mutationService = new DrizzleAdminPoliciesMutationService(db);

      try {
        await mutationService.deleteRolePolicy({
          organizationId: organizationResult.data.id,
          policyId: policyResult.data.policyId,
        });

        await recordAdminAuditEvent({
          category: 'rbac_policy',
          action: 'rbac_policy.delete',
          outcome: 'success',
          tenantId: access.tenant.tenantId,
          actorUserId: access.user.id,
          targetType: 'policy',
          targetId: policyResult.data.policyId,
        });

        return createSuccessResponse({ policyId: policyResult.data.policyId });
      } catch (error) {
        if (error instanceof ProtectedPolicyDeletionError) {
          return createServerErrorResponse(error.message, 400, error.code);
        }

        const mapped = mapSharedPolicyMutationError(error);
        if (mapped) return mapped;

        throw error;
      }
    }),
  ),
);
