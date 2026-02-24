import { z } from 'zod';

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
  handler: (args: {
    input: z.infer<TSchema>;
    context: SecurityContext;
  }) => Promise<TResult>;
}

/**
 * Creates a secure server action with validation, authorization, and auditing.
 */
export function createSecureAction<TSchema extends z.ZodType, TResult>({
  schema,
  role = 'user',
  handler,
}: ActionOptions<TSchema, TResult>) {
  return async (
    input: z.infer<TSchema> & { _replayToken?: string },
  ): Promise<
    | { status: 'success'; data: TResult }
    | {
        status: 'validation_error';
        errors: z.inferFlattenedErrors<TSchema>['fieldErrors'];
      }
    | { status: 'unauthorized'; error: string }
    | { status: 'error'; error: string }
  > => {
    const context = await getSecurityContext();
    const actionName = handler.name || 'anonymous_action';

    try {
      // 1. Authenticate & Authorize
      authorize(context, role);

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
          errors: error.flatten().fieldErrors,
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
