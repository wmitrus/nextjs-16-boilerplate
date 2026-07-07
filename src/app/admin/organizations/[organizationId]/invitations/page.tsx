import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { InvitationsClient } from '@/app/admin/invitations/InvitationsClient';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { rolesTable } from '@/modules/authorization/infrastructure/drizzle/schema';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';

export const metadata: Metadata = {
  title: 'Organization Invitations — Administration',
  description:
    'Send and manage organization-scoped invitations on the canonical nested admin route.',
};

export default async function OrganizationInvitationsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await connection();

  const resolvedParams = await params;
  await getServerRequestLogContext({
    pathname: `/admin/organizations/${resolvedParams.organizationId}/invitations`,
  });

  const data = await loadOrganizationInvitations(resolvedParams.organizationId);

  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href="/admin"
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Administration
          </Link>
          <span>/</span>
          <Link
            href="/admin/organizations"
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Organizations
          </Link>
          <span>/</span>
          <Link
            href={`/admin/organizations/${data.organization.id}`}
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {data.organization.name}
          </Link>
          <span>/</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Invitations
          </span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {data.organization.name} invitations
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Send direct invitations and manage pending links for this
              organization using the canonical nested route.
            </p>
          </div>
          <Link
            href={`/admin/organizations/${data.organization.id}/roles`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Open roles
          </Link>
        </div>
      </div>

      <InvitationsClient
        invitations={data.invitations}
        roles={data.roles}
        createEndpoint={`/api/admin/organizations/${data.organization.id}/invitations`}
        revokeEndpointBase={`/api/admin/organizations/${data.organization.id}/invitations`}
      />
    </div>
  );
}

async function loadOrganizationInvitations(organizationId: string) {
  const container = getAppContainer();
  const access = await resolveNodeProvisioningAccess(container);

  if (access.status !== 'ALLOWED') {
    return null;
  }

  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const readService = new DrizzleAdminOrganizationsReadService(db);
  const organization = await readService.getDetailInActiveScope({
    activeOrganizationId: access.tenant.organizationId,
    organizationId,
  });

  if (!organization) {
    return null;
  }

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

  const invitationService = new DefaultInvitationService(
    new DrizzleInvitationRepository(db),
    emailService,
    { appUrl: env.NEXT_PUBLIC_APP_URL ?? '' },
  );

  const [rawInvitations, rawRoles] = await Promise.all([
    invitationService.listByOrganization(organizationId),
    db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .where(eq(rolesTable.organizationId, organizationId))
      .orderBy(rolesTable.name),
  ]);

  return {
    organization: organization.organization,
    invitations: rawInvitations.map(({ token: _token, ...rest }) => ({
      ...rest,
      expiresAt: rest.expiresAt.toISOString(),
      acceptedAt: rest.acceptedAt?.toISOString() ?? null,
      createdAt: rest.createdAt.toISOString(),
    })),
    roles: rawRoles,
  };
}
