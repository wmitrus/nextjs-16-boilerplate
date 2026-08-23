import { createHash } from 'node:crypto';

import { resolveServerLogger } from '@/core/logger/di';

import type { EmailService } from '../domain/EmailService';
import {
  DuplicateInvitationError,
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
} from '../domain/errors';
import type { InvitationRepository } from '../domain/InvitationRepository';
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
  InvitationService,
} from '../domain/InvitationService';
import {
  buildInvitationExpiry,
  generateInvitationToken,
} from '../domain/token';
import type { Invitation } from '../domain/types';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'invitations',
  module: 'default-invitation-service',
});

function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export interface DefaultInvitationServiceOptions {
  readonly appUrl: string;
  readonly organizationName?: string;
  readonly invitedByName?: string | null;
}

export class DefaultInvitationService implements InvitationService {
  constructor(
    private readonly repository: InvitationRepository,
    private readonly emailService: EmailService,
    private readonly options: DefaultInvitationServiceOptions,
  ) {}

  async createInvitation(input: CreateInvitationInput): Promise<Invitation> {
    const existing = await this.repository.findPendingByEmailAndOrg(
      input.email,
      input.organizationId,
    );
    if (existing) {
      throw new DuplicateInvitationError(
        `A pending invitation already exists for ${input.email} in this organization`,
      );
    }

    const token = generateInvitationToken();
    const expiresAt = buildInvitationExpiry(input.expiresInHours);

    const invitation = await this.repository.create({
      organizationId: input.organizationId,
      invitedByUserId: input.invitedByUserId,
      email: input.email,
      roleId: input.roleId,
      token,
      expiresAt,
    });

    const inviteUrl = `${this.options.appUrl}/auth/invite/${token}`;

    try {
      await this.emailService.sendInvitationEmail({
        to: input.email,
        organizationName: this.options.organizationName ?? 'the organization',
        invitedByName: this.options.invitedByName ?? null,
        inviteUrl,
        expiresAt,
      });
    } catch (error) {
      logger.warn(
        {
          event: 'invitation:email_send_failed',
          invitationId: invitation.id,
          emailHash: hashEmail(input.email),
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'Invitation email send failed — invitation still created',
      );
    }

    logger.info(
      {
        event: 'invitation:created',
        invitationId: invitation.id,
        organizationId: input.organizationId,
        emailHash: hashEmail(input.email),
      },
      'Invitation created',
    );

    return invitation;
  }

  async validateToken(token: string): Promise<Invitation> {
    const invitation = await this.repository.findByToken(token);

    if (!invitation) {
      throw new InvitationNotFoundError();
    }

    if (invitation.status === 'accepted') {
      throw new InvitationAlreadyUsedError();
    }

    if (invitation.status === 'revoked') {
      throw new InvitationRevokedError();
    }

    if (invitation.status === 'expired' || invitation.expiresAt < new Date()) {
      if (invitation.status !== 'expired') {
        await this.repository.markExpired(invitation.id);
      }
      throw new InvitationExpiredError();
    }

    return invitation;
  }

  async acceptInvitation(input: AcceptInvitationInput): Promise<Invitation> {
    const invitation = await this.validateToken(input.token);
    const acceptedAt = input.acceptedAt ?? new Date();

    const acceptedInvitation = await this.repository.markAccepted(
      invitation.id,
      acceptedAt,
    );
    if (!acceptedInvitation) {
      throw new InvitationAlreadyUsedError();
    }

    logger.info(
      {
        event: 'invitation:accepted',
        invitationId: acceptedInvitation.id,
        organizationId: acceptedInvitation.organizationId,
        emailHash: hashEmail(acceptedInvitation.email),
      },
      'Invitation accepted',
    );

    return acceptedInvitation;
  }

  async revokeInvitation(
    id: string,
    organizationId: string | null,
  ): Promise<boolean> {
    const revoked = await this.repository.revokePendingScoped(
      id,
      organizationId,
    );

    if (!revoked) {
      logger.warn(
        {
          event: 'invitation:revoke_no_match',
          invitationId: id,
          scopedToOrganization: organizationId !== null,
        },
        'Invitation revoke matched no pending invitation in the authorized scope',
      );
      return false;
    }

    logger.info(
      { event: 'invitation:revoked', invitationId: id },
      'Invitation revoked',
    );
    return true;
  }

  async listByOrganization(organizationId: string): Promise<Invitation[]> {
    return this.repository.listByOrganization(organizationId);
  }
}
