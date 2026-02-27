import { vi } from 'vitest';
import type { z } from 'zod';

import { ROLES } from '@/core/contracts/roles';

import type { ActionOptions } from './secure-action';

export const mockCreateSecureAction = vi.fn(
  <TSchema extends z.ZodType, TResult>(
    options: ActionOptions<TSchema, TResult>,
  ) => {
    return async (input: z.infer<TSchema>) => {
      return {
        status: 'success' as const,
        data: await options.handler({
          input,
          context: {
            user: { id: 'test', role: ROLES.USER, tenantId: 'test' },
            ip: '127.0.0.1',
            userAgent: 'test',
            correlationId: 'test',
            requestId: 'test',
            runtime: 'node',
            environment: 'test',
          },
        }),
      };
    };
  },
);

export function resetSecureActionMocks() {
  mockCreateSecureAction.mockClear();
}

vi.mock('./secure-action', () => ({
  createSecureAction: <TSchema extends z.ZodType, TResult>(
    options: ActionOptions<TSchema, TResult>,
  ) => mockCreateSecureAction(options),
}));
