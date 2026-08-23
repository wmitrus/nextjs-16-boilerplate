/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleInvitationRepository } from './DrizzleInvitationRepository';

import { seedAuthorization } from '@/modules/authorization/infrastructure/drizzle/seed';
import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let repository: DrizzleInvitationRepository;
let acmeOrgId: string;
let globexOrgId: string;
let acmeRoleId: string;
let aliceUserId: string;
let tokenCounter = 0;

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function createPendingInvitation(organizationId: string) {
  tokenCounter += 1;
  return repository.create({
    organizationId,
    invitedByUserId: aliceUserId,
    email: `invitee-${tokenCounter}@example.com`,
    roleId: acmeRoleId,
    token: `revoke-scope-token-${tokenCounter}`,
    expiresAt: daysFromNow(7),
  });
}

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  acmeOrgId = auth.orgs.acmeHq.id;
  globexOrgId = auth.orgs.globexHq.id;
  acmeRoleId = auth.roles.acmeMember.id;
  aliceUserId = users.alice.id;
  repository = new DrizzleInvitationRepository(testDb.db);
});

afterAll(async () => {
  await testDb.cleanup();
});

/**
 * SEC-41. `revokePendingScoped` carries the authorized organization in the
 * same UPDATE predicate as the id. These tests exercise that against a real
 * database rather than a mock, because the whole point of the change is what
 * the SQL matches -- a mocked repository can be made to "pass" regardless of
 * what predicate the statement actually carries.
 */
describe('DrizzleInvitationRepository.revokePendingScoped (real DB)', () => {
  it('revokes a pending invitation that belongs to the authorized organization', async () => {
    const invitation = await createPendingInvitation(acmeOrgId);

    const revoked = await repository.revokePendingScoped(
      invitation.id,
      acmeOrgId,
    );

    expect(revoked).not.toBeNull();
    expect(revoked?.id).toBe(invitation.id);
    expect(revoked?.status).toBe('revoked');
  });

  it('matches no row when the invitation belongs to another organization', async () => {
    // The cross-tenant IDOR this case exists to close: an Acme admin holding
    // a Globex invitation id.
    const invitation = await createPendingInvitation(globexOrgId);

    const revoked = await repository.revokePendingScoped(
      invitation.id,
      acmeOrgId,
    );

    expect(revoked).toBeNull();

    // And -- the part a SELECT-then-UPDATE shape would fail -- the row is
    // genuinely untouched, not merely unreported.
    const stillPending = await repository.findByToken(invitation.token);
    expect(stillPending?.status).toBe('pending');
  });

  it('matches no row on a second revoke of the same invitation', async () => {
    const invitation = await createPendingInvitation(acmeOrgId);

    await expect(
      repository.revokePendingScoped(invitation.id, acmeOrgId),
    ).resolves.not.toBeNull();
    // `status = 'pending'` is in the predicate, so revoking is single-shot.
    await expect(
      repository.revokePendingScoped(invitation.id, acmeOrgId),
    ).resolves.toBeNull();
  });

  it('does not revoke an already-accepted invitation', async () => {
    const invitation = await createPendingInvitation(acmeOrgId);
    await repository.markAccepted(invitation.id, new Date());

    await expect(
      repository.revokePendingScoped(invitation.id, acmeOrgId),
    ).resolves.toBeNull();

    const accepted = await repository.findByToken(invitation.token);
    expect(accepted?.status).toBe('accepted');
  });

  it('revokes across organizations only for the unscoped platform-admin path', async () => {
    const invitation = await createPendingInvitation(globexOrgId);

    // `null` is the deliberate opt-in to an unscoped revoke, mirroring
    // `AdminUserScope` in DrizzleAdminUsersService (SEC-26). It is reachable
    // only from a caller already established as an env-based platform admin.
    const revoked = await repository.revokePendingScoped(invitation.id, null);

    expect(revoked?.id).toBe(invitation.id);
    expect(revoked?.status).toBe('revoked');
  });
});
