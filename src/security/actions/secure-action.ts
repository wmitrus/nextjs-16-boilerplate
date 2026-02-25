import { z } from 'zod';

import { container } from '@/core/container';
import { AUTHORIZATION } from '@/core/contracts';
import type {
  AuthorizationService,
  ResourceContext,
} from '@/core/contracts/authorization';

import {
  createAction,
  type Action,
} from '@/modules/authorization/domain/permission';
import { logActionAudit } from '@/security/actions/action-audit';
import { validateReplayToken } from '@/security/actions/action-replay';
import { authorize, AuthorizationError } from '@/security/core/authorization';
import type {
  SecurityContext,
  UserRole,
} from '@/security/core/security-context';
import { getSecurityContext } from '@/security/core/security-context';

export interface ActionOptions<TSchema extends z.ZodType, TResult> {
  schema: TSchema;
  role?: UserRole;
  resource?: ResourceContext;
  action?: Action;
  handler: (args: {
    input: z.infer<TSchema>;
    context: SecurityContext;
  }) => Promise<TResult>;
}

/**
 * Creates a secure server action with validation, authorization, and auditing.
 */
export interface TreeifiedError {
  errors: string[];
  properties: Record<string, { errors: string[] }>;
}

export function createSecureAction<TSchema extends z.ZodType, TResult>({
  schema,
  role = 'user',
  resource,
  action,
  handler,
}: ActionOptions<TSchema, TResult>) {
  return async (
    input: z.infer<TSchema> & { _replayToken?: string },
  ): Promise<
    | { status: 'success'; data: TResult }
    | {
        status: 'validation_error';
        errors: TreeifiedError;
      }
    | { status: 'unauthorized'; error: string }
    | { status: 'error'; error: string }
  > => {
    const context = await getSecurityContext();
    const actionName =
      action ||
      createAction(resource?.type ?? 'system', handler.name || 'execute');

    try {
      // 1. Basic RBAC check
      authorize(context, role);

      // 2. Advanced ABAC/RBAC check via AuthorizationService if resource is provided
      if (resource && context.user) {
        const authService = container.resolve<AuthorizationService>(
          AUTHORIZATION.SERVICE,
        );
        const hasPermission = await authService.can({
          tenant: {
            tenantId: context.user.tenantId,
            userId: context.user.id,
          },
          subject: {
            id: context.user.id,
          },
          resource,
          action: actionName,
        });

        if (!hasPermission) {
          throw new AuthorizationError(
            `Permission denied for action: ${actionName}`,
          );
        }
      }

      // 3. Replay Protection
      if (input._replayToken) {
        await validateReplayToken(input._replayToken, context);
      }

      // 4. Validate Input
      const { _replayToken, ...pureInput } = input;
      const validatedInput = schema.parse(pureInput);

      // 5. Execute Handler
      const result = await handler({
        input: validatedInput,
        context,
      });

      // 6. Audit Log (Success)
      await logActionAudit({
        actionName,
        input: pureInput,
        result: 'success',
        context,
      });

      return {
        status: 'success' as const,
        data: result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Internal Server Error';

      // 7. Audit Log (Failure)
      await logActionAudit({
        actionName,
        input,
        result: 'failure',
        error: errorMessage,
        context,
      });

      if (error instanceof z.ZodError) {
        return {
          status: 'validation_error' as const,
          errors: z.treeifyError(error) as TreeifiedError,
        };
      }

      if (error instanceof AuthorizationError) {
        return {
          status: 'unauthorized' as const,
          error: errorMessage,
        };
      }

      return {
        status: 'error' as const,
        error: errorMessage,
      };
    }
  };
}
