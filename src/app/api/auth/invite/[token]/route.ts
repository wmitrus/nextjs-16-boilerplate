import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createSuccessResponse,
  createServerErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import {
  InvitationExpiredError,
  InvitationAlreadyUsedError,
  InvitationRevokedError,
  InvitationNotFoundError,
} from '@/modules/invitations/domain/errors';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { NoOpEmailService } from '@/modules/invitations/infrastructure/NoOpEmailService';

function isInvitationError(
  error: unknown,
): error is
  | InvitationNotFoundError
  | InvitationExpiredError
  | InvitationAlreadyUsedError
  | InvitationRevokedError {
  return (
    error instanceof InvitationNotFoundError ||
    error instanceof InvitationExpiredError ||
    error instanceof InvitationAlreadyUsedError ||
    error instanceof InvitationRevokedError
  );
}

function resolveService() {
  const container = getAppContainer();
  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const repository = new DrizzleInvitationRepository(db);
  return new DefaultInvitationService(repository, new NoOpEmailService(), {
    appUrl: env.NEXT_PUBLIC_APP_URL ?? '',
  });
}

/**
 * GET /api/auth/invite/[token]
 * Validates an invitation token and returns invitation details.
 * No authentication required — invitation links target new users.
 */
export const GET = withErrorHandler(async (_request, context) => {
  await connection();

  const params = await context.params;
  const token = params['token'];

  if (!token || Array.isArray(token)) {
    return createServerErrorResponse('Invalid token', 400, 'INVALID_TOKEN');
  }

  const service = resolveService();

  try {
    const invitation = await service.validateToken(token);
    return createSuccessResponse({
      invitationId: invitation.id,
      email: invitation.email,
      organizationId: invitation.organizationId,
      expiresAt: invitation.expiresAt.toISOString(),
      status: invitation.status,
    });
  } catch (error) {
    if (isInvitationError(error)) {
      return createServerErrorResponse(
        error.message,
        410,
        (error as { code: string }).code,
      );
    }
    throw error;
  }
});

/**
 * POST /api/auth/invite/[token]
 * Accepts an invitation — marks it as used.
 * Called after the invited user completes sign-up/sign-in.
 */
export const POST = withErrorHandler(async (_request, context) => {
  await connection();

  const params = await context.params;
  const token = params['token'];

  if (!token || Array.isArray(token)) {
    return createServerErrorResponse('Invalid token', 400, 'INVALID_TOKEN');
  }

  const service = resolveService();

  try {
    const invitation = await service.acceptInvitation({ token });
    return createSuccessResponse({
      invitationId: invitation.id,
      email: invitation.email,
      organizationId: invitation.organizationId,
      acceptedAt: invitation.acceptedAt?.toISOString(),
    });
  } catch (error) {
    if (isInvitationError(error)) {
      return createServerErrorResponse(
        error.message,
        410,
        (error as { code: string }).code,
      );
    }
    throw error;
  }
});
