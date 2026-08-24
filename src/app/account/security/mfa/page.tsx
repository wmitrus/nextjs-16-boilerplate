import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { AUTH } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { MfaService } from '@/core/contracts/mfa';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { MfaEnrollmentClient } from './MfaEnrollmentClient';

import { buildBootstrapRedirectUrl } from '@/app/auth/post-auth-redirect';
import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';

/**
 * Second-factor management for the signed-in account (SEC-48).
 *
 * Reachable by any authenticated user, not just administrators: MFA is an
 * account-level control, and administrators are simply the accounts for which
 * it is *mandatory* (enforced by the admin gate, not here).
 */

export default function MfaSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={null}>
      <MfaSettings searchParams={searchParams} />
    </Suspense>
  );
}

async function MfaSettings({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  const container = getAppContainer();
  const access = await resolveNodeProvisioningAccess(container);

  if (access.status === 'UNAUTHENTICATED') {
    redirect('/auth/signin?redirect_url=/account/security/mfa');
  }

  if (
    access.status === 'BOOTSTRAP_REQUIRED' ||
    access.status === 'ONBOARDING_REQUIRED'
  ) {
    redirect(buildBootstrapRedirectUrl('/account/security/mfa'));
  }

  if (access.status !== 'ALLOWED') {
    redirect('/');
  }

  const rawIdentity = await container
    .resolve<RequestIdentitySource>(AUTH.IDENTITY_SOURCE)
    .get();
  const status = await container
    .resolve<MfaService>(AUTH.MFA_SERVICE)
    .getStatus({
      userId: access.user.id,
      externalUserId: rawIdentity.userId,
    });

  const params = await searchParams;
  // A single known value, compared literally: never rendered back into the
  // page as text, so a crafted `?reason=` cannot become page content.
  const requiredForAdmin = params?.reason === 'admin';

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Two-factor authentication
      </h1>
      {requiredForAdmin && (
        <div
          role="status"
          className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          Administrative access requires a second factor. Set one up to continue
          to the admin panel.
        </div>
      )}

      {status.enrollmentSurface === 'provider' ? (
        <div className="mt-6 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
          <p>
            Your identity provider manages two-factor authentication for this
            account.
          </p>
          <p>
            {status.enrolled
              ? 'A second factor is enrolled.'
              : 'No second factor is enrolled yet.'}
          </p>
          {status.enrollmentUrl && (
            <a
              className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              href={status.enrollmentUrl}
              rel="noreferrer"
            >
              Manage it with your provider
            </a>
          )}
        </div>
      ) : (
        <MfaEnrollmentClient initiallyEnrolled={status.enrolled} />
      )}
    </div>
  );
}
