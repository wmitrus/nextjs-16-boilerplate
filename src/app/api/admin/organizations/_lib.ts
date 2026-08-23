import { z } from 'zod';

import { AUTHORIZATION } from '@/core/contracts';
import { parseAction, type Action } from '@/core/contracts/authorization';
import type { AuthorizationService } from '@/core/contracts/authorization';
import { ACTIONS } from '@/core/contracts/resources-actions';
import type { getAppContainer } from '@/core/runtime/bootstrap';

export type {
  OrganizationDetailDto,
  OrganizationSummaryDto,
} from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

export const organizationsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .default(50)
    .transform((value) => Math.min(value, 100)),
  offset: z.coerce.number().int().min(0).optional().default(0),
  search: z.string().max(200).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

export const organizationIdSchema = z.object({
  id: z.uuid(),
});

export async function checkOrganizationsActionAccess(
  email: string | undefined,
  userId: string,
  tenantId: string,
  container: ReturnType<typeof getAppContainer>,
  action: Action,
): Promise<boolean> {
  if (isEnvBasedPlatformAdmin(email)) {
    return true;
  }

  const authzService = container.resolve<AuthorizationService>(
    AUTHORIZATION.SERVICE,
  );
  const { resource } = parseAction(action);

  return await authzService.can({
    tenant: { tenantId },
    subject: { id: userId },
    resource: { type: resource, id: 'admin-panel' },
    action,
  });
}

export async function checkOrganizationsAdminAccess(
  email: string | undefined,
  userId: string,
  tenantId: string,
  container: ReturnType<typeof getAppContainer>,
): Promise<boolean> {
  return checkOrganizationsActionAccess(
    email,
    userId,
    tenantId,
    container,
    ACTIONS.SECURITY_MANAGE_POLICIES,
  );
}

// Moved to shared/lib/api so non-admin API families can use it too.
export { getFieldErrors } from '@/shared/lib/api/field-errors';
