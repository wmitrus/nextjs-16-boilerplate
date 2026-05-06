import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { InvitationsClient } from './InvitationsClient';

import {
  organizationsTable,
  rolesTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';

export const metadata: Metadata = {
  title: 'Invitations — Administration',
  description: 'Send direct invitations and manage pending invitation links.',
};

export default async function InvitationsAdminPage() {
  await connection();
  await getServerRequestLogContext({ pathname: '/admin/invitations' });

  const container = getAppContainer();
  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);

  const tenantId = env.DEFAULT_TENANT_ID;
  let invitations: Awaited<
    ReturnType<DefaultInvitationService['listByOrganization']>
  > = [];
  let roles: Array<{ id: string; name: string }> = [];

  if (tenantId) {
    const orgRows = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(eq(organizationsTable.tenantId, tenantId))
      .limit(1);

    const orgId = orgRows[0]?.id;

    if (orgId) {
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

      const service = new DefaultInvitationService(
        new DrizzleInvitationRepository(db),
        emailService,
        { appUrl: env.NEXT_PUBLIC_APP_URL ?? '' },
      );

      const [rawInvitations, rawRoles] = await Promise.all([
        service.listByOrganization(orgId),
        db
          .select({ id: rolesTable.id, name: rolesTable.name })
          .from(rolesTable)
          .where(eq(rolesTable.organizationId, orgId))
          .orderBy(rolesTable.name),
      ]);

      invitations = rawInvitations;
      roles = rawRoles;
    }
  }

  const safeInvitations = invitations.map(({ token: _token, ...rest }) => ({
    ...rest,
    expiresAt: rest.expiresAt.toISOString(),
    acceptedAt: rest.acceptedAt?.toISOString() ?? null,
    createdAt: rest.createdAt.toISOString(),
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Link
              href="/admin"
              className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Administration
            </Link>
            <span>/</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              Invitations
            </span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Invitations
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Send direct invitations to users and manage pending invitation
            links.
          </p>
        </div>
      </div>

      <InvitationsClient invitations={safeInvitations} roles={roles} />
    </div>
  );
}
