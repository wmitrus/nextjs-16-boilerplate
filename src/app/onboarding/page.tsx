import { OnboardingForm } from './onboarding-form';

type OnboardingSearchParams = Promise<{
  redirect_url?: string;
}>;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: OnboardingSearchParams;
}) {
  const { redirect_url } = await searchParams;

  return <OnboardingForm redirectUrl={redirect_url} />;
}
