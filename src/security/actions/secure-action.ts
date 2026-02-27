import { z } from 'zod';

import {
  createAction,
  type Action,
  type AuthorizationService,
  type ResourceContext,
} from '@/core/contracts/authorization';
import { ROLES } from '@/core/contracts/roles';
import type { UserRole } from '@/core/contracts/roles';

import { logActionAudit } from '@/security/actions/action-audit';
import { validateReplayToken } from '@/security/actions/action-replay';
import {
  AuthorizationFacade,
  AuthorizationError,
} from '@/security/core/authorization-facade';
import { createRequestScopedContextFromSecurityContext } from '@/security/core/request-scoped-context';
import type { SecurityContext } from '@/security/core/security-context';

export interface SecureActionDependencies {
  getSecurityContext: () => Promise<SecurityContext>;
  authorizationService: AuthorizationService;
}

type SecureActionDependenciesResolver =
  | SecureActionDependencies
  | (() => SecureActionDependencies | Promise<SecureActionDependencies>);

export interface ActionOptions<TSchema extends z.ZodType, TResult> {
  schema: TSchema;
  role?: UserRole;
  resource?: ResourceContext;
  action?: Action;
  dependencies: SecureActionDependenciesResolver;
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
  role = ROLES.USER,
  resource,
  action,
  dependencies,
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
    const resolvedDependencies =
      typeof dependencies === 'function' ? await dependencies() : dependencies;
    const context = await resolvedDependencies.getSecurityContext();
    const authorization: AuthorizationFacade = new AuthorizationFacade(
      resolvedDependencies.authorizationService,
    );
    const effectiveResource: ResourceContext =
      resource ??
      ({
        type: 'system',
        id: handler.name || 'anonymous-action',
      } satisfies ResourceContext);

    const actionName =
      action ||
      createAction(resource?.type ?? 'system', handler.name || 'execute');

    try {
      // 1. Unified authorization check via central facade
      if (!context.user) {
        throw new AuthorizationError('Authentication required');
      }

      const requestScope = createRequestScopedContextFromSecurityContext(
        context,
        {
          actionName,
          requiredRole: role,
        },
      );

      authorization.ensureRequiredRole(context.user.role, role);
      await authorization.authorize(
        {
          tenant: {
            tenantId: context.user.tenantId,
          },
          subject: {
            id: context.user.id,
            attributes: {
              role: context.user.role,
              ...context.user.attributes,
            },
          },
          resource: effectiveResource,
          action: actionName,
          environment: {
            ip: context.ip,
            time: new Date(),
          },
          attributes: {
            requestScope,
          },
        },
        `Permission denied for action: ${actionName}`,
      );

      // 2. Replay Protection
      if (input._replayToken) {
        await validateReplayToken(input._replayToken, context);
      }

      // 3. Validate Input
      const { _replayToken, ...pureInput } = input;
      const validatedInput = schema.parse(pureInput);

      // 4. Execute Handler
      const result = await handler({
        input: validatedInput,
        context,
      });

      // 5. Audit Log (Success)
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

      // 6. Audit Log (Failure)
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
