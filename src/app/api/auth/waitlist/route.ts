import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createSuccessResponse,
  createServerErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';
import { getIP } from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';

import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { DuplicateWaitlistEntryError } from '@/modules/waitlist/domain/errors';
import { ClerkWaitlistBridge } from '@/modules/waitlist/infrastructure/clerk/ClerkWaitlistBridge';
import { DefaultWaitlistService } from '@/modules/waitlist/infrastructure/DefaultWaitlistService';
import { DrizzleWaitlistRepository } from '@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository';

const bodySchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(200).optional(),
  organizationId: z.uuid().optional(),
});

const WAITLIST_PATH = '/api/auth/waitlist';

/**
 * POST /api/auth/waitlist
 * Adds an email to the waitlist and sends a confirmation email.
 * Only active when REGISTRATION_MODE=invite-only.
 * No authentication required — targets new users.
 */
export const POST = withErrorHandler(async (request) => {
  await connection();

  const ip = await getIP(new Headers(request.headers));
  const rateLimitResult = await checkRateLimit(`waitlist:${ip}`, {
    path: WAITLIST_PATH,
  });

  if (!rateLimitResult.success) {
    return createServerErrorResponse(
      'Too many requests. Please wait before trying again.',
      429,
      'RATE_LIMITED',
    );
  }

  if (env.REGISTRATION_MODE !== 'invite-only') {
    return createServerErrorResponse(
      'Waitlist is not active',
      400,
      'WAITLIST_INACTIVE',
    );
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return createServerErrorResponse(
      'Invalid request body',
      400,
      'VALIDATION_ERROR',
    );
  }

  const { email, name, organizationId } = parsed.data;

  const container = getAppContainer();
  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);

  const repository = new DrizzleWaitlistRepository(db);
  const emailService = createEmailService({
    provider: env.EMAIL_PROVIDER,
    resendApiKey: env.RESEND_API_KEY,
    resendFromEmail: env.RESEND_FROM_EMAIL,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpSecure: env.SMTP_SECURE,
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
    smtpFromEmail: env.SMTP_FROM_EMAIL,
  });
  const service = new DefaultWaitlistService(repository, emailService);

  try {
    const entry = await service.joinWaitlist({ email, name, organizationId });

    if (env.AUTH_PROVIDER === 'clerk') {
      const bridge = new ClerkWaitlistBridge();
      await bridge.addToWaitlist(email);
    }

    return createSuccessResponse({
      id: entry.id,
      email: entry.email,
      status: entry.status,
    });
  } catch (error) {
    if (error instanceof DuplicateWaitlistEntryError) {
      return createServerErrorResponse(error.message, 409, error.code);
    }
    throw error;
  }
});
