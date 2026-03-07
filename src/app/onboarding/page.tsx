import { sanitizeRedirectUrl } from '@/shared/lib/routing/safe-redirect';

import { OnboardingForm } from './onboarding-form';

interface OnboardingPageProps {
  searchParams: Promise<{ redirect_url?: string }>;
}

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const { redirect_url } = await searchParams;
  const safeRedirectUrl = sanitizeRedirectUrl(redirect_url ?? '', '/users');

  return <OnboardingForm redirectUrl={safeRedirectUrl} />;
}
