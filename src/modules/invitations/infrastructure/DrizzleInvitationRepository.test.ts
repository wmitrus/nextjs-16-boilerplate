import { describe, expect, it, vi } from 'vitest';

import { DuplicateInvitationError } from '../domain/errors';

import { DrizzleInvitationRepository } from './drizzle/DrizzleInvitationRepository';

describe('DrizzleInvitationRepository', () => {
  it('translates the pending invitation unique index violation', async () => {
    const returning = vi.fn().mockRejectedValue({
      code: '23505',
      constraint: 'uq_invitations_org_email_pending',
      message: 'duplicate key value violates unique constraint',
    });

    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });

    const repository = new DrizzleInvitationRepository({
      insert,
    } as never);

    await expect(
      repository.create({
        organizationId: '10000000-0000-4000-8000-000000000001',
        invitedByUserId: null,
        email: 'user@example.com',
        roleId: '20000000-0000-4000-8000-000000000001',
        token: 'token',
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(DuplicateInvitationError);
  });
});
