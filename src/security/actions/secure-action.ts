import { z } from 'zod';

import {
  createAction,
  type Action,
  type AuthorizationService,
  type ResourceContext,
} from '@/core/contracts/authorization';
import {
  MissingTenantContextError,
  TenantMembershipRequiredError,
  TenantNotProvisionedError,
} from '@/core/contracts/tenancy';
import { env } from '@/core/env';
import { isPublicError } from '@/core/error/public-error';
import { resolveServerLogger } from '@/core/logger/di';

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
    | { status: 'bootstrap_required' }
    | { status: 'onboarding_required' }
    | { status: 'account_disabled' }
    | { status: 'tenant_context_required' }
    | { status: 'tenant_membership_required' }
    | { status: 'error'; error: string; correlationId: string }
  > => {
    let context: SecurityContext | undefined;
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
      const resolvedDependencies =
        typeof dependencies === 'function'
          ? await dependencies()
          : dependencies;
      context = await resolvedDependencies.getSecurityContext();
      const authorization: AuthorizationFacade = new AuthorizationFacade(
        resolvedDependencies.authorizationService,
      );

      // 1. Readiness checks (ordered by specificity)
      const readinessDeniedStatus = (() => {
        switch (context.readinessStatus) {
          case 'BOOTSTRAP_REQUIRED':
            return 'bootstrap_required' as const;
          case 'ONBOARDING_REQUIRED':
            return 'onboarding_required' as const;
          case 'ACCOUNT_DISABLED':
            return 'account_disabled' as const;
          case 'TENANT_CONTEXT_REQUIRED':
            return 'tenant_context_required' as const;
          case 'TENANT_MEMBERSHIP_REQUIRED':
            return 'tenant_membership_required' as const;
          default:
            return null;
        }
      })();

      if (readinessDeniedStatus !== null) {
        await logActionAudit({
          actionName,
          input,
          result: 'failure',
          error: `Readiness check failed: ${context.readinessStatus}`,
          context,
        });
        return { status: readinessDeniedStatus };
      }

      if (!context.user) {
        await logActionAudit({
          actionName,
          input,
          result: 'failure',
          error: 'Authentication required',
          context,
        });
        return {
          status: 'unauthorized' as const,
          error: 'Authentication required',
        };
      }

      const requestScope = createRequestScopedContextFromSecurityContext(
        context,
        { actionName },
      );

      await authorization.authorize(
        {
          tenant: {
            tenantId: context.user.tenantId,
          },
          subject: {
            id: context.user.id,
            attributes: context.user.attributes,
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
      await validateReplayToken(input._replayToken, context);

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
      const rawErrorMessage =
        error instanceof Error ? error.message : 'Internal Server Error';

      // 6. Audit Log (Failure)
      if (context) {
        await logActionAudit({
          actionName,
          input,
          result: 'failure',
          error: rawErrorMessage,
          context,
        });
      }

      if (error instanceof z.ZodError) {
        return {
          status: 'validation_error' as const,
          errors: z.treeifyError(error) as TreeifiedError,
        };
      }

      if (error instanceof AuthorizationError) {
        // Safe to expose: an AuthorizationError's message is always supplied
        // by the `authorize()` call site in this repository (defaulting to
        // 'Unauthorized'), never text produced by a library or driver.
        return {
          status: 'unauthorized' as const,
          error: error.message,
        };
      }

      if (
        error instanceof MissingTenantContextError ||
        error instanceof TenantNotProvisionedError
      ) {
        return { status: 'tenant_context_required' as const };
      }

      if (error instanceof TenantMembershipRequiredError) {
        return { status: 'tenant_membership_required' as const };
      }

      // Everything that reaches here is an exception nobody classified: a
      // driver error, a provider SDK failure, a filesystem path, an
      // unexpected library throw. Its text is not a message for a user, and
      // may carry internal identifiers, queries or paths -- so it never
      // crosses the boundary. The client gets a correlation id; the log
      // above holds the detail under that same id. See SEC-37.
      const correlationId = context?.correlationId ?? crypto.randomUUID();

      resolveServerLogger()
        .child({
          type: 'ACTION',
          category: 'security',
          module: 'secure-action',
        })
        .error(
          {
            event: 'action:unhandled_error',
            actionName,
            correlationId,
            errorName: error instanceof Error ? error.name : typeof error,
            errorMessage: rawErrorMessage,
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          'Secure action failed with an unclassified error',
        );

      if (isPublicError(error)) {
        return {
          status: 'error' as const,
          error: error.message,
          correlationId,
        };
      }

      return {
        status: 'error' as const,
        // Outside production the real message is far more useful than a
        // reference id, and there is no untrusted client to protect from it
        // -- the same trade-off `with-error-handler.ts` already makes for
        // API routes.
        error:
          env.NODE_ENV === 'production'
            ? `Something went wrong. Reference: ${correlationId}`
            : rawErrorMessage,
        correlationId,
      };
    }
  };
}
