import { z } from 'zod';

import { AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
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

export function getFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors = new Map<string, string[]>();

  for (const issue of error.issues) {
    const [firstPathSegment] = issue.path;
    if (typeof firstPathSegment !== 'string') {
      continue;
    }

    const currentErrors = fieldErrors.get(firstPathSegment) ?? [];
    fieldErrors.set(firstPathSegment, [...currentErrors, issue.message]);
  }

  return Object.fromEntries(fieldErrors);
}

export async function checkOrganizationsAdminAccess(
  email: string | undefined,
  userId: string,
  tenantId: string,
  container: ReturnType<typeof getAppContainer>,
): Promise<boolean> {
  if (isEnvBasedPlatformAdmin(email)) {
    return true;
  }

  const authzService = container.resolve<AuthorizationService>(
    AUTHORIZATION.SERVICE,
  );

  return await authzService.can({
    tenant: { tenantId },
    subject: { id: userId },
    resource: { type: RESOURCES.SECURITY, id: 'admin-panel' },
    action: ACTIONS.SECURITY_MANAGE_POLICIES,
  });
}
