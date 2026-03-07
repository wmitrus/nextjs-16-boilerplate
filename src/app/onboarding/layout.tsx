import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { AUTH } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import { UserNotProvisionedError } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { getAppContainer } from '@/core/runtime/bootstrap';

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <OnboardingGuard>{children}</OnboardingGuard>
    </Suspense>
  );
}

async function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const container = getAppContainer();

  const identityProvider = container.resolve<IdentityProvider>(
    AUTH.IDENTITY_PROVIDER,
  );
  let identity;
  try {
    identity = await identityProvider.getCurrentIdentity();
  } catch (err) {
    if (err instanceof UserNotProvisionedError) {
      redirect('/auth/bootstrap');
    }
    throw err;
  }

  if (!identity) {
    redirect('/sign-in');
  }

  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );
  const user = await userRepository.findById(identity.id);

  if (!user) {
    redirect('/auth/bootstrap');
  }

  if (user.onboardingComplete) {
    redirect('/users');
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">{children}</div>
  );
}
