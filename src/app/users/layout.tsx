import { redirect } from 'next/navigation';

import { getAppContainer } from '@/core/runtime/bootstrap';

import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';

export default async function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await resolveNodeProvisioningAccess(getAppContainer());

  if (access.status === 'UNAUTHENTICATED') {
    redirect('/sign-in?redirect_url=/users');
  }

  if (access.status === 'BOOTSTRAP_REQUIRED') {
    redirect('/auth/bootstrap?redirect_url=/users');
  }

  if (access.status === 'ONBOARDING_REQUIRED') {
    redirect('/onboarding');
  }

  if (access.status === 'TENANT_CONTEXT_REQUIRED') {
    redirect('/onboarding?reason=tenant-context-required');
  }

  if (
    access.status === 'TENANT_MEMBERSHIP_REQUIRED' ||
    access.status === 'FORBIDDEN'
  ) {
    redirect('/');
  }

  return children;
}
